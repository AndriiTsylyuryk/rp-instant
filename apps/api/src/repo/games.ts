import type { Schedule } from "@rp/shared";

type GameRow = {
  id: string;
  club: string;
  title: string;
  joinCode: string;
  status: "draft" | "lobby" | "live" | "ended" | "cancelled";
  locale: "et" | "en";
  startsAt: string;
  schedule: Schedule | null;
  joining_locked: boolean;
  sponsor_name: string | null;
  sponsor_logo: string | null;
};

export type Game = {
  id: string;
  clubId: string;
  title: string;
  code: string;
  status: GameRow["status"];
  locale: GameRow["locale"];
  startsAt: number | null;
  schedule: Schedule | null;
  joiningLocked: boolean;
  sponsor: {
    name: string | null;
    logoUrl: string | null;
  } | null;
};
