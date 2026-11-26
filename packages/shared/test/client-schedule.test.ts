import { describe, expect, it } from "vitest";
import {
  COUNTS_RETRY_MS,
  LOBBY_LAST_MS,
  PAUSE_MS,
  PREFETCH_MS,
  QUESTION_TIME_S,
  STARTING_BUFFER_MS,
} from "../src/constants.js";
import { nextPollDelay, type ScheduleView } from "../src/client-schedule.js";

const STARTS_AT = 1_000_000;
const OPEN_AT = STARTS_AT + STARTING_BUFFER_MS;
const CLOSE_AT = OPEN_AT + QUESTION_TIME_S * 1000;
const PAUSE_ENDS_AT = CLOSE_AT + PAUSE_MS;
const randomZero = () => 0;

function state(overrides: Partial<ScheduleView> = {}): ScheduleView {
  return {
    phase: { type: "get-ready", nextIndex: 0 },
    nextBoundaryAt: OPEN_AT,
    reveal: null,
    nextQuestion: { index: 0 },
    ...overrides,
  };
}

describe("nextPollDelay", () => {
  it("polls at the question boundary during get-ready", () => {
    expect(nextPollDelay(state(), STARTS_AT + 3_463, randomZero)).toBe(1_537);
  });

  it("does not add the question duration when nextQuestion is prefetched", () => {
    const delay = nextPollDelay(state(), STARTS_AT + 3_463, randomZero);
    expect(delay ?? Number.POSITIVE_INFINITY).toBeLessThan(
      QUESTION_TIME_S * 1000,
    );
  });

  it("polls at question close during a question", () => {
    expect(
      nextPollDelay(
        state({
          phase: { type: "question", index: 0 },
          nextBoundaryAt: CLOSE_AT,
        }),
        STARTS_AT + 6_000,
        randomZero,
      ),
    ).toBe(9_000);
  });

  it("polls at pause end instead of skipping the next question", () => {
    expect(
      nextPollDelay(
        state({
          phase: { type: "pause", index: 0 },
          nextBoundaryAt: PAUSE_ENDS_AT,
          reveal: { counts: [1, 0, 0, 0] },
        }),
        STARTS_AT + 15_583,
        randomZero,
      ),
    ).toBe(PAUSE_ENDS_AT - (STARTS_AT + 15_583));
  });

  it("retries quickly while reveal counts are pending", () => {
    expect(
      nextPollDelay(
        state({
          phase: { type: "pause", index: 0 },
          nextBoundaryAt: PAUSE_ENDS_AT,
          reveal: { counts: null },
        }),
        STARTS_AT + 15_583,
        randomZero,
      ),
    ).toBe(COUNTS_RETRY_MS);
  });

  it("polls at the last lobby cadence away from the start", () => {
    expect(
      nextPollDelay(
        state({
          phase: { type: "lobby" },
          nextBoundaryAt: STARTS_AT,
          nextQuestion: null,
        }),
        STARTS_AT - 30_000,
        randomZero,
      ),
    ).toBe(LOBBY_LAST_MS);
  });

  it("polls when the first question is prefetched near the start", () => {
    expect(
      nextPollDelay(
        state({
          phase: { type: "lobby" },
          nextBoundaryAt: STARTS_AT,
          nextQuestion: null,
        }),
        STARTS_AT - 1_000,
        randomZero,
      ),
    ).toBe(1_000 + STARTING_BUFFER_MS - PREFETCH_MS);
  });

  it("stops polling after the final phase", () => {
    expect(
      nextPollDelay(
        state({ phase: { type: "final" }, nextBoundaryAt: null }),
        STARTS_AT + 60_000,
        randomZero,
      ),
    ).toBeNull();
  });
});
