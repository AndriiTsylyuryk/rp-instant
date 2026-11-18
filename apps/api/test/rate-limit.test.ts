import { beforeEach, describe, expect, it } from "vitest";
import type { FastifyRequest } from "fastify";
import { rateLimit, resetRateLimits } from "../src/auth/rate-limit.js";

function req(ip: string, email?: string): FastifyRequest {
  return { ip, body: { email } } as unknown as FastifyRequest;
}

beforeEach(() => {
  resetRateLimits();
});

describe("rateLimit", () => {
  it("пропускає до max запитів і відсікає наступні з 429", async () => {
    const limit = rateLimit({ name: "t1", max: 2, windowMs: 60_000 });

    await limit(req("1.1.1.1"));
    await limit(req("1.1.1.1"));

    await expect(limit(req("1.1.1.1"))).rejects.toMatchObject({
      statusCode: 429,
      message: "rate_limited",
    });
  });

  it("рахує різні IP окремо", async () => {
    const limit = rateLimit({ name: "t2", max: 1, windowMs: 60_000 });

    await limit(req("1.1.1.1"));
    await expect(limit(req("2.2.2.2"))).resolves.toBeUndefined();
  });

  it("підтримує власний ключ (наприклад, email)", async () => {
    const limit = rateLimit({
      name: "t3",
      max: 1,
      windowMs: 60_000,
      key: (r) => String((r.body as { email?: string }).email),
    });

    await limit(req("1.1.1.1", "a@x.com"));
    await expect(limit(req("9.9.9.9", "a@x.com"))).rejects.toMatchObject({
      statusCode: 429,
    });
  });
});
