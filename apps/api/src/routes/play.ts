import { Game } from "../repo/games.js";
import {
  countParticipants,
  createParticipant,
  getLeaderboard,
  getParticipantByToken,
} from "../repo/participants.js";
import { computeState } from "../state.js";
import { FastifyInstance } from "fastify";
import { getCachedGameByCode, getCachedGameById } from "../game-cashe.js";
import type {} from "@fastify/cookie";

const PLAY_COOKIE = "pr_play";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; //30days
const COOKIE_SECURE = process.env.NODE_END === "production";

const NICK_MIN = 5;
const NICK_MAX = 20;

async function publicState(game: Game) {
  const now = Date.now();
  const { phase, nextBoundaryAt } = computeState(game, now);
  return {
    serverNow: now,
    phase,
    nextBoundaryAt,
    players: await countParticipants(game.id),
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

function readCode(value: unknown): string {
  return typeof value === "string" ? value.trim().toLocaleUpperCase() : "";
}

export async function playRoutes(app: FastifyInstance) {
  app.get("/game/state", async (req, reply) => {
    reply.header("cache-control", "no-store");

    const code = readCode((req.query as Record<string, unknown>).code);
    if (code.length < 6) {
      return reply.code(404).send({ error: "not_found" });
    }
    const game = await getCachedGameByCode(code);
    if (!game || game.status === "draft") {
      return reply.code(404).send({ error: "not_found" });
    }
    return publicState(game);
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

    const me = await getParticipantByToken(token);
    if (!me) {
      reply.clearCookie(PLAY_COOKIE, { path: "/api" });
      return reply.code(401).send({ error: "no_session" });
    }

    const game = await getCachedGameById(me.gameId);
    if (!game) {
      return reply.code(404).send({ error: "not_found" });
    }

    const base = await publicState(game);
    return {
      ...base,
      me: { id: me.id, nickname: me.nickname, score: me.score },
      top: await getLeaderboard(game.id, 10),
    };
  });
}
