import createHttpError from "http-errors";
import { z } from "zod";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type {} from "@fastify/cookie";
import {
  AUTH_COOKIE,
  PLAY_COOKIE,
  authCookieOptions,
} from "../auth/cookies.js";
import { csrfGuard } from "../auth/guards.js";
import {
  verifyPassword,
  verifyPbToken,
  type VerifiedUser,
} from "../auth/pb-verify.js";
import { rateLimit } from "../auth/rate-limit.js";
import {
  createAuthSession,
  destroyAuthSession,
  getAuthSession,
} from "../auth/session-store.js";
import { buildViewer } from "../auth/viewer.js";
import { createFan } from "../repo/fans.js";
import { linkParticipantToFan } from "../repo/participants.js";
import { getCachedGameById } from "../game-cache.js";
import { resultsWindowOver } from "../game-lifecycle.js";
import { getSession } from "../session-cache.js";

const Collection = z.enum(["fans", "managers"]);
const Email = z
  .email()
  .max(254)
  .transform((s) => s.toLowerCase());

const SessionBody = z.object({
  collection: Collection,

  token: z.string().min(20).max(4096),
});

const LoginBody = z.object({
  collection: Collection,
  email: Email,
  password: z.string().min(1).max(200),
});

const SignupBody = z.object({
  email: Email,
  password: z.string().min(8).max(71),
  nickname: z
    .string()
    .transform((s) => s.trim().replace(/\s+/g, " "))
    .pipe(z.string().min(5).max(20)),
  consent: z.literal(true),
});

const MINUTE = 60_000;

const loginByIp = rateLimit({
  name: "login-ip",
  max: 20,
  windowMs: 10 * MINUTE,
});
const loginByEmail = rateLimit({
  name: "login-email",
  max: 10,
  windowMs: 15 * MINUTE,
  key: (req) =>
    String((req.body as { email?: unknown } | null)?.email ?? "").toLowerCase(),
});
const signupByIp = rateLimit({
  name: "signup-ip",
  max: 5,
  windowMs: 60 * MINUTE,
});
const sessionByIp = rateLimit({
  name: "session-ip",
  max: 30,
  windowMs: 10 * MINUTE,
});

async function startSession(
  req: FastifyRequest,
  reply: FastifyReply,
  user: VerifiedUser,
) {
  const previous = req.cookies[AUTH_COOKIE];
  if (previous) {
    await destroyAuthSession(previous).catch(() => {});
  }

  const { token, session } = await createAuthSession(user);

  const playToken = req.cookies[PLAY_COOKIE];
  const guest = playToken ? await getSession(playToken) : null;
  if (user.role === "fan" && guest && guest.fanId === null) {
    const game = await getCachedGameById(guest.gameId);
    if (!game || !resultsWindowOver(game, Date.now())) {
      await linkParticipantToFan(guest.id, user.userId);
      guest.fanId = user.userId;
    }
  }

  reply.setCookie(AUTH_COOKIE, token, authCookieOptions);
  return { viewer: await buildViewer(session, guest) };
}

export async function authRoutes(app: FastifyInstance) {
  app.setErrorHandler((err, req, reply) => {
    if (createHttpError.isHttpError(err)) {
      return reply.code(err.statusCode).send({ error: err.message });
    }
    const status = (err as { statusCode?: number }).statusCode;
    if (typeof status === "number" && status >= 400 && status < 500) {
      return reply.code(status).send({ error: "bad_request" });
    }
    req.log.error(err);
    return reply.code(500).send({ error: "internal" });
  });

  app.post(
    "/auth/signup",
    { preHandler: [csrfGuard, signupByIp] },
    async (req, reply) => {
      reply.header("Cache-Control", "no-store");

      const body = SignupBody.safeParse(req.body);
      if (!body.success) {
        throw createHttpError(400, "bad_request");
      }

      const created = await createFan({
        email: body.data.email,
        password: body.data.password,
        nickname: body.data.nickname,
      });
      if (!created.ok) {
        throw createHttpError(
          created.reason === "email_taken" ? 409 : 400,
          created.reason,
        );
      }

      return startSession(req, reply, {
        userId: created.fan.id,
        role: "fan",
        profile: {
          name: null,
          nickname: created.fan.nickname,
          email: created.fan.email,
          clubId: null,
        },
      });
    },
  );

  app.post(
    "/auth/login",
    { preHandler: [csrfGuard, loginByIp, loginByEmail] },
    async (req, reply) => {
      reply.header("Cache-Control", "no-store");

      const body = LoginBody.safeParse(req.body);
      if (!body.success) {
        throw createHttpError(400, "bad_request");
      }

      const user = await verifyPassword(
        body.data.collection,
        body.data.email,
        body.data.password,
      );
      if (!user) {
        throw createHttpError(401, "invalid_credentials");
      }

      return startSession(req, reply, user);
    },
  );

  app.post(
    "/auth/session",
    { preHandler: [csrfGuard, sessionByIp] },
    async (req, reply) => {
      reply.header("Cache-Control", "no-store");

      const body = SessionBody.safeParse(req.body);
      if (!body.success) {
        throw createHttpError(400, "bad_request");
      }

      const user = await verifyPbToken(body.data.collection, body.data.token);
      if (!user) {
        throw createHttpError(401, "invalid_token");
      }

      return startSession(req, reply, user);
    },
  );

  app.post("/auth/logout", { preHandler: csrfGuard }, async (req, reply) => {
    reply.header("Cache-Control", "no-store");

    const token = req.cookies[AUTH_COOKIE];
    if (token) {
      await destroyAuthSession(token).catch(() => {});
    }
    reply.clearCookie(AUTH_COOKIE, { path: "/api" });
    return { ok: true };
  });

  app.get("/me", async (req, reply) => {
    reply.header("Cache-Control", "no-store");

    const authToken = req.cookies[AUTH_COOKIE];
    const auth = authToken ? await getAuthSession(authToken) : null;
    if (authToken && !auth) {
      reply.clearCookie(AUTH_COOKIE, { path: "/api" });
    }

    const playToken = req.cookies[PLAY_COOKIE];
    const guest = playToken ? await getSession(playToken) : null;

    return { viewer: await buildViewer(auth, guest) };
  });
}
