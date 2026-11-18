import {
  nextPollDelay,
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
    sponsor: { name: string | null; logoUrl: string | null } | null;
  };
};

export type PlayStateResponse = PublicState & {
  me: { id: string; nickname: string; score: number; rank: number };
  top: LeaderboardRow[];
};

export async function fetchPublicState(code: string): Promise<PublicState> {
  const { data } = await http.get<PublicState>("/game/state", {
    params: { code },
  });
  return data;
}

export function pollDelay(state: PublicState): number | null {
  return nextPollDelay(state, state.serverNow);
}

export async function fetchPlayState(): Promise<PlayStateResponse> {
  const { data } = await http.get<PlayStateResponse>("/play/state");
  return data;
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
