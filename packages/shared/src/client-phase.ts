import { getPhaseAt } from "./schedule.js";
import type { Phase, Schedule } from "./types.js";

export type LocalPhase = {
  phase: Phase;

  nextBoundaryAt: number | null;
};

export function localPhaseAt(
  startsAt: number,
  schedule: Schedule,
  serverTime: number,
): LocalPhase {
  const elapsed = serverTime - startsAt;
  if (elapsed < 0) {
    return { phase: { type: "lobby" }, nextBoundaryAt: startsAt };
  }

  const slice = getPhaseAt(schedule, elapsed);
  return {
    phase: slice.phase,
    nextBoundaryAt:
      slice.nextBoundaryAt === null ? null : startsAt + slice.nextBoundaryAt,
  };
}

const WINDOW_MS = 2 * 60_000;
const MAX_SAMPLES = 30;

type Sample = { offset: number; rtt: number; at: number };

export class ServerClock {
  private samples: Sample[] = [];
  private readonly clock: () => number;

  constructor(clock: () => number = Date.now) {
    this.clock = clock;
  }

  addSample(serverNow: number, sentAt: number, receivedAt: number): void {
    const rtt = Math.max(0, receivedAt - sentAt);
    this.samples.push({
      offset: serverNow - (sentAt + receivedAt) / 2,
      rtt,
      at: receivedAt,
    });

    const cutoff = receivedAt - WINDOW_MS;
    this.samples = this.samples
      .filter((s) => s.at >= cutoff)
      .slice(-MAX_SAMPLES);
  }

  offset(): number {
    let best: Sample | null = null;
    for (const s of this.samples) {
      if (!best || s.rtt < best.rtt || (s.rtt === best.rtt && s.at > best.at)) {
        best = s;
      }
    }
    return best ? best.offset : 0;
  }

  now(): number {
    return this.clock() + this.offset();
  }
}
