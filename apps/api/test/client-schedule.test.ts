import { describe, expect, it } from "vitest";
import {
  BOUNDARY_JITTER_MS,
  LOBBY_FAR_MS,
  PREFETCH_JITTER_MS,
  PREFETCH_MS,
  nextPollDelay,
} from "@rp/shared";

const pause = { type: "pause", index: 0 } as const;
const reveal = { counts: [1, 2] };

describe("nextPollDelay prefetch", () => {
  it("polls inside the prefetch window before the question opens", () => {
    const delay = nextPollDelay(
      { phase: pause, nextBoundaryAt: 10_000, reveal, nextQuestion: null },
      0,
      () => 0.5,
    )!;
    expect(delay).toBe(10_000 - PREFETCH_MS + 0.5 * PREFETCH_JITTER_MS);
    expect(delay).toBeLessThan(10_000 - 500);
  });

  it("polls after the boundary once the question is loaded", () => {
    const delay = nextPollDelay(
      { phase: pause, nextBoundaryAt: 3000, reveal, nextQuestion: { index: 1 } },
      0,
      () => 0,
    )!;
    expect(delay).toBe(3000);
  });

  it("falls back to boundary + jitter inside the window with no next question", () => {
    const delay = nextPollDelay(
      { phase: pause, nextBoundaryAt: 3000, reveal, nextQuestion: null },
      0,
      () => 1,
    )!;
    expect(delay).toBe(3000 + BOUNDARY_JITTER_MS);
  });

  it("keeps the retry loop while counts are not ready", () => {
    const delay = nextPollDelay(
      {
        phase: pause,
        nextBoundaryAt: 10_000,
        reveal: { counts: null },
        nextQuestion: null,
      },
      0,
      () => 0,
    )!;
    expect(delay).toBeLessThan(1000);
  });
});

describe("nextPollDelay lobby", () => {
  it("polls rarely when far from the start", () => {
    const delay = nextPollDelay(
      {
        phase: { type: "lobby" },
        nextBoundaryAt: 10 * 60_000,
        reveal: null,
        nextQuestion: null,
      },
      0,
      () => 0,
    )!;
    expect(delay).toBe(LOBBY_FAR_MS);
  });

  it("schedules the next poll inside get-ready when the start is near", () => {
    const delay = nextPollDelay(
      {
        phase: { type: "lobby" },
        nextBoundaryAt: 8000,
        reveal: null,
        nextQuestion: null,
      },
      0,
      () => 0,
    )!;
    // старт + (5000 - 4000) = перший момент, коли сервер віддає питання
    expect(delay).toBe(8000 + 1000);
  });
});
