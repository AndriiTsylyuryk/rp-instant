import createHttpError from "http-errors";

const TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo";
const ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);

export type GoogleIdentity = {
  sub: string;
  email: string;
  name: string | null;
};

export async function verifyGoogleIdToken(
  idToken: string,
): Promise<GoogleIdentity | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw createHttpError(503, "google_not_configured");
  }

  let res: Response;
  try {
    res = await fetch(
      `${TOKENINFO_URL}?id_token=${encodeURIComponent(idToken)}`,
      {
        signal: AbortSignal.timeout(5000),
      },
    );
  } catch {
    throw createHttpError(502, "google_unavailable");
  }

  if (res.status >= 500) {
    throw createHttpError(502, "google_unavailable");
  }
  if (!res.ok) {
    return null;
  }

  const data = (await res.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!data) return null;

  const exp = Number(data.exp);
  if (
    data.aud !== clientId ||
    typeof data.iss !== "string" ||
    !ISSUERS.has(data.iss) ||
    !Number.isFinite(exp) ||
    exp * 1000 <= Date.now() ||
    String(data.email_verified) !== "true" ||
    typeof data.email !== "string" ||
    typeof data.sub !== "string"
  ) {
    return null;
  }

  return {
    sub: data.sub,
    email: data.email.toLowerCase(),
    name: typeof data.name === "string" && data.name ? data.name : null,
  };
}
