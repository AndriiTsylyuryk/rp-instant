import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getScoreboard: vi.fn(),
}));

vi.mock("../src/repo/participants.js", () => ({
  getScoreboard: mocks.getScoreboard,
}));

type LeaderboardCacheModule = typeof import("../src/leaderboard-cache.js");

const TTL_MS = 2000;
const BASE_TIME = Date.parse("2026-01-01T00:00:00.000Z");

let cache: LeaderboardCacheModule;

function makeRows(scores: number[]) {
  return scores.map((score, index) => ({
    nickname: `player_${index + 1}`,
    score,
  }));
}

beforeEach(async () => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(BASE_TIME);
  cache = await import("../src/leaderboard-cache.js");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("getBoard", () => {
  it("builds the top and full score list once per TTL", async () => {
    mocks.getScoreboard.mockResolvedValue(makeRows([100, 80, 60]));

    const first = await cache.getBoard("game_1");
    const second = await cache.getBoard("game_1");

    expect(first).toEqual({
      top: [
        { rank: 1, nickname: "player_1", score: 100 },
        { rank: 2, nickname: "player_2", score: 80 },
        { rank: 3, nickname: "player_3", score: 60 },
      ],
      scores: [100, 80, 60],
      builtAt: BASE_TIME,
    });
    expect(second).toBe(first);
    expect(mocks.getScoreboard).toHaveBeenCalledWith("game_1");
    expect(mocks.getScoreboard).toHaveBeenCalledTimes(1);
  });

  it("limits top to ten while keeping every score for ranking", async () => {
    mocks.getScoreboard.mockResolvedValue(
      makeRows([120, 110, 100, 90, 80, 70, 60, 50, 40, 30, 20, 10]),
    );

    const board = await cache.getBoard("game_1");

    expect(board.top).toHaveLength(10);
    expect(board.top[9]).toEqual({
      rank: 10,
      nickname: "player_10",
      score: 30,
    });
    expect(board.scores).toHaveLength(12);
  });

  it("reloads after the TTL expires", async () => {
    mocks.getScoreboard.mockResolvedValueOnce(makeRows([10]));

    await cache.getBoard("game_1");
    vi.setSystemTime(BASE_TIME + TTL_MS);
    mocks.getScoreboard.mockResolvedValueOnce(makeRows([20]));
    const board = await cache.getBoard("game_1");

    expect(board.top[0].score).toBe(20);
    expect(mocks.getScoreboard).toHaveBeenCalledTimes(2);
  });

  it("keeps separate boards per game", async () => {
    mocks.getScoreboard
      .mockResolvedValueOnce(makeRows([1]))
      .mockResolvedValueOnce(makeRows([2]));

    const first = await cache.getBoard("game_1");
    const second = await cache.getBoard("game_2");

    expect(first.scores).toEqual([1]);
    expect(second.scores).toEqual([2]);
    expect(mocks.getScoreboard).toHaveBeenNthCalledWith(1, "game_1");
    expect(mocks.getScoreboard).toHaveBeenNthCalledWith(2, "game_2");
  });

  it("deduplicates concurrent loads for the same game", async () => {
    let resolveLoad!: (
      rows: ReturnType<typeof makeRows>,
    ) => void;
    mocks.getScoreboard.mockReturnValue(
      new Promise((resolve) => {
        resolveLoad = resolve;
      }),
    );

    const first = cache.getBoard("game_1");
    const second = cache.getBoard("game_1");

    expect(mocks.getScoreboard).toHaveBeenCalledTimes(1);
    resolveLoad(makeRows([5]));

    await expect(first).resolves.toMatchObject({ scores: [5] });
    await expect(second).resolves.toMatchObject({ scores: [5] });
  });

  it("reloads after a failed load", async () => {
    mocks.getScoreboard
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(makeRows([5]));

    await expect(cache.getBoard("game_1")).rejects.toThrow("boom");
    await expect(cache.getBoard("game_1")).resolves.toMatchObject({
      scores: [5],
    });
    expect(mocks.getScoreboard).toHaveBeenCalledTimes(2);
  });
});

describe("rankOf", () => {
  it("returns the shared rank for tied scores", async () => {
    mocks.getScoreboard.mockResolvedValue(
      makeRows([100, 80, 80, 50]),
    );
    const board = await cache.getBoard("game_1");

    expect(cache.rankOf(board, 100)).toBe(1);
    expect(cache.rankOf(board, 80)).toBe(2);
    expect(cache.rankOf(board, 50)).toBe(4);
    expect(cache.rankOf(board, 0)).toBe(5);
  });

  it("returns first place for an empty board", async () => {
    mocks.getScoreboard.mockResolvedValue([]);
    const board = await cache.getBoard("game_1");

    expect(cache.rankOf(board, 0)).toBe(1);
  });
});

describe("invalidateBoard", () => {
  it("forces the next lookup to reload", async () => {
    mocks.getScoreboard.mockResolvedValueOnce(makeRows([1]));

    await cache.getBoard("game_1");
    cache.invalidateBoard("game_1");
    mocks.getScoreboard.mockResolvedValueOnce(makeRows([2]));
    const board = await cache.getBoard("game_1");

    expect(board.scores).toEqual([2]);
    expect(mocks.getScoreboard).toHaveBeenCalledTimes(2);
  });
});
