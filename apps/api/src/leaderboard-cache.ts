import type { LeaderboardRow } from "@rp/shared";
import { getScoreboard } from "./repo/participants.js";

const TTL_MS = 2000;
const TOP_N = 10;

type Board = {
  top: LeaderboardRow[];
  scores: number[]; // усі бали, за спаданням — основа для рангу
  builtAt: number;
};

const cache = new Map<string, Board>();
const inflight = new Map<string, Promise<Board>>();

export function getBoard(gameId: string): Promise<Board> {
  const hit = cache.get(gameId);
  if (hit && Date.now() - hit.builtAt < TTL_MS) {
    return Promise.resolve(hit);
  }

  const running = inflight.get(gameId);
  if (running) {
    return running;
  }

  const promise = getScoreboard(gameId)
    .then((rows) => {
      const board: Board = {
        top: rows.slice(0, TOP_N).map((row, i) => ({
          rank: i + 1,
          nickname: row.nickname,
          score: row.score,
        })),
        scores: rows.map((row) => row.score),
        builtAt: Date.now(),
      };

      cache.set(gameId, board);
      return board;
    })
    .finally(() => {
      inflight.delete(gameId);
    });

  inflight.set(gameId, promise);
  return promise;
}

/** Скільки гравців мають строго більший бал, +1. Бінарний пошук по спадному масиву. */
export function rankOf(board: Board, score: number): number {
  let low = 0;
  let high = board.scores.length;

  while (low < high) {
    const mid = (low + high) >> 1;
    if (board.scores[mid] > score) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return low + 1;
}

export function invalidateBoard(gameId: string): void {
  cache.delete(gameId);
}
