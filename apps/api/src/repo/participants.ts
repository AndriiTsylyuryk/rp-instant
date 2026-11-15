import { randomBytes } from "crypto";
import { base64 } from "zod";
import { pb, withPb } from "./pb.js";
import { ClientResponseError } from "pocketbase";

type ParticipantRow = {
  id: string;
  game: string;
  nickname: string;
  session_token: string;
  score: number;
  hidden: boolean;
  fan: string;
  created: string;
};

export type Participant = {
  id: string;
  gameId: string;
  nickname: string;
  score: number;
  hidden: boolean;
  fanId: string | null;
};

function toParticipant(row: ParticipantRow) {
  return {
    id: row.id,
    gameId: row.game,
    nickname: row.nickname,
    score: row.score ?? 0,
    hidden: row.hidden ?? false,
    fanId: row.fan || null,
  };
}

export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export type JoinResult =
  | {
      ok: true;
      participant: Participant;
      sessionToken: string;
    }
  | { ok: false; reason: "nickname_taken" };

export async function createParticipant(
  gameId: string,
  nickname: string,
): Promise<JoinResult> {
  const sessionToken = newSessionToken();

  try {
    const row = await withPb(async () =>
      pb.collection("participants").create<ParticipantRow>({
        game: gameId,
        nickname,
        sessionToken,
        score: 0,
        hidden: false,
      }),
    );
    return { ok: true, participant: toParticipant(row), sessionToken };
  } catch (err) {
    if (err instanceof ClientResponseError && err.status === 400) {
      return { ok: false, reason: "nickname_taken" };
    }
    throw err;
  }
}
