import type { Game } from "./repo/games.js";

export const GUEST_RESULTS_TTL_MS = 24 * 60 * 60 * 1000;

export function endedAtOf(game: Game): number | null {
  if (game.startsAt === null || game.schedule === null) {
    return null;
  }
  return game.startsAt + game.schedule.endsAt;
}

export function resultsWindowOver(game: Game, now: number): boolean {
  const endedAt = endedAtOf(game);
  return endedAt !== null && now > endedAt + GUEST_RESULTS_TTL_MS;
}
