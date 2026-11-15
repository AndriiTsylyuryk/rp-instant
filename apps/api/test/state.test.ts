import { describe, expect, it } from "vitest";
import type { Schedule } from "@rp/shared";
import { computeState } from "../src/state.js";
import type { Game } from "../src/repo/games.js";

const schedule: Schedule = {
  version: 1,
  questionCount: 1,
  questions: [
    { index: 0, kind: "quiz", opensAt: 5000, closesAt: 15000, pauseEndsAt: 23000 },
  ],
  endsAt: 23000,
};

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: "game_1",
    clubId: "club_1",
    title: "Derby",
    code: "ABC123",
    status: "live",
    locale: "et",
    startsAt: 1000,
    schedule,
    joiningLocked: false,
    sponsor: null,
    ...overrides,
  };
}

describe("computeState", () => {
  it("returns draft for a draft game", () => {
    expect(computeState(makeGame({ status: "draft" }), 1000)).toEqual({
      phase: "draft",
      nextBoundaryAt: null,
    });
  });

  it("returns ended for ended and cancelled games", () => {
    expect(computeState(makeGame({ status: "ended" }), 1000)).toEqual({
      phase: "ended",
      nextBoundaryAt: null,
    });
    expect(computeState(makeGame({ status: "cancelled" }), 1000)).toEqual({
      phase: "ended",
      nextBoundaryAt: null,
    });
  });

  it("returns lobby without a boundary when there is no schedule", () => {
    expect(computeState(makeGame({ schedule: null }), 1000)).toEqual({
      phase: { type: "lobby" },
      nextBoundaryAt: null,
    });
  });

  it("returns lobby without a boundary when there is no start time", () => {
    expect(computeState(makeGame({ startsAt: null }), 1000)).toEqual({
      phase: { type: "lobby" },
      nextBoundaryAt: null,
    });
  });

  it("returns lobby with the start time as boundary before the game starts", () => {
    expect(computeState(makeGame({ startsAt: 1000 }), 500)).toEqual({
      phase: { type: "lobby" },
      nextBoundaryAt: 1000,
    });
  });

  it("delegates to getPhaseAt once the game has started", () => {
    const game = makeGame({ startsAt: 1000 });

    expect(computeState(game, 1000)).toEqual({
      phase: { type: "get-ready", nextIndex: 0 },
      nextBoundaryAt: 5000,
    });
    expect(computeState(game, 6000)).toEqual({
      phase: { type: "question", index: 0 },
      nextBoundaryAt: 15000,
    });
  });

  it("returns final after the schedule ends", () => {
    expect(computeState(makeGame({ startsAt: 1000 }), 30_000)).toEqual({
      phase: { type: "final" },
      nextBoundaryAt: null,
    });
  });
});
