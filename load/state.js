import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";
import game from "./game.js";

function readInteger(name, fallback, allowZero = false) {
  const raw = __ENV[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  const valid = Number.isInteger(value) && (allowZero ? value >= 0 : value > 0);
  if (!valid) {
    throw new Error(
      `${name} must be a ${allowZero ? "non-negative" : "positive"} integer, got "${raw}"`,
    );
  }
  return value;
}

const BASE_URL = (__ENV.BASE_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");
const VUS = readInteger("VUS", 2000);
const STATE_INTERVAL_MS = readInteger("STATE_INTERVAL_MS", 1000);
const STATE_JITTER_MS = readInteger("STATE_JITTER_MS", 200, true);
const JOIN_SPREAD_MS = readInteger("JOIN_SPREAD_MS", 10_000);
const JOIN_JITTER_MS = readInteger("JOIN_JITTER_MS", 250, true);
const DURATION = __ENV.DURATION || "120s";
const JOIN_TIMEOUT = __ENV.JOIN_TIMEOUT || "60s";
const STATE_TIMEOUT = __ENV.STATE_TIMEOUT || "10s";
const RESULTS_FILE = __ENV.RESULTS_FILE || "load/state-results.json";

if (STATE_INTERVAL_MS < 100) {
  throw new Error("STATE_INTERVAL_MS must be at least 100");
}

const TARGET_RPS = (VUS * 1000) / STATE_INTERVAL_MS;

export const options = {
  scenarios: {
    state: {
      executor: "constant-vus",
      vus: VUS,
      duration: DURATION,
      gracefulStop: "10s",
    },
  },
  discardResponseBodies: true,
  noCookiesReset: true,
  thresholds: {
    join_success: ["rate>0.99"],
    state_success: ["rate>0.99"],
    http_req_failed: ["rate<0.01"],
    join_latency: ["p(95)<5000"],
    state_latency: ["p(95)<500", "p(99)<1000"],
  },
  summaryTrendStats: ["avg", "min", "med", "p(90)", "p(95)", "p(99)", "max"],
};

const joinLatency = new Trend("join_latency");
const stateLatency = new Trend("state_latency");
const joinSuccess = new Rate("join_success");
const stateSuccess = new Rate("state_success");
const joinsOk = new Counter("joins_ok");
const statesOk = new Counter("state_ok");
const stateRequests = new Counter("state_requests");

let joinState = "pending";

function stateIntervalMs() {
  const jitter = (Math.random() - 0.5) * STATE_JITTER_MS;
  return Math.max(50, STATE_INTERVAL_MS + jitter);
}

export function setup() {
  const endAt = game.startsAt + game.schedule.endsAt;
  if (Date.now() >= endAt) {
    throw new Error(
      "Load-test game has already ended. Re-run `npm run seed:load` and start k6 immediately.",
    );
  }
}

export default function () {
  if (joinState === "pending") {
    joinState = "attempted";

    const joinDelayMs =
      ((__VU - 1) / VUS) * JOIN_SPREAD_MS + Math.random() * JOIN_JITTER_MS;
    sleep(joinDelayMs / 1000);

    const joinRes = http.post(
      `${BASE_URL}/api/join`,
      JSON.stringify({
        code: game.code,
        nickname: `player-${__VU}`,
      }),
      {
        headers: { "Content-Type": "application/json" },
        timeout: JOIN_TIMEOUT,
        tags: { endpoint: "join" },
      },
    );

    joinLatency.add(joinRes.timings.duration);
    const joined = check(joinRes, {
      "join returns 200": (res) => res.status === 200,
    });
    joinSuccess.add(joined);
    if (!joined) {
      if (__VU <= 5) {
        console.error(`VU ${__VU} join failed: ${joinRes.status}`);
      }
      return;
    }

    joinsOk.add(1);
    joinState = "joined";
  }

  if (joinState !== "joined") return;

  const startedAt = Date.now();
  const stateRes = http.get(`${BASE_URL}/api/play/state`, {
    timeout: STATE_TIMEOUT,
    tags: { endpoint: "state" },
  });

  stateRequests.add(1);
  stateLatency.add(stateRes.timings.duration);
  const ok = check(stateRes, {
    "state returns 200": (res) => res.status === 200,
  });
  stateSuccess.add(ok);
  if (ok) statesOk.add(1);

  const remainingMs = stateIntervalMs() - (Date.now() - startedAt);
  sleep(Math.max(0, remainingMs) / 1000);
}

function metricValue(metrics, name, field, fallback = 0) {
  const metric = metrics[name];
  if (!metric) return fallback;
  if (field === "rate") return metric.values.rate ?? fallback;
  if (field === "count") return metric.values.count ?? fallback;
  return metric.values[field] ?? fallback;
}

export function handleSummary(data) {
  const metrics = data.metrics;
  const summary = {
    vus: VUS,
    target_state_rps: Math.round(TARGET_RPS),
    state_interval_ms: STATE_INTERVAL_MS,
    state_jitter_ms: STATE_JITTER_MS,
    joins_ok: metricValue(metrics, "joins_ok", "count"),
    state_ok: metricValue(metrics, "state_ok", "count"),
    join_success_rate: metricValue(metrics, "join_success", "rate"),
    state_success_rate: metricValue(metrics, "state_success", "rate"),
    actual_state_rps: metricValue(metrics, "state_requests", "rate"),
    join_p95_ms: metricValue(metrics, "join_latency", "p(95)"),
    state_p95_ms: metricValue(metrics, "state_latency", "p(95)"),
    state_p99_ms: metricValue(metrics, "state_latency", "p(99)"),
    http_req_failed_rate: metricValue(metrics, "http_req_failed", "rate"),
  };

  return {
    stdout: `\n${JSON.stringify(summary, null, 2)}\n`,
    [RESULTS_FILE]: JSON.stringify(data, null, 2),
  };
}
