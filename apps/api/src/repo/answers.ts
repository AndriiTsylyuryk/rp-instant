import { ClientResponseError } from "pocketbase";
import { pb, withPb } from "./pb.js";

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

export type Answer = {
  id: string;
  questionId: string;
  option: number;
  elapsedMs: number;
  isCorrect: boolean;
  points: number;
};

function toAnswer(row: AnswerRow): Answer {
  return {
    id: row.id,
    questionId: row.quiz_question,
    option: row.option ?? 0,
    elapsedMs: row.elapsed_ms ?? 0,
    isCorrect: row.is_correct ?? false,
    points: row.points ?? 0,
  };
}

export type AnswerInput = {
  gameId: string;
  participantId: string;
  questionId: string;
  option: number;
  elapsedMs: number;
  isCorrect: boolean;
  points: number;
};

export type AnswerResultRow =
  | { ok: true; answer: Answer }
  | { ok: false; reason: "already_answered" };

export async function createAnswer(
  input: AnswerInput,
): Promise<AnswerResultRow> {
  let row: AnswerRow;

  try {
    row = await withPb(async () =>
      pb.collection("answers").create<AnswerRow>({
        game: input.gameId,
        participant: input.participantId,
        quiz_question: input.questionId,
        option: input.option,
        answered_at: new Date().toISOString(),
        elapsed_ms: input.elapsedMs,
        is_correct: input.isCorrect,
        points: input.points,
      }),
    );
  } catch (err) {
    if (err instanceof ClientResponseError && err.status === 400) {
      return { ok: false, reason: "already_answered" };
    }
    throw err;
  }

  if (input.points > 0) {
    await bumpScore(input.participantId, input.points);
  }

  return { ok: true, answer: toAnswer(row) };
}

async function bumpScore(participantId: string, points: number): Promise<void> {
  try {
    await withPb(async () =>
      pb.collection("participants").update(participantId, {
        "score+": points,
      }),
    );
  } catch {
    // answers — джерело правди, participants.score — похідне.
    // Розійшлося — полагодить recomputeScore, гру ламати не треба.
  }
}

export function getAnswersByParticipant(
  participantId: string,
): Promise<Answer[]> {
  return withPb(async () => {
    const rows = await pb.collection("answers").getFullList<AnswerRow>({
      filter: pb.filter("participant = {:participantId}", { participantId }),
      sort: "created",
    });
    return rows.map(toAnswer);
  });
}

export async function countByOption(
  questionId: string,
  optionCount: number,
): Promise<number[]> {
  return withPb(async () => {
    const counts = await Promise.all(
      Array.from({ length: optionCount }, (_, option) =>
        pb
          .collection("answers")
          .getList<AnswerRow>(1, 1, {
            filter: pb.filter(
              "quiz_question = {:questionId} && option = {:option}",
              { questionId, option },
            ),
            fields: "id",
          })
          .then((page) => page.totalItems),
      ),
    );
    return counts;
  });
}

export async function recomputeScore(participantId: string): Promise<number> {
  const answers = await getAnswersByParticipant(participantId);
  const score = answers.reduce((sum, answer) => sum + answer.points, 0);

  await withPb(async () =>
    pb.collection("participants").update(participantId, { score }),
  );

  return score;
}
