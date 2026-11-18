import { createHash, randomBytes } from "node:crypto";
import {
  deleteAuthSession,
  deleteExpiredAuthSessions,
  extendAuthSession,
  findAuthSession,
  insertAuthSession,
  type AuthRole,
  type SessionProfile,
} from "../repo/auth-sessions.js";

export type AuthSession = {
  rowId: string;
  userId: string;
  role: AuthRole;
  profile: SessionProfile;
  expiresAt: number;
  touchedAt: number;
};

export const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;
export const TOUCH_EVERY_MS = 10 * 60 * 1000;
const SWEEP_EVERY_MS = 10 * 60 * 1000;

const cache = new Map<string, AuthSession>();
const inflight = new Map<string, Promise<AuthSession | null>>();

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function validate(hash: string, session: AuthSession): AuthSession | null {
  const now = Date.now();

  if (session.expiresAt <= now) {
    cache.delete(hash);
    void deleteAuthSession(session.rowId).catch(() => {});
    return null;
  }

  if (now - session.touchedAt >= TOUCH_EVERY_MS) {
    session.touchedAt = now;
    session.expiresAt = now + SESSION_TTL_MS;
    void extendAuthSession(session.rowId, session.expiresAt).catch(() => {});
  }

  return session;
}

export function getAuthSession(token: string): Promise<AuthSession | null> {
  const hash = hashToken(token);

  const hit = cache.get(hash);
  if (hit) {
    return Promise.resolve(validate(hash, hit));
  }

  const running = inflight.get(hash);
  if (running) {
    return running;
  }

  const promise = findAuthSession(hash)
    .then((stored) => {
      if (!stored) {
        return null;
      }
      const session: AuthSession = { ...stored, touchedAt: Date.now() };
      cache.set(hash, session);
      return validate(hash, session);
    })
    .finally(() => {
      inflight.delete(hash);
    });

  inflight.set(hash, promise);
  return promise;
}

export async function createAuthSession(input: {
  userId: string;
  role: AuthRole;
  profile: SessionProfile;
}): Promise<{ token: string; session: AuthSession }> {
  const token = randomBytes(32).toString("base64url");
  const hash = hashToken(token);
  const now = Date.now();
  const expiresAt = now + SESSION_TTL_MS;

  const rowId = await insertAuthSession({
    tokenHash: hash,
    userId: input.userId,
    role: input.role,
    profile: input.profile,
    expiresAt,
  });

  const session: AuthSession = {
    rowId,
    userId: input.userId,
    role: input.role,
    profile: input.profile,
    expiresAt,
    touchedAt: now,
  };
  cache.set(hash, session);

  return { token, session };
}

export async function destroyAuthSession(token: string): Promise<void> {
  const hash = hashToken(token);
  const session = cache.get(hash) ?? (await findAuthSession(hash));
  cache.delete(hash);

  if (session) {
    await deleteAuthSession(session.rowId);
  }
}

export function authSessionCount(): number {
  return cache.size;
}

export function startAuthSessionSweep(): void {
  setInterval(() => {
    const now = Date.now();
    for (const [hash, session] of cache) {
      if (session.expiresAt <= now) {
        cache.delete(hash);
      }
    }
    void deleteExpiredAuthSessions().catch(() => {});
  }, SWEEP_EVERY_MS).unref();
}
