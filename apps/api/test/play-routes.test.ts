import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";

const mocks = vi.hoisted(() => ({
  getCachedGameByCode: vi.fn(),
  getCachedGameById: vi.fn(),
  countParticipants: vi.fn(),
  createParticipant: vi.fn(),
  getParticipantByToken: vi.fn(),
  getLeaderboard: vi.fn(),
}));

vi.mock("../src/repo/games.js", () => ({}));

vi.mock("../src/game-cashe.js", () => ({
  getCachedGameByCode: mocks.getCachedGameByCode,
  getCachedGameById: mocks.getCachedGameById,
}));

vi.mock("../src/repo/participants.js", () => ({
  countParticipants: mocks.countParticipants,
  createParticipant: mocks.createParticipant,
  getParticipantByToken: mocks.getParticipantByToken,
  getLeaderboard: mocks.getLeaderboard,
}));

import { playRoutes } from "../src/routes/play.js";
import type { Game } from "../src/repo/games.js";

let app: FastifyInstance;

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: "game_1",
    clubId: "club_1",
    title: "Derby",
    code: "ABC123",
    status: "lobby",
    locale: "et",
    startsAt: null,
    schedule: null,
    joiningLocked: false,
    sponsor: null,
    ...overrides,
  };
}

function makeParticipant(overrides: Record<string, unknown> = {}) {
  return {
    id: "participant_1",
    gameId: "game_1",
    nickname: "neo",
    score: 5,
    hidden: false,
    fanId: null,
    ...overrides,
  };
}

beforeEach(async () => {
  vi.clearAllMocks();
  app = Fastify();
  await app.register(cookie);
  await app.register(playRoutes, { prefix: "/api" });
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

describe("GET /api/game/state", () => {
  it("rejects codes shorter than 6 characters", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/game/state?code=ABC",
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "not_found" });
    expect(mocks.getCachedGameByCode).not.toHaveBeenCalled();
  });

  it("returns not_found for missing or draft games", async () => {
    mocks.getCachedGameByCode.mockResolvedValueOnce(null);
    const missing = await app.inject({
      method: "GET",
      url: "/api/game/state?code=ABC123",
    });
    expect(missing.statusCode).toBe(404);

    mocks.getCachedGameByCode.mockResolvedValueOnce(
      makeGame({ status: "draft" }),
    );
    const draft = await app.inject({
      method: "GET",
      url: "/api/game/state?code=ABC123",
    });
    expect(draft.statusCode).toBe(404);
  });

  it("returns the public state for a live game", async () => {
    mocks.getCachedGameByCode.mockResolvedValue(makeGame());
    mocks.countParticipants.mockResolvedValue(3);

    const res = await app.inject({
      method: "GET",
      url: "/api/game/state?code=abc123",
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(mocks.getCachedGameByCode).toHaveBeenCalledWith("ABC123");
    expect(mocks.countParticipants).toHaveBeenCalledWith("game_1");
    expect(res.json()).toEqual({
      serverNow: expect.any(Number),
      phase: { type: "lobby" },
      nextBoundaryAt: null,
      players: 3,
      game: {
        id: "game_1",
        title: "Derby",
        locale: "et",
        startsAt: null,
        joiningLocked: false,
        sponsor: null,
      },
    });
  });
});

describe("POST /api/join", () => {
  async function join(payload: Record<string, unknown>, cookieHeader?: string) {
    return app.inject({
      method: "POST",
      url: "/api/join",
      payload,
      headers: cookieHeader ? { cookie: cookieHeader } : undefined,
    });
  }

  it("rejects nicknames outside the allowed length", async () => {
    const short = await join({ code: "ABC123", nickname: "neo" });
    expect(short.statusCode).toBe(400);
    expect(short.json()).toEqual({ error: "bad_nickname" });

    const long = await join({ code: "ABC123", nickname: "a".repeat(21) });
    expect(long.statusCode).toBe(400);
    expect(long.json()).toEqual({ error: "bad_nickname" });
  });

  it("returns not_found for a missing game", async () => {
    mocks.getCachedGameByCode.mockResolvedValue(null);

    const res = await join({ code: "ABC123", nickname: "player" });

    expect(res.statusCode).toBe(404);
  });

  it("returns game_ended for ended and cancelled games", async () => {
    for (const status of ["ended", "cancelled"] as const) {
      mocks.getCachedGameByCode.mockResolvedValueOnce(makeGame({ status }));
      const res = await join({ code: "ABC123", nickname: "player" });
      expect(res.statusCode).toBe(410);
      expect(res.json()).toEqual({ error: "game_ended" });
    }
  });

  it("returns joining_locked when joining is locked", async () => {
    mocks.getCachedGameByCode.mockResolvedValue(
      makeGame({ joiningLocked: true }),
    );

    const res = await join({ code: "ABC123", nickname: "player" });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: "joining_locked" });
  });

  it("reuses an existing participant from the same game", async () => {
    mocks.getCachedGameByCode.mockResolvedValue(makeGame());
    mocks.getParticipantByToken.mockResolvedValue(makeParticipant());

    const res = await join(
      { code: "ABC123", nickname: "player" },
      "pr_play=token_1",
    );

    expect(res.statusCode).toBe(200);
    expect(mocks.getParticipantByToken).toHaveBeenCalledWith("token_1");
    expect(mocks.createParticipant).not.toHaveBeenCalled();
    expect(res.json()).toEqual({
      me: { id: "participant_1", nickname: "neo", score: 5 },
    });
  });

  it("does not reuse a participant from another game", async () => {
    mocks.getCachedGameByCode.mockResolvedValue(makeGame());
    mocks.getParticipantByToken.mockResolvedValue(
      makeParticipant({ gameId: "other_game" }),
    );
    mocks.createParticipant.mockResolvedValue({
      ok: true,
      participant: makeParticipant(),
      sessionToken: "new_token",
    });

    const res = await join(
      { code: "ABC123", nickname: "player" },
      "pr_play=token_1",
    );

    expect(res.statusCode).toBe(200);
    expect(mocks.createParticipant).toHaveBeenCalledWith("game_1", "player");
  });

  it("returns conflict when the nickname is taken", async () => {
    mocks.getCachedGameByCode.mockResolvedValue(makeGame());
    mocks.createParticipant.mockResolvedValue({
      ok: false,
      reason: "nickname_taken",
    });

    const res = await join({ code: "ABC123", nickname: "player" });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: "nickname_taken" });
  });

  it("creates a participant and sets the play cookie", async () => {
    mocks.getCachedGameByCode.mockResolvedValue(makeGame());
    mocks.createParticipant.mockResolvedValue({
      ok: true,
      participant: makeParticipant({ score: 0 }),
      sessionToken: "new_token",
    });

    const res = await join({ code: "ABC123", nickname: "  player  " });

    expect(res.statusCode).toBe(200);
    expect(mocks.createParticipant).toHaveBeenCalledWith("game_1", "player");
    expect(res.json()).toEqual({
      me: { id: "participant_1", nickname: "neo", score: 0 },
    });
    expect(res.headers["set-cookie"]).toContain("pr_play=new_token");
  });
});

