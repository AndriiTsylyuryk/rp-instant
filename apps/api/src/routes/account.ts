import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type {} from "@fastify/cookie";
import { AUTH_COOKIE } from "../auth/cookies.js";
import { verifyGoogleIdToken } from "../auth/google.js";
import { csrfGuard, requireRole } from "../auth/guards.js";
import { verifyPassword } from "../auth/pb-verify.js";
import { rateLimit } from "../auth/rate-limit.js";
import {
  destroyUserAuthSessions,
  updateUserNickname,
} from "../auth/session-store.js";
import { AppError } from "../errors.js";
import { deleteFan, updateFanNickname } from "../repo/fans.js";
import { listFanGames } from "../repo/participants.js";

const MINUTE = 60_000;
const GAMES_PER_PAGE = 10;

const Nickname = z
  .string()
  .transform((s) => s.trim().replace(/\s+/g, " "))
  .pipe(z.string().min(5).max(20));

const NicknameBody = z.object({ nickname: Nickname });

const DeleteBody = z
  .object({
    password: z.string().min(1).max(200).optional(),
    credential: z.string().min(20).max(4096).optional(),
  })
  .refine((b) => b.password !== undefined || b.credential !== undefined);

const byUser = (req: { auth: { userId: string } | null }) =>
  req.auth?.userId ?? "";

const nicknameLimit = rateLimit({
  name: "nickname-user",
  max: 5,
  windowMs: 60 * MINUTE,
  key: byUser,
});
const deleteLimit = rateLimit({
  name: "delete-user",
  max: 5,
  windowMs: 15 * MINUTE,
  key: byUser,
});

export async function accountRoutes(app: FastifyInstance) {
  app.get(
    "/me/games",
    { preHandler: requireRole("fan") },
    async (req, reply) => {
      reply.header("Cache-Control", "no-store");

      const { page } = z
        .object({ page: z.coerce.number().int().min(1).max(1000).default(1) })
        .parse(req.query);

      return listFanGames(req.auth!.userId, page, GAMES_PER_PAGE);
    },
  );

  app.patch(
    "/me/nickname",
    { preHandler: [csrfGuard, requireRole("fan"), nicknameLimit] },
    async (req, reply) => {
      reply.header("Cache-Control", "no-store");

      const body = NicknameBody.safeParse(req.body);
      if (!body.success) {
        throw new AppError(400, "bad_request");
      }

      const { userId } = req.auth!;
      await updateFanNickname(userId, body.data.nickname);
      await updateUserNickname(userId, body.data.nickname);
      return { nickname: body.data.nickname };
    },
  );

  app.post(
    "/me/delete",
    { preHandler: [csrfGuard, requireRole("fan"), deleteLimit] },
    async (req, reply) => {
      reply.header("Cache-Control", "no-store");

      const body = DeleteBody.safeParse(req.body);
      if (!body.success) {
        throw new AppError(400, "bad_request");
      }

      const auth = req.auth!;
      const email = auth.profile.email?.toLowerCase() ?? "";

      let confirmed = false;
      if (body.data.password !== undefined) {
        const user = await verifyPassword("fans", email, body.data.password);
        confirmed = user?.userId === auth.userId;
      } else if (body.data.credential !== undefined) {
        const identity = await verifyGoogleIdToken(body.data.credential);
        confirmed = identity?.email === email;
      }
      if (!confirmed) {
        throw new AppError(401, "invalid_credentials");
      }

      await destroyUserAuthSessions(auth.userId);
      await deleteFan(auth.userId);

      reply.clearCookie(AUTH_COOKIE, { path: "/api" });
      return { ok: true };
    },
  );
}
