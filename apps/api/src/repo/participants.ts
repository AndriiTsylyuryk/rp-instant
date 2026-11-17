import { randomBytes } from "crypto";
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
        session_token: sessionToken,
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

export async function getParticipantByToken(
  sessionToken: string,
): Promise<Participant | null> {
  try {
    return await withPb(async () => {
      const row = await pb
        .collection("participants")
        .getFirstListItem<ParticipantRow>(
          pb.filter("session_token = {:t}", { t: sessionToken }),
        );
      return toParticipant(row);
    });
  } catch (err) {
    if (err instanceof ClientResponseError && err.status === 404) return null;
    throw err;
  }
}

export function countParticipants(gameId: string): Promise<number> {
  return withPb(async () => {
    const res = await pb.collection("participants").getList(1, 1, {
      filter: pb.filter("game = {:g} && hidden = false", { g: gameId }),
      fields: "id",
    });
    return res.totalItems;
  });
}

export function getLeaderboard(gameId: string, limit = 10) {
  return withPb(async () => {
    const res = await pb
      .collection("participants")
      .getList<ParticipantRow>(1, limit, {
        filter: pb.filter("game = {:g} && hidden = false", { g: gameId }),
        sort: "-score,created",
        skipTotal: true,
      });
    return res.items.map((row, i) => ({
      rank: i + 1,
      nickname: row.nickname,
      score: row.score ?? 0,
    }));
  });
}

export function getScoreboard(
  gameId: string,
): Promise<Array<{ nickname: string; score: number }>> {
  return withPb(async () => {
    const rows = await pb
      .collection("participants")
      .getFullList<ParticipantRow>({
        filter: pb.filter("game = {:gameId} && hidden != true", { gameId }),
        sort: "-score,created",
        fields: "nickname,score",
      });

    return rows.map((row) => ({
      nickname: row.nickname,
      score: row.score ?? 0,
    }));
  });
}
