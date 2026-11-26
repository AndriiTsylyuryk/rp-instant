import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend, Counter } from "k6/metrics";
import game from "./game.js";

const BASE_URL = (__ENV.BASE_URL || "http://127.0.0.1:3000").replace(
  /\/+$/,
  "",
);
const VUS = Number(__ENV.VUS || 2000);
const JOIN_SPREAD_MS = Number(__ENV.JOIN_SPREAD_MS || 10000);
const LEGACY = __ENV.LEGACY === "1";

// Константи з packages/shared/src/constants.ts
const C = {
  PREFETCH_MS: 4000,
  PREFETCH_JITTER_MS: 3500,
  BOUNDARY_JITTER_MS: 4000,
  LOBBY_JITTER_MS: 2000,
  LOBBY_FAR_MS: 30000,
  LOBBY_NEAR_MS: 10000,
  LOBBY_LAST_MS: 5000,
  COUNTS_RETRY_MS: 400,
  HEARTBEAT_MS: 10000,
  MIN_DELAY_MS: 250,
  STARTING_BUFFER_MS: 5000,
};

export const options = {
  scenarios: {
    play: {
      executor: "per-vu-iterations",
      vus: VUS,
      iterations: 1,
      maxDuration: "10m",
    },
  },
  noCookiesReset: true,
  thresholds: {
    join_success: ["rate>0.99"],
    state_success: ["rate>0.99"],
    state_latency: ["p(95)<500", "p(99)<1000"],
    prefetch_present: ["rate>0.99"],
  },
  summaryTrendStats: ["avg", "min", "med", "p(90)", "p(95)", "p(99)", "max"],
};

const joinSuccess = new Rate("join_success");
const stateSuccess = new Rate("state_success");
const stateLatency = new Trend("state_latency");
// nextQuestion є у відповіді, отриманій у вікні префетчу
const prefetchPresent = new Rate("prefetch_present");
// за скільки мс до відкриття отримано питання
const prefetchLead = new Trend("prefetch_lead_ms");
const polls = new Counter("polls");

const floor = (d) => Math.max(C.MIN_DELAY_MS, d);

const until = (s) =>
  s.nextBoundaryAt === null
    ? C.HEARTBEAT_MS
    : Math.max(0, s.nextBoundaryAt - s.serverNow);

function boundaryDelay(s) {
  const left = until(s);
  if (!LEGACY && s.nextQuestion === null && left > C.PREFETCH_MS) {
    return floor(left - C.PREFETCH_MS + Math.random() * C.PREFETCH_JITTER_MS);
  }
  return floor(left + Math.random() * C.BOUNDARY_JITTER_MS);
}

// Порт nextPollDelay з packages/shared/src/client-schedule.ts
function nextDelay(s) {
  if (s.phase === "ended") return null;
  if (typeof s.phase === "string") return C.HEARTBEAT_MS;

  switch (s.phase.type) {
    case "final":
      return null;

    case "lobby": {
      const left = until(s);
      if (!LEGACY && s.nextBoundaryAt !== null && left <= C.LOBBY_NEAR_MS) {
        return (
          left +
          (C.STARTING_BUFFER_MS - C.PREFETCH_MS) +
          Math.random() * C.PREFETCH_JITTER_MS
        );
      }
      const base =
        left > 300000
          ? C.LOBBY_FAR_MS
          : left > 60000
            ? C.LOBBY_NEAR_MS
            : C.LOBBY_LAST_MS;
      return base + Math.random() * C.LOBBY_JITTER_MS;
    }

    case "get-ready":
      return boundaryDelay(s);

    case "question":
      return floor(until(s) + Math.random() * C.BOUNDARY_JITTER_MS);

    case "pause": {
      if (s.reveal && s.reveal.counts === null) {
        return C.COUNTS_RETRY_MS + Math.random() * C.COUNTS_RETRY_MS;
      }
      return boundaryDelay(s);
    }
  }
  return null;
}

export default function () {
  sleep((((__VU - 1) / VUS) * JOIN_SPREAD_MS + Math.random() * 250) / 1000);

  const join = http.post(
    `${BASE_URL}/api/join`,
    JSON.stringify({ code: game.code, nickname: `player-${__VU}` }),
    {
      headers: { "Content-Type": "application/json" },
      tags: { endpoint: "join" },
    },
  );
  const joined = check(join, { "join 200": (r) => r.status === 200 });
  joinSuccess.add(joined);
  if (!joined) return;

  const endAt = game.startsAt + game.schedule.endsAt + 5000;
  let first = true;

  while (Date.now() < endAt) {
    const res = http.get(
      `${BASE_URL}/api/play/state${first ? "?schedule=1" : ""}`,
      { tags: { endpoint: "state" } },
    );
    first = false;

    polls.add(1);
    stateLatency.add(res.timings.duration);
    const ok = check(res, { "state 200": (r) => r.status === 200 });
    stateSuccess.add(ok);
    let s = null;
    try {
      s = res.json();
    } catch (_) {
      // не JSON
    }
    if (!ok || !s) {
      sleep(3);
      continue;
    }

    // Чи є питання у вікні префетчу (крім останньої паузи, де наступного немає)
    if (
      typeof s.phase !== "string" &&
      s.phase.type === "pause" &&
      s.phase.index + 1 < game.questionCount &&
      until(s) <= C.PREFETCH_MS
    ) {
      prefetchPresent.add(s.nextQuestion !== null);
      if (s.nextQuestion !== null) prefetchLead.add(until(s));
    }

    const delay = nextDelay(s);
    if (delay === null) break;
    sleep(delay / 1000);
  }
}
