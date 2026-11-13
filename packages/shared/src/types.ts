export type Schedule = {
  version: 1;
  questionCount: number;
  questions: Array<{
    index: number;
    kind: "quiz" | "promo";
    opensAt: number;
    closesAt: number;
    pauseEndsAt: number;
  }>;
  endsAt: number;
};

export type Phase =
  | { type: "lobby" }
  | { type: "get-ready"; nextIndex: number }
  | { type: "question"; index: number }
  | { type: "pause"; index: number }
  | { type: "final" };

export type GameState = {
  code: string;
  status: "lobby" | "live" | "ended" | "cancelled";
  startsAt: number;
  schedule: Schedule | null;
  joiningLocked: boolean;
  sponsor: { name: string; logoUrl: string } | null;
};

export type PublicQuestion = {
  index: number;
  kind: "quiz" | "promo";
  text: string;
  options: string[];
  doublePoints: boolean;
};

export type AnswerResult = {
  isCorrect: boolean;
  points: number;
  total: number;
};

export type Reveal = { index: number; correctOption: number; counts: number[] };
export type LeaderboardRow = { rank: number; nickname: string; score: number };
export type PlayState = {
  nickname: string;
  score: number;
  rank: number;
  answered: Array<{
    index: number;
    option: number;
    isCorrect: boolean;
    points: number;
  }>;
};

export type Me = {
  fan: { id: string; nickname: string; email: string } | null;
  manager: {
    id: string;
    name: string;
    club: { id: string; name: string | null };
  } | null;
};
