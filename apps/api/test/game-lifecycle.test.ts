import { describe, expect, it } from "vitest";
import { buildSchedule } from "@rp/shared";
import {
  endedAtOf,
  GUEST_RESULTS_TTL_MS,
  resultsWindowOver,
} from "../src/game-lifecycle.js";
import type { Game } from "../src/repo/games.js";

const START = Date.parse("2026-01-01T12:00:00.000Z");
const schedule = buildSchedule([{ kind: "quiz" }]);

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

describe("endedAtOf", () => {
  it("is the start plus the schedule length", () => {
    expect(endedAtOf(makeGame())).toBe(START + schedule.endsAt);
  });

  it("is null before the game is scheduled", () => {
    expect(endedAtOf(makeGame({ startsAt: null }))).toBeNull();
    expect(endedAtOf(makeGame({ schedule: null }))).toBeNull();
  });
});

describe("resultsWindowOver", () => {
  const endedAt = START + schedule.endsAt;

  it("is open until 24h after the end", () => {
    const game = makeGame();
    expect(resultsWindowOver(game, endedAt)).toBe(false);
    expect(resultsWindowOver(game, endedAt + GUEST_RESULTS_TTL_MS)).toBe(false);
  });

  it("is over after 24h", () => {
    expect(
      resultsWindowOver(makeGame(), endedAt + GUEST_RESULTS_TTL_MS + 1),
    ).toBe(true);
  });

  it("never closes a game that has not been scheduled", () => {
    expect(
      resultsWindowOver(makeGame({ schedule: null }), endedAt + 10 * GUEST_RESULTS_TTL_MS),
    ).toBe(false);
  });
});
