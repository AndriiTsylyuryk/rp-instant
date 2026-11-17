import type { Game } from "./repo/games.js";
import { saveFinalTop, setGameStatus } from "./repo/games.js";
import { invalidateGame } from "./game-cache.js";
import { getBoard, invalidateBoard } from "./leaderboard-cache.js";
import { dropGameSessions } from "./session-cache.js";
import { dropPlayerCount } from "./player-count.js";
import { getCachedQuestions, invalidateQuestions } from "./questions-cache.js";
import { invalidateCounts } from "./reveal-cache.js";
import type { StateSlice } from "./state.js";

const EVICT_DELAY_MS = 10 * 60 * 1000;

const pending = new Set<string>();

function wantedStatus(phase: StateSlice["phase"]): Game["status"] | null {
  if (typeof phase === "string") {
    return null; // draft / ended — нічого доганяти
  }
  if (phase.type === "lobby") return "lobby";
  if (phase.type === "final") return "ended";
  return "live";
}

/**
 * Ліниве узгодження games.status із фазою. Викликається з читань стану,
 * нічого не чекає і ніколи не кидає — це сторона ефекту, а не частина відповіді.
 */
export function reconcileStatus(game: Game, phase: StateSlice["phase"]): void {
  if (game.status === "ended" || game.status === "cancelled") {
    return;
  }

  const wanted = wantedStatus(phase);
  if (wanted === null || wanted === game.status) {
    return;
  }

  if (pending.has(game.id)) {
    return;
  }
  pending.add(game.id);

  const work = wanted === "ended" ? endGame(game) : goLive(game, wanted);

  void work
    .catch(() => {})
    .finally(() => {
      pending.delete(game.id);
    });
}

async function goLive(game: Game, status: Game["status"]): Promise<void> {
  await setGameStatus(game.id, status);
  invalidateGame(game);
}

async function endGame(game: Game): Promise<void> {
  const board = await getBoard(game.id);
  await saveFinalTop(game.id, board.top); // пише final_top, ended_at, status
  invalidateGame(game);

  setTimeout(() => {
    void releaseGame(game.id);
  }, EVICT_DELAY_MS).unref();
}

/** Звільнити всю пам'ять, яку тримала гра. */
export async function releaseGame(gameId: string): Promise<void> {
  const questions = await getCachedQuestions(gameId).catch(() => []);
  for (const question of questions) {
    invalidateCounts(question.id);
  }

  invalidateQuestions(gameId);
  dropGameSessions(gameId);
  dropPlayerCount(gameId);
  invalidateBoard(gameId);
}
