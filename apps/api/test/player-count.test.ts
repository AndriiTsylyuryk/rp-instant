import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  countParticipants: vi.fn(),
}));

vi.mock("../src/repo/participants.js", () => ({
  countParticipants: mocks.countParticipants,
}));

type PlayerCountModule = typeof import("../src/player-count.js");

const TTL_MS = 30_000;
const BASE_TIME = Date.parse("2026-01-01T00:00:00.000Z");

let cache: PlayerCountModule;

beforeEach(async () => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(BASE_TIME);
  cache = await import("../src/player-count.js");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("getPlayerCount", () => {
  it("loads once and serves the cached count for the TTL", async () => {
    mocks.countParticipants.mockResolvedValue(7);

    await expect(cache.getPlayerCount("game_1")).resolves.toBe(7);
    vi.setSystemTime(BASE_TIME + TTL_MS - 1);
    await expect(cache.getPlayerCount("game_1")).resolves.toBe(7);

    expect(mocks.countParticipants).toHaveBeenCalledWith("game_1");
    expect(mocks.countParticipants).toHaveBeenCalledTimes(1);
  });

  it("reloads after the TTL expires", async () => {
    mocks.countParticipants.mockResolvedValueOnce(7).mockResolvedValueOnce(9);

    await cache.getPlayerCount("game_1");
    vi.setSystemTime(BASE_TIME + TTL_MS);
    await expect(cache.getPlayerCount("game_1")).resolves.toBe(9);

    expect(mocks.countParticipants).toHaveBeenCalledTimes(2);
  });

  it("keeps separate counts per game", async () => {
    mocks.countParticipants
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(5);

    await expect(cache.getPlayerCount("game_1")).resolves.toBe(2);
    await expect(cache.getPlayerCount("game_2")).resolves.toBe(5);

    expect(mocks.countParticipants).toHaveBeenNthCalledWith(1, "game_1");
    expect(mocks.countParticipants).toHaveBeenNthCalledWith(2, "game_2");
  });

  it("deduplicates concurrent loads for the same game", async () => {
    let resolveLoad!: (count: number) => void;
    mocks.countParticipants.mockReturnValue(
      new Promise<number>((resolve) => {
        resolveLoad = resolve;
      }),
    );

    const first = cache.getPlayerCount("game_1");
    const second = cache.getPlayerCount("game_1");

    expect(mocks.countParticipants).toHaveBeenCalledTimes(1);
    resolveLoad(4);

    await expect(first).resolves.toBe(4);
    await expect(second).resolves.toBe(4);
  });

  it("reloads after a failed load", async () => {
    mocks.countParticipants
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(3);

    await expect(cache.getPlayerCount("game_1")).rejects.toThrow("boom");
    await expect(cache.getPlayerCount("game_1")).resolves.toBe(3);
    expect(mocks.countParticipants).toHaveBeenCalledTimes(2);
  });
});

describe("incrementPlayerCount", () => {
  it("increments an existing cached count", async () => {
    mocks.countParticipants.mockResolvedValue(3);
    await cache.getPlayerCount("game_1");

    cache.incrementPlayerCount("game_1");

    await expect(cache.getPlayerCount("game_1")).resolves.toBe(4);
    expect(mocks.countParticipants).toHaveBeenCalledTimes(1);
  });

  it("does nothing when the game is not cached", async () => {
    cache.incrementPlayerCount("game_1");

    mocks.countParticipants.mockResolvedValue(1);
    await expect(cache.getPlayerCount("game_1")).resolves.toBe(1);
    expect(mocks.countParticipants).toHaveBeenCalledTimes(1);
  });
});

describe("dropPlayerCount", () => {
  it("forces the next lookup to reload", async () => {
    mocks.countParticipants.mockResolvedValueOnce(2).mockResolvedValueOnce(8);

    await cache.getPlayerCount("game_1");
    cache.dropPlayerCount("game_1");
    await expect(cache.getPlayerCount("game_1")).resolves.toBe(8);

    expect(mocks.countParticipants).toHaveBeenCalledTimes(2);
  });
});
