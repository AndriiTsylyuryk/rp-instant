import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildSchedule } from "@rp/shared";
import { GUEST_RESULTS_TTL_MS } from "../src/game-lifecycle.js";
import type { Game } from "../src/repo/games.js";

const mocks = vi.hoisted(() => ({
  sweepGameCache: vi.fn(),
  releaseGame: vi.fn(),
}));

vi.mock("../src/game-cache.js", () => ({
  sweepGameCache: mocks.sweepGameCache,
}));

vi.mock("../src/transitions.js", () => ({
  releaseGame: mocks.releaseGame,
}));

type Sweep = typeof import("../src/cache-sweep.js");
type Registry = typeof import("../src/game-registry.js");

const START = Date.parse("2026-01-01T12:00:00.000Z");
const schedule = buildSchedule([{ kind: "quiz" }]);
const releaseAt = START + schedule.endsAt + GUEST_RESULTS_TTL_MS;

let sweep: Sweep;
let registry: Registry;

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: "game_1",
    clubId: "club_1",
    title: "Derby",
    code: "ABC123",
    status: "live",
    locale: "et",
    startsAt: START,
    schedule,
    joiningLocked: false,
    sponsor: null,
    ...overrides,
  };
}

beforeEach(async () => {
  vi.resetModules();
  vi.resetAllMocks();
  mocks.releaseGame.mockResolvedValue(undefined);
  sweep = await import("../src/cache-sweep.js");
  registry = await import("../src/game-registry.js");
});

describe("sweepCaches", () => {
  it("evicts stale game-cache entries on every pass", () => {
    sweep.sweepCaches(123);

    expect(mocks.sweepGameCache).toHaveBeenCalledWith(123);
  });

  it("does not release a game before its results window ends", () => {
    registry.trackGame(makeGame());

    expect(sweep.sweepCaches(releaseAt - 1)).toEqual([]);
    expect(mocks.releaseGame).not.toHaveBeenCalled();
  });

  it("releases a game once after its window and then forgets it", () => {
    registry.trackGame(makeGame());

    expect(sweep.sweepCaches(releaseAt)).toEqual(["game_1"]);
    expect(mocks.releaseGame).toHaveBeenCalledWith("game_1");

    sweep.sweepCaches(releaseAt + 60_000);
    expect(mocks.releaseGame).toHaveBeenCalledTimes(1);
  });

  it("releases cancelled games on the next pass", () => {
    registry.trackGame(makeGame({ status: "cancelled" }), 1000);

    expect(sweep.sweepCaches(1000)).toEqual(["game_1"]);
  });

  it("keeps sweeping when a release fails", async () => {
    mocks.releaseGame.mockRejectedValue(new Error("boom"));
    registry.trackGame(makeGame());

    expect(() => sweep.sweepCaches(releaseAt)).not.toThrow();
  });
});
