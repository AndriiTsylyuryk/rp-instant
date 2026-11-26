import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import {
  ANSWER_GRACE_MS,
  buildSchedule,
  PREFETCH_MS,
  STARTING_BUFFER_MS,
} from "@rp/shared";

const mocks = vi.hoisted(() => ({
  getCachedGameByCode: vi.fn(),
  getCachedGameById: vi.fn(),
  getCachedGameByScreenToken: vi.fn(),
  createParticipant: vi.fn(),
  getParticipantByToken: vi.fn(),
  linkParticipantToFan: vi.fn(),
  revokeParticipantSession: vi.fn(),
  getAuthSession: vi.fn(),
  getSession: vi.fn(),
  putSession: vi.fn(),
  invalidateSession: vi.fn(),
  getPlayerCount: vi.fn(),
  incrementPlayerCount: vi.fn(),
  getBoard: vi.fn(),
  rankOf: vi.fn(),
  createAnswer: vi.fn(),
  getAnswersByParticipant: vi.fn(),
  getCachedQuestions: vi.fn(),
  getCachedQuestionAt: vi.fn(),
  getCachedCounts: vi.fn(),
}));

vi.mock("../src/repo/games.js", () => ({}));

vi.mock("../src/repo/pb.js", () => ({
  pb: {},
  withPb: (fn: (client: unknown) => Promise<unknown>) => fn({}),
}));

vi.mock("../src/game-cache.js", () => ({
  getCachedGameByCode: mocks.getCachedGameByCode,
  getCachedGameById: mocks.getCachedGameById,
  getCachedGameByScreenToken: mocks.getCachedGameByScreenToken,
}));

vi.mock("../src/repo/participants.js", () => ({
  createParticipant: mocks.createParticipant,
  getParticipantByToken: mocks.getParticipantByToken,
  linkParticipantToFan: mocks.linkParticipantToFan,
  revokeParticipantSession: mocks.revokeParticipantSession,
}));

vi.mock("../src/auth/session-store.js", () => ({
  getAuthSession: mocks.getAuthSession,
}));

vi.mock("../src/session-cache.js", () => ({
  getSession: mocks.getSession,
  putSession: mocks.putSession,
  invalidateSession: mocks.invalidateSession,
}));

vi.mock("../src/player-count.js", () => ({
  getPlayerCount: mocks.getPlayerCount,
  incrementPlayerCount: mocks.incrementPlayerCount,
}));

vi.mock("../src/leaderboard-cache.js", () => ({
  getBoard: mocks.getBoard,
  rankOf: mocks.rankOf,
}));

vi.mock("../src/repo/answers.js", () => ({
  createAnswer: mocks.createAnswer,
  getAnswersByParticipant: mocks.getAnswersByParticipant,
}));

vi.mock("../src/questions-cache.js", () => ({
  getCachedQuestions: mocks.getCachedQuestions,
  getCachedQuestionAt: mocks.getCachedQuestionAt,
}));

vi.mock("../src/reveal-cache.js", () => ({
  getCachedCounts: mocks.getCachedCounts,
}));

import { playRoutes } from "../src/routes/play.js";
import type { Game } from "../src/repo/games.js";

const BASE = Date.parse("2026-01-01T12:00:00.000Z");
const PLAY_COOKIE = "rp_play=token_1";

type Question = {
  id: string;
  index: number;
  kind: "quiz" | "promo";
  text: string;
  options: string[];
  correctOption: number | null;
  doublePoints: boolean;
};

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
    lobbyMinutes: 5,
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

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "participant_1",
    gameId: "game_1",
    nickname: "neo",
    fanId: null,
    score: 5,
    ...overrides,
  };
}

function makeQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: "question_1",
    index: 0,
    kind: "quiz",
    text: "Who wins?",
    options: ["A", "B"],
    correctOption: 1,
    doublePoints: false,
    ...overrides,
  };
}

function useTime(now: number = BASE) {
  vi.spyOn(Date, "now").mockReturnValue(now);
}

function liveGame(
  elapsedMs: number,
  kinds: Array<{ kind: "quiz" | "promo" }> = [{ kind: "quiz" }],
): Game {
  const schedule = buildSchedule(kinds);
  return makeGame({
    status: "live",
    startsAt: BASE - elapsedMs,
    schedule,
  });
}

