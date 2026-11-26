import type { FastifyInstance, FastifyReply } from "fastify";
import type {} from "@fastify/cookie";
import { ANSWER_GRACE_MS, PREFETCH_MS, scoreAnswer } from "@rp/shared";
import { Game } from "../repo/games.js";
import {
  createParticipant,
  getParticipantByToken,
  linkParticipantToFan,
  revokeParticipantSession,
} from "../repo/participants.js";
import { createAnswer, getAnswersByParticipant } from "../repo/answers.js";
import { isCorrectOption, toPublicQuestion } from "../repo/questions.js";
import { getCachedQuestionAt, getCachedQuestions } from "../questions-cache.js";
import { getCachedCounts } from "../reveal-cache.js";
import {
  getCachedGameByCode,
  getCachedGameById,
  getCachedGameByScreenToken,
} from "../game-cache.js";
import { getSession, invalidateSession, putSession } from "../session-cache.js";
import { getPlayerCount, incrementPlayerCount } from "../player-count.js";
import { getBoard, rankOf } from "../leaderboard-cache.js";
import { computeState, type StateSlice } from "../state.js";
import { reconcileStatus } from "../transitions.js";
import { AUTH_COOKIE, COOKIE_SECURE, PLAY_COOKIE } from "../auth/cookies.js";
import { getAuthSession } from "../auth/session-store.js";
import { endedAtOf, GUEST_RESULTS_TTL_MS } from "../game-lifecycle.js";
import { rateLimit } from "../auth/rate-limit.js";

const JOIN_COOKIE_MAX_AGE_S = 60 * 60 * 24;

function playCookieOptions(maxAgeSeconds: number) {
  return {
    path: "/api",
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: "lax",
    maxAge: maxAgeSeconds,
  } as const;
}

function applyResultsWindow(
  game: Game,
  token: string,
  reply: FastifyReply,
  now: number,
): boolean {
  const endedAt = endedAtOf(game);
  if (endedAt === null || now < endedAt) {
    return true;
  }

  const remainingMs = endedAt + GUEST_RESULTS_TTL_MS - now;
  if (remainingMs <= 0) {
    invalidateSession(token);
    reply.clearCookie(PLAY_COOKIE, { path: "/api" });
    return false;
  }

  reply.setCookie(
    PLAY_COOKIE,
    token,
    playCookieOptions(Math.floor(remainingMs / 1000)),
  );
  return true;
}

const SCREEN_TOKEN = /^[A-Za-z0-9]{24}$/;

const screenByIp = rateLimit({ name: "screen-ip", max: 60, windowMs: 60_000 });

/**
 * Формат PIN. Усе, що не схоже на код, відсікаємо ДО кешу й БД: сміттєві ключі
 * не потрапляють у game-cache. Якщо ваші join_code містять інші символи
 * (наприклад, "-"), розширте цей regex.
 */
const PIN_FORMAT = /^[A-Z0-9]{6,12}$/;

// Перевірка PIN: 30 спроб за хвилину на IP достатньо людині, але не перебору.
const lookupByIp = rateLimit({ name: "lookup-ip", max: 30, windowMs: 60_000 });

const NICK_MIN = 5;
const NICK_MAX = 20;

type LivePhase = Exclude<StateSlice["phase"], string>;

function isLive(phase: StateSlice["phase"]): phase is LivePhase {
  return typeof phase !== "string";
}

function isGameOver(phase: StateSlice["phase"]): boolean {
  return typeof phase === "string" ? phase === "ended" : phase.type === "final";
}

function readCode(value: unknown): string {
  return typeof value === "string" ? value.trim().toLocaleUpperCase() : "";
}

