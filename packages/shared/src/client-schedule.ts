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
  QUESTION_TIME_S,
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

/** Прокинутися, коли відкриється вікно передзавантаження. */
function prefetchPoll(
  state: ScheduleView,
  now: number,
  random: Random,
): number {
  const opensIn = untilBoundary(state, now);
  return Math.max(0, opensIn - PREFETCH_MS) + random() * PREFETCH_JITTER_MS;
}

export function nextPollDelay(
  state: ScheduleView,
  now: number,
  random: Random = Math.random,
): number | null {
  const phase = state.phase;

  // draft / ended — чекаємо, нічого не плануємо
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
      // питання №0 ще не в руках — іти по нього
      return state.nextQuestion
        ? floor(
            untilBoundary(state, now) +
              QUESTION_TIME_S * 1000 +
              random() * BOUNDARY_JITTER_MS,
          )
        : floor(prefetchPoll(state, now, random));

    case "question":
      return floor(untilBoundary(state, now) + random() * BOUNDARY_JITTER_MS);

    case "pause": {
      if (state.reveal && state.reveal.counts === null) {
        return COUNTS_RETRY_MS + random() * COUNTS_RETRY_MS;
      }

      if (!state.nextQuestion) {
        return floor(prefetchPoll(state, now, random));
      }

      return floor(
        untilBoundary(state, now) +
          QUESTION_TIME_S * 1000 +
          random() * BOUNDARY_JITTER_MS,
      );
    }
  }
}

function floor(delay: number): number {
  return Math.max(MIN_DELAY_MS, delay);
}