function answer(
  payload: Record<string, unknown>,
  cookieHeader: string | null = PLAY_COOKIE,
) {
  return app.inject({
    method: "POST",
    url: "/api/play/answer",
    payload,
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
  });
}

function setupOpenQuestion(
  overrides: { elapsedMs?: number; question?: Partial<Question> } = {},
) {
  const schedule = buildSchedule([{ kind: "quiz" }]);
  const elapsedMs =
    overrides.elapsedMs ?? schedule.questions[0].opensAt + 2000;
  const game = makeGame({
    status: "live",
    startsAt: BASE - elapsedMs,
    schedule,
  });

  useTime(BASE);
  const session = makeSession();
  mocks.getSession.mockResolvedValue(session);
  mocks.getCachedGameById.mockResolvedValue(game);
  mocks.getCachedQuestionAt.mockResolvedValue(
    makeQuestion(overrides.question),
  );
  mocks.createAnswer.mockResolvedValue({
    ok: true,
    answer: {
      id: "answer_1",
      questionId: "question_1",
      option: 1,
      elapsedMs: 2000,
      isCorrect: true,
      points: 900,
    },
  });

  return { game, schedule, session };
}

beforeEach(async () => {
  vi.resetAllMocks();
  mocks.getPlayerCount.mockResolvedValue(0);
  mocks.getBoard.mockResolvedValue({ top: [], scores: [], builtAt: 0 });
  mocks.rankOf.mockReturnValue(1);
  mocks.getAnswersByParticipant.mockResolvedValue([]);
  mocks.getCachedQuestions.mockResolvedValue([]);

  app = Fastify();
  await app.register(cookie);
  await app.register(playRoutes, { prefix: "/api" });
  await app.ready();
});

