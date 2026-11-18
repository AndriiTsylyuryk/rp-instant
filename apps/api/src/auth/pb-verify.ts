import PocketBase, { ClientResponseError } from "pocketbase";
import type { RecordModel } from "pocketbase";
import type { AuthCollection } from "@rp/shared";
import type { AuthRole, SessionProfile } from "../repo/auth-sessions.js";

const PB_URL = process.env.PB_URL || "http://127.0.0.1:8090";

export type VerifiedUser = {
  userId: string;
  role: AuthRole;
  profile: SessionProfile;
};

const ROLE_BY_COLLECTION: Record<AuthCollection, AuthRole> = {
  fans: "fan",
  managers: "manager",
};

function str(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function toVerified(
  collection: AuthCollection,
  record: RecordModel,
): VerifiedUser {
  // TODO: для fans можна вимагати record.verified === true,
  // коли налаштуєте SMTP і підтвердження email для реєстрації паролем.
  return {
    userId: record.id,
    role: ROLE_BY_COLLECTION[collection],
    profile: {
      name: str(record.name),
      nickname: str(record.nickname),
      email: str(record.email),
      clubId: str(record.club),
    },
  };
}

function freshClient(): PocketBase {
  const client = new PocketBase(PB_URL);
  client.autoCancellation(false);
  return client;
}

function isRejection(err: unknown): boolean {
  return (
    err instanceof ClientResponseError &&
    [400, 401, 403, 404].includes(err.status)
  );
}

export async function verifyPbToken(
  collection: AuthCollection,
  token: string,
): Promise<VerifiedUser | null> {
  const client = freshClient();
  client.authStore.save(token, null);

  try {
    const { record } = await client.collection(collection).authRefresh();
    return toVerified(collection, record);
  } catch (err) {
    if (isRejection(err)) return null;
    throw err;
  }
}

export async function verifyPassword(
  collection: AuthCollection,
  email: string,
  password: string,
): Promise<VerifiedUser | null> {
  const client = freshClient();

  try {
    const { record } = await client
      .collection(collection)
      .authWithPassword(email, password);
    return toVerified(collection, record);
  } catch (err) {
    if (isRejection(err)) return null;
    throw err;
  }
}
