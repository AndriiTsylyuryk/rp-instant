import { getPhaseAt, type Schedule } from "@rp/shared";
import type { Game } from "./repo/games.js";

export type StateSlice = {
  phase: ReturnType<typeof getPhaseAt>["phase"] | "draft" | "ended";
  nextBoundaryAt: number | null;
};

export function computeState(game: Game, now: number): StateSlice {
  if (game.status === "draft") {
    return { phase: "draft", nextBoundaryAt: null };
  }
  if (game.status === "ended" || game.status === "cancelled") {
    return { phase: "ended", nextBoundaryAt: null };
  }
  if (game.startsAt === null || game.schedule === null) {
    return { phase: { type: "lobby" }, nextBoundaryAt: null };
  }

  const elapsed = now - game.startsAt;
  if (elapsed < 0) {
    return { phase: { type: "lobby" }, nextBoundaryAt: game.startsAt };
  }

  return getPhaseAt(game.schedule as Schedule, elapsed);
}
