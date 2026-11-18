export const PLAY_COOKIE = "rp_play";

export const AUTH_COOKIE = "rp_auth";

export const COOKIE_SECURE = process.env.NODE_ENV === "production";

export const AUTH_COOKIE_MAX_AGE_S = 60 * 60 * 24 * 14;

export const authCookieOptions = {
  path: "/api",
  httpOnly: true,
  secure: COOKIE_SECURE,
  sameSite: "lax",
  maxAge: AUTH_COOKIE_MAX_AGE_S,
} as const;
