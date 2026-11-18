import createHttpError from "http-errors";
import type { FastifyReply, FastifyRequest } from "fastify";
import type {} from "@fastify/cookie";
import type { AuthRole } from "../repo/auth-sessions.js";
import { getAuthSession, type AuthSession } from "./session-store.js";
import { AUTH_COOKIE } from "./cookies.js";

declare module "fastify" {
  interface FastifyRequest {
    auth: AuthSession | null;
  }
}

const ALLOWED_ORIGINS = (process.env.WEB_ORIGIN ?? "http://localhost:5173")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export async function csrfGuard(req: FastifyRequest): Promise<void> {
  if (SAFE_METHODS.has(req.method)) {
    return;
  }
  const origin = req.headers.origin;
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) {
    throw createHttpError(403, "bad_origin");
  }
}

export async function authenticate(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const token = req.cookies[AUTH_COOKIE];
  if (!token) {
    throw createHttpError(401, "no_session");
  }

  const session = await getAuthSession(token);
  if (!session) {
    reply.clearCookie(AUTH_COOKIE, { path: "/api" });
    throw createHttpError(401, "no_session");
  }

  req.auth = session;
}

export function requireRole(...roles: AuthRole[]) {
  return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    await authenticate(req, reply);
    if (!req.auth || !roles.includes(req.auth.role)) {
      throw createHttpError(403, "forbidden");
    }
  };
}
