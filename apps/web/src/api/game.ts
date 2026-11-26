import {
  nextPollDelay,
  type Schedule,
  type LeaderboardRow,
  type Phase,
  type PublicQuestion,
} from "@rp/shared";
import { http } from "./http";

export type ServerPhase = Phase | "draft" | "ended";

export type PublicState = {
  serverNow: number;
  phase: ServerPhase;
  nextBoundaryAt: number | null;
  players: number;
  question: PublicQuestion | null;
  reveal: {
    index: number;
    correctOption: number;
    counts: number[] | null;
  } | null;
  nextQuestion: PublicQuestion | null;
  game: {
    id: string;
    title: string;
    locale: "et" | "en";
    startsAt: number | null;
    joiningLocked: boolean;
    lobbyMinutes: number | null;
    scheduleKey: string | null;
    schedule?: Schedule | null;
    sponsor: { name: string | null; logoUrl: string | null } | null;
  };
};

export type PlayStateResponse = PublicState & {
  me: { id: string; nickname: string; score: number; rank: number };
  top: LeaderboardRow[];
};

export async function lookupGame(code: string): Promise<{
  title: string;
  sponsor: PublicState["game"]["sponsor"];
}> {
  const { data } = await http.get<{
    title: string;
    sponsor: PublicState["game"]["sponsor"];
  }>("/game/lookup", { params: { code } });
  return data;
}

export async function fetchPublicState(code: string): Promise<PublicState> {
  const { data } = await http.get<PublicState>("/game/state", {
    params: { code },
  });
  return data;
}

export type ScreenState = PublicState & { joinCode: string };

export type FetchOptions = { schedule?: boolean };

export async function fetchScreenState(
  token: string,
  opts: FetchOptions = {},
): Promise<ScreenState> {
  const { data } = await http.get<ScreenState>("/screen/state", {
    params: { token, ...(opts.schedule ? { schedule: 1 } : {}) },
  });
  return data;
}

export function pollDelay(state: PublicState): number | null {
  if (state.phase === "ended") return null;
  return nextPollDelay(state, state.serverNow);
}

export async function fetchPlayState(
  opts: FetchOptions = {},
): Promise<PlayStateResponse> {
  const { data } = await http.get<PlayStateResponse>("/play/state", {
    params: opts.schedule ? { schedule: 1 } : undefined,
  });
  return data;
}

export async function skipLogin(): Promise<void> {
  await http.post("/play/skip-login");
}

export async function joinGame(code: string, nickname: string): Promise<void> {
  await http.post("/join", { code, nickname });
}

export async function submitAnswer(index: number, option: number) {
  const { data } = await http.post<{
    isCorrect: boolean;
    points: number;
    total: number;
  }>("/play/answer", { index, option });
  return data;
}
