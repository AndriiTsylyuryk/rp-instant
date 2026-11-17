import { getParticipantByToken } from "./repo/participants.js";

export type Session = {
  id: string;
  gameId: string;
  nickname: string;
  fanId: string | null;
  score: number; // єдине змінне поле
};

const cache = new Map<string, Session>();
const inflight = new Map<string, Promise<Session | null>>();

export function getSession(token: string): Promise<Session | null> {
  const hit = cache.get(token);
  if (hit) {
    return Promise.resolve(hit);
  }

  const running = inflight.get(token);
  if (running) {
    return running;
  }

  const promise = getParticipantByToken(token)
    .then((participant) => {
      if (!participant) {
        return null;
      }

      const session: Session = {
        id: participant.id,
        gameId: participant.gameId,
        nickname: participant.nickname,
        fanId: participant.fanId,
        score: participant.score,
      };

      cache.set(token, session);
      return session;
    })
    .finally(() => {
      inflight.delete(token);
    });

  inflight.set(token, promise);
  return promise;
}

/** Після join — щоб перший же /play/state не йшов у базу. */
export function putSession(token: string, session: Session): void {
  cache.set(token, session);
}

export function invalidateSession(token: string): void {
  cache.delete(token);
}

/** Викликати на переході гри в ended. Без цього процес пухне на 2000 записів за матч. */
export function dropGameSessions(gameId: string): number {
  let removed = 0;
  for (const [token, session] of cache) {
    if (session.gameId === gameId) {
      cache.delete(token);
      removed += 1;
    }
  }
  return removed;
}

export function sessionCount(): number {
  return cache.size;
}
