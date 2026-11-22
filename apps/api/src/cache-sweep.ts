import { sweepGameCache } from "./game-cache.js";
import { dueGames, forgetGame } from "./game-registry.js";
import { releaseGame } from "./transitions.js";

const SWEEP_EVERY_MS = 60_000;

export function sweepCaches(now: number = Date.now()): string[] {
  sweepGameCache(now);

  const due = dueGames(now);
  for (const gameId of due) {
    forgetGame(gameId);
    void releaseGame(gameId).catch(() => {});
  }
  return due;
}

export function startCacheSweep(): void {
  setInterval(() => {
    sweepCaches();
  }, SWEEP_EVERY_MS).unref();
}
