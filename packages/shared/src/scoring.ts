import { BASE_POINTS, PROMO_POINTS, QUESTION_TIME_S } from "./constants.js";

export function computePoints(
  responseMs: number,
  limitMs: number,
  doublePoints: boolean,
): number {
  if (limitMs <= 0) {
    return 0;
  }

  const clamped = Math.min(Math.max(responseMs, 0), limitMs);
  const points = Math.round(BASE_POINTS * (1 - clamped / (2 * limitMs)));

  return doublePoints ? points * 2 : points;
}

export function scoreAnswer(
  question: { kind: "quiz" | "promo"; doublePoints: boolean },
  isCorrect: boolean,
  responseMs: number,
  limitMs: number = QUESTION_TIME_S * 1000,
): number {
  if (question.kind === "promo") {
    return PROMO_POINTS;
  }
  if (!isCorrect) {
    return 0;
  }
  return computePoints(responseMs, limitMs, question.doublePoints);
}
