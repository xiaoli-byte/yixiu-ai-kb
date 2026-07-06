import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
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

for (const config of processes) {
  const spawnConfig = createSpawnConfig(config.args);
  const child = spawn(spawnConfig.command, spawnConfig.args, {
    cwd: root,
    env: createEnv(config.env),
    stdio: ["inherit", "pipe", "pipe"],
    detached: !isWindows,
  });
  children.push(child);
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