describe("GET /api/play/state", () => {
  it("returns no_session without a cookie", async () => {
    const res = await app.inject({ method: "GET", url: "/api/play/state" });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "no_session" });
  });

  it("clears the cookie when the participant no longer exists", async () => {
    mocks.getParticipantByToken.mockResolvedValue(null);

    const res = await app.inject({
      method: "GET",
      url: "/api/play/state",
      headers: { cookie: "pr_play=stale" },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "no_session" });
    expect(res.headers["set-cookie"]).toContain("pr_play=");
  });

  it("returns not_found when the participant game is missing", async () => {
    mocks.getParticipantByToken.mockResolvedValue(makeParticipant());
    mocks.getCachedGameById.mockResolvedValue(null);

    const res = await app.inject({
      method: "GET",
      url: "/api/play/state",
      headers: { cookie: "pr_play=token_1" },
    });

    expect(res.statusCode).toBe(404);
  });

  it("returns the public state plus personal info and leaderboard", async () => {
    mocks.getParticipantByToken.mockResolvedValue(makeParticipant());
    mocks.getCachedGameById.mockResolvedValue(makeGame());
    mocks.countParticipants.mockResolvedValue(2);
    mocks.getLeaderboard.mockResolvedValue([
      { rank: 1, nickname: "neo", score: 5 },
    ]);

    const res = await app.inject({
      method: "GET",
      url: "/api/play/state",
      headers: { cookie: "pr_play=token_1" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(mocks.getCachedGameById).toHaveBeenCalledWith("game_1");
    expect(mocks.getLeaderboard).toHaveBeenCalledWith("game_1", 10);
    expect(res.json()).toEqual({
      serverNow: expect.any(Number),
      phase: { type: "lobby" },
      nextBoundaryAt: null,
      players: 2,
      game: {
        id: "game_1",
        title: "Derby",
        locale: "et",
        startsAt: null,
        joiningLocked: false,
        sponsor: null,
      },
      me: { id: "participant_1", nickname: "neo", score: 5 },
      top: [{ rank: 1, nickname: "neo", score: 5 }],
    });
  });
});
