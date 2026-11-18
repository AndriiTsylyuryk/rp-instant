import { ClientResponseError } from "pocketbase";
import { pb, withPb } from "./pb.js";

export type AuthRole = "fan" | "manager";

export type SessionProfile = {
  name: string | null;
  nickname: string | null;
  email: string | null;
  clubId: string | null;
};

type AuthSessionRow = {
  id: string;
  token_hash: string;
  user_id: string;
  role: AuthRole;
  profile: SessionProfile | null;
  expires_at: string;
};

export type StoredAuthSession = {
  rowId: string;
  userId: string;
  role: AuthRole;
  profile: SessionProfile;
  expiresAt: number;
};

const EMPTY_PROFILE: SessionProfile = {
  name: null,
  nickname: null,
  email: null,
  clubId: null,
};

function toStored(row: AuthSessionRow): StoredAuthSession {
  return {
    rowId: row.id,
    userId: row.user_id,
    role: row.role,
    profile: row.profile ?? EMPTY_PROFILE,
    expiresAt: new Date(row.expires_at).getTime(),
  };
}

export async function insertAuthSession(input: {
  tokenHash: string;
  userId: string;
  role: AuthRole;
  profile: SessionProfile;
  expiresAt: number;
}): Promise<string> {
  const row = await withPb(() =>
    pb.collection("auth_sessions").create<AuthSessionRow>({
      token_hash: input.tokenHash,
      user_id: input.userId,
      role: input.role,
      profile: input.profile,
      expires_at: new Date(input.expiresAt).toISOString(),
    }),
  );
  return row.id;
}

export async function findAuthSession(
  tokenHash: string,
): Promise<StoredAuthSession | null> {
  try {
    return await withPb(async () => {
      const row = await pb
        .collection("auth_sessions")
        .getFirstListItem<AuthSessionRow>(
          pb.filter("token_hash = {:h}", { h: tokenHash }),
        );
      return toStored(row);
    });
  } catch (err) {
    if (err instanceof ClientResponseError && err.status === 404) return null;
    throw err;
  }
}

export async function extendAuthSession(
  rowId: string,
  expiresAt: number,
): Promise<void> {
  await withPb(() =>
    pb.collection("auth_sessions").update(rowId, {
      expires_at: new Date(expiresAt).toISOString(),
    }),
  );
}

export async function deleteAuthSession(rowId: string): Promise<void> {
  try {
    await withPb(() => pb.collection("auth_sessions").delete(rowId));
  } catch (err) {
    if (err instanceof ClientResponseError && err.status === 404) return;
    throw err;
  }
}

export async function deleteExpiredAuthSessions(): Promise<number> {
  const rows = await withPb(() =>
    pb.collection("auth_sessions").getFullList<{ id: string }>({
      filter: pb.filter("expires_at < {:now}", { now: new Date() }),
      fields: "id",
    }),
  );
  for (const row of rows) {
    await deleteAuthSession(row.id);
  }
  return rows.length;
}
