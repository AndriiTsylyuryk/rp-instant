import { countParticipants } from "./repo/participants.js";

const TTL_MS = 30_000;

type Entry = { value: number; loadedAt: number };

const counts = new Map<string, Entry>();
const inflight = new Map<string, Promise<number>>();

export function getPlayerCount(gameId: string): Promise<number> {
  const hit = counts.get(gameId);
  if (hit && Date.now() - hit.loadedAt < TTL_MS) {
    return Promise.resolve(hit.value);
  }

  const running = inflight.get(gameId);
  if (running) {
    return running;
  }

  const promise = countParticipants(gameId)
    .then((value) => {
      counts.set(gameId, { value, loadedAt: Date.now() });
      return value;
    })
    .finally(() => {
      inflight.delete(gameId);
    });

  inflight.set(gameId, promise);
  return promise;
}

export function incrementPlayerCount(gameId: string): void {
  const hit = counts.get(gameId);
  if (hit) {
    hit.value += 1;
  }
  // Якщо запису немає — нічого не робимо: наступне читання візьме
  // COUNT з бази, і новий рядок там уже буде.
}

export function dropPlayerCount(gameId: string): void {
  counts.delete(gameId);
}