afterEach(async () => {
  vi.restoreAllMocks();
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
    mocks.getPlayerCount.mockResolvedValue(3);

    const res = await app.inject({
      method: "GET",
      url: "/api/game/state?code=abc123",
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(mocks.getCachedGameByCode).toHaveBeenCalledWith("ABC123");
    expect(mocks.getPlayerCount).toHaveBeenCalledWith("game_1");
    expect(res.json()).toEqual({
      serverNow: expect.any(Number),
      phase: { type: "lobby" },
      nextBoundaryAt: null,
      players: 3,
      question: null,
      reveal: null,
      nextQuestion: null,
      game: {
        id: "game_1",
        title: "Derby",
        locale: "et",
        startsAt: null,
        joiningLocked: false,
        lobbyMinutes: 5,
        scheduleKey: null,
        sponsor: null,
      },
    });
  });

  it("prefetches the next question inside the prefetch window", async () => {
    useTime(BASE);
    const schedule = buildSchedule([{ kind: "quiz" }, { kind: "quiz" }]);
    const elapsedMs = schedule.questions[0].opensAt - PREFETCH_MS / 2;
    mocks.getCachedGameByCode.mockResolvedValue(
      liveGame(elapsedMs, [
        { kind: "quiz" },
        { kind: "quiz" },
      ]),
    );
    mocks.getCachedQuestionAt.mockResolvedValue(makeQuestion());

    const res = await app.inject({
      method: "GET",
      url: "/api/game/state?code=ABC123",
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().nextQuestion).toEqual({
      index: 0,
      kind: "quiz",
      text: "Who wins?",
      options: ["A", "B"],
      doublePoints: false,
    });
    expect(mocks.getCachedQuestionAt).toHaveBeenCalledWith("game_1", 0);
  });

  it("returns the current question during a question phase", async () => {
    useTime(BASE);
    mocks.getCachedGameByCode.mockResolvedValue(
      liveGame(STARTING_BUFFER_MS + 2000),
    );
    mocks.getCachedQuestionAt.mockResolvedValue(makeQuestion());

    const res = await app.inject({
      method: "GET",
      url: "/api/game/state?code=ABC123",
    });

    expect(res.statusCode).toBe(200);
    expect(mocks.getCachedQuestionAt).toHaveBeenCalledWith("game_1", 0);
    expect(res.json()).toMatchObject({
      phase: { type: "question", index: 0 },
      question: {
        index: 0,
        kind: "quiz",
        text: "Who wins?",
        options: ["A", "B"],
        doublePoints: false,
      },
      reveal: null,
    });
  });

  it("returns a reveal without counts during the answer grace window", async () => {
    const schedule = buildSchedule([{ kind: "quiz" }]);
    const elapsed = schedule.questions[0].closesAt + 100;
    useTime(BASE);
    mocks.getCachedGameByCode.mockResolvedValue(liveGame(elapsed));
    mocks.getCachedQuestionAt.mockResolvedValue(makeQuestion());

    const res = await app.inject({
      method: "GET",
      url: "/api/game/state?code=ABC123",
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      phase: { type: "pause", index: 0 },
      reveal: { index: 0, correctOption: 1, counts: null },
    });
    expect(mocks.getCachedCounts).not.toHaveBeenCalled();
  });

  it("returns option counts once the answer grace window has passed", async () => {
    const schedule = buildSchedule([{ kind: "quiz" }]);
    const elapsed = schedule.questions[0].closesAt + ANSWER_GRACE_MS;
    useTime(BASE);
    mocks.getCachedGameByCode.mockResolvedValue(liveGame(elapsed));
    mocks.getCachedQuestionAt.mockResolvedValue(makeQuestion());
    mocks.getCachedCounts.mockResolvedValue([3, 4]);

    const res = await app.inject({
      method: "GET",
      url: "/api/game/state?code=ABC123",
    });

    expect(res.statusCode).toBe(200);
    expect(mocks.getCachedCounts).toHaveBeenCalledWith("question_1", 2);
    expect(res.json()).toMatchObject({
      phase: { type: "pause", index: 0 },
      reveal: { index: 0, correctOption: 1, counts: [3, 4] },
    });
  });

  it("returns a null question when the question is missing", async () => {
    useTime(BASE);
    mocks.getCachedGameByCode.mockResolvedValue(
      liveGame(STARTING_BUFFER_MS + 2000),
    );
    mocks.getCachedQuestionAt.mockResolvedValue(null);

    const res = await app.inject({
      method: "GET",
      url: "/api/game/state?code=ABC123",
    });

    expect(res.json()).toMatchObject({ question: null, reveal: null });
  });
});

describe("GET /api/screen/state", () => {
  const TOKEN = "S".repeat(24);

  it("rejects malformed tokens without touching the cache", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/screen/state?token=short",
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "not_found" });
    expect(mocks.getCachedGameByScreenToken).not.toHaveBeenCalled();
  });

  it("returns not_found for an unknown token", async () => {
    mocks.getCachedGameByScreenToken.mockResolvedValue(null);

    const res = await app.inject({
      method: "GET",
      url: `/api/screen/state?token=${TOKEN}`,
    });

    expect(res.statusCode).toBe(404);
    expect(mocks.getCachedGameByScreenToken).toHaveBeenCalledWith(TOKEN);
  });

  it("returns the public state plus the join code", async () => {
    mocks.getCachedGameByScreenToken.mockResolvedValue(makeGame());
    mocks.getPlayerCount.mockResolvedValue(3);

    const res = await app.inject({
      method: "GET",
      url: `/api/screen/state?token=${TOKEN}`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.json()).toMatchObject({
      phase: { type: "lobby" },
      players: 3,
      joinCode: "ABC123",
      game: { id: "game_1", title: "Derby" },
    });
  });
});

