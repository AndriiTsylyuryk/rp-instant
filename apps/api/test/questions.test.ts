import { beforeEach, describe, expect, it, vi } from "vitest";

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
  getQuestionsForGame,
  isCorrectOption,
  toPublicQuestion,
} from "../src/repo/questions.js";

const quizzesGetFullList = vi.fn();
const questionsGetFullList = vi.fn();

type QuizRow = { id: string; position: number };

type QuestionRow = {
  id: string;
  quiz: string;
  position: number;
  kind: "quiz" | "promo" | "";
  text: string;
  options: unknown;
  correct_option: number | null;
  points_multiplier: number | null;
};

function makeQuiz(overrides: Partial<QuizRow> = {}): QuizRow {
  return { id: "quiz_1", position: 0, ...overrides };
}

function makeQuestion(overrides: Partial<QuestionRow> = {}): QuestionRow {
  return {
    id: "question_1",
    quiz: "quiz_1",
    position: 0,
    kind: "quiz",
    text: "Who wins?",
    options: ["A", "B"],
    correct_option: 0,
    points_multiplier: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.filter.mockReturnValue("FILTER");
  mocks.collection.mockImplementation((name: string) => {
    if (name === "quizzes") return { getFullList: quizzesGetFullList };
    if (name === "quiz_questions") {
      return { getFullList: questionsGetFullList };
    }
    throw new Error(`unexpected collection: ${name}`);
  });
});

describe("getQuestionsForGame", () => {
  it("returns an empty list and skips question lookup when the game has no quizzes", async () => {
    quizzesGetFullList.mockResolvedValue([]);

    const questions = await getQuestionsForGame("game_1");

    expect(questions).toEqual([]);
    expect(mocks.filter).toHaveBeenCalledWith("game= {:gameId}", {
      gameId: "game_1",
    });
    expect(quizzesGetFullList).toHaveBeenCalledWith({
      filter: "FILTER",
      sort: "position,created",
      fields: "id, position",
    });
    expect(questionsGetFullList).not.toHaveBeenCalled();
  });

  it("loads quizzes ordered by position and questions by position then creation", async () => {
    quizzesGetFullList.mockResolvedValue([makeQuiz()]);
    questionsGetFullList.mockResolvedValue([makeQuestion()]);

    await getQuestionsForGame("game_1");

    expect(quizzesGetFullList).toHaveBeenCalledWith({
      filter: "FILTER",
      sort: "position,created",
      fields: "id, position",
    });
    expect(questionsGetFullList).toHaveBeenCalledWith({
      filter: "FILTER",
      sort: "position, created",
    });
  });

  it("assigns sequential indexes in the concatenated order", async () => {
    quizzesGetFullList.mockResolvedValue([
      makeQuiz({ id: "quiz_a", position: 0 }),
      makeQuiz({ id: "quiz_b", position: 1 }),
    ]);
    questionsGetFullList.mockResolvedValue([
      makeQuestion({ id: "a0", quiz: "quiz_a", position: 0 }),
      makeQuestion({ id: "b0", quiz: "quiz_b", position: 0 }),
      makeQuestion({ id: "a1", quiz: "quiz_a", position: 1 }),
      makeQuestion({ id: "b1", quiz: "quiz_b", position: 1 }),
    ]);

    const questions = await getQuestionsForGame("game_1");

    expect(questions.map((question) => question.index)).toEqual([0, 1, 2, 3]);
  });

  it("groups by quiz instead of sorting all questions globally by position", async () => {
    quizzesGetFullList.mockResolvedValue([
      makeQuiz({ id: "quiz_a", position: 0 }),
      makeQuiz({ id: "quiz_b", position: 1 }),
    ]);
    const rows = [
      makeQuestion({ id: "a0", quiz: "quiz_a", position: 0 }),
      makeQuestion({ id: "b0", quiz: "quiz_b", position: 0 }),
      makeQuestion({ id: "a1", quiz: "quiz_a", position: 1 }),
      makeQuestion({ id: "b1", quiz: "quiz_b", position: 1 }),
    ];
    questionsGetFullList.mockResolvedValue(rows);

    const questions = await getQuestionsForGame("game_1");

    expect(questions.map((question) => question.id)).toEqual([
      "a0",
      "a1",
      "b0",
      "b1",
    ]);
    expect(questions.map((question) => `${question.id}:${question.index}`)).toEqual([
      "a0:0",
      "a1:1",
      "b0:2",
      "b1:3",
    ]);
    expect([...rows].sort((x, y) => x.position - y.position).map((row) => row.id)).toEqual([
      "a0",
      "b0",
      "a1",
      "b1",
    ]);
  });

  it("maps row fields into questions", async () => {
    quizzesGetFullList.mockResolvedValue([makeQuiz()]);
    questionsGetFullList.mockResolvedValue([
      makeQuestion({
        id: "quiz_q",
        kind: "quiz",
        options: ["Yes", "No"],
        correct_option: 1,
        points_multiplier: 2,
      }),
      makeQuestion({
        id: "promo_q",
        position: 1,
        kind: "promo",
        text: "Sponsor",
        options: null,
        correct_option: null,
        points_multiplier: 1,
      }),
      makeQuestion({
        id: "blank_kind_q",
        position: 2,
        kind: "",
      }),
    ]);

    const questions = await getQuestionsForGame("game_1");

    expect(questions).toEqual([
      {
        id: "quiz_q",
        index: 0,
        kind: "quiz",
        text: "Who wins?",
        options: ["Yes", "No"],
        correctOption: 1,
        doublePoints: true,
      },
      {
        id: "promo_q",
        index: 1,
        kind: "promo",
        text: "Sponsor",
        options: [],
        correctOption: null,
        doublePoints: false,
      },
      {
        id: "blank_kind_q",
        index: 2,
        kind: "quiz",
        text: "Who wins?",
        options: ["A", "B"],
        correctOption: 0,
        doublePoints: false,
      },
    ]);
  });

  it("stringifies option values", async () => {
    quizzesGetFullList.mockResolvedValue([makeQuiz()]);
    questionsGetFullList.mockResolvedValue([
      makeQuestion({ options: [1, 2, true] }),
    ]);

    const [question] = await getQuestionsForGame("game_1");

    expect(question.options).toEqual(["1", "2", "true"]);
  });
});

describe("toPublicQuestion", () => {
  it("omits answer and internal fields", () => {
    const publicQuestion = toPublicQuestion({
      id: "question_1",
      index: 3,
      kind: "quiz",
      text: "Who wins?",
      options: ["A", "B"],
      correctOption: 1,
      doublePoints: true,
    });

    expect(publicQuestion).toEqual({
      index: 3,
      kind: "quiz",
      text: "Who wins?",
      options: ["A", "B"],
      doublePoints: true,
    });
  });
});

describe("isCorrectOption", () => {
  const question = {
    id: "question_1",
    index: 0,
    kind: "quiz" as const,
    text: "Who wins?",
    options: ["A", "B"],
    correctOption: 1,
    doublePoints: false,
  };

  it("is true only for the correct option of a quiz", () => {
    expect(isCorrectOption(question, 1)).toBe(true);
    expect(isCorrectOption(question, 0)).toBe(false);
  });

  it("is false for promo questions even if the option matches", () => {
    expect(isCorrectOption({ ...question, kind: "promo" }, 1)).toBe(false);
  });
});
