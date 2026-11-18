import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  insertAuthSession: vi.fn(),
  findAuthSession: vi.fn(),
  extendAuthSession: vi.fn(),
  deleteAuthSession: vi.fn(),
  deleteExpiredAuthSessions: vi.fn(),
}));

vi.mock("../src/repo/auth-sessions.js", () => mocks);

type StoreModule = typeof import("../src/auth/session-store.js");

let store: StoreModule;

const profile = { name: "Ann", nickname: null, email: null, clubId: "club_1" };

beforeEach(async () => {
  vi.resetModules();
  vi.resetAllMocks();
  mocks.insertAuthSession.mockResolvedValue("row_1");
  mocks.extendAuthSession.mockResolvedValue(undefined);
  mocks.deleteAuthSession.mockResolvedValue(undefined);
  store = await import("../src/auth/session-store.js");
});

describe("auth session store", () => {
  it("зберігає хеш токена, а не сам токен", async () => {
    const { token } = await store.createAuthSession({
      userId: "u1",
      role: "manager",
      profile,
    });

    const saved = mocks.insertAuthSession.mock.calls[0][0];
    expect(saved.tokenHash).toBe(store.hashToken(token));
    expect(saved.tokenHash).not.toBe(token);
  });

  it("після створення читає з пам'яті без запитів у БД", async () => {
    const { token } = await store.createAuthSession({
      userId: "u1",
      role: "manager",
      profile,
    });

    const session = await store.getAuthSession(token);

    expect(session?.userId).toBe("u1");
    expect(mocks.findAuthSession).not.toHaveBeenCalled();
  });

  it("при промаху кешу читає з БД один раз", async () => {
    mocks.findAuthSession.mockResolvedValue({
      rowId: "row_9",
      userId: "u9",
      role: "fan",
      profile,
      expiresAt: Date.now() + 60_000,
    });

    await store.getAuthSession("some-token");
    await store.getAuthSession("some-token");

    expect(mocks.findAuthSession).toHaveBeenCalledTimes(1);
  });

  it("невідомий токен → null", async () => {
    mocks.findAuthSession.mockResolvedValue(null);

    expect(await store.getAuthSession("nope")).toBeNull();
  });

  it("протермінована сесія → null і видалення рядка", async () => {
    mocks.findAuthSession.mockResolvedValue({
      rowId: "row_old",
      userId: "u1",
      role: "fan",
      profile,
      expiresAt: Date.now() - 1,
    });

    expect(await store.getAuthSession("old")).toBeNull();
    expect(mocks.deleteAuthSession).toHaveBeenCalledWith("row_old");
  });

  it("destroy прибирає сесію з кешу та з БД", async () => {
    const { token } = await store.createAuthSession({
      userId: "u1",
      role: "fan",
      profile,
    });
    mocks.findAuthSession.mockResolvedValue(null);

    await store.destroyAuthSession(token);

    expect(mocks.deleteAuthSession).toHaveBeenCalledWith("row_1");
    expect(await store.getAuthSession(token)).toBeNull();
  });
});
