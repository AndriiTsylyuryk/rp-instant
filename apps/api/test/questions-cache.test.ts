import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getQuestionsForGame: vi.fn(),
}));

vi.mock("../src/repo/questions.js", () => ({
  getQuestionsForGame: mocks.getQuestionsForGame,
}));

type QuestionsCacheModule = typeof import("../src/questions-cache.js");

type Question = {
  id: string;
  index: number;
  kind: "quiz" | "promo";
  text: string;
  options: string[];
  correctOption: number | null;
  doublePoints: boolean;
};

let cache: QuestionsCacheModule;

function makeQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: "question_1",
    index: 0,
    kind: "quiz",
    text: "Who wins?",
    options: ["A", "B"],
    correctOption: 0,
    doublePoints: false,
    ...overrides,
  };
}

beforeEach(async () => {
  vi.resetModules();
  vi.resetAllMocks();
  cache = await import("../src/questions-cache.js");
});

describe("getCachedQuestions", () => {
  it("loads the questions once and serves the cached list", async () => {
    const questions = [makeQuestion()];
    mocks.getQuestionsForGame.mockResolvedValue(questions);

    await expect(cache.getCachedQuestions("game_1")).resolves.toBe(questions);
    await expect(cache.getCachedQuestions("game_1")).resolves.toBe(questions);

    expect(mocks.getQuestionsForGame).toHaveBeenCalledWith("game_1");
    expect(mocks.getQuestionsForGame).toHaveBeenCalledTimes(1);
  });

  it("does not cache an empty result", async () => {
    mocks.getQuestionsForGame.mockResolvedValue([]);

    await cache.getCachedQuestions("game_1");
    await cache.getCachedQuestions("game_1");

    expect(mocks.getQuestionsForGame).toHaveBeenCalledTimes(2);
  });

  it("keeps separate caches per game", async () => {
    mocks.getQuestionsForGame
      .mockResolvedValueOnce([makeQuestion({ id: "q_game_1" })])
      .mockResolvedValueOnce([makeQuestion({ id: "q_game_2" })]);

    const first = await cache.getCachedQuestions("game_1");
    const second = await cache.getCachedQuestions("game_2");

    expect(first[0].id).toBe("q_game_1");
    expect(second[0].id).toBe("q_game_2");
    expect(mocks.getQuestionsForGame).toHaveBeenCalledTimes(2);
  });

  it("deduplicates concurrent loads for the same game", async () => {
    let resolveLoad!: (questions: Question[]) => void;
    mocks.getQuestionsForGame.mockReturnValue(
      new Promise<Question[]>((resolve) => {
        resolveLoad = resolve;
      }),
    );
    const questions = [makeQuestion()];

    const first = cache.getCachedQuestions("game_1");
    const second = cache.getCachedQuestions("game_1");

    expect(mocks.getQuestionsForGame).toHaveBeenCalledTimes(1);
    resolveLoad(questions);

    await expect(first).resolves.toBe(questions);
    await expect(second).resolves.toBe(questions);
  });

  it("reloads after an in-flight load fails", async () => {
    mocks.getQuestionsForGame
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce([makeQuestion()]);

    await expect(cache.getCachedQuestions("game_1")).rejects.toThrow("boom");
    await expect(cache.getCachedQuestions("game_1")).resolves.toHaveLength(1);
    expect(mocks.getQuestionsForGame).toHaveBeenCalledTimes(2);
  });
});

describe("getCachedQuestionAt", () => {
  it("returns the question at the requested index", async () => {
    const questions = [
      makeQuestion({ id: "q0", index: 0 }),
      makeQuestion({ id: "q1", index: 1 }),
    ];
    mocks.getQuestionsForGame.mockResolvedValue(questions);

    await expect(cache.getCachedQuestionAt("game_1", 1)).resolves.toBe(
      questions[1],
    );
    await expect(cache.getCachedQuestionAt("game_1", 0)).resolves.toBe(
      questions[0],
    );
    expect(mocks.getQuestionsForGame).toHaveBeenCalledTimes(1);
  });

  it("returns null when the index is out of range", async () => {
    mocks.getQuestionsForGame.mockResolvedValue([makeQuestion()]);

    await expect(cache.getCachedQuestionAt("game_1", 5)).resolves.toBeNull();
  });

  it("returns null when the game has no questions", async () => {
    mocks.getQuestionsForGame.mockResolvedValue([]);

    await expect(cache.getCachedQuestionAt("game_1", 0)).resolves.toBeNull();
  });
});

describe("invalidateQuestions", () => {
  it("forces the next lookup to reload", async () => {
    mocks.getQuestionsForGame.mockResolvedValue([makeQuestion()]);

    await cache.getCachedQuestions("game_1");
    cache.invalidateQuestions("game_1");
    await cache.getCachedQuestions("game_1");

    expect(mocks.getQuestionsForGame).toHaveBeenCalledTimes(2);
  });
});

describe("peekQuestions", () => {
  it("returns nothing and does not hit the database when the game is not cached", () => {
    expect(cache.peekQuestions("game_1")).toEqual([]);
    expect(mocks.getQuestionsForGame).not.toHaveBeenCalled();
  });

  it("returns the cached questions without another query", async () => {
    const questions = [makeQuestion()];
    mocks.getQuestionsForGame.mockResolvedValue(questions);
    await cache.getCachedQuestions("game_1");

    expect(cache.peekQuestions("game_1")).toBe(questions);
    expect(mocks.getQuestionsForGame).toHaveBeenCalledTimes(1);
  });
});
