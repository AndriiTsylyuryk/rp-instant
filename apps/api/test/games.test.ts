import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

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

import type { Schedule } from "@rp/shared";
import {
  getGameByCode,
  getGameById,
  moveStartsAt,
  openLobby,
  saveFinalTop,
} from "../src/repo/games.js";

const getFirstListItem = vi.fn();
const update = vi.fn();

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "game_1",
    club: "club_1",
    title: "Derby",
    joinCode: "AB12",
    status: "lobby",
    locale: "et",
    startsAt: "2026-01-01T12:00:00.000Z",
    schedule: null,
    joining_locked: false,
    sponsor_name: null,
    sponsor_logo: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.filter.mockReturnValue("FILTER");
  mocks.collection.mockReturnValue({ getFirstListItem, update });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("getGameByCode", () => {
  it("looks up a game by uppercase join code and maps the row", async () => {
    getFirstListItem.mockResolvedValue(makeRow());

    const game = await getGameByCode("ab12");

    expect(mocks.filter).toHaveBeenCalledWith("joinCode = {:code}", {
      code: "AB12",
    });
    expect(mocks.collection).toHaveBeenCalledWith("games");
    expect(getFirstListItem).toHaveBeenCalledWith("FILTER", {
      sort: "-created",
    });
    expect(game).toEqual({
      id: "game_1",
      clubId: "club_1",
      title: "Derby",
      code: "AB12",
      status: "lobby",
      locale: "et",
      startsAt: Date.parse("2026-01-01T12:00:00.000Z"),
      schedule: null,
      joiningLocked: false,
      sponsor: null,
    });
  });

  it("returns null when no matching game exists", async () => {
    getFirstListItem.mockRejectedValue(new Error("No items found."));

    await expect(getGameByCode("zzzz")).resolves.toBeNull();
  });

  it("rethrows unexpected errors", async () => {
    const error = new Error("connection refused");
    getFirstListItem.mockRejectedValue(error);

    await expect(getGameByCode("ab12")).rejects.toBe(error);
  });
});

describe("getGameById", () => {
  it("looks up a game by id and maps the row", async () => {
    getFirstListItem.mockResolvedValue(makeRow());

    const game = await getGameById("game_1");

    expect(mocks.filter).toHaveBeenCalledWith("id = {:id}", { id: "game_1" });
    expect(getFirstListItem).toHaveBeenCalledWith("FILTER", {
      sort: "-created",
    });
    expect(game?.id).toBe("game_1");
  });

  it("returns null when the game is missing", async () => {
    getFirstListItem.mockRejectedValue(new Error("No items found."));

    await expect(getGameById("missing")).resolves.toBeNull();
  });
});

describe("toGame mapping (via getGameByCode)", () => {
  async function mapRow(overrides: Record<string, unknown> = {}) {
    getFirstListItem.mockResolvedValue(makeRow(overrides));
    return getGameByCode("ab12");
  }

  it("maps an empty startsAt to null", async () => {
    const game = await mapRow({ startsAt: "" });

    expect(game?.startsAt).toBeNull();
  });

  it("builds a sponsor logo URL when a logo is present", async () => {
    const game = await mapRow({
      sponsor_name: "Acme",
      sponsor_logo: "logo.png",
    });

    expect(game?.sponsor).toEqual({
      name: "Acme",
      logoUrl: "/api/files/games/game_1/logo.png",
    });
  });

  it("keeps sponsor name with a null logo URL when only name is set", async () => {
    const game = await mapRow({ sponsor_name: "Acme" });

    expect(game?.sponsor).toEqual({ name: "Acme", logoUrl: null });
  });

  it("returns null sponsor when neither name nor logo is set", async () => {
    const game = await mapRow();

    expect(game?.sponsor).toBeNull();
  });

  it("passes the schedule through unchanged", async () => {
    const schedule: Schedule = {
      version: 1,
      questionCount: 0,
      questions: [],
      endsAt: 0,
    };

    const game = await mapRow({ schedule });

    expect(game?.schedule).toEqual(schedule);
  });
});

describe("openLobby", () => {
  it("updates status, starts_at and schedule", async () => {
    const schedule: Schedule = {
      version: 1,
      questionCount: 0,
      questions: [],
      endsAt: 0,
    };

    await openLobby("game_1", "2026-02-03T04:05:06.000Z", schedule);

    expect(mocks.collection).toHaveBeenCalledWith("games");
    expect(update).toHaveBeenCalledWith("game_1", {
      status: "lobby",
      starts_at: "2026-02-03T04:05:06.000Z",
      schedule,
    });
  });
});

describe("moveStartsAt", () => {
  it("updates only starts_at", async () => {
    await moveStartsAt("game_1", "2026-02-03T04:05:06.000Z");

    expect(update).toHaveBeenCalledWith("game_1", {
      starts_at: "2026-02-03T04:05:06.000Z",
    });
  });
});

describe("saveFinalTop", () => {
  it("saves the final top, ends the game and records ended_at", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-05T10:00:00.000Z"));
    const top = [{ rank: 1, nickname: "neo", score: 100 }];

    await saveFinalTop("game_1", top);

    expect(update).toHaveBeenCalledWith("game_1", {
      final_top: top,
      ended_at: "2026-05-05T10:00:00.000Z",
      status: "ended",
    });
  });
});
