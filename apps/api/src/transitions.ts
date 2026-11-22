import type { Game } from "./repo/games.js";
import { saveFinalTop, setGameStatus } from "./repo/games.js";
import { invalidateGame } from "./game-cache.js";
import { getBoard, invalidateBoard } from "./leaderboard-cache.js";
import { dropGameSessions } from "./session-cache.js";
import { dropPlayerCount } from "./player-count.js";
import { invalidateQuestions, peekQuestions } from "./questions-cache.js";
import { invalidateCounts } from "./reveal-cache.js";
import type { StateSlice } from "./state.js";

const pending = new Set<string>();

function wantedStatus(phase: StateSlice["phase"]): Game["status"] | null {
  if (typeof phase === "string") {
    return null;
  }
  if (phase.type === "lobby") return "lobby";
  if (phase.type === "final") return "ended";
  return "live";
}

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
  await saveFinalTop(game.id, board.top);
  invalidateGame(game);
}

export async function releaseGame(gameId: string): Promise<void> {
  for (const question of peekQuestions(gameId)) {
    invalidateCounts(question.id);
  }

  invalidateQuestions(gameId);
  dropGameSessions(gameId);
  dropPlayerCount(gameId);
  invalidateBoard(gameId);
}
