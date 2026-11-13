import { describe, expect, it } from "vitest";
import { PAUSE_MS, QUESTION_TIME_S, STARTING_BUFFER_MS } from "../src/constants.js";
import { buildSchedule, getPhaseAt } from "../src/schedule.js";

const QUESTION_MS = QUESTION_TIME_S * 1000;

describe("buildSchedule", () => {
  it("returns an empty schedule when there are no questions", () => {
    expect(buildSchedule([])).toEqual({
      version: 1,
      questionCount: 0,
      questions: [],
      endsAt: STARTING_BUFFER_MS,
    });
  });

  it("schedules a single question with the expected boundaries", () => {
    const schedule = buildSchedule([{ kind: "quiz" }]);

    expect(schedule.version).toBe(1);
    expect(schedule.questionCount).toBe(1);
    expect(schedule.questions).toEqual([
      {
        index: 0,
        kind: "quiz",
        opensAt: STARTING_BUFFER_MS,
        closesAt: STARTING_BUFFER_MS + QUESTION_MS,
        pauseEndsAt: STARTING_BUFFER_MS + QUESTION_MS + PAUSE_MS,
      },
    ]);
    expect(schedule.endsAt).toBe(STARTING_BUFFER_MS + QUESTION_MS + PAUSE_MS);
  });

  it("chains questions back to back after each pause", () => {
    const schedule = buildSchedule([
      { kind: "quiz" },
      { kind: "promo" },
      { kind: "quiz" },
    ]);

    expect(schedule.questionCount).toBe(3);
    expect(schedule.questions.map((q) => q.index)).toEqual([0, 1, 2]);
    expect(schedule.questions.map((q) => q.kind)).toEqual([
      "quiz",
      "promo",
      "quiz",
    ]);

    const step = QUESTION_MS + PAUSE_MS;
    for (const [i, question] of schedule.questions.entries()) {
      const opensAt = STARTING_BUFFER_MS + i * step;
      expect(question.opensAt).toBe(opensAt);
      expect(question.closesAt).toBe(opensAt + QUESTION_MS);
      expect(question.pauseEndsAt).toBe(opensAt + QUESTION_MS + PAUSE_MS);
    }

    expect(schedule.questions[1].opensAt).toBe(
      schedule.questions[0].pauseEndsAt,
    );
    expect(schedule.endsAt).toBe(
      schedule.questions[schedule.questions.length - 1].pauseEndsAt,
    );
  });

  it("preserves the kind of every question", () => {
    const schedule = buildSchedule([{ kind: "promo" }]);

    expect(schedule.questions[0].kind).toBe("promo");
  });
});

describe("getPhaseAt", () => {
  const schedule = buildSchedule([{ kind: "quiz" }, { kind: "quiz" }]);
  const first = schedule.questions[0];
  const second = schedule.questions[1];

  it("is in lobby before the schedule starts", () => {
    expect(getPhaseAt(schedule, -1)).toEqual({
      phase: { type: "lobby" },
      nextBoundaryAt: 0,
    });
  });

  it("is in get-ready from start until the first question opens", () => {
    expect(getPhaseAt(schedule, 0)).toEqual({
      phase: { type: "get-ready", nextIndex: 0 },
      nextBoundaryAt: first.opensAt,
    });
    expect(getPhaseAt(schedule, first.opensAt - 1)).toEqual({
      phase: { type: "get-ready", nextIndex: 0 },
      nextBoundaryAt: first.opensAt,
    });
  });

  it("is in question from opensAt until closesAt", () => {
    expect(getPhaseAt(schedule, first.opensAt)).toEqual({
      phase: { type: "question", index: 0 },
      nextBoundaryAt: first.closesAt,
    });
    expect(getPhaseAt(schedule, first.closesAt - 1)).toEqual({
      phase: { type: "question", index: 0 },
      nextBoundaryAt: first.closesAt,
    });
  });

  it("is in pause from closesAt until pauseEndsAt", () => {
    expect(getPhaseAt(schedule, first.closesAt)).toEqual({
      phase: { type: "pause", index: 0 },
      nextBoundaryAt: first.pauseEndsAt,
    });
    expect(getPhaseAt(schedule, first.pauseEndsAt - 1)).toEqual({
      phase: { type: "pause", index: 0 },
      nextBoundaryAt: first.pauseEndsAt,
    });
  });

  it("moves to the next question at its pause boundary", () => {
    expect(getPhaseAt(schedule, second.opensAt)).toEqual({
      phase: { type: "question", index: 1 },
      nextBoundaryAt: second.closesAt,
    });
    expect(getPhaseAt(schedule, second.pauseEndsAt - 1)).toEqual({
      phase: { type: "pause", index: 1 },
      nextBoundaryAt: second.pauseEndsAt,
    });
  });

  it("is in final at or after the schedule end", () => {
    expect(getPhaseAt(schedule, schedule.endsAt)).toEqual({
      phase: { type: "final" },
      nextBoundaryAt: null,
    });
    expect(getPhaseAt(schedule, schedule.endsAt + 1000)).toEqual({
      phase: { type: "final" },
      nextBoundaryAt: null,
    });
  });

  it("is in final for an empty schedule once elapsed is non-negative", () => {
    const empty = buildSchedule([]);

    expect(getPhaseAt(empty, 0)).toEqual({
      phase: { type: "final" },
      nextBoundaryAt: null,
    });
    expect(getPhaseAt(empty, 10_000)).toEqual({
      phase: { type: "final" },
      nextBoundaryAt: null,
    });
  });

  it("is in lobby for negative elapsed even with an empty schedule", () => {
    expect(getPhaseAt(buildSchedule([]), -1)).toEqual({
      phase: { type: "lobby" },
      nextBoundaryAt: 0,
    });
  });
});
