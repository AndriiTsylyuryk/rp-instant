import Fastify from "fastify";

const app = Fastify({
  logger: true,
  trustProxy: true,
  bodyLimit: 64 * 1024,
});

app.get("/api/health", async () => {
  return { ok: true };
});

app.get("/api/time", async () => {
  return { now: Date.now() };
});

const port = Number(process.env.PORT) || 3000;
await app.listen({ port, host: "0.0.0.0" });
