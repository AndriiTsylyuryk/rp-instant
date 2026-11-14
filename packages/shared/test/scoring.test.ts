import { describe, expect, it } from "vitest";
import {
  BASE_POINTS,
  PROMO_POINTS,
  QUESTION_TIME_S,
} from "../src/constants.js";
import { computePoints, scoreAnswer } from "../src/scoring.js";

const LIMIT_MS = QUESTION_TIME_S * 1000;

describe("computePoints", () => {
  it("awards full base points for an instant answer", () => {
    expect(computePoints(0, LIMIT_MS, false)).toBe(BASE_POINTS);
  });

  it("awards half base points at the time limit", () => {
    expect(computePoints(LIMIT_MS, LIMIT_MS, false)).toBe(BASE_POINTS / 2);
  });

  it("scales linearly with the response time", () => {
    expect(computePoints(LIMIT_MS / 2, LIMIT_MS, false)).toBe(750);
    expect(computePoints(LIMIT_MS / 4, LIMIT_MS, false)).toBe(875);
  });

  it("clamps negative response times to zero", () => {
    expect(computePoints(-100, LIMIT_MS, false)).toBe(BASE_POINTS);
  });

  it("clamps response times beyond the limit to the limit", () => {
    expect(computePoints(LIMIT_MS * 2, LIMIT_MS, false)).toBe(BASE_POINTS / 2);
  });

  it("rounds fractional points to the nearest integer", () => {
    const limit = 3000;
    expect(computePoints(1000, limit, false)).toBe(833);
    expect(computePoints(2000, limit, false)).toBe(667);
  });

  it("doubles the points when doublePoints is true", () => {
    expect(computePoints(0, LIMIT_MS, true)).toBe(BASE_POINTS * 2);
    expect(computePoints(LIMIT_MS, LIMIT_MS, true)).toBe(BASE_POINTS);
    expect(computePoints(LIMIT_MS / 2, LIMIT_MS, true)).toBe(1500);
  });

  it("returns zero for a non-positive limit, even with doublePoints", () => {
    expect(computePoints(0, 0, false)).toBe(0);
    expect(computePoints(0, -100, false)).toBe(0);
    expect(computePoints(0, 0, true)).toBe(0);
  });
});

describe("scoreAnswer", () => {
  it("always returns promo points for promo questions", () => {
    expect(
      scoreAnswer(
        { kind: "promo", doublePoints: false },
        true,
        0,
        LIMIT_MS,
      ),
    ).toBe(PROMO_POINTS);
    expect(
      scoreAnswer(
        { kind: "promo", doublePoints: true },
        true,
        0,
        LIMIT_MS,
      ),
    ).toBe(PROMO_POINTS);
    expect(
      scoreAnswer(
        { kind: "promo", doublePoints: false },
        false,
        0,
        LIMIT_MS,
      ),
    ).toBe(PROMO_POINTS);
  });

  it("returns zero for an incorrect quiz answer", () => {
    expect(
      scoreAnswer({ kind: "quiz", doublePoints: false }, false, 0, LIMIT_MS),
    ).toBe(0);
    expect(
      scoreAnswer({ kind: "quiz", doublePoints: true }, false, 0, LIMIT_MS),
    ).toBe(0);
  });

  it("computes points for a correct quiz answer", () => {
    expect(
      scoreAnswer({ kind: "quiz", doublePoints: false }, true, 0, LIMIT_MS),
    ).toBe(BASE_POINTS);
    expect(
      scoreAnswer(
        { kind: "quiz", doublePoints: false },
        true,
        LIMIT_MS / 2,
        LIMIT_MS,
      ),
    ).toBe(750);
  });

  it("doubles points for a correct double-points quiz answer", () => {
    expect(
      scoreAnswer({ kind: "quiz", doublePoints: true }, true, 0, LIMIT_MS),
    ).toBe(BASE_POINTS * 2);
  });

  it("uses the default question time limit when none is provided", () => {
    expect(
      scoreAnswer({ kind: "quiz", doublePoints: false }, true, LIMIT_MS),
    ).toBe(BASE_POINTS / 2);
    expect(scoreAnswer({ kind: "quiz", doublePoints: false }, true, 0)).toBe(
      BASE_POINTS,
    );
  });

  it("returns zero when the limit is non-positive", () => {
    expect(
      scoreAnswer({ kind: "quiz", doublePoints: false }, true, 0, 0),
    ).toBe(0);
  });
});
