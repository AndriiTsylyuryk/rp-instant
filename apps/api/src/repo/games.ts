import type { Schedule } from "@rp/shared";
import { pb, withPb } from "./pb.js";
import { ClientResponseError } from "pocketbase";

type GameRow = {
  id: string;
  club: string;
  title: string;
  join_code: string;
  status: "draft" | "lobby" | "live" | "ended" | "cancelled";
  locale: "et" | "en";
  starts_at: string;
  schedule: Schedule | null;
  joining_locked: boolean;
  sponsor_name: string | null;
  sponsor_logo: string | null;
};

export type Game = {
  id: string;
  clubId: string;
  title: string;
  code: string;
  status: GameRow["status"];
  locale: GameRow["locale"];
  startsAt: number | null;
  schedule: Schedule | null;
  joiningLocked: boolean;
  sponsor: {
    name: string | null;
    logoUrl: string | null;
  } | null;
};

function toGame(row: GameRow): Game {
  return {
    id: row.id,
    clubId: row.club,
    title: row.title,
    code: row.join_code,
    status: row.status,
    locale: row.locale,
    startsAt: row.starts_at ? new Date(row.starts_at).getTime() : null,
    schedule: row.schedule,
    joiningLocked: row.joining_locked,
    sponsor:
      row.sponsor_name || row.sponsor_logo
        ? {
            name: row.sponsor_name,
            logoUrl: row.sponsor_logo
              ? `/api/files/games/${row.id}/${row.sponsor_logo}`
              : null,
          }
        : null,
  };
}

export async function getGameByCode(code: string): Promise<Game | null> {
  try {
    return await withPb(async () => {
      const row = await pb
        .collection("games")
        .getFirstListItem<GameRow>(
          pb.filter("join_code = {:code}", { code: code.toUpperCase() }),
          { sort: "-created" },
        );
      return toGame(row);
    });
  } catch (err) {
    if (err instanceof ClientResponseError && err.status === 404) {
      return null;
    }
    throw err;
  }
}

export async function getGameByScreenToken(
  token: string,
): Promise<Game | null> {
  try {
    return await withPb(async () => {
      const row = await pb
        .collection("games")
        .getFirstListItem<GameRow>(
          pb.filter("screen_token = {:t} && status != 'draft'", { t: token }),
        );
      return toGame(row);
    });
  } catch (err) {
    if (err instanceof ClientResponseError && err.status === 404) {
      return null;
    }
    throw err;
  }
}

export async function getGameById(id: string): Promise<Game | null> {
  try {
    return await withPb(async () => {
      const row = await pb
        .collection("games")
        .getFirstListItem<GameRow>(pb.filter("id = {:id}", { id: id }), {
          sort: "-created",
        });
      return toGame(row);
    });
  } catch (err) {
    if (err instanceof ClientResponseError && err.status === 404) {
      return null;
    }
    throw err;
  }
}

export function openLobby(
  id: string,
  startsAt: number,
  schedule: Schedule,
): Promise<void> {
  return withPb(async () => {
    await pb.collection("games").update(id, {
      status: "lobby",
      starts_at: new Date(startsAt).toISOString(),
      schedule,
    });
  });
}

export function moveStartsAt(id: string, startsAt: string): Promise<void> {
  return withPb(async () => {
    await pb.collection("games").update(id, {
      starts_at: new Date(startsAt).toISOString(),
    });
  });
}

export function saveFinalTop(id: string, top: unknown): Promise<void> {
  return withPb(async () => {
    await pb.collection("games").update(id, {
      final_top: top,
      ended_at: new Date().toISOString(),
      status: "ended",
    });
  });
}

export function setGameStatus(
  id: string,
  status: Game["status"],
): Promise<void> {
  return withPb(async () => {
    await pb.collection("games").update(id, { status });
  });
}
