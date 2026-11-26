import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ServerClock,
  localPhaseAt,
  type PublicQuestion,
  type Schedule,
} from "@rp/shared";
import { pollDelay } from "../api/game";
import type { PublicState } from "../api/game";
import { usePolling } from "./usePolling";
import type { PollTiming } from "./usePolling";

const SAFETY_MS = 100;

type Known = { gameId: string; byIndex: Record<number, PublicQuestion> };

function remember(prev: Known, data: PublicState): Known {
  const base = prev.gameId === data.game.id ? prev.byIndex : {};
  let next = base;

  for (const q of [data.question, data.nextQuestion]) {
    if (q && base[q.index] === undefined) {
      if (next === base) next = { ...base };
      next[q.index] = q;
    }
  }

  return next === prev.byIndex && prev.gameId === data.game.id
    ? prev
    : { gameId: data.game.id, byIndex: next };
}

function derive<S extends PublicState>(
  raw: S,
  schedule: Schedule | null,
  known: Known,
  now: number,
): S {
  if (
    now === 0 ||
    typeof raw.phase === "string" ||
    schedule === null ||
    raw.game.startsAt === null
  ) {
    return raw;
  }

  const { phase, nextBoundaryAt } = localPhaseAt(
    raw.game.startsAt,
    schedule,
    now,
  );

  const index =
    phase.type === "question" || phase.type === "pause" ? phase.index : null;
  const byIndex = known.gameId === raw.game.id ? known.byIndex : {};

  return {
    ...raw,
    phase,
    nextBoundaryAt,
    serverNow: now,
    question: index === null ? null : (byIndex[index] ?? null),
    reveal:
      phase.type === "pause" && raw.reveal?.index === phase.index
        ? raw.reveal
        : null,
    nextQuestion: null,
  } as S;
}

export function useGameState<S extends PublicState>(
  fetchState: (opts: { schedule: boolean }) => Promise<S>,
  deps: unknown[],
): { state: S | null; error: unknown } {
  const [clock] = useState(() => new ServerClock());
  const [now, setNow] = useState(0);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [known, setKnown] = useState<Known>({ gameId: "", byIndex: {} });

  const wantSchedule = useRef(true);
  const knownKey = useRef<string | null | undefined>(undefined);
  const pollNowRef = useRef<() => void>(() => {});

  const estimate = useCallback(() => clock.now() - SAFETY_MS, [clock]);

  const onResult = (data: S, timing: PollTiming) => {
    clock.addSample(data.serverNow, timing.sentAt, timing.receivedAt);
    setNow(estimate());

    const { schedule: incoming, scheduleKey: key } = data.game;
    if (incoming !== undefined) {
      wantSchedule.current = false;
      knownKey.current = key;
      setSchedule(incoming);
    } else if (key !== knownKey.current) {
      wantSchedule.current = true;
      setTimeout(() => pollNowRef.current(), 0);
    }

    setKnown((prev) => remember(prev, data));
  };

  const {
    data: raw,
    error,
    pollNow,
  } = usePolling(
    () => fetchState({ schedule: wantSchedule.current }),
    pollDelay,
    deps,
    onResult,
  );

  useEffect(() => {
    pollNowRef.current = pollNow;
  }, [pollNow]);

  const state = useMemo(
    () => (raw ? derive(raw, schedule, known, now) : null),
    [raw, schedule, known, now],
  );

  const boundary = state?.nextBoundaryAt ?? null;
  useEffect(() => {
    if (boundary === null) return;
    const delay = Math.max(0, boundary - estimate());
    const timer = setTimeout(() => setNow(estimate()), delay + 1);
    return () => clearTimeout(timer);
  }, [boundary, now, estimate]);

  const missing =
    state &&
    typeof state.phase !== "string" &&
    (state.phase.type === "question" || state.phase.type === "pause") &&
    state.question === null
      ? `${state.phase.type}:${state.phase.index}`
      : null;
  useEffect(() => {
    if (missing === null) return;
    const timer = setTimeout(pollNow, 200 + Math.random() * 800);
    return () => clearTimeout(timer);
  }, [missing, pollNow]);

  return { state, error };
}