describe("GET /api/game/lookup", () => {
  const lookup = (code: string) =>
    app.inject({ method: "GET", url: `/api/game/lookup?code=${code}` });

  it("rejects malformed codes without touching the cache", async () => {
    for (const code of ["ABC", "ab%20cd!", "A".repeat(40)]) {
      const res = await lookup(code);
      expect(res.statusCode).toBe(404);
    }
    expect(mocks.getCachedGameByCode).not.toHaveBeenCalled();
  });

  it("returns not_found for a missing or draft game", async () => {
    mocks.getCachedGameByCode.mockResolvedValueOnce(null);
    expect((await lookup("ABC123")).statusCode).toBe(404);

    mocks.getCachedGameByCode.mockResolvedValueOnce(
      makeGame({ status: "draft" }),
    );
    expect((await lookup("ABC123")).statusCode).toBe(404);
  });

  it("returns game_ended for ended and cancelled games", async () => {
    for (const status of ["ended", "cancelled"] as const) {
      mocks.getCachedGameByCode.mockResolvedValueOnce(makeGame({ status }));
      const res = await lookup("ABC123");
      expect(res.statusCode).toBe(410);
      expect(res.json()).toEqual({ error: "game_ended" });
    }
  });

  it("returns joining_locked when joining is closed", async () => {
    mocks.getCachedGameByCode.mockResolvedValue(
      makeGame({ joiningLocked: true }),
    );

    const res = await lookup("ABC123");

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: "joining_locked" });
  });

  it("returns only the title and sponsor of a joinable game", async () => {
    mocks.getCachedGameByCode.mockResolvedValue(
      makeGame({ sponsor: { name: "Acme", logoUrl: null } }),
    );

    const res = await lookup("abc123");

    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(mocks.getCachedGameByCode).toHaveBeenCalledWith("ABC123");
    expect(res.json()).toEqual({
      title: "Derby",
      sponsor: { name: "Acme", logoUrl: null },
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

  it("rejects a malformed code without touching the cache", async () => {
    const res = await join({ code: "no", nickname: "player" });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "not_found" });
    expect(mocks.getCachedGameByCode).not.toHaveBeenCalled();
  });

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
      "rp_play=token_1",
    );

    expect(res.statusCode).toBe(200);
    expect(mocks.getParticipantByToken).toHaveBeenCalledWith("token_1");
    expect(mocks.createParticipant).not.toHaveBeenCalled();
    expect(mocks.putSession).not.toHaveBeenCalled();
    expect(mocks.incrementPlayerCount).not.toHaveBeenCalled();
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
      "rp_play=token_1",
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
    expect(mocks.putSession).toHaveBeenCalledWith("new_token", {
      id: "participant_1",
      gameId: "game_1",
      nickname: "neo",
      fanId: null,
      score: 0,
    });
    expect(mocks.incrementPlayerCount).toHaveBeenCalledWith("game_1");
    expect(res.json()).toEqual({
      me: { id: "participant_1", nickname: "neo", score: 0 },
    });
    expect(res.headers["set-cookie"]).toContain("rp_play=new_token");
  });
});

describe("POST /api/join as a logged-in fan", () => {
  const AUTH_COOKIE_HEADER = "rp_auth=auth_token";

  async function join(cookieHeader: string) {
    return app.inject({
      method: "POST",
      url: "/api/join",
      payload: { code: "ABC123", nickname: "player" },
      headers: { cookie: cookieHeader },
    });
  }

  it("links the new participant to the fan account", async () => {
    mocks.getCachedGameByCode.mockResolvedValue(makeGame());
    mocks.getAuthSession.mockResolvedValue({ role: "fan", userId: "fan_1" });
    mocks.createParticipant.mockResolvedValue({
      ok: true,
      participant: makeParticipant({ score: 0, fanId: "fan_1" }),
      sessionToken: "new_token",
    });

    const res = await join(AUTH_COOKIE_HEADER);

    expect(res.statusCode).toBe(200);
    expect(mocks.getAuthSession).toHaveBeenCalledWith("auth_token");
    expect(mocks.createParticipant).toHaveBeenCalledWith(
      "game_1",
      "player",
      "fan_1",
    );
    expect(mocks.putSession).toHaveBeenCalledWith(
      "new_token",
      expect.objectContaining({ fanId: "fan_1" }),
    );
  });

  it("does not link managers", async () => {
    mocks.getCachedGameByCode.mockResolvedValue(makeGame());
    mocks.getAuthSession.mockResolvedValue({ role: "manager", userId: "m_1" });
    mocks.createParticipant.mockResolvedValue({
      ok: true,
      participant: makeParticipant({ score: 0 }),
      sessionToken: "new_token",
    });

    await join(AUTH_COOKIE_HEADER);

    expect(mocks.createParticipant).toHaveBeenCalledWith("game_1", "player");
  });

  it("does not look up an auth session for guests", async () => {
    mocks.getCachedGameByCode.mockResolvedValue(makeGame());
    mocks.createParticipant.mockResolvedValue({
      ok: true,
      participant: makeParticipant({ score: 0 }),
      sessionToken: "new_token",
    });

    await app.inject({
      method: "POST",
      url: "/api/join",
      payload: { code: "ABC123", nickname: "player" },
    });

    expect(mocks.getAuthSession).not.toHaveBeenCalled();
  });

  it("links an already joined guest who logged in afterwards", async () => {
    mocks.getCachedGameByCode.mockResolvedValue(makeGame());
    mocks.getAuthSession.mockResolvedValue({ role: "fan", userId: "fan_1" });
    mocks.getParticipantByToken.mockResolvedValue(makeParticipant());

    const res = await join(`${AUTH_COOKIE_HEADER}; rp_play=token_1`);

    expect(res.statusCode).toBe(200);
    expect(mocks.linkParticipantToFan).toHaveBeenCalledWith(
      "participant_1",
      "fan_1",
    );
    expect(mocks.invalidateSession).toHaveBeenCalledWith("token_1");
    expect(mocks.createParticipant).not.toHaveBeenCalled();
  });
});

