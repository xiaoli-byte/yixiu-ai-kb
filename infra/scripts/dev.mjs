import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const apiRequire = createRequire(resolve(root, "apps/api/package.json"));
const isWindows = process.platform === "win32";
const pnpm = "pnpm";
const rootEnv = loadRootEnv();

const processes = [
  {
    name: "api",
    color: "\x1b[36m",
    args: ["--filter", "@ai-knowledge/api", "dev"],
    env: { DOCUMENT_WORKER_ENABLED: "false" },
  },
  {
    name: "worker",
    color: "\x1b[35m",
    args: ["--filter", "@ai-knowledge/api", "worker:dev"],
    env: { DOCUMENT_WORKER_ENABLED: "true" },
  },
  {
    name: "web",
    color: "\x1b[32m",
    args: ["--filter", "@ai-knowledge/web", "dev"],
    env: {},
  },
];

const reset = "\x1b[0m";
const children = [];
let shuttingDown = false;
let forceExitTimer;

function writePrefix(name, color, line, stream = process.stdout) {
  if (line.length === 0) return;
  stream.write(`${color}[${name}]${reset} ${line}\n`);
}

function writeBlock(name, color, text, stream = process.stdout) {
  for (const line of String(text).split(/\r?\n/)) {
    writePrefix(name, color, line, stream);
  }
}

function pipeWithPrefix(child, name, color) {
  for (const [source, target] of [
    [child.stdout, process.stdout],
    [child.stderr, process.stderr],
  ]) {
    let buffered = "";
    source.on("data", (chunk) => {
      buffered += chunk.toString();
      const lines = buffered.split(/\r?\n/);
      buffered = lines.pop() ?? "";
      for (const line of lines) writePrefix(name, color, line, target);
    });
    source.on("end", () => {
      if (buffered) writePrefix(name, color, buffered, target);
    });
  }
}

function isChildRunning(child) {
  return child.exitCode === null && child.signalCode === null;
}

function killProcessTree(child) {
  if (!child.pid || !isChildRunning(child)) return Promise.resolve();

  if (isWindows) {
    return new Promise((resolveKill) => {
      const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
      killer.on("exit", () => resolveKill());
      killer.on("error", () => resolveKill());
    });
  }

  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    try {
      child.kill("SIGTERM");
    } catch {}
  }
  return Promise.resolve();
}

async function stopAll(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  forceExitTimer = setTimeout(() => process.exit(exitCode), 5000);
  forceExitTimer.unref();

  await Promise.all(children.map((child) => killProcessTree(child)));
  clearTimeout(forceExitTimer);
  process.exit(exitCode);
}

function parseEnvFile(path) {
  if (!existsSync(path)) return {};
  const parsed = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/i);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    parsed[match[1]] = value;
  }
  return parsed;
}

function loadRootEnv() {
  return {
    ...parseEnvFile(resolve(root, ".env")),
    ...parseEnvFile(resolve(root, ".env.local")),
  };
}

function isTruthy(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function maskDatabaseUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.password) url.password = "***";
    return url.toString();
  } catch {
    return "<invalid DATABASE_URL>";
  }
}

function buildPostgresHint(connectionString, reason) {
  const lines = [
    `PostgreSQL preflight failed for ${maskDatabaseUrl(connectionString)}.`,
    `Reason: ${reason}`,
  ];

  try {
    const url = new URL(connectionString);
    const usesDefaultLocalPostgres =
      ["localhost", "127.0.0.1", "::1"].includes(url.hostname) &&
      (!url.port || url.port === "5432");

    if (usesDefaultLocalPostgres) {
      const user = url.username || rootEnv.POSTGRES_USER || "ai_knowledge";
      const dbName = url.pathname.replace(/^\//, "") || rootEnv.POSTGRES_DB || "ai_knowledge";
      lines.push(
        "DATABASE_URL currently points at localhost:5432, which often belongs to another local PostgreSQL instance.",
        "If you use this project's Docker PostgreSQL, prefer the non-conflicting host port from .env.example:",
        "  POSTGRES_PORT=56432",
        `  DATABASE_URL=postgresql://${user}:<POSTGRES_PASSWORD>@localhost:56432/${dbName}`,
      );
    }
  } catch {
    lines.push("DATABASE_URL is not a valid PostgreSQL URL.");
  }

  lines.push("Set SKIP_DEV_PREFLIGHT=true only when you intentionally want to bypass this check.");
  return lines.join("\n");
}

async function checkPostgres() {
  const connectionString = rootEnv.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Missing DATABASE_URL in root .env/.env.local");
  }

  const { Client } = apiRequire("pg");
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 3000,
  });

  try {
    await client.connect();
  } catch (error) {
    throw new Error(buildPostgresHint(connectionString, error.message));
  } finally {
    try {
      await client.end();
    } catch {}
  }
}

