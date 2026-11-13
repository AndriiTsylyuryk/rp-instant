import { PAUSE_MS, QUESTION_TIME_S, STARTING_BUFFER_MS } from "./constants.js";
import { Phase, PublicQuestion, Schedule } from "./types.js";

export function buildSchedule(
  questions: Array<{ kind: "quiz" | "promo" }>,
): Schedule {
  const items: Schedule["questions"] = [];
  let time = STARTING_BUFFER_MS;

  for (const [index, question] of questions.entries()) {
    const opensAt = time;
    const closesAt = opensAt + QUESTION_TIME_S * 1000;
    const pauseEndsAt = closesAt + PAUSE_MS;

    items.push({
      index,
      kind: question.kind,
      opensAt,
      closesAt,
      pauseEndsAt,
    });
    time = pauseEndsAt;
  }

  return {
    version: 1,
    questionCount: questions.length,
    questions: items,
    endsAt: time,
  };
}

export function getPhaseAt(
  schedule: Schedule,
  elapsedMs: number,
): { phase: Phase; nextBoundaryAt: number | null } {
  const { questions, endsAt } = schedule;

  if (elapsedMs < 0) {
    return { phase: { type: "lobby" }, nextBoundaryAt: 0 };
  }

  if (questions.length === 0 || elapsedMs >= endsAt) {
    return { phase: { type: "final" }, nextBoundaryAt: null };
  }

  for (const question of questions) {
    if (elapsedMs < question.opensAt) {
      return {
        phase: { type: "get-ready", nextIndex: question.index },
        nextBoundaryAt: question.opensAt,
      };
    }
    if (elapsedMs < question.closesAt) {
      return {
        phase: { type: "question", index: question.index },
        nextBoundaryAt: question.closesAt,
      };
    }
    if (elapsedMs < question.pauseEndsAt) {
      return {
        phase: { type: "pause", index: question.index },
        nextBoundaryAt: question.pauseEndsAt,
      };
    }
  }
  return { phase: { type: "final" }, nextBoundaryAt: null };
}
