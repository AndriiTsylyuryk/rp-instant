import createHttpError from "http-errors";
import type { FastifyRequest } from "fastify";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const SWEEP_EVERY_MS = 60_000;
let sweeping = false;

function ensureSweep(): void {
  if (sweeping) return;
  sweeping = true;
  setInterval(() => {
    const now = Date.now();
    for (const [id, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(id);
    }
  }, SWEEP_EVERY_MS).unref();
}

type Options = {
  name: string;
  max: number;
  windowMs: number;
  key?: (req: FastifyRequest) => string;
};

export function rateLimit({ name, max, windowMs, key }: Options) {
  ensureSweep();

  return async (req: FastifyRequest): Promise<void> => {
    const now = Date.now();
    const id = `${name}:${(key?.(req) ?? req.ip).slice(0, 254)}`;

    let bucket = buckets.get(id);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(id, bucket);
    }

    bucket.count += 1;
    if (bucket.count > max) {
      throw createHttpError(429, "rate_limited");
    }
  };
}

export function resetRateLimits(): void {
  buckets.clear();
}
