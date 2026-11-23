import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const TTL_MS = 10 * 60 * 1000;

const configured = process.env.SIGNUP_TOKEN_SECRET;
if (!configured && process.env.NODE_ENV === "production") {
  throw new Error("Missing SIGNUP_TOKEN_SECRET");
}

const SECRET = configured || randomBytes(32).toString("hex");

export type SignupClaims = { email: string; sub: string };

function sign(body: string): string {
  return createHmac("sha256", SECRET).update(body).digest("base64url");
}

export function createSignupToken(
  claims: SignupClaims,
  now = Date.now(),
): string {
  const body = Buffer.from(
    JSON.stringify({ e: claims.email, s: claims.sub, x: now + TTL_MS }),
  ).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifySignupToken(
  token: string,
  now = Date.now(),
): SignupClaims | null {
  const [body, mac, extra] = token.split(".");
  if (!body || !mac || extra !== undefined) return null;

  const expected = Buffer.from(sign(body));
  const actual = Buffer.from(mac);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }

  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString()) as {
      e?: unknown;
      s?: unknown;
      x?: unknown;
    };
    if (
      typeof data.e !== "string" ||
      typeof data.s !== "string" ||
      typeof data.x !== "number" ||
      data.x <= now
    ) {
      return null;
    }
    return { email: data.e, sub: data.s };
  } catch {
    return null;
  }
}
