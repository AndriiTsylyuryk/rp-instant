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

/** Перший крок входу: чи існує гра з таким PIN і чи можна приєднатись. */
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

/** Стан для екрана арени: публічний стан плюс код приєднання (для QR). */
export type ScreenState = PublicState & { joinCode: string };

export async function fetchScreenState(token: string): Promise<ScreenState> {
  const { data } = await http.get<ScreenState>("/screen/state", {
    params: { token },
  });
  return data;
}

/** Через скільки питати знову. null = більше не питати (завершена гра). */
export function pollDelay(state: PublicState): number | null {
  if (state.phase === "ended") return null;
  return nextPollDelay(state, state.serverNow);
}

export async function fetchPlayState(): Promise<PlayStateResponse> {
  const { data } = await http.get<PlayStateResponse>("/play/state");
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
