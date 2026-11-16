import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClientResponseError } from "pocketbase";

const mocks = vi.hoisted(() => ({
  collection: vi.fn(),
  filter: vi.fn(),
}));

vi.mock("../src/repo/pb.js", () => {
  const pb = { collection: mocks.collection, filter: mocks.filter };
  return {
    pb,
    withPb: (fn: (client: typeof pb) => Promise<unknown>) => fn(pb),
  };
});

import {
  countByOption,
  createAnswer,
  getAnswersByParticipant,
  recomputeScore,
  type AnswerInput,
} from "../src/repo/answers.js";

const answersCreate = vi.fn();
const answersGetFullList = vi.fn();
const answersGetList = vi.fn();
const participantsUpdate = vi.fn();

type AnswerRow = {
  id: string;
  game: string;
  participant: string;
  quiz_question: string;
  option: number;
  answered_at: string;
  elapsed_ms: number;
  is_correct: boolean;
  points: number;
};

function makeRow(overrides: Partial<AnswerRow> = {}): AnswerRow {
  return {
    id: "answer_1",
    game: "game_1",
    participant: "participant_1",
    quiz_question: "question_1",
    option: 2,
    answered_at: "2026-01-01T12:00:00.000Z",
    elapsed_ms: 1500,
    is_correct: true,
    points: 900,
    ...overrides,
  };
}

