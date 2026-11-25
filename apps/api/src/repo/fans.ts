import { randomBytes } from "node:crypto";
import PocketBase, { ClientResponseError } from "pocketbase";
import type { RecordModel } from "pocketbase";
import type { AuthCollection } from "@rp/shared";
import { PB_URL, pb, withPb } from "./pb.js";

export type CreatedFan = { id: string; email: string; nickname: string };

export type CreateFanResult =
  | { ok: true; fan: CreatedFan }
  | { ok: false; reason: "email_taken" | "invalid" };

type FanRow = { id: string; email: string; nickname: string };

export async function createFan(input: {
  email: string;
  password: string;
  nickname: string;
  verified?: boolean;
}): Promise<CreateFanResult> {
  try {
    const row = await withPb(() =>
      pb.collection("fans").create<FanRow>({
        email: input.email,
        password: input.password,
        passwordConfirm: input.password,
        nickname: input.nickname,
        emailVisibility: false,
        verified: input.verified ?? false,
        consent_at: new Date().toISOString(),
      }),
    );
    return {
      ok: true,
      fan: { id: row.id, email: row.email, nickname: row.nickname },
    };
  } catch (err) {
    if (err instanceof ClientResponseError && err.status === 400) {
      const data = err.response?.data as
        | Record<string, { code?: string }>
        | undefined;
      if (data?.email?.code === "validation_not_unique") {
        return { ok: false, reason: "email_taken" };
      }
      return { ok: false, reason: "invalid" };
    }
    throw err;
  }
}

export function randomPassword(): string {
  return randomBytes(32).toString("base64url");
}

export async function findAccountByEmail(
  collection: AuthCollection,
  email: string,
): Promise<RecordModel | null> {
  try {
    return await withPb(() =>
      pb
        .collection(collection)
        .getFirstListItem(pb.filter("email = {:email}", { email })),
    );
  } catch (err) {
    if (err instanceof ClientResponseError && err.status === 404) return null;
    throw err;
  }
}

export async function deleteFan(id: string): Promise<void> {
  try {
    await withPb(() => pb.collection("fans").delete(id));
  } catch (err) {
    if (err instanceof ClientResponseError && err.status === 404) return;
    throw err;
  }
}

export async function requestFanVerification(email: string): Promise<void> {
  await withPb(() => pb.collection("fans").requestVerification(email));
}

export async function confirmFanVerification(token: string): Promise<boolean> {
  try {
    await new PocketBase(PB_URL).collection("fans").confirmVerification(token);
    return true;
  } catch (err) {
    if (err instanceof ClientResponseError && err.status === 400) return false;
    throw err;
  }
}

export async function updateFanNickname(
  id: string,
  nickname: string,
): Promise<void> {
  await withPb(() => pb.collection("fans").update(id, { nickname }));
}
