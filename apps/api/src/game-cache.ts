import {
  Game,
  getGameByCode,
  getGameById,
  getGameByScreenToken,
} from "./repo/games.js";
import { trackGame } from "./game-registry.js";

const TTL_MS = 2000;
const NEGATIVE_TTL_MS = 5000;

export const MAX_GAME_CACHE_ENTRIES = 5000;

type Entry = { game: Game | null; fetchedAt: number };

const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<Game | null>>();

function put(key: string, entry: Entry): void {
  cache.set(key, entry);

  for (const oldest of cache.keys()) {
    if (cache.size <= MAX_GAME_CACHE_ENTRIES) break;
    cache.delete(oldest);
  }
}

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
      put(key, { game, fetchedAt: at });
      if (game) {
        put(`id:${game.id}`, { game, fetchedAt: at });
        trackGame(game);
      }
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

export function getCachedGameByScreenToken(
  token: string,
): Promise<Game | null> {
  return load(`screen:${token}`, () => getGameByScreenToken(token));
}

export function invalidateGame(game: Game): void {
  cache.delete(`id:${game.id}`);
  cache.delete(`code:${game.code.toLocaleUpperCase()}`);
}

export function sweepGameCache(now: number = Date.now()): void {
  for (const [key, entry] of cache) {
    if (!isFresh(entry, now)) {
      cache.delete(key);
    }
  }
}

export function gameCacheSize(): number {
  return cache.size;
}
