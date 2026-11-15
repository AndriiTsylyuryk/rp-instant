import { afterAll, beforeAll, describe, expect, it } from "vitest";
import PocketBase from "pocketbase";

const LIVE = process.env.PB_LIVE === "1";
const describeLive = LIVE ? describe : describe.skip;

describeLive("getGameByCode against a live PocketBase", () => {
  const url = process.env.PB_URL ?? "http://127.0.0.1:8091";
  const email = process.env.PB_SUPERUSER_EMAIL ?? "live@rp.local";
  const password = process.env.PB_SUPERUSER_PASSWORD ?? "live-test-password";

  const client = new PocketBase(url);
  client.autoCancellation(false);

  const joinCode = `LIVE${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const startsAt = "2026-03-04T05:06:07.000Z";
  let createdId: string | undefined;

  beforeAll(async () => {
    await client.collection("_superusers").authWithPassword(email, password);
    const record = await client.collection("games").create({
      title: "Live field names test",
      join_code: joinCode,
      status: "lobby",
      lobby_minutes: 5,
      starts_at: startsAt,
      joining_locked: false,
    });
    createdId = record.id;
  });

  afterAll(async () => {
    if (createdId) {
      await client.collection("games").delete(createdId);
    }
  });

  it("finds the record by the real join_code column and maps starts_at", async () => {
    const { getGameByCode } = await import("../../src/repo/games.js");

    const game = await getGameByCode(joinCode.toLowerCase());

    expect(game).not.toBeNull();
    expect(game?.id).toBe(createdId);
    expect(game?.code).toBe(joinCode);
    expect(game?.startsAt).toBe(Date.parse(startsAt));
  });
});
