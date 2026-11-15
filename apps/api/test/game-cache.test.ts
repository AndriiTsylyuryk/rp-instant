import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Game } from "../src/repo/games.js";

const mocks = vi.hoisted(() => ({
  getGameByCode: vi.fn(),
  getGameById: vi.fn(),
}));

vi.mock("../src/repo/games.js", () => ({
  getGameByCode: mocks.getGameByCode,
  getGameById: mocks.getGameById,
}));

type CacheModule = typeof import("../src/game-cashe.js");

const TTL_MS = 2000;
const NEGATIVE_TTL_MS = 5000;
const BASE_TIME = Date.parse("2026-01-01T00:00:00.000Z");

let cache: CacheModule;

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: "game_1",
    clubId: "club_1",
    title: "Derby",
    code: "ABC123",
    status: "lobby",
    locale: "et",
    startsAt: null,
    schedule: null,
    joiningLocked: false,
    sponsor: null,
    ...overrides,
  };
}

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(BASE_TIME);
  cache = await import("../src/game-cashe.js");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("getCachedGameByCode", () => {
  it("loads by uppercased code and serves the cached value", async () => {
    const game = makeGame();
    mocks.getGameByCode.mockResolvedValue(game);

    await expect(cache.getCachedGameByCode("abc123")).resolves.toBe(game);
    expect(mocks.getGameByCode).toHaveBeenCalledWith("ABC123");

    await expect(cache.getCachedGameByCode("ABC123")).resolves.toBe(game);
    expect(mocks.getGameByCode).toHaveBeenCalledTimes(1);
  });

  it("reloads after the positive TTL expires", async () => {
    mocks.getGameByCode.mockResolvedValue(makeGame());

    await cache.getCachedGameByCode("abc123");
    vi.setSystemTime(BASE_TIME + TTL_MS - 1);
    await cache.getCachedGameByCode("abc123");
    expect(mocks.getGameByCode).toHaveBeenCalledTimes(1);

    vi.setSystemTime(BASE_TIME + TTL_MS);
    await cache.getCachedGameByCode("abc123");
    expect(mocks.getGameByCode).toHaveBeenCalledTimes(2);
  });

  it("caches misses for the negative TTL only", async () => {
    mocks.getGameByCode.mockResolvedValue(null);

    await expect(cache.getCachedGameByCode("abc123")).resolves.toBeNull();
    vi.setSystemTime(BASE_TIME + NEGATIVE_TTL_MS - 1);
    await expect(cache.getCachedGameByCode("abc123")).resolves.toBeNull();
    expect(mocks.getGameByCode).toHaveBeenCalledTimes(1);

    vi.setSystemTime(BASE_TIME + NEGATIVE_TTL_MS);
    await expect(cache.getCachedGameByCode("abc123")).resolves.toBeNull();
    expect(mocks.getGameByCode).toHaveBeenCalledTimes(2);
  });

  it("deduplicates concurrent loads for the same code", async () => {
    let resolveLoad!: (game: Game) => void;
    mocks.getGameByCode.mockReturnValue(
      new Promise<Game>((resolve) => {
        resolveLoad = resolve;
      }),
    );
    const game = makeGame();

    const first = cache.getCachedGameByCode("abc123");
    const second = cache.getCachedGameByCode("abc123");

    expect(mocks.getGameByCode).toHaveBeenCalledTimes(1);
    resolveLoad(game);

    await expect(first).resolves.toBe(game);
    await expect(second).resolves.toBe(game);
  });

  it("reloads after an in-flight load fails", async () => {
    mocks.getGameByCode
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(makeGame());

    await expect(cache.getCachedGameByCode("abc123")).rejects.toThrow("boom");
    await expect(cache.getCachedGameByCode("abc123")).resolves.toMatchObject({
      id: "game_1",
    });
    expect(mocks.getGameByCode).toHaveBeenCalledTimes(2);
  });
});

describe("getCachedGameById", () => {
  it("reuses the game cached during a code lookup", async () => {
    const game = makeGame();
    mocks.getGameByCode.mockResolvedValue(game);
    await cache.getCachedGameByCode("abc123");

    await expect(cache.getCachedGameById("game_1")).resolves.toBe(game);
    expect(mocks.getGameById).not.toHaveBeenCalled();
  });

  it("loads by id and caches the result", async () => {
    const game = makeGame();
    mocks.getGameById.mockResolvedValue(game);

    await expect(cache.getCachedGameById("game_1")).resolves.toBe(game);
    await expect(cache.getCachedGameById("game_1")).resolves.toBe(game);
    expect(mocks.getGameById).toHaveBeenCalledWith("game_1");
    expect(mocks.getGameById).toHaveBeenCalledTimes(1);
  });
});

describe("invalidateGame", () => {
  it("drops both code and id cache entries", async () => {
    const game = makeGame();
    mocks.getGameByCode.mockResolvedValue(game);
    mocks.getGameById.mockResolvedValue(game);

    await cache.getCachedGameByCode("abc123");
    cache.invalidateGame(game);

    await cache.getCachedGameById("game_1");
    await cache.getCachedGameByCode("abc123");

    expect(mocks.getGameByCode).toHaveBeenCalledTimes(2);
    expect(mocks.getGameById).toHaveBeenCalledTimes(1);
  });
});
