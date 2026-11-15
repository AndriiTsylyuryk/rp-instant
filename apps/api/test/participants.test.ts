import { beforeEach, describe, expect, it, vi } from "vitest";
import { ClientResponseError } from "pocketbase";

const mocks = vi.hoisted(() => ({
  collection: vi.fn(),
  filter: vi.fn(),
}));

vi.mock("../src/repo/pb.js", () => {
  const pb = { collection: mocks.collection, filter: mocks.filter };
  return {
    pb,
    withPb: (fn: (client: typeof pb) => Promise<unknown>) => fn(pb),
  };
});

import {
  countParticipants,
  createParticipant,
  getLeaderboard,
  getParticipantByToken,
  newSessionToken,
} from "../src/repo/participants.js";

const create = vi.fn();
const getFirstListItem = vi.fn();
const getList = vi.fn();

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "participant_1",
    game: "game_1",
    nickname: "neo",
    session_token: "token_1",
    score: 0,
    hidden: false,
    fan: "",
    created: "2026-01-01T12:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.filter.mockReturnValue("FILTER");
  mocks.collection.mockReturnValue({ create, getFirstListItem, getList });
});

describe("newSessionToken", () => {
  it("returns a 32-byte base64url token", () => {
    const token = newSessionToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("returns a different token on each call", () => {
    expect(newSessionToken()).not.toBe(newSessionToken());
  });
});

describe("createParticipant", () => {
  it("creates a participant and returns the mapped result", async () => {
    create.mockResolvedValue(
      makeRow({ score: 15, fan: "fan_1", nickname: "neo" }),
    );

    const result = await createParticipant("game_1", "neo");

    expect(mocks.collection).toHaveBeenCalledWith("participants");
    expect(create).toHaveBeenCalledTimes(1);

    const payload = create.mock.calls[0][0];
    expect(payload).toMatchObject({
      game: "game_1",
      nickname: "neo",
      score: 0,
      hidden: false,
    });
    expect(payload.session_token).toMatch(/^[A-Za-z0-9_-]{43}$/);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sessionToken).toBe(payload.session_token);
    expect(result.participant).toEqual({
      id: "participant_1",
      gameId: "game_1",
      nickname: "neo",
      score: 15,
      hidden: false,
      fanId: "fan_1",
    });
  });

  it("falls back to zero score, hidden false and null fan for empty row values", async () => {
    create.mockResolvedValue(makeRow({ score: null, hidden: null, fan: "" }));

    const result = await createParticipant("game_1", "neo");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.participant.score).toBe(0);
    expect(result.participant.hidden).toBe(false);
    expect(result.participant.fanId).toBeNull();
  });

  it("returns nickname_taken on a 400 client error", async () => {
    create.mockRejectedValue(new ClientResponseError({ status: 400 }));

    await expect(createParticipant("game_1", "neo")).resolves.toEqual({
      ok: false,
      reason: "nickname_taken",
    });
  });

  it("rethrows non-400 errors", async () => {
    const error = new ClientResponseError({ status: 500 });
    create.mockRejectedValue(error);

    await expect(createParticipant("game_1", "neo")).rejects.toBe(error);
  });

  it("rethrows unexpected errors", async () => {
    const error = new Error("connection refused");
    create.mockRejectedValue(error);

    await expect(createParticipant("game_1", "neo")).rejects.toBe(error);
  });
});

describe("getParticipantByToken", () => {
  it("looks up a participant by session token and maps the row", async () => {
    getFirstListItem.mockResolvedValue(makeRow({ fan: "fan_1" }));

    const participant = await getParticipantByToken("token_1");

    expect(mocks.filter).toHaveBeenCalledWith("session_token = {:t}", {
      t: "token_1",
    });
    expect(getFirstListItem).toHaveBeenCalledWith("FILTER");
    expect(participant).toEqual({
      id: "participant_1",
      gameId: "game_1",
      nickname: "neo",
      score: 0,
      hidden: false,
      fanId: "fan_1",
    });
  });

  it("returns null when the participant is missing", async () => {
    getFirstListItem.mockRejectedValue(new ClientResponseError({ status: 404 }));

    await expect(getParticipantByToken("missing")).resolves.toBeNull();
  });

  it("rethrows non-404 errors", async () => {
    const error = new ClientResponseError({ status: 500 });
    getFirstListItem.mockRejectedValue(error);

    await expect(getParticipantByToken("token_1")).rejects.toBe(error);
  });
});

describe("countParticipants", () => {
  it("counts only visible participants of the game", async () => {
    getList.mockResolvedValue({ totalItems: 7 });

    const count = await countParticipants("game_1");

    expect(mocks.filter).toHaveBeenCalledWith(
      "game = {:g} && hidden = false",
      { g: "game_1" },
    );
    expect(getList).toHaveBeenCalledWith(1, 1, {
      filter: "FILTER",
      fields: "id",
    });
    expect(count).toBe(7);
  });
});

describe("getLeaderboard", () => {
  it("returns ranked visible participants with the default limit", async () => {
    getList.mockResolvedValue({
      items: [
        makeRow({ nickname: "neo", score: 30 }),
        makeRow({ nickname: "trinity", score: 20 }),
      ],
    });

    const leaderboard = await getLeaderboard("game_1");

    expect(mocks.filter).toHaveBeenCalledWith(
      "game = {:g} && hidden = false",
      { g: "game_1" },
    );
    expect(getList).toHaveBeenCalledWith(1, 10, {
      filter: "FILTER",
      sort: "-score,created",
      skipTotal: true,
    });
    expect(leaderboard).toEqual([
      { rank: 1, nickname: "neo", score: 30 },
      { rank: 2, nickname: "trinity", score: 20 },
    ]);
  });

  it("uses a custom limit", async () => {
    getList.mockResolvedValue({ items: [] });

    await getLeaderboard("game_1", 3);

    expect(getList).toHaveBeenCalledWith(1, 3, expect.any(Object));
  });

  it("falls back to zero score for rows without score", async () => {
    getList.mockResolvedValue({ items: [makeRow({ score: null })] });

    const leaderboard = await getLeaderboard("game_1");

    expect(leaderboard).toEqual([{ rank: 1, nickname: "neo", score: 0 }]);
  });

  it("returns an empty leaderboard when there are no participants", async () => {
    getList.mockResolvedValue({ items: [] });

    await expect(getLeaderboard("game_1")).resolves.toEqual([]);
  });
});
