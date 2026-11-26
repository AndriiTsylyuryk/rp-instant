import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildSchedule } from "@rp/shared";
import { GUEST_RESULTS_TTL_MS } from "../src/game-lifecycle.js";
import type { Game } from "../src/repo/games.js";

type Registry = typeof import("../src/game-registry.js");

const START = Date.parse("2026-01-01T12:00:00.000Z");
const schedule = buildSchedule([{ kind: "quiz" }]);
const releaseAt = START + schedule.endsAt + GUEST_RESULTS_TTL_MS;

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
    lobbyMinutes: 5,
    sponsor: null,
    ...overrides,
  };
}

beforeEach(async () => {
  vi.resetModules();
  registry = await import("../src/game-registry.js");
});

describe("game registry", () => {
  it("releases a game when its results window ends", () => {
    registry.trackGame(makeGame());

    expect(registry.dueGames(releaseAt - 1)).toEqual([]);
    expect(registry.dueGames(releaseAt)).toEqual(["game_1"]);
  });

  it("releases cancelled games immediately", () => {
    registry.trackGame(makeGame({ status: "cancelled" }), 1000);

    expect(registry.dueGames(1000)).toEqual(["game_1"]);
  });

  it("does not track games without a schedule", () => {
    registry.trackGame(makeGame({ startsAt: null, schedule: null }));

    expect(registry.trackedGameCount()).toBe(0);
  });

  it("moves the release time when the start is rescheduled", () => {
    registry.trackGame(makeGame());
    registry.trackGame(makeGame({ startsAt: START + 60_000 }));

    expect(registry.dueGames(releaseAt)).toEqual([]);
    expect(registry.dueGames(releaseAt + 60_000)).toEqual(["game_1"]);
  });

  it("forgets a game", () => {
    registry.trackGame(makeGame());
    registry.forgetGame("game_1");

    expect(registry.dueGames(releaseAt)).toEqual([]);
  });

  it("tracks a re-read game again, so a repopulated cache is released again", () => {
    registry.trackGame(makeGame());
    registry.forgetGame("game_1");
    registry.trackGame(makeGame());

    expect(registry.dueGames(releaseAt + 1)).toEqual(["game_1"]);
  });
});
