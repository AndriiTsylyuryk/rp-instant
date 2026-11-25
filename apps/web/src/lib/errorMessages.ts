import { isApiError } from "../api/http";

const COMMON_ERRORS: Record<string, string> = {
  bad_origin: "Request blocked (origin).",
  forbidden: "You don't have access to this action.",
  google_unavailable: "Google is unavailable. Try again later.",
  invalid_google_token: "Could not verify Google sign-in.",
  network: "No connection to the server.",
  no_session: "Your session has expired. Please log in again.",
  rate_limited: "Too many attempts. Try again later.",
};

export const AUTH_ERRORS: Record<string, string> = {
  ...COMMON_ERRORS,
  bad_request: "Check your input (password must be at least 8 characters).",
  email_not_verified: "Verify your email first.",
  email_taken: "An account with this email already exists.",
  google_not_configured: "Google sign-in is not configured.",
  invalid_credentials: "Invalid email or password.",
  invalid_token: "Could not verify sign-in.",
  no_account: "No account with this email.",
  signup_expired: "Sign-up expired. Continue with Google again.",
};

export const JOIN_ERRORS: Record<string, string> = {
  ...COMMON_ERRORS,
  bad_nickname: "Nickname must be 5–20 characters.",
  game_ended: "This game has already ended.",
  joining_locked: "Joining this game is closed.",
  nickname_taken: "This nickname is already taken.",
  not_found: "Game with this code was not found.",
  rate_limited: "Too many attempts. Try again in a minute.",
};

export const ACCOUNT_ERRORS: Record<string, string> = {
  ...COMMON_ERRORS,
  invalid_credentials: "Could not confirm your identity.",
};

export const NICKNAME_ERRORS: Record<string, string> = {
  ...ACCOUNT_ERRORS,
  bad_request: "Nickname must be 5–20 characters.",
};

export function describeError(
  err: unknown,
  messages: Record<string, string>,
  fallback = "Something went wrong.",
): string {
  if (isApiError(err)) {
    return messages[err.code] ?? fallback;
  }
  return fallback;
}

export function describeAuthError(err: unknown): string {
  const fallback =
    err instanceof Error && err.message ? err.message : "Something went wrong.";
  return describeError(err, AUTH_ERRORS, fallback);
}

export function describeJoinError(err: unknown): string {
  if (isApiError(err) && err.status === 429) {
    return "Too many attempts. Try again in a minute.";
  }
  return describeError(err, JOIN_ERRORS, "Could not join the game.");
}

export function describeAccountError(err: unknown): string {
  return describeError(err, ACCOUNT_ERRORS);
}

export function describeNicknameError(err: unknown): string {
  return describeError(err, NICKNAME_ERRORS);
}