function runNeo4jMigrations() {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(
      process.execPath,
      ["-r", "ts-node/register", "-r", "tsconfig-paths/register", "src/database/neo4j/migrate.ts"],
      {
        cwd: resolve(root, "apps/api"),
        env: createEnv({}),
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      },
    );

    pipeWithPrefix(child, "graph-migrate", "\x1b[90m");
    child.on("error", rejectRun);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolveRun();
        return;
      }
      const reason = signal ? `signal ${signal}` : `code ${code ?? 0}`;
      rejectRun(new Error(`Neo4j migration failed with ${reason}`));
    });
  });
}

async function runPreflight() {
  if (isTruthy(rootEnv.SKIP_DEV_PREFLIGHT)) return;
  await checkPostgres();
  writePrefix("preflight", "\x1b[90m", "PostgreSQL connection OK");
  await runNeo4jMigrations();
}

function createEnv(extraEnv) {
  const env = { ...rootEnv, ...process.env, ...extraEnv };
  if (isWindows) {
    const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path");
    const pathValue = pathKey ? env[pathKey] : undefined;
    for (const key of Object.keys(env)) {
      if (key.toLowerCase() === "path") delete env[key];
      if (env[key] == null) delete env[key];
    }
    if (pathValue) env.Path = pathValue;
  }
  return env;
}

function createSpawnConfig(args) {
  if (!isWindows) {
    return { command: pnpm, args };
  }

  return {
    command: process.env.ComSpec || "cmd.exe",
    args: ["/d", "/s", "/c", pnpm, ...args],
  };
}

try {
  await runPreflight();
} catch (error) {
  writeBlock("preflight", "\x1b[31m", error.message, process.stderr);
  process.exit(1);
}

writePrefix(
  "dev",
  "\x1b[90m",
  "starting api, worker, and web. Run this script from the repository root with npm run dev or pnpm dev.",
);

for (const config of processes) {
  const spawnConfig = createSpawnConfig(config.args);
  const childEnv = createEnv(config.env);
  const workerFlag =
    childEnv.DOCUMENT_WORKER_ENABLED == null
      ? ""
      : ` DOCUMENT_WORKER_ENABLED=${childEnv.DOCUMENT_WORKER_ENABLED}`;
  writePrefix(
    "dev",
    "\x1b[90m",
    `starting ${config.name}: pnpm ${config.args.join(" ")}${workerFlag}`,
  );
  const child = spawn(spawnConfig.command, spawnConfig.args, {
    cwd: root,
    env: childEnv,
    stdio: ["inherit", "pipe", "pipe"],
    detached: !isWindows,
  });
  children.push(child);
  writePrefix(config.name, config.color, `started pid=${child.pid ?? "unknown"}${workerFlag}`);
  pipeWithPrefix(child, config.name, config.color);

  child.on("error", (error) => {
    writePrefix(config.name, config.color, `failed to start: ${error.message}`, process.stderr);
    stopAll(1);
  });

  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    const reason = signal ? `signal ${signal}` : `code ${code ?? 0}`;
    writePrefix(config.name, config.color, `exited with ${reason}`, process.stderr);
    stopAll(code ?? 1);
  });
}

process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));
process.on("uncaughtException", (error) => {
  writePrefix("dev", "\x1b[31m", `uncaught exception: ${error.message}`, process.stderr);
  stopAll(1);
});
process.on("unhandledRejection", (reason) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  writePrefix("dev", "\x1b[31m", `unhandled rejection: ${message}`, process.stderr);
  stopAll(1);
});
