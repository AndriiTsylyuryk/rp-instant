import type { Game } from "./repo/games.js";
import { endedAtOf, GUEST_RESULTS_TTL_MS } from "./game-lifecycle.js";

const releaseAt = new Map<string, number>();

export function trackGame(game: Game, now: number = Date.now()): void {
  if (game.status === "cancelled") {
    releaseAt.set(game.id, now);
    return;
  }

  const endedAt = endedAtOf(game);
  if (endedAt === null) {
    releaseAt.delete(game.id);
    return;
  }

  releaseAt.set(game.id, endedAt + GUEST_RESULTS_TTL_MS);
}

export function dueGames(now: number = Date.now()): string[] {
  const due: string[] = [];
  for (const [gameId, at] of releaseAt) {
    if (now >= at) {
      due.push(gameId);
    }
  }
  return due;
}

export function forgetGame(gameId: string): void {
  releaseAt.delete(gameId);
}

export function trackedGameCount(): number {
  return releaseAt.size;
}
