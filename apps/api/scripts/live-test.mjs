import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const composeFile = resolve(repoRoot, "docker-compose.test.yml");
const apiDir = resolve(repoRoot, "apps/api");

const email = process.env.PB_SUPERUSER_EMAIL ?? "live@rp.local";
const password = process.env.PB_SUPERUSER_PASSWORD ?? "live-test-password";
const pbUrl = process.env.PB_URL ?? "http://127.0.0.1:8091";
const keep = process.env.KEEP_PB === "1";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed (${result.status})`);
  }
}

function compose(args) {
  run("docker", ["compose", "-f", composeFile, ...args]);
}

async function waitForHealth(timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${pbUrl}/api/health`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`PocketBase did not become healthy at ${pbUrl}`);
}

let testExitCode = 1;

try {
  console.log("Starting isolated PocketBase...");
  compose(["build", "pocketbase-test"]);
  compose([
    "run",
    "--rm",
    "--entrypoint",
    "/pb/pocketbase",
    "pocketbase-test",
    "migrate",
    "up",
    "--dir=/pb_data",
    "--migrationsDir=/pb_migrations",
  ]);
  compose([
    "run",
    "--rm",
    "--entrypoint",
    "/pb/pocketbase",
    "pocketbase-test",
    "superuser",
    "create",
    email,
    password,
    "--dir=/pb_data",
  ]);
  compose(["up", "-d", "pocketbase-test"]);

  await waitForHealth();
  console.log(`PocketBase is healthy at ${pbUrl}`);

  const result = spawnSync(
    "npx",
    ["vitest", "run", "test/live/games.live.test.ts"],
    {
      cwd: apiDir,
      stdio: "inherit",
      shell: process.platform === "win32",
      env: {
        ...process.env,
        PB_LIVE: "1",
        PB_URL: pbUrl,
        PB_SUPERUSER_EMAIL: email,
        PB_SUPERUSER_PASSWORD: password,
      },
    },
  );

  testExitCode = result.status ?? 1;
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
} finally {
  if (!keep) {
    console.log("Cleaning up PocketBase...");
    try {
      compose(["down", "-v"]);
    } catch {
      // ignore cleanup errors
    }
  } else {
    console.log("KEEP_PB=1 set, leaving PocketBase running.");
  }
}

process.exit(testExitCode);
