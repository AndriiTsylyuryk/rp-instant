import { Game, getGameByCode, getGameById } from "./repo/games.js";

const TTL_MS = 2000;
const NEGATIVE_TTL_MS = 5000;

type Entry = { game: Game | null; fetchedAt: number };

const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<Game | null>>();

function isFresh(entry: Entry, now: number): boolean {
  const ttl = entry.game ? TTL_MS : NEGATIVE_TTL_MS;
  return now - entry.fetchedAt < ttl;
}

function load(
  key: string,
  loader: () => Promise<Game | null>,
): Promise<Game | null> {
  const now = Date.now();

  const hit = cache.get(key);
  if (hit && isFresh(hit, now)) return Promise.resolve(hit.game);

  const running = inflight.get(key);
  if (running) return running;

  const promise = loader()
    .then((game) => {
      const at = Date.now();
      cache.set(key, { game, fetchedAt: at });
      if (game) cache.set(`id:${game.id}`, { game, fetchedAt: at });
      return game;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, promise);
  return promise;
}

export function getCachedGameById(id: string): Promise<Game | null> {
  return load(`id:${id}`, () => getGameById(id));
}

export function getCachedGameByCode(code: string): Promise<Game | null> {
  const normalized = code.toLocaleUpperCase();
  return load(`code:${normalized}`, () => getGameByCode(normalized));
}

export function invalidateGame(game: Game): void {
  cache.delete(`id:${game.id}`);
  cache.delete(`code:${game.code.toLocaleUpperCase()}`);
}
