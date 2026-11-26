import {
  BOUNDARY_JITTER_MS,
  COUNTS_RETRY_MS,
  HEARTBEAT_MS,
  LOBBY_FAR_MS,
  LOBBY_JITTER_MS,
  LOBBY_LAST_MS,
  LOBBY_NEAR_MS,
  MIN_DELAY_MS,
  PREFETCH_JITTER_MS,
  PREFETCH_MS,
  STARTING_BUFFER_MS,
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

function nextBoundaryDelay(
  state: ScheduleView,
  now: number,
  random: Random,
): number {
  const left = untilBoundary(state, now);

  if (state.nextQuestion === null && left > PREFETCH_MS) {
    return floor(left - PREFETCH_MS + random() * PREFETCH_JITTER_MS);
  }
  return floor(left + random() * BOUNDARY_JITTER_MS);
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

      if (state.nextBoundaryAt !== null && left <= LOBBY_NEAR_MS) {
        return (
          left +
          (STARTING_BUFFER_MS - PREFETCH_MS) +
          random() * PREFETCH_JITTER_MS
        );
      }

      const base =
        left > 5 * 60_000
          ? LOBBY_FAR_MS
          : left > 60_000
            ? LOBBY_NEAR_MS
            : LOBBY_LAST_MS;
      return base + random() * LOBBY_JITTER_MS;
    }

    case "get-ready":
      return nextBoundaryDelay(state, now, random);

    case "question":
      return floor(untilBoundary(state, now) + random() * BOUNDARY_JITTER_MS);

    case "pause": {
      if (state.reveal && state.reveal.counts === null) {
        return COUNTS_RETRY_MS + random() * COUNTS_RETRY_MS;
      }

      return nextBoundaryDelay(state, now, random);
    }
  }
}

function floor(delay: number): number {
  return Math.max(MIN_DELAY_MS, delay);
}