function makeInput(overrides: Partial<AnswerInput> = {}): AnswerInput {
  return {
    gameId: "game_1",
    participantId: "participant_1",
    questionId: "question_1",
    option: 2,
    elapsedMs: 1500,
    isCorrect: true,
    points: 900,
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T12:00:00.000Z"));
  mocks.filter.mockReturnValue("FILTER");
  mocks.collection.mockImplementation((name: string) => {
    if (name === "answers") {
      return {
        create: answersCreate,
        getFullList: answersGetFullList,
        getList: answersGetList,
      };
    }
    if (name === "participants") {
      return { update: participantsUpdate };
    }
    throw new Error(`unexpected collection: ${name}`);
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createAnswer", () => {
  it("creates the answer row and maps it", async () => {
    answersCreate.mockResolvedValue(makeRow());

    const result = await createAnswer(makeInput());

    expect(mocks.collection).toHaveBeenCalledWith("answers");
    expect(answersCreate).toHaveBeenCalledWith({
      game: "game_1",
      participant: "participant_1",
      quiz_question: "question_1",
      option: 2,
      answered_at: "2026-01-01T12:00:00.000Z",
      elapsed_ms: 1500,
      is_correct: true,
      points: 900,
    });
    expect(result).toEqual({
      ok: true,
      answer: {
        id: "answer_1",
        questionId: "question_1",
        option: 2,
        elapsedMs: 1500,
        isCorrect: true,
        points: 900,
      },
    });
  });

  it("bumps the participant score for a scoring answer", async () => {
    answersCreate.mockResolvedValue(makeRow());

    await createAnswer(makeInput({ points: 900 }));

    expect(mocks.collection).toHaveBeenCalledWith("participants");
    expect(participantsUpdate).toHaveBeenCalledWith("participant_1", {
      "score+": 900,
    });
  });

  it("does not bump the score for zero-point answers", async () => {
    answersCreate.mockResolvedValue(makeRow({ points: 0, is_correct: false }));

    await createAnswer(makeInput({ points: 0, isCorrect: false }));

    expect(participantsUpdate).not.toHaveBeenCalled();
  });

  it("still returns the answer when the score bump fails", async () => {
    answersCreate.mockResolvedValue(makeRow());
    participantsUpdate.mockRejectedValue(new Error("write failed"));

    await expect(createAnswer(makeInput())).resolves.toMatchObject({
      ok: true,
      answer: { id: "answer_1" },
    });
  });

  it("returns already_answered on a duplicate 400 error", async () => {
    answersCreate.mockRejectedValue(new ClientResponseError({ status: 400 }));

    await expect(createAnswer(makeInput())).resolves.toEqual({
      ok: false,
      reason: "already_answered",
    });
    expect(participantsUpdate).not.toHaveBeenCalled();
  });

  it("rethrows non-400 client errors", async () => {
    const error = new ClientResponseError({ status: 500 });
    answersCreate.mockRejectedValue(error);

    await expect(createAnswer(makeInput())).rejects.toBe(error);
  });

  it("rethrows unexpected errors", async () => {
    const error = new Error("connection refused");
    answersCreate.mockRejectedValue(error);

    await expect(createAnswer(makeInput())).rejects.toBe(error);
  });

  it("falls back to defaults for empty row values", async () => {
    answersCreate.mockResolvedValue(
      makeRow({
        option: null as unknown as number,
        elapsed_ms: null as unknown as number,
        is_correct: null as unknown as boolean,
        points: null as unknown as number,
      }),
    );

    const result = await createAnswer(makeInput({ points: 0 }));

    expect(result).toEqual({
      ok: true,
      answer: {
        id: "answer_1",
        questionId: "question_1",
        option: 0,
        elapsedMs: 0,
        isCorrect: false,
        points: 0,
      },
    });
  });
});

describe("getAnswersByParticipant", () => {
  it("loads answers sorted by creation and maps them", async () => {
    answersGetFullList.mockResolvedValue([makeRow(), makeRow({ id: "answer_2" })]);

    const answers = await getAnswersByParticipant("participant_1");

    expect(mocks.filter).toHaveBeenCalledWith(
      "participant = {:participantId}",
      { participantId: "participant_1" },
    );
    expect(answersGetFullList).toHaveBeenCalledWith({
      filter: "FILTER",
      sort: "created",
    });
    expect(answers).toEqual([
      {
        id: "answer_1",
        questionId: "question_1",
        option: 2,
        elapsedMs: 1500,
        isCorrect: true,
        points: 900,
      },
      {
        id: "answer_2",
        questionId: "question_1",
        option: 2,
        elapsedMs: 1500,
        isCorrect: true,
        points: 900,
      },
    ]);
  });

  it("returns an empty list when the participant has no answers", async () => {
    answersGetFullList.mockResolvedValue([]);

    await expect(getAnswersByParticipant("participant_1")).resolves.toEqual([]);
  });
});

describe("countByOption", () => {
  it("counts answers per option and preserves option order", async () => {
    answersGetList
      .mockResolvedValueOnce({ totalItems: 4 })
      .mockResolvedValueOnce({ totalItems: 7 });

    const counts = await countByOption("question_1", 2);

    expect(counts).toEqual([4, 7]);
    expect(answersGetList).toHaveBeenCalledTimes(2);
    expect(mocks.filter).toHaveBeenNthCalledWith(
      1,
      "quiz_question = {:questionId} && option = {:option}",
      { questionId: "question_1", option: 0 },
    );
    expect(mocks.filter).toHaveBeenNthCalledWith(
      2,
      "quiz_question = {:questionId} && option = {:option}",
      { questionId: "question_1", option: 1 },
    );
    expect(answersGetList).toHaveBeenNthCalledWith(1, 1, 1, {
      filter: "FILTER",
      fields: "id",
    });
    expect(answersGetList).toHaveBeenNthCalledWith(2, 1, 1, {
      filter: "FILTER",
      fields: "id",
    });
  });

  it("returns an empty list without queries when there are no options", async () => {
    await expect(countByOption("question_1", 0)).resolves.toEqual([]);
    expect(answersGetList).not.toHaveBeenCalled();
  });
});

describe("recomputeScore", () => {
  it("sums answer points and writes the derived score", async () => {
    answersGetFullList.mockResolvedValue([
      makeRow({ id: "answer_1", points: 900 }),
      makeRow({ id: "answer_2", points: 450 }),
      makeRow({ id: "answer_3", points: 0 }),
    ]);

    const score = await recomputeScore("participant_1");

    expect(score).toBe(1350);
    expect(participantsUpdate).toHaveBeenCalledWith("participant_1", {
      score: 1350,
    });
  });

  it("writes zero when the participant has no answers", async () => {
    answersGetFullList.mockResolvedValue([]);

    const score = await recomputeScore("participant_1");

    expect(score).toBe(0);
    expect(participantsUpdate).toHaveBeenCalledWith("participant_1", {
      score: 0,
    });
  });
});
