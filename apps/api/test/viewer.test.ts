import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildSchedule, STARTING_BUFFER_MS } from "@rp/shared";
import type { Game } from "../src/repo/games.js";
import type { AuthSession } from "../src/auth/session-store.js";
import type { Session } from "../src/session-cache.js";

const mocks = vi.hoisted(() => ({
  getCachedGameById: vi.fn(),
}));

vi.mock("../src/game-cache.js", () => ({
  getCachedGameById: mocks.getCachedGameById,
}));

import { buildViewer } from "../src/auth/viewer.js";

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: "game_1",
    clubId: "club_1",
    title: "Derby",
    code: "ABC123",
    status: "live",
    locale: "et",
    startsAt: 1000,
    schedule: null,
    joiningLocked: false,
    sponsor: null,
    ...overrides,
  };
}

function makeGuest(overrides: Partial<Session> = {}): Session {
  return {
    id: "participant_1",
    gameId: "game_1",
    nickname: "neo",
    fanId: null,
    score: 5,
    ...overrides,
  };
}

function makeAuthSession(overrides: Partial<AuthSession> = {}): AuthSession {
  return {
    rowId: "row_1",
    userId: "fan_1",
    role: "fan",
    profile: {
      name: null,
      nickname: "neo",
      email: "neo@example.com",
      clubId: null,
    },
    expiresAt: Date.now() + 60_000,
    touchedAt: Date.now(),
    ...overrides,
  };
}

const NOW = Date.parse("2026-01-01T12:00:00.000Z");
const schedule = buildSchedule([{ kind: "quiz" }]);

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(Date, "now").mockReturnValue(NOW);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("buildViewer", () => {
  it("returns anonymous without auth or guest", async () => {
    await expect(buildViewer(null, null)).resolves.toEqual({
      kind: "anonymous",
    });
    expect(mocks.getCachedGameById).not.toHaveBeenCalled();
  });

  it("returns guest with the participant game code", async () => {
    mocks.getCachedGameById.mockResolvedValue(makeGame());

    await expect(buildViewer(null, makeGuest())).resolves.toEqual({
      kind: "guest",
      participant: {
        nickname: "neo",
        gameCode: "ABC123",
        gameStatus: "lobby",
      },
    });
    expect(mocks.getCachedGameById).toHaveBeenCalledWith("game_1");
  });

  describe("participant game status", () => {
    async function statusOf(game: Game | null) {
      mocks.getCachedGameById.mockResolvedValue(game);
      const viewer = await buildViewer(null, makeGuest());
      return viewer.kind === "guest" ? viewer.participant.gameStatus : null;
    }

    it("is lobby before the game is scheduled", async () => {
      await expect(statusOf(makeGame({ startsAt: null }))).resolves.toBe(
        "lobby",
      );
    });

    it("is live while questions are running", async () => {
      const game = makeGame({
        startsAt: NOW - STARTING_BUFFER_MS - 2000,
        schedule,
      });
      await expect(statusOf(game)).resolves.toBe("live");
    });

    it("is ended when the schedule is over, even if status is still live", async () => {
      const game = makeGame({
        status: "live",
        startsAt: NOW - schedule.endsAt - 1000,
        schedule,
      });
      await expect(statusOf(game)).resolves.toBe("ended");
    });

    it("is ended for ended and cancelled games", async () => {
      await expect(statusOf(makeGame({ status: "ended" }))).resolves.toBe(
        "ended",
      );
      await expect(statusOf(makeGame({ status: "cancelled" }))).resolves.toBe(
        "ended",
      );
    });

    it("drops the participant when the game no longer exists", async () => {
      mocks.getCachedGameById.mockResolvedValue(null);

      await expect(buildViewer(null, makeGuest())).resolves.toEqual({
        kind: "anonymous",
      });
    });
  });

  it("returns fan with participant", async () => {
    mocks.getCachedGameById.mockResolvedValue(makeGame());

    await expect(
      buildViewer(makeAuthSession(), makeGuest()),
    ).resolves.toEqual({
      kind: "fan",
      fan: {
        id: "fan_1",
        nickname: "neo",
        email: "neo@example.com",
      },
      participant: {
        nickname: "neo",
        gameCode: "ABC123",
        gameStatus: "lobby",
      },
    });
  });

  it("returns fan without participant", async () => {
    await expect(buildViewer(makeAuthSession(), null)).resolves.toEqual({
      kind: "fan",
      fan: {
        id: "fan_1",
        nickname: "neo",
        email: "neo@example.com",
      },
      participant: null,
    });
    expect(mocks.getCachedGameById).not.toHaveBeenCalled();
  });

  it("returns manager", async () => {
    const auth = makeAuthSession({
      userId: "manager_1",
      role: "manager",
      profile: {
        name: "Coach",
        nickname: null,
        email: "coach@example.com",
        clubId: "club_1",
      },
    });

    await expect(buildViewer(auth, null)).resolves.toEqual({
      kind: "manager",
      manager: {
        id: "manager_1",
        name: "Coach",
        clubId: "club_1",
      },
    });
  });

  it("does not include a participant for manager", async () => {
    mocks.getCachedGameById.mockResolvedValue(makeGame());
    const auth = makeAuthSession({
      userId: "manager_1",
      role: "manager",
      profile: {
        name: "Coach",
        nickname: null,
        email: "coach@example.com",
        clubId: "club_1",
      },
    });

    const viewer = await buildViewer(auth, makeGuest());

    expect(viewer).toEqual({
      kind: "manager",
      manager: {
        id: "manager_1",
        name: "Coach",
        clubId: "club_1",
      },
    });
    expect(viewer).not.toHaveProperty("participant");
  });
});
