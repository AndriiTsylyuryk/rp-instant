import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";

/**
 * Прикладна помилка API. `code` — частина контракту з клієнтом,
 * `message` лишається для логів (тут дорівнює коду для сумісності).
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, code: string) {
    super(code);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}

/** Єдиний формат помилок API: { error: "<code>" }. */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err, req, reply) => {
    if (isAppError(err)) {
      return reply.code(err.statusCode).send({ error: err.code });
    }
    if (err instanceof ZodError) {
      return reply.code(400).send({ error: "bad_request" });
    }
    const status = (err as { statusCode?: number }).statusCode;
    if (typeof status === "number" && status >= 400 && status < 500) {
      return reply.code(status).send({ error: "bad_request" });
    }
    req.log.error(err);
    return reply.code(500).send({ error: "internal" });
  });
}
