import { describe, expect, it } from "vitest";
import { ServerClock, buildSchedule, localPhaseAt } from "@rp/shared";

const schedule = buildSchedule([{ kind: "quiz" }, { kind: "quiz" }]);
const START = 1_000_000;

describe("localPhaseAt", () => {
  it("is lobby before the start", () => {
    expect(localPhaseAt(START, schedule, START - 1)).toEqual({
      phase: { type: "lobby" },
      nextBoundaryAt: START,
    });
  });

  it("walks through all phases", () => {
    const at = (ms: number) => localPhaseAt(START, schedule, START + ms);

    expect(at(0)).toEqual({
      phase: { type: "get-ready", nextIndex: 0 },
      nextBoundaryAt: START + 5000,
    });
    expect(at(5000)).toEqual({
      phase: { type: "question", index: 0 },
      nextBoundaryAt: START + 15_000,
    });
    expect(at(16_000)).toEqual({
      phase: { type: "pause", index: 0 },
      nextBoundaryAt: START + 23_000,
    });
    expect(at(23_000).phase).toEqual({ type: "question", index: 1 });
    expect(at(41_000)).toEqual({
      phase: { type: "final" },
      nextBoundaryAt: null,
    });
  });
});

describe("ServerClock", () => {
  it("derives the offset from the middle of the round trip", () => {
    const clock = new ServerClock(() => 2000);
    // запит 1000..1200, сервер відповів 5100 => серверний час ~ 1100 + 4000
    clock.addSample(5100, 1000, 1200);
    expect(clock.offset()).toBe(4000);
    expect(clock.now()).toBe(6000);
  });

  it("prefers the sample with the lowest round trip", () => {
    const clock = new ServerClock(() => 0);
    clock.addSample(5000, 1000, 1400); // rtt 400, offset 3800
    clock.addSample(5020, 1000, 1040); // rtt 40, offset 4000
    expect(clock.offset()).toBe(4000);
  });

  it("forgets samples older than the window", () => {
    const clock = new ServerClock(() => 0);
    clock.addSample(5020, 1000, 1040); // offset 4000
    clock.addSample(200_200, 200_000, 200_200); // offset 100, далеко за вікном першого
    expect(clock.offset()).toBe(100);
  });
});
