import PocketBase, { ClientResponseError } from "pocketbase";

const url = process.env.PB_URL || "https://127.0.0.1:8090";
const email = process.env.PB_SUPERUSER_EMAIL;
const password = process.env.PB_SUPERUSER_PASSWORD;

if (!email || !password) {
  throw new Error("Missing PB_SUPERUSER_EMAIL or PB_SUPERUSER_PASSWORD");
}

export const pb = new PocketBase(url);
pb.autoCancellation(false);

let authing: Promise<unknown> | null = null;

export function authenticate(): Promise<unknown> {
  if (!authing) {
    authing = pb
      .collection("_superusers")
      .authWithPassword(email!, password!)
      .finally(() => {
        authing = null;
      });
  }
  return authing;
}

export async function withPb<T>(
  fn: (pb: PocketBase) => Promise<T>,
): Promise<T> {
  if (!pb.authStore.isValid) {
    await authenticate();
  }

  try {
    return await fn(pb);
  } catch (err) {
    if (!isAuthError(err)) {
      throw err;
    }

    pb.authStore.clear();
    await authenticate();
    return fn(pb);
  }
}

function isAuthError(err: unknown): boolean {
  return (
    err instanceof ClientResponseError &&
    (err.status === 401 || err.status === 403)
  );
}