describe("play cookie lifetime", () => {
  const HOUR = 60 * 60 * 1000;

  function endedGameHoursAgo(hours: number): Game {
    const schedule = buildSchedule([{ kind: "quiz" }]);
    return makeGame({
      status: "ended",
      startsAt: BASE - schedule.endsAt - hours * HOUR,
      schedule,
    });
  }

  it("sets a 24h cookie when joining", async () => {
    mocks.getCachedGameByCode.mockResolvedValue(makeGame());
    mocks.createParticipant.mockResolvedValue({
      ok: true,
      participant: makeParticipant({ score: 0 }),
      sessionToken: "new_token",
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/join",
      payload: { code: "ABC123", nickname: "player" },
    });

    expect(res.headers["set-cookie"]).toContain("Max-Age=86400");
  });

  it("shrinks the cookie to the rest of the 24h window after the game ends", async () => {
    useTime(BASE);
    mocks.getSession.mockResolvedValue(makeSession());
    mocks.getCachedGameById.mockResolvedValue(endedGameHoursAgo(1));

    const res = await app.inject({
      method: "GET",
      url: "/api/play/state",
      headers: { cookie: PLAY_COOKIE },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["set-cookie"]).toContain("rp_play=token_1");
    expect(res.headers["set-cookie"]).toContain("Max-Age=82800"); // 23 год
  });

  it("closes access once the 24h window is over", async () => {
    useTime(BASE);
    mocks.getSession.mockResolvedValue(makeSession());
    mocks.getCachedGameById.mockResolvedValue(endedGameHoursAgo(25));

    const res = await app.inject({
      method: "GET",
      url: "/api/play/state",
      headers: { cookie: PLAY_COOKIE },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "no_session" });
    expect(mocks.invalidateSession).toHaveBeenCalledWith("token_1");
    expect(res.headers["set-cookie"]).toContain("rp_play=;");
  });

  it("does not touch the cookie while the game is still running", async () => {
    useTime(BASE);
    mocks.getSession.mockResolvedValue(makeSession());
    mocks.getCachedGameById.mockResolvedValue(
      liveGame(STARTING_BUFFER_MS + 2000),
    );
    mocks.getCachedQuestionAt.mockResolvedValue(makeQuestion());

    const res = await app.inject({
      method: "GET",
      url: "/api/play/state",
      headers: { cookie: PLAY_COOKIE },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["set-cookie"]).toBeUndefined();
  });
});

describe("GET /api/play/state", () => {
  it("returns no_session without a cookie", async () => {
    const res = await app.inject({ method: "GET", url: "/api/play/state" });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "no_session" });
  });

  it("clears the cookie when the session no longer exists", async () => {
    mocks.getSession.mockResolvedValue(null);

    const res = await app.inject({
      method: "GET",
      url: "/api/play/state",
      headers: { cookie: "rp_play=stale" },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "no_session" });
    expect(mocks.getSession).toHaveBeenCalledWith("stale");
    expect(mocks.invalidateSession).toHaveBeenCalledWith("stale");
    expect(res.headers["set-cookie"]).toContain("rp_play=");
  });

  it("returns not_found when the participant game is missing", async () => {
    mocks.getSession.mockResolvedValue(makeSession());
    mocks.getCachedGameById.mockResolvedValue(null);

    const res = await app.inject({
      method: "GET",
      url: "/api/play/state",
      headers: { cookie: PLAY_COOKIE },
    });

    expect(res.statusCode).toBe(404);
  });

  it("returns the public state plus personal info and leaderboard", async () => {
    mocks.getSession.mockResolvedValue(makeSession());
    mocks.getCachedGameById.mockResolvedValue(makeGame());
    mocks.getPlayerCount.mockResolvedValue(2);
    const board = {
      top: [{ rank: 1, nickname: "trinity", score: 10 }],
      scores: [10, 5],
      builtAt: BASE,
    };
    mocks.getBoard.mockResolvedValue(board);
    mocks.rankOf.mockReturnValue(2);

    const res = await app.inject({
      method: "GET",
      url: "/api/play/state",
      headers: { cookie: PLAY_COOKIE },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(mocks.getCachedGameById).toHaveBeenCalledWith("game_1");
    expect(mocks.getBoard).toHaveBeenCalledWith("game_1");
    expect(mocks.rankOf).toHaveBeenCalledWith(board, 5);
    expect(res.json()).toEqual({
      serverNow: expect.any(Number),
      phase: { type: "lobby" },
      nextBoundaryAt: null,
      players: 2,
      question: null,
      reveal: null,
      nextQuestion: null,
      game: {
        id: "game_1",
        title: "Derby",
        locale: "et",
        startsAt: null,
        joiningLocked: false,
        lobbyMinutes: 5,
        scheduleKey: null,
        sponsor: null,
      },
      me: { id: "participant_1", nickname: "neo", score: 5, rank: 2 },
      top: [{ rank: 1, nickname: "trinity", score: 10 }],
    });
    expect(res.json()).not.toHaveProperty("answered");
  });

  it("includes the current question during a question phase", async () => {
    useTime(BASE);
    mocks.getSession.mockResolvedValue(makeSession());
    mocks.getCachedGameById.mockResolvedValue(
      liveGame(STARTING_BUFFER_MS + 2000),
    );
    mocks.getCachedQuestionAt.mockResolvedValue(makeQuestion());

    const res = await app.inject({
      method: "GET",
      url: "/api/play/state",
      headers: { cookie: PLAY_COOKIE },
    });

    expect(res.json()).toMatchObject({
      phase: { type: "question", index: 0 },
      question: { index: 0, text: "Who wins?" },
      reveal: null,
    });
  });
});

describe("POST /api/play/skip-login", () => {
  function finalGame(): Game {
    const schedule = buildSchedule([{ kind: "quiz" }]);
    return makeGame({
      status: "live",
      startsAt: BASE - schedule.endsAt - 1000,
      schedule,
    });
  }

  function skip(cookieHeader: string | null = PLAY_COOKIE) {
    return app.inject({
      method: "POST",
      url: "/api/play/skip-login",
      headers: cookieHeader ? { cookie: cookieHeader } : undefined,
    });
  }

  it("is idempotent without a play cookie", async () => {
    const res = await skip(null);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(mocks.revokeParticipantSession).not.toHaveBeenCalled();
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("clears a stale play session", async () => {
    mocks.getSession.mockResolvedValue(null);

    const res = await skip("rp_play=stale");

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(mocks.invalidateSession).toHaveBeenCalledWith("stale");
    expect(res.headers["set-cookie"]).toContain("rp_play=;");
  });

  it("revokes the participant and clears the cookie at game over", async () => {
    useTime(BASE);
    mocks.getSession.mockResolvedValue(makeSession());
    mocks.getCachedGameById.mockResolvedValue(finalGame());

    const res = await skip();

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(mocks.revokeParticipantSession).toHaveBeenCalledWith(
      "participant_1",
    );
    expect(mocks.invalidateSession).toHaveBeenCalledWith("token_1");
    expect(res.headers["set-cookie"]).toContain("rp_play=;");
  });

  it("rejects account-owned participation", async () => {
    useTime(BASE);
    mocks.getSession.mockResolvedValue(makeSession({ fanId: "fan_1" }));
    mocks.getCachedGameById.mockResolvedValue(finalGame());

    const res = await skip();

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: "account_owned" });
    expect(mocks.revokeParticipantSession).not.toHaveBeenCalled();
    expect(mocks.invalidateSession).not.toHaveBeenCalled();
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("rejects while the game is still running", async () => {
    useTime(BASE);
    mocks.getSession.mockResolvedValue(makeSession());
    mocks.getCachedGameById.mockResolvedValue(makeGame());

    const res = await skip();

    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: "not_finished" });
    expect(mocks.revokeParticipantSession).not.toHaveBeenCalled();
    expect(mocks.invalidateSession).not.toHaveBeenCalled();
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("clears the cookie when the game is missing", async () => {
    useTime(BASE);
    mocks.getSession.mockResolvedValue(makeSession());
    mocks.getCachedGameById.mockResolvedValue(null);

    const res = await skip();

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(mocks.invalidateSession).toHaveBeenCalledWith("token_1");
    expect(res.headers["set-cookie"]).toContain("rp_play=;");
  });
});

describe("GET /api/play/history", () => {
  it("returns no_session without a cookie", async () => {
    const res = await app.inject({ method: "GET", url: "/api/play/history" });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "no_session" });
  });

  it("returns no_session for an unknown session", async () => {
    mocks.getSession.mockResolvedValue(null);

    const res = await app.inject({
      method: "GET",
      url: "/api/play/history",
      headers: { cookie: "rp_play=stale" },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "no_session" });
  });

  it("maps stored answers to question indexes and drops unknown questions", async () => {
    mocks.getSession.mockResolvedValue(makeSession());
    mocks.getCachedQuestions.mockResolvedValue([
      makeQuestion({ id: "q0", index: 0 }),
      makeQuestion({ id: "q1", index: 1 }),
    ]);
    mocks.getAnswersByParticipant.mockResolvedValue([
      {
        id: "answer_1",
        questionId: "q1",
        option: 1,
        elapsedMs: 1200,
        isCorrect: true,
        points: 940,
      },
      {
        id: "answer_2",
        questionId: "removed_question",
        option: 0,
        elapsedMs: 500,
        isCorrect: false,
        points: 0,
      },
    ]);

    const res = await app.inject({
      method: "GET",
      url: "/api/play/history",
      headers: { cookie: PLAY_COOKIE },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(mocks.getAnswersByParticipant).toHaveBeenCalledWith(
      "participant_1",
    );
    expect(mocks.getCachedQuestions).toHaveBeenCalledWith("game_1");
    expect(res.json()).toEqual({
      answered: [{ index: 1, option: 1, isCorrect: true, points: 940 }],
    });
  });
});

describe("POST /api/play/answer", () => {
  it("returns no_session without a cookie", async () => {
    const res = await answer({ index: 0, option: 1 }, null);

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "no_session" });
  });

  it("clears the cookie and returns no_session for a stale token", async () => {
    mocks.getSession.mockResolvedValue(null);

    const res = await answer({ index: 0, option: 1 }, "rp_play=stale");

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "no_session" });
    expect(res.headers["set-cookie"]).toContain("rp_play=");
  });

  it("returns not_found when the game is missing", async () => {
    mocks.getSession.mockResolvedValue(makeSession());
    mocks.getCachedGameById.mockResolvedValue(null);

    const res = await answer({ index: 0, option: 1 });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "not_found" });
  });

  it("returns not_found when the game has no schedule yet", async () => {
    mocks.getSession.mockResolvedValue(makeSession());
    mocks.getCachedGameById.mockResolvedValue(
      makeGame({ status: "live", startsAt: BASE }),
    );

    const res = await answer({ index: 0, option: 1 });

    expect(res.statusCode).toBe(404);
  });

  it("rejects non-integer or negative indexes and options", async () => {
    mocks.getSession.mockResolvedValue(makeSession());
    mocks.getCachedGameById.mockResolvedValue(
      liveGame(STARTING_BUFFER_MS + 2000),
    );

    for (const payload of [
      { option: 1 },
      { index: 0.5, option: 1 },
      { index: 0, option: -1 },
      { index: "0", option: 1 },
      { index: 0, option: "1" },
    ]) {
      const res = await answer(payload);
      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ error: "bad_request" });
    }
  });

  it("returns closed during get-ready", async () => {
    useTime(BASE);
    mocks.getSession.mockResolvedValue(makeSession());
    mocks.getCachedGameById.mockResolvedValue(liveGame(0));

    const res = await answer({ index: 0, option: 1 });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: "closed" });
    expect(mocks.getCachedQuestionAt).not.toHaveBeenCalled();
  });

  it("accepts answers during the grace window after closing", async () => {
    const schedule = buildSchedule([{ kind: "quiz" }]);
    const elapsed = schedule.questions[0].closesAt + 100;
    const game = makeGame({
      status: "live",
      startsAt: BASE - elapsed,
      schedule,
    });
    useTime(BASE);
    mocks.getSession.mockResolvedValue(makeSession());
    mocks.getCachedGameById.mockResolvedValue(game);
    mocks.getCachedQuestionAt.mockResolvedValue(makeQuestion());
    mocks.createAnswer.mockResolvedValue({
      ok: true,
      answer: {
        id: "answer_1",
        questionId: "question_1",
        option: 1,
        elapsedMs: 10100,
        isCorrect: true,
        points: 500,
      },
    });

    const res = await answer({ index: 0, option: 1 });

    expect(res.statusCode).toBe(200);
    expect(mocks.createAnswer).toHaveBeenCalledWith({
      gameId: "game_1",
      participantId: "participant_1",
      questionId: "question_1",
      option: 1,
      elapsedMs: 10100,
      isCorrect: true,
      points: 500,
    });
    expect(res.json()).toEqual({ isCorrect: true, points: 500, total: 505 });
  });

  it("returns closed once the grace window has passed", async () => {
    const schedule = buildSchedule([{ kind: "quiz" }]);
    const elapsed =
      schedule.questions[0].closesAt + ANSWER_GRACE_MS + 1;
    useTime(BASE);
    mocks.getSession.mockResolvedValue(makeSession());
    mocks.getCachedGameById.mockResolvedValue(
      makeGame({
        status: "live",
        startsAt: BASE - elapsed,
        schedule,
      }),
    );

    const res = await answer({ index: 0, option: 1 });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: "closed" });
  });

  it("returns wrong_question for an index other than the open one", async () => {
    setupOpenQuestion();

    const res = await answer({ index: 1, option: 1 });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: "wrong_question" });
    expect(mocks.getCachedQuestionAt).not.toHaveBeenCalled();
  });

  it("returns not_found when the open question is missing", async () => {
    setupOpenQuestion();
    mocks.getCachedQuestionAt.mockResolvedValue(null);

    const res = await answer({ index: 0, option: 1 });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "not_found" });
  });

  it("rejects an option outside the question options", async () => {
    setupOpenQuestion();

    const res = await answer({ index: 0, option: 2 });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "bad_option" });
    expect(mocks.createAnswer).not.toHaveBeenCalled();
  });

  it("scores a correct answer and returns the new total", async () => {
    setupOpenQuestion();

    const res = await answer({ index: 0, option: 1 });

    expect(res.statusCode).toBe(200);
    expect(mocks.createAnswer).toHaveBeenCalledWith({
      gameId: "game_1",
      participantId: "participant_1",
      questionId: "question_1",
      option: 1,
      elapsedMs: 2000,
      isCorrect: true,
      points: 900,
    });
    expect(res.json()).toEqual({ isCorrect: true, points: 900, total: 905 });
  });

  it("scores a wrong answer with zero points", async () => {
    setupOpenQuestion();
    mocks.createAnswer.mockResolvedValue({
      ok: true,
      answer: {
        id: "answer_1",
        questionId: "question_1",
        option: 0,
        elapsedMs: 2000,
        isCorrect: false,
        points: 0,
      },
    });

    const res = await answer({ index: 0, option: 0 });

    expect(mocks.createAnswer).toHaveBeenCalledWith(
      expect.objectContaining({ option: 0, isCorrect: false, points: 0 }),
    );
    expect(res.json()).toEqual({ isCorrect: false, points: 0, total: 5 });
  });

  it("uses promo scoring for a promo question", async () => {
    setupOpenQuestion({
      question: { kind: "promo", correctOption: null, doublePoints: false },
    });
    mocks.createAnswer.mockResolvedValue({
      ok: true,
      answer: {
        id: "answer_1",
        questionId: "question_1",
        option: 0,
        elapsedMs: 2000,
        isCorrect: false,
        points: 0,
      },
    });

    const res = await answer({ index: 0, option: 0 });

    expect(mocks.createAnswer).toHaveBeenCalledWith(
      expect.objectContaining({ isCorrect: false, points: 0 }),
    );
    expect(res.json()).toEqual({ isCorrect: false, points: 0, total: 5 });
  });

  it("returns conflict when the question was already answered", async () => {
    setupOpenQuestion();
    mocks.createAnswer.mockResolvedValue({
      ok: false,
      reason: "already_answered",
    });

    const res = await answer({ index: 0, option: 1 });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: "already_answered" });
  });
});
