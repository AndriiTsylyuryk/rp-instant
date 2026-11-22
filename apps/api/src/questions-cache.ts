import { getQuestionsForGame, type Question } from "./repo/questions.js";

const cache = new Map<string, Question[]>();
const inflight = new Map<string, Promise<Question[]>>();

export function getCachedQuestions(gameId: string): Promise<Question[]> {
  const hit = cache.get(gameId);
  if (hit) {
    return Promise.resolve(hit);
  }

  const running = inflight.get(gameId);
  if (running) {
    return running;
  }

  const promise = getQuestionsForGame(gameId)
    .then((questions) => {
      if (questions.length > 0) {
        cache.set(gameId, questions);
      }
      return questions;
    })
    .finally(() => {
      inflight.delete(gameId);
    });

  inflight.set(gameId, promise);
  return promise;
}

export async function getCachedQuestionAt(
  gameId: string,
  index: number,
): Promise<Question | null> {
  const questions = await getCachedQuestions(gameId);
  return questions[index] ?? null;
}

export function invalidateQuestions(gameId: string): void {
  cache.delete(gameId);
}

export function peekQuestions(gameId: string): Question[] {
  return cache.get(gameId) ?? [];
}