function readInt(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function openQuestionIndex(
  game: Game,
  phase: StateSlice["phase"],
  now: number,
): number | null {
  if (!isLive(phase) || game.startsAt === null || game.schedule === null) {
    return null;
  }
  if (phase.type === "question") {
    return phase.index;
  }
  if (phase.type === "pause") {
    const item = game.schedule.questions[phase.index];
    const closesAt = game.startsAt + item.closesAt;
    return now - closesAt <= ANSWER_GRACE_MS ? phase.index : null;
  }
  return null;
}

function prefetchIndex(
  game: Game,
  phase: StateSlice["phase"],
  now: number,
): number | null {
  if (!isLive(phase) || game.startsAt === null || game.schedule === null) {
    return null;
  }

  const index =
    phase.type === "get-ready"
      ? phase.nextIndex
      : phase.type === "pause"
        ? phase.index + 1
        : null;

  if (index === null) {
    return null;
  }

  const item = game.schedule.questions[index];
  if (!item) {
    return null;
  }

  return now >= game.startsAt + item.opensAt - PREFETCH_MS ? index : null;
}

async function currentSlice(
  game: Game,
  phase: StateSlice["phase"],
  now: number,
) {
  if (!isLive(phase) || game.startsAt === null || game.schedule === null) {
    return { question: null, reveal: null };
  }

  if (phase.type === "question") {
    const question = await getCachedQuestionAt(game.id, phase.index);
    return {
      question: question ? toPublicQuestion(question) : null,
      reveal: null,
    };
  }

  if (phase.type === "pause") {
    const question = await getCachedQuestionAt(game.id, phase.index);
    if (!question) {
      return { question: null, reveal: null };
    }

    const item = game.schedule.questions[phase.index];
    const settledAt = game.startsAt + item.closesAt + ANSWER_GRACE_MS;
    const counts =
      now >= settledAt
        ? await getCachedCounts(question.id, question.options.length)
        : null;

    return {
      question: toPublicQuestion(question),
      reveal: {
        index: question.index,
        correctOption: question.correctOption,
        counts,
      },
    };
  }

  return { question: null, reveal: null };
}

async function questionSlice(
  game: Game,
  phase: StateSlice["phase"],
  now: number,
) {
  const base = await currentSlice(game, phase, now);
  const index = prefetchIndex(game, phase, now);
  const upcoming =
    index === null ? null : await getCachedQuestionAt(game.id, index);

  return {
    ...base,
    nextQuestion: upcoming ? toPublicQuestion(upcoming) : null,
  };
}

async function answeredSlice(gameId: string, participantId: string) {
  const [answers, questions] = await Promise.all([
    getAnswersByParticipant(participantId),
    getCachedQuestions(gameId),
  ]);

  const indexById = new Map(questions.map((q) => [q.id, q.index]));

  return answers
    .map((answer) => ({
      index: indexById.get(answer.questionId) ?? -1,
      option: answer.option,
      isCorrect: answer.isCorrect,
      points: answer.points,
    }))
    .filter((answer) => answer.index >= 0);
}

/** Змінюється, коли змінюється час розкладу (клієнт тоді перезавантажує його). */
function scheduleKeyOf(game: Game): string | null {
  if (game.startsAt === null || game.schedule === null) {
    return null;
  }
  return `${game.startsAt}:${game.schedule.endsAt}:${game.schedule.questionCount}`;
}

function wantsSchedule(req: { query: unknown }): boolean {
  return (req.query as Record<string, unknown>).schedule === "1";
}

async function publicState(game: Game, now: number, withSchedule = false) {
  const { phase, nextBoundaryAt } = computeState(game, now);
  reconcileStatus(game, phase);
  const slice = await questionSlice(game, phase, now);

  return {
    serverNow: now,
    phase,
    nextBoundaryAt,
    players: await getPlayerCount(game.id),
    question: slice.question,
    reveal: slice.reveal,
    nextQuestion: slice.nextQuestion,
    game: {
      id: game.id,
      title: game.title,
      locale: game.locale,
      startsAt: game.startsAt,
      joiningLocked: game.joiningLocked,
      lobbyMinutes: game.lobbyMinutes,
      scheduleKey: scheduleKeyOf(game),
      ...(withSchedule ? { schedule: game.schedule } : {}),
      sponsor: game.sponsor,
    },
  };
}
export async function playRoutes(app: FastifyInstance) {
  app.get("/game/state", async (req, reply) => {
    reply.header("Cache-Control", "no-store");

    const code = readCode((req.query as Record<string, unknown>).code);
    if (!PIN_FORMAT.test(code)) {
      return reply.code(404).send({ error: "not_found" });
    }

    const game = await getCachedGameByCode(code);
    if (!game || game.status === "draft") {
      return reply.code(404).send({ error: "not_found" });
    }

    return publicState(game, Date.now(), wantsSchedule(req));
  });

  app.get("/game/lookup", { preHandler: lookupByIp }, async (req, reply) => {
    reply.header("Cache-Control", "no-store");

    const code = readCode((req.query as Record<string, unknown>).code);
    if (!PIN_FORMAT.test(code)) {
      return reply.code(404).send({ error: "not_found" });
    }

    const game = await getCachedGameByCode(code);
    if (!game || game.status === "draft") {
      return reply.code(404).send({ error: "not_found" });
    }
    if (game.status === "ended" || game.status === "cancelled") {
      return reply.code(410).send({ error: "game_ended" });
    }
    if (game.joiningLocked) {
      return reply.code(403).send({ error: "joining_locked" });
    }

    return { title: game.title, sponsor: game.sponsor };
  });

  app.get("/screen/state", { preHandler: screenByIp }, async (req, reply) => {
    reply.header("Cache-Control", "no-store");

    const token = (req.query as Record<string, unknown>).token;

    if (typeof token !== "string" || !SCREEN_TOKEN.test(token)) {
      return reply.code(404).send({ error: "not_found" });
    }

    const game = await getCachedGameByScreenToken(token);
    if (!game) {
      return reply.code(404).send({ error: "not_found" });
    }

    return {
      ...(await publicState(game, Date.now(), wantsSchedule(req))),
      joinCode: game.code,
    };
  });

  app.post("/join", async (req, reply) => {
    reply.header("Cache-Control", "no-store");

    const body = (req.body ?? {}) as Record<string, unknown>;
    const code = readCode(body.code);
    const nickname =
      typeof body.nickname === "string"
        ? body.nickname.trim().replace(/\s+/g, " ")
        : "";

    if (nickname.length < NICK_MIN || nickname.length > NICK_MAX) {
      return reply.code(400).send({ error: "bad_nickname" });
    }
    if (!PIN_FORMAT.test(code)) {
      return reply.code(404).send({ error: "not_found" });
    }

    const game = await getCachedGameByCode(code);
    if (!game || game.status === "draft") {
      return reply.code(404).send({ error: "not_found" });
    }
    if (game.status === "ended" || game.status === "cancelled") {
      return reply.code(410).send({ error: "game_ended" });
    }
    if (game.joiningLocked) {
      return reply.code(403).send({ error: "joining_locked" });
    }

    const authToken = req.cookies[AUTH_COOKIE];
    const auth = authToken ? await getAuthSession(authToken) : null;
    const fanId = auth?.role === "fan" ? auth.userId : null;

    const existingToken = req.cookies[PLAY_COOKIE];
    if (existingToken) {
      const existing = await getParticipantByToken(existingToken);
      if (existing && existing.gameId === game.id) {
        if (fanId && existing.fanId === null) {
          await linkParticipantToFan(existing.id, fanId);
          invalidateSession(existingToken);
        }
        return {
          me: {
            id: existing.id,
            nickname: existing.nickname,
            score: existing.score,
          },
        };
      }
    }

    const result = fanId
      ? await createParticipant(game.id, nickname, fanId)
      : await createParticipant(game.id, nickname);
    if (!result.ok) {
      return reply.code(409).send({ error: result.reason });
    }

    putSession(result.sessionToken, {
      id: result.participant.id,
      gameId: game.id,
      nickname: result.participant.nickname,
      fanId,
      score: 0,
    });
    incrementPlayerCount(game.id);

    reply.setCookie(
      PLAY_COOKIE,
      result.sessionToken,
      playCookieOptions(JOIN_COOKIE_MAX_AGE_S),
    );

    return {
      me: {
        id: result.participant.id,
        nickname: result.participant.nickname,
        score: 0,
      },
    };
  });

  app.get("/play/state", async (req, reply) => {
    reply.header("Cache-Control", "no-store");

    const token = req.cookies[PLAY_COOKIE];
    if (!token) {
      return reply.code(401).send({ error: "no_session" });
    }

    const me = await getSession(token);
    if (!me) {
      invalidateSession(token);
      reply.clearCookie(PLAY_COOKIE, { path: "/api" });
      return reply.code(401).send({ error: "no_session" });
    }

    const game = await getCachedGameById(me.gameId);
    if (!game) {
      return reply.code(404).send({ error: "not_found" });
    }

    const now = Date.now();
    if (!applyResultsWindow(game, token, reply, now)) {
      return reply.code(401).send({ error: "no_session" });
    }

    const base = await publicState(game, now, wantsSchedule(req));
    const board = await getBoard(game.id);

    return {
      ...base,
      me: {
        id: me.id,
        nickname: me.nickname,
        score: me.score,
        rank: rankOf(board, me.score),
      },
      top: board.top,
    };
  });

  app.post("/play/skip-login", async (req, reply) => {
    reply.header("Cache-Control", "no-store");

    const token = req.cookies[PLAY_COOKIE];
    if (!token) {
      return { ok: true };
    }

    const me = await getSession(token);
    if (!me) {
      invalidateSession(token);
      reply.clearCookie(PLAY_COOKIE, { path: "/api" });
      return { ok: true };
    }
    if (me.fanId !== null) {
      return reply.code(403).send({ error: "account_owned" });
    }

    const game = await getCachedGameById(me.gameId);
    if (!game) {
      invalidateSession(token);
      reply.clearCookie(PLAY_COOKIE, { path: "/api" });
      return { ok: true };
    }

    const { phase } = computeState(game, Date.now());
    if (!isGameOver(phase)) {
      return reply.code(409).send({ error: "not_finished" });
    }

    await revokeParticipantSession(me.id);
    invalidateSession(token);
    reply.clearCookie(PLAY_COOKIE, { path: "/api" });
    return { ok: true };
  });

  app.get("/play/history", async (req, reply) => {
    reply.header("Cache-Control", "no-store");

    const token = req.cookies[PLAY_COOKIE];
    if (!token) {
      return reply.code(401).send({ error: "no_session" });
    }

    const me = await getSession(token);
    if (!me) {
      return reply.code(401).send({ error: "no_session" });
    }

    const game = await getCachedGameById(me.gameId);
    if (game && !applyResultsWindow(game, token, reply, Date.now())) {
      return reply.code(401).send({ error: "no_session" });
    }

    return { answered: await answeredSlice(me.gameId, me.id) };
  });

  app.post("/play/answer", async (req, reply) => {
    reply.header("Cache-Control", "no-store");

    const token = req.cookies[PLAY_COOKIE];
    if (!token) {
      return reply.code(401).send({ error: "no_session" });
    }

    const me = await getSession(token);
    if (!me) {
      reply.clearCookie(PLAY_COOKIE, { path: "/api" });
      return reply.code(401).send({ error: "no_session" });
    }

    const game = await getCachedGameById(me.gameId);
    if (!game || game.schedule === null || game.startsAt === null) {
      return reply.code(404).send({ error: "not_found" });
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const index = readInt(body.index);
    const option = readInt(body.option);
    if (index === null || option === null || option < 0) {
      return reply.code(400).send({ error: "bad_request" });
    }

    const now = Date.now();
    const { phase } = computeState(game, now);
    const openIndex = openQuestionIndex(game, phase, now);
    if (openIndex === null) {
      return reply.code(409).send({ error: "closed" });
    }
    if (openIndex !== index) {
      return reply.code(409).send({ error: "wrong_question" });
    }

    const question = await getCachedQuestionAt(game.id, openIndex);
    if (!question) {
      return reply.code(404).send({ error: "not_found" });
    }
    if (option >= question.options.length) {
      return reply.code(400).send({ error: "bad_option" });
    }

    const item = game.schedule.questions[openIndex];
    const elapsedMs = Math.max(0, now - game.startsAt - item.opensAt);
    const limitMs = item.closesAt - item.opensAt;

    const isCorrect = isCorrectOption(question, option);
    const points = scoreAnswer(question, isCorrect, elapsedMs, limitMs);

    const result = await createAnswer({
      gameId: game.id,
      participantId: me.id,
      questionId: question.id,
      option,
      elapsedMs,
      isCorrect,
      points,
    });

    if (!result.ok) {
      return reply.code(409).send({ error: result.reason });
    }

    me.score += points;

    return {
      isCorrect,
      points,
      total: me.score,
    };
  });
}
