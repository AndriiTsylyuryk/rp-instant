import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { playRoutes } from "./routes/play.js";

const app = Fastify({
  logger: true,
  trustProxy: true,
});

await app.register(cookie);
await app.register(playRoutes, { prefix: "/api" });

app.get("/api/health", async () => ({ ok: true }));

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "127.0.0.1";

try {
  await app.listen({ port, host });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
