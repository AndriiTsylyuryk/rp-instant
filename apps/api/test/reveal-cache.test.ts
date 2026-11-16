import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  countByOption: vi.fn(),
}));

vi.mock("../src/repo/answers.js", () => ({
  countByOption: mocks.countByOption,
}));

type RevealCacheModule = typeof import("../src/reveal-cache.js");

let cache: RevealCacheModule;

beforeEach(async () => {
  vi.resetModules();
  vi.resetAllMocks();
  cache = await import("../src/reveal-cache.js");
});

describe("getCachedCounts", () => {
  it("loads counts once and serves the cached array", async () => {
    const counts = [3, 5];
    mocks.countByOption.mockResolvedValue(counts);

    await expect(cache.getCachedCounts("question_1", 2)).resolves.toBe(counts);
    await expect(cache.getCachedCounts("question_1", 2)).resolves.toBe(counts);

    expect(mocks.countByOption).toHaveBeenCalledWith("question_1", 2);
    expect(mocks.countByOption).toHaveBeenCalledTimes(1);
  });

  it("keeps separate caches per question", async () => {
    mocks.countByOption
      .mockResolvedValueOnce([1])
      .mockResolvedValueOnce([2]);

    await cache.getCachedCounts("question_1", 1);
    await cache.getCachedCounts("question_2", 1);

    expect(mocks.countByOption).toHaveBeenNthCalledWith(1, "question_1", 1);
    expect(mocks.countByOption).toHaveBeenNthCalledWith(2, "question_2", 1);
  });

  it("deduplicates concurrent loads for the same question", async () => {
    let resolveLoad!: (counts: number[]) => void;
    mocks.countByOption.mockReturnValue(
      new Promise<number[]>((resolve) => {
        resolveLoad = resolve;
      }),
    );
    const counts = [4, 6];

    const first = cache.getCachedCounts("question_1", 2);
    const second = cache.getCachedCounts("question_1", 2);

    expect(mocks.countByOption).toHaveBeenCalledTimes(1);
    resolveLoad(counts);

    await expect(first).resolves.toBe(counts);
    await expect(second).resolves.toBe(counts);
  });

  it("reloads after a failed load", async () => {
    mocks.countByOption
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce([1, 2]);

    await expect(cache.getCachedCounts("question_1", 2)).rejects.toThrow(
      "boom",
    );
    await expect(cache.getCachedCounts("question_1", 2)).resolves.toEqual([
      1, 2,
    ]);
    expect(mocks.countByOption).toHaveBeenCalledTimes(2);
  });
});

describe("invalidateCounts", () => {
  it("forces the next lookup to reload", async () => {
    mocks.countByOption.mockResolvedValue([1, 2]);

    await cache.getCachedCounts("question_1", 2);
    cache.invalidateCounts("question_1");
    await cache.getCachedCounts("question_1", 2);

    expect(mocks.countByOption).toHaveBeenCalledTimes(2);
  });
});
