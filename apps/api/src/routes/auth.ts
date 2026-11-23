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
import { verifyGoogleIdToken } from "../auth/google.js";
import {
  toVerified,
  verifyPassword,
  verifyPbToken,
  type VerifiedUser,
} from "../auth/pb-verify.js";
import { createSignupToken, verifySignupToken } from "../auth/signup-token.js";
import { rateLimit } from "../auth/rate-limit.js";
import {
  createAuthSession,
  destroyAuthSession,
  getAuthSession,
} from "../auth/session-store.js";
import { buildViewer } from "../auth/viewer.js";
import {
  confirmFanVerification,
  createFan,
  deleteFan,
  findAccountByEmail,
  randomPassword,
  requestFanVerification,
} from "../repo/fans.js";
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

const Nickname = z
  .string()
  .transform((s) => s.trim().replace(/\s+/g, " "))
  .pipe(z.string().min(5).max(20));

const SignupBody = z.object({
  email: Email,
  password: z.string().min(8).max(71),
  nickname: Nickname,
  consent: z.literal(true),
});

const VerifyBody = z.object({ token: z.string().min(20).max(2048) });
const ResendBody = z.object({ email: Email });

const GoogleBody = z.object({
  collection: Collection,
  credential: z.string().min(20).max(4096),
});

const GoogleCompleteBody = z.object({
  signupToken: z.string().min(20).max(1024),
  nickname: Nickname,
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

const resendByIp = rateLimit({
  name: "resend-ip",
  max: 10,
  windowMs: 60 * MINUTE,
});
const resendByEmail = rateLimit({
  name: "resend-email",
  max: 3,
  windowMs: 15 * MINUTE,
  key: (req) =>
    String((req.body as { email?: unknown } | null)?.email ?? "").toLowerCase(),
});

async function sendVerification(req: FastifyRequest, email: string) {
  try {
    await requestFanVerification(email);
  } catch (err) {
    req.log.error(err, "verification email failed");
  }
}

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

      await sendVerification(req, created.fan.email);
      return { status: "verification_sent" as const, email: created.fan.email };
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
      if (user.emailVerified === false) {
        throw createHttpError(403, "email_not_verified");
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

  app.post(
    "/auth/verify-email",
    { preHandler: [csrfGuard, sessionByIp] },
    async (req, reply) => {
      reply.header("Cache-Control", "no-store");

      const body = VerifyBody.safeParse(req.body);
      if (!body.success) {
        throw createHttpError(400, "bad_request");
      }
      if (!(await confirmFanVerification(body.data.token))) {
        throw createHttpError(400, "invalid_verification_token");
      }
      return { ok: true };
    },
  );

  app.post(
    "/auth/resend-verification",
    { preHandler: [csrfGuard, resendByIp, resendByEmail] },
    async (req, reply) => {
      reply.header("Cache-Control", "no-store");

      const body = ResendBody.safeParse(req.body);
      if (!body.success) {
        throw createHttpError(400, "bad_request");
      }

      await sendVerification(req, body.data.email);
      return { ok: true };
    },
  );

  app.post(
    "/auth/google",
    { preHandler: [csrfGuard, sessionByIp] },
    async (req, reply) => {
      reply.header("Cache-Control", "no-store");

      const body = GoogleBody.safeParse(req.body);
      if (!body.success) {
        throw createHttpError(400, "bad_request");
      }

      const identity = await verifyGoogleIdToken(body.data.credential);
      if (!identity) {
        throw createHttpError(401, "invalid_google_token");
      }

      const { collection } = body.data;
      let record = await findAccountByEmail(collection, identity.email);

      if (collection === "fans" && record && record.verified !== true) {
        await deleteFan(record.id);
        record = null;
      }

      if (!record) {
        if (collection === "managers") {
          throw createHttpError(403, "no_account");
        }
        return {
          status: "signup_required" as const,
          email: identity.email,
          suggestedNickname: identity.name?.slice(0, 20) ?? "",
          signupToken: createSignupToken({
            email: identity.email,
            sub: identity.sub,
          }),
        };
      }

      const result = await startSession(
        req,
        reply,
        toVerified(collection, record),
      );
      return { status: "ok" as const, ...result };
    },
  );

  app.post(
    "/auth/google/complete",
    { preHandler: [csrfGuard, signupByIp] },
    async (req, reply) => {
      reply.header("Cache-Control", "no-store");

      const body = GoogleCompleteBody.safeParse(req.body);
      if (!body.success) {
        throw createHttpError(400, "bad_request");
      }

      const claims = verifySignupToken(body.data.signupToken);
      if (!claims) {
        throw createHttpError(401, "signup_expired");
      }

      const created = await createFan({
        email: claims.email,
        password: randomPassword(),
        nickname: body.data.nickname,
        verified: true,
      });
      if (!created.ok) {
        throw createHttpError(
          created.reason === "email_taken" ? 409 : 400,
          created.reason,
        );
      }

      const result = await startSession(req, reply, {
        userId: created.fan.id,
        role: "fan",
        profile: {
          name: null,
          nickname: created.fan.nickname,
          email: created.fan.email,
          clubId: null,
        },
      });
      return { status: "ok" as const, ...result };
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
