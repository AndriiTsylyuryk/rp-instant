import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSchedule } from "@rp/shared";
import { pb, withPb } from "../src/repo/pb.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const loadDir = resolve(repoRoot, "load");

const OPTION_COUNT = 4;

function readInteger(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer, got "${raw}"`);
  }
  return value;
}

function randomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

async function main() {
  const questionCount = readInteger("LOAD_QUESTIONS", 20);
  const leadSeconds = readInteger("LOAD_LEAD_SECONDS", 120);
  const code = (process.env.LOAD_CODE || randomCode()).toUpperCase();

  if (!/^[A-Z0-9]{6,20}$/.test(code)) {
    throw new Error("LOAD_CODE must be 6-20 letters or digits");
  }

  const startsAt = Date.now() + leadSeconds * 1000;
  const schedule = buildSchedule(
    Array.from({ length: questionCount }, () => ({ kind: "quiz" as const })),
  );

  const game = await withPb(async () =>
    pb.collection("games").create<{ id: string }>({
      title: `Load test ${code}`,
      join_code: code,
      status: "lobby",
      lobby_minutes: Math.min(30, Math.max(1, Math.ceil(leadSeconds / 60))),
      starts_at: new Date(startsAt).toISOString(),
      schedule,
      joining_locked: false,
    }),
  );

  const quiz = await withPb(async () =>
    pb.collection("quizzes").create<{ id: string }>({
      game: game.id,
      position: 1,
      title: "Load test quiz",
    }),
  );

  for (let index = 0; index < questionCount; index += 1) {
    await withPb(async () =>
      pb.collection("quiz_questions").create({
        quiz: quiz.id,
        position: index + 1,
        kind: "quiz",
        text: `Load question ${index + 1}`,
        options: ["A", "B", "C", "D"],
        correct_option: index % OPTION_COUNT,
        double_points: false,
      }),
    );
  }

  const config = {
    gameId: game.id,
    code,
    title: `Load test ${code}`,
    seededAt: Date.now(),
    startsAt,
    questionCount,
    optionCount: OPTION_COUNT,
    schedule,
  };

  mkdirSync(loadDir, { recursive: true });
  writeFileSync(
    resolve(loadDir, "game.js"),
    `export default ${JSON.stringify(config, null, 2)};\n`,
  );

  console.log(`Seeded game ${code} (${game.id})`);
  console.log(`Questions: ${questionCount}`);
  console.log(`Start: ${new Date(startsAt).toLocaleString()} (${leadSeconds}s from now)`);
  console.log("Run: k6 run load/match.js");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
