import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";
import game from "./game.js";

function readInteger(name, fallback) {
  const raw = __ENV[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer, got "${raw}"`);
  }
  return value;
}

const BASE_URL = (__ENV.BASE_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");
const VUS = readInteger("VUS", 2000);
const JOIN_SPREAD_MS = readInteger("JOIN_SPREAD_MS", 60_000);
const JOIN_JITTER_MS = readInteger("JOIN_JITTER_MS", 250);
const ANSWER_START_MS = readInteger("ANSWER_START_MS", 2_000);
const ANSWER_RPS = readInteger("ANSWER_RPS", 600);
const ANSWER_JITTER_MS = readInteger("ANSWER_JITTER_MS", 100);
const JOIN_TIMEOUT = __ENV.JOIN_TIMEOUT || "60s";
const ANSWER_TIMEOUT = __ENV.ANSWER_TIMEOUT || "15s";
const RESULTS_FILE = __ENV.RESULTS_FILE || "load/results.json";

const QUESTION_COUNT = game.schedule.questions.length;
const OPTION_COUNT = game.optionCount || 4;
const QUESTION_OPEN_MS =
  game.schedule.questions[0].closesAt - game.schedule.questions[0].opensAt;
const LAST_ANSWER_MS =
  ANSWER_START_MS + ((VUS - 1) * 1000) / ANSWER_RPS + ANSWER_JITTER_MS;

if (LAST_ANSWER_MS >= QUESTION_OPEN_MS) {
  throw new Error(
    `VUS=${VUS} at ANSWER_RPS=${ANSWER_RPS} would answer after the question closes. ` +
      `Raise ANSWER_RPS or lower ANSWER_START_MS.`,
  );
}

const maxDurationSeconds = Math.max(
  120,
  Math.ceil(
    (game.startsAt + game.schedule.endsAt - game.seededAt) / 1000,
  ) + 180,
);

export const options = {
  scenarios: {
    players: {
      executor: "per-vu-iterations",
      vus: VUS,
      iterations: 1,
      maxDuration: `${maxDurationSeconds}s`,
    },
  },
  thresholds: {
    join_success: ["rate>0.99"],
    answer_success: ["rate>0.99"],
    answer_missed: ["count==0"],
    http_req_failed: ["rate<0.02"],
    join_latency: ["p(95)<5000"],
    answer_latency: ["p(95)<3000", "p(99)<5000"],
  },
  summaryTrendStats: ["avg", "min", "med", "p(90)", "p(95)", "p(99)", "max"],
};

const joinLatency = new Trend("join_latency");
const answerLatency = new Trend("answer_latency");
const joinSuccess = new Rate("join_success");
const answerSuccess = new Rate("answer_success");
const joinsOk = new Counter("joins_ok");
const answersOk = new Counter("answers_ok");
const answersMissed = new Counter("answer_missed");

function sleepUntil(timestampMs) {
  const remaining = timestampMs - Date.now();
  if (remaining > 0) {
    sleep(remaining / 1000);
  }
}

function answerOffsetMs(vu) {
  return (
    ANSWER_START_MS +
    ((vu - 1) * 1000) / ANSWER_RPS +
    Math.random() * ANSWER_JITTER_MS
  );
}

export function setup() {
  const minimumLeadMs = JOIN_SPREAD_MS + 15_000;
  const leadMs = game.startsAt - Date.now();

  if (leadMs < minimumLeadMs) {
    throw new Error(
      `Only ${Math.round(leadMs / 1000)}s until game start, need at least ` +
        `${Math.round(minimumLeadMs / 1000)}s. Re-run the seeder and start k6 immediately.`,
    );
  }

  if (questionCountMismatch()) {
    throw new Error("load/game.js is inconsistent with its schedule");
  }
}

function questionCountMismatch() {
  return QUESTION_COUNT !== game.questionCount;
}

export default function () {
  const joinDelayMs =
    ((__VU - 1) / VUS) * JOIN_SPREAD_MS + Math.random() * JOIN_JITTER_MS;
  sleepUntil(Date.now() + joinDelayMs);

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
  if (joined) joinsOk.add(1);

  if (!joined) {
    if (__VU <= 5) {
      console.error(`VU ${__VU} join failed: ${joinRes.status} ${joinRes.body}`);
    }
    return;
  }

  for (let index = 0; index < QUESTION_COUNT; index += 1) {
    const item = game.schedule.questions[index];
    const opensAt = game.startsAt + item.opensAt;
    const closesAt = game.startsAt + item.closesAt;
    const answerAt = opensAt + answerOffsetMs(__VU);

    sleepUntil(answerAt);

    if (Date.now() > closesAt) {
      answersMissed.add(1, { question: String(index) });
      continue;
    }

    const answerRes = http.post(
      `${BASE_URL}/api/play/answer`,
      JSON.stringify({
        index,
        option: (__VU + index) % OPTION_COUNT,
      }),
      {
        headers: { "Content-Type": "application/json" },
        timeout: ANSWER_TIMEOUT,
        tags: { endpoint: "answer", question: String(index) },
      },
    );

    answerLatency.add(answerRes.timings.duration, {
      question: String(index),
    });
    const answered = check(answerRes, {
      "answer returns 200": (res) => res.status === 200,
    });
    answerSuccess.add(answered, { question: String(index) });
    if (answered) {
      answersOk.add(1);
    } else if (__VU <= 5) {
      console.error(
        `VU ${__VU} answer ${index} failed: ${answerRes.status} ${answerRes.body}`,
      );
    }
  }
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
    questions: QUESTION_COUNT,
    answer_rps_target: ANSWER_RPS,
    expected_answers: VUS * QUESTION_COUNT,
    joins_ok: metricValue(metrics, "joins_ok", "count"),
    answers_ok: metricValue(metrics, "answers_ok", "count"),
    answer_missed: metricValue(metrics, "answer_missed", "count"),
    join_success_rate: metricValue(metrics, "join_success", "rate"),
    answer_success_rate: metricValue(metrics, "answer_success", "rate"),
    join_p95_ms: metricValue(metrics, "join_latency", "p(95)"),
    answer_p95_ms: metricValue(metrics, "answer_latency", "p(95)"),
    answer_p99_ms: metricValue(metrics, "answer_latency", "p(99)"),
    http_req_failed_rate: metricValue(metrics, "http_req_failed", "rate"),
  };

  return {
    stdout: `\n${JSON.stringify(summary, null, 2)}\n`,
    [RESULTS_FILE]: JSON.stringify(data, null, 2),
  };
}
