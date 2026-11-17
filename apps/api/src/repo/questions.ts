import type { PublicQuestion } from "@rp/shared";
import { pb, withPb } from "./pb.js";

type QuizRow = {
  id: string;
  position: number;
};

type QuestionRow = {
  id: string;
  quiz: string;
  position: number;
  kind: "quiz" | "promo" | "";
  text: string;
  options: unknown;
  correct_option: number | null;
  double_points: boolean | null;
};

export type Question = {
  id: string;
  index: number;
  kind: "quiz" | "promo";
  text: string;
  options: string[];
  correctOption: number | null;
  doublePoints: boolean;
};

function toOptions(value: unknown): string[] {
  return Array.isArray(value) ? value.map((option) => String(option)) : [];
}

function toQuestion(row: QuestionRow, index: number): Question {
  return {
    id: row.id,
    index,
    kind: row.kind === "promo" ? "promo" : "quiz",
    text: row.text,
    options: toOptions(row.options),
    correctOption:
      typeof row.correct_option === "number" ? row.correct_option : null,
    doublePoints: row.double_points ?? false,
  };
}

export function getQuestionsForGame(gameId: string): Promise<Question[]> {
  return withPb(async () => {
    const quizzes = await pb.collection("quizzes").getFullList<QuizRow>({
      filter: pb.filter("game= {:gameId}", { gameId }),
      sort: "position,created",
      fields: "id, position",
    });
    if (quizzes.length === 0) {
      return [];
    }
    const rows = await pb
      .collection("quiz_questions")
      .getFullList<QuestionRow>({
        filter: pb.filter("quiz.game = {:gameId}", { gameId }),
        sort: "position, created",
      });

    const byQuiz = new Map<string, QuestionRow[]>();
    for (const row of rows) {
      const list = byQuiz.get(row.quiz);
      if (list) {
        list.push(row);
      } else {
        byQuiz.set(row.quiz, [row]);
      }
    }

    const ordered: Question[] = [];
    for (const quiz of quizzes) {
      for (const row of byQuiz.get(quiz.id) ?? []) {
        ordered.push(toQuestion(row, ordered.length));
      }
    }

    return ordered;
  });
}

export function toPublicQuestion(question: Question): PublicQuestion {
  return {
    index: question.index,
    kind: question.kind,
    text: question.text,
    options: question.options,
    doublePoints: question.doublePoints,
  };
}

export function isCorrectOption(question: Question, option: number): boolean {
  return question.kind === "quiz" && question.correctOption === option;
}
