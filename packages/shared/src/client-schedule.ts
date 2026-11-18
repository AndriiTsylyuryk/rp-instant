import {
  BOUNDARY_JITTER_MS,
  COUNTS_RETRY_MS,
  HEARTBEAT_MS,
  LOBBY_FAR_MS,
  LOBBY_JITTER_MS,
  LOBBY_LAST_MS,
  LOBBY_NEAR_MS,
  MIN_DELAY_MS,
} from "./constants.js";
import { Phase } from "./types.js";

export type ScheduleView = {
  phase: Phase | "draft" | "ended";
  nextBoundaryAt: number | null;
  reveal: { counts: number[] | null } | null;
  nextQuestion: { index: number } | null;
};
type Random = () => number;

function untilBoundary(state: ScheduleView, now: number): number {
  if (state.nextBoundaryAt === null) {
    return HEARTBEAT_MS;
  }
  return Math.max(0, state.nextBoundaryAt - now);
}

export function nextPollDelay(
  state: ScheduleView,
  now: number,
  random: Random = Math.random,
): number | null {
  const phase = state.phase;

  if (typeof phase === "string") {
    return HEARTBEAT_MS;
  }

  switch (phase.type) {
    case "final":
      return null;

    case "lobby": {
      const left = untilBoundary(state, now);
      const base =
        left > 5 * 60_000
          ? LOBBY_FAR_MS
          : left > 60_000
            ? LOBBY_NEAR_MS
            : LOBBY_LAST_MS;
      return base + random() * LOBBY_JITTER_MS;
    }

    case "get-ready":
      return floor(untilBoundary(state, now) + random() * BOUNDARY_JITTER_MS);

    case "question":
      return floor(untilBoundary(state, now) + random() * BOUNDARY_JITTER_MS);

    case "pause": {
      if (state.reveal && state.reveal.counts === null) {
        return COUNTS_RETRY_MS + random() * COUNTS_RETRY_MS;
      }

      return floor(untilBoundary(state, now) + random() * BOUNDARY_JITTER_MS);
    }
  }
}

function floor(delay: number): number {
  return Math.max(MIN_DELAY_MS, delay);
}
