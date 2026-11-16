import { countByOption } from "./repo/answers.js";

const cache = new Map<string, number[]>();
const inflight = new Map<string, Promise<number[]>>();

export function getCachedCounts(
  questionId: string,
  optionCount: number,
): Promise<number[]> {
  const hit = cache.get(questionId);
  if (hit) {
    return Promise.resolve(hit);
  }

  const running = inflight.get(questionId);
  if (running) {
    return running;
  }

  const promise = countByOption(questionId, optionCount)
    .then((counts) => {
      cache.set(questionId, counts);
      return counts;
    })
    .finally(() => {
      inflight.delete(questionId);
    });

  inflight.set(questionId, promise);
  return promise;
}

export function invalidateCounts(questionId: string): void {
  cache.delete(questionId);
}
