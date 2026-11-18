import { ClientResponseError } from "pocketbase";
import { pb, withPb } from "./pb.js";

export type CreatedFan = { id: string; email: string; nickname: string };

export type CreateFanResult =
  | { ok: true; fan: CreatedFan }
  | { ok: false; reason: "email_taken" | "invalid" };

type FanRow = { id: string; email: string; nickname: string };

export async function createFan(input: {
  email: string;
  password: string;
  nickname: string;
}): Promise<CreateFanResult> {
  try {
    const row = await withPb(() =>
      pb.collection("fans").create<FanRow>({
        email: input.email,
        password: input.password,
        passwordConfirm: input.password,
        nickname: input.nickname,
        emailVisibility: false,
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
