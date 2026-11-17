import type { FastifyInstance } from "fastify";
import type {} from "@fastify/cookie";
import { ANSWER_GRACE_MS, scoreAnswer } from "@rp/shared";
import { Game } from "../repo/games.js";
import {
  createParticipant,
  getParticipantByToken,
} from "../repo/participants.js";
import { createAnswer, getAnswersByParticipant } from "../repo/answers.js";
import { isCorrectOption, toPublicQuestion } from "../repo/questions.js";
import { getCachedQuestionAt, getCachedQuestions } from "../questions-cache.js";
import { getCachedCounts } from "../reveal-cache.js";
import { getCachedGameByCode, getCachedGameById } from "../game-cache.js";
import { getSession, invalidateSession, putSession } from "../session-cache.js";
import { getPlayerCount, incrementPlayerCount } from "../player-count.js";
import { getBoard, rankOf } from "../leaderboard-cache.js";
import { computeState, type StateSlice } from "../state.js";

const PLAY_COOKIE = "rp_play";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const COOKIE_SECURE = process.env.NODE_ENV === "production";

const NICK_MIN = 5;
const NICK_MAX = 20;

type LivePhase = Exclude<StateSlice["phase"], string>;

function isLive(phase: StateSlice["phase"]): phase is LivePhase {
  return typeof phase !== "string";
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

async function questionSlice(
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

async function publicState(game: Game, now: number) {
  const { phase, nextBoundaryAt } = computeState(game, now);
  const slice = await questionSlice(game, phase, now);

  return {
    serverNow: now,
    phase,
    nextBoundaryAt,
    players: await getPlayerCount(game.id),
    question: slice.question,
    reveal: slice.reveal,
    game: {
      id: game.id,
      title: game.title,
      locale: game.locale,
      startsAt: game.startsAt,
      joiningLocked: game.joiningLocked,
      sponsor: game.sponsor,
    },
  };
}
export async function playRoutes(app: FastifyInstance) {
  app.get("/game/state", async (req, reply) => {
    reply.header("Cache-Control", "no-store");

    const code = readCode((req.query as Record<string, unknown>).code);
    if (code.length < 6) {
      return reply.code(404).send({ error: "not_found" });
    }

    const game = await getCachedGameByCode(code);
    if (!game || game.status === "draft") {
      return reply.code(404).send({ error: "not_found" });
    }

    return publicState(game, Date.now());
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

    const existingToken = req.cookies[PLAY_COOKIE];
    if (existingToken) {
      const existing = await getParticipantByToken(existingToken);
      if (existing && existing.gameId === game.id) {
        return {
          me: {
            id: existing.id,
            nickname: existing.nickname,
            score: existing.score,
          },
        };
      }
    }

    const result = await createParticipant(game.id, nickname);
    if (!result.ok) {
      return reply.code(409).send({ error: result.reason });
    }

    putSession(result.sessionToken, {
      id: result.participant.id,
      gameId: game.id,
      nickname: result.participant.nickname,
      fanId: null,
      score: 0,
    });
    incrementPlayerCount(game.id);

    reply.setCookie(PLAY_COOKIE, result.sessionToken, {
      path: "/api",
      httpOnly: true,
      secure: COOKIE_SECURE,
      sameSite: "lax",
      maxAge: COOKIE_MAX_AGE,
    });

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

    const base = await publicState(game, Date.now());
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
