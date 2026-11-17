import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getParticipantByToken: vi.fn(),
}));

vi.mock("../src/repo/participants.js", () => ({
  getParticipantByToken: mocks.getParticipantByToken,
}));

type SessionCacheModule = typeof import("../src/session-cache.js");

let cache: SessionCacheModule;

function makeParticipant(overrides: Record<string, unknown> = {}) {
  return {
    id: "participant_1",
    gameId: "game_1",
    nickname: "neo",
    score: 5,
    hidden: false,
    fanId: null,
    ...overrides,
  };
}

beforeEach(async () => {
  vi.resetModules();
  vi.resetAllMocks();
  cache = await import("../src/session-cache.js");
});

describe("getSession", () => {
  it("loads a participant once and serves the cached session", async () => {
    mocks.getParticipantByToken.mockResolvedValue(makeParticipant());

    const first = await cache.getSession("token_1");
    const second = await cache.getSession("token_1");

    expect(mocks.getParticipantByToken).toHaveBeenCalledWith("token_1");
    expect(mocks.getParticipantByToken).toHaveBeenCalledTimes(1);
    expect(first).toEqual({
      id: "participant_1",
      gameId: "game_1",
      nickname: "neo",
      fanId: null,
      score: 5,
    });
    expect(second).toBe(first);
  });

  it("keeps separate sessions per token", async () => {
    mocks.getParticipantByToken
      .mockResolvedValueOnce(makeParticipant({ id: "participant_1" }))
      .mockResolvedValueOnce(makeParticipant({ id: "participant_2" }));

    const first = await cache.getSession("token_1");
    const second = await cache.getSession("token_2");

    expect(first?.id).toBe("participant_1");
    expect(second?.id).toBe("participant_2");
    expect(mocks.getParticipantByToken).toHaveBeenCalledTimes(2);
  });

  it("does not cache misses", async () => {
    mocks.getParticipantByToken.mockResolvedValue(null);

    await expect(cache.getSession("token_1")).resolves.toBeNull();
    await expect(cache.getSession("token_1")).resolves.toBeNull();

    expect(mocks.getParticipantByToken).toHaveBeenCalledTimes(2);
  });

  it("deduplicates concurrent loads for the same token", async () => {
    let resolveLoad!: (
      participant: ReturnType<typeof makeParticipant>,
    ) => void;
    mocks.getParticipantByToken.mockReturnValue(
      new Promise((resolve) => {
        resolveLoad = resolve;
      }),
    );
    const participant = makeParticipant();

    const first = cache.getSession("token_1");
    const second = cache.getSession("token_1");

    expect(mocks.getParticipantByToken).toHaveBeenCalledTimes(1);
    resolveLoad(participant);

    await expect(first).resolves.toMatchObject({ id: "participant_1" });
    await expect(second).resolves.toMatchObject({ id: "participant_1" });
  });

  it("reloads after an in-flight load fails", async () => {
    mocks.getParticipantByToken
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(makeParticipant());

    await expect(cache.getSession("token_1")).rejects.toThrow("boom");
    await expect(cache.getSession("token_1")).resolves.toMatchObject({
      id: "participant_1",
    });
    expect(mocks.getParticipantByToken).toHaveBeenCalledTimes(2);
  });
});

describe("putSession", () => {
  it("serves a session without querying the database", async () => {
    const session = {
      id: "participant_1",
      gameId: "game_1",
      nickname: "neo",
      fanId: null,
      score: 0,
    };

    cache.putSession("token_1", session);

    await expect(cache.getSession("token_1")).resolves.toBe(session);
    expect(mocks.getParticipantByToken).not.toHaveBeenCalled();
  });
});

describe("invalidateSession", () => {
  it("forces the next lookup to reload", async () => {
    mocks.getParticipantByToken.mockResolvedValue(makeParticipant());

    await cache.getSession("token_1");
    cache.invalidateSession("token_1");
    await cache.getSession("token_1");

    expect(mocks.getParticipantByToken).toHaveBeenCalledTimes(2);
  });
});

describe("dropGameSessions", () => {
  it("drops only sessions for the requested game", async () => {
    cache.putSession("token_1", {
      id: "participant_1",
      gameId: "game_1",
      nickname: "neo",
      fanId: null,
      score: 0,
    });
    cache.putSession("token_2", {
      id: "participant_2",
      gameId: "game_1",
      nickname: "trinity",
      fanId: null,
      score: 0,
    });
    cache.putSession("token_3", {
      id: "participant_3",
      gameId: "game_2",
      nickname: "morpheus",
      fanId: null,
      score: 0,
    });

    expect(cache.dropGameSessions("game_1")).toBe(2);
    expect(cache.sessionCount()).toBe(1);

    mocks.getParticipantByToken.mockResolvedValue(makeParticipant());
    await cache.getSession("token_1");
    expect(mocks.getParticipantByToken).toHaveBeenCalledWith("token_1");
  });
});
