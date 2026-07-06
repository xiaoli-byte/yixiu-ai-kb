import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  args.set(process.argv[i], process.argv[i + 1]);
}

const composeFile = args.get("--compose-file") || "docker-compose.prod.yml";
const envFile = args.get("--env-file") || ".env.production";

if (!existsSync(envFile)) {
  fail(`Missing ${envFile}. Create it from .env.production.example before running smoke:deploy.`);
}

const env = parseEnvFile(envFile);
const composeBase = ["compose", "-f", composeFile, "--env-file", envFile];

expectDockerDaemon();
run("docker", [...composeBase, "config", "--services"]);
expectCompleted("ai-knowledge-db-init");
expectCompleted("ai-knowledge-graph-init");
expectHealthy("ai-knowledge-postgres");
expectHealthy("ai-knowledge-redis");
expectHealthy("ai-knowledge-neo4j");
expectHealthy("ai-knowledge-minio");
expectRunning("ai-knowledge-api");
expectRunning("ai-knowledge-web");

expectHttp("API health", `http://localhost:${requiredEnv("API_PORT")}/health`);
expectHttp("Web", `http://localhost:${requiredEnv("WEB_PORT")}`);
expectHttp("MinIO health", `http://localhost:${requiredEnv("MINIO_PORT")}/minio/health/live`);
expectHttp("Neo4j HTTP", `http://localhost:${requiredEnv("NEO4J_HTTP_PORT")}`);
expectExec("Redis ping", "ai-knowledge-redis", ["redis-cli", "ping"], "PONG");

console.log("[smoke:deploy] all deployment checks passed");

function parseEnvFile(path) {
  const values = {};
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
    values[match[1]] = value;
  }
  return values;
}

function requiredEnv(key) {
  const value = env[key]?.trim();
  if (!value) fail(`Missing ${key} in ${envFile}`);
  return value;
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    encoding: "utf8",
    shell: process.platform === "win32",
    ...options,
  });
  if (result.status !== 0) {
    fail(`${command} ${commandArgs.join(" ")} failed\n${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

function expectDockerDaemon() {
  const result = spawnSync("docker", ["info", "--format", "{{.ServerVersion}}"], {
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    fail(`Docker daemon is not reachable. Start Docker Desktop and rerun smoke:deploy.\n${result.stderr || result.stdout}`);
  }
  console.log(`[smoke:deploy] Docker daemon reachable (${result.stdout.trim()})`);
}

function dockerInspect(container, format) {
  return run("docker", ["inspect", "-f", format, container]);
}

function expectCompleted(container) {
  const state = dockerInspect(container, "{{.State.Status}} {{.State.ExitCode}}");
  if (state !== "exited 0") fail(`${container} expected exited 0, got ${state}`);
  console.log(`[smoke:deploy] ${container} completed`);
}

function expectHealthy(container) {
  const status = dockerInspect(
    container,
    "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}",
  );
  if (status !== "healthy") fail(`${container} expected healthy, got ${status}`);
  console.log(`[smoke:deploy] ${container} healthy`);
}

function expectRunning(container) {
  const status = dockerInspect(container, "{{.State.Status}}");
  if (status !== "running") fail(`${container} expected running, got ${status}`);
  console.log(`[smoke:deploy] ${container} running`);
}

function expectHttp(name, url) {
  const result = spawnSync(
    "node",
    [
      "--input-type=module",
      "-e",
      `const r=await fetch(${JSON.stringify(url)}); if(!r.ok) throw new Error(String(r.status));`,
    ],
    { encoding: "utf8" },
  );
  if (result.status !== 0) fail(`${name} failed at ${url}: ${result.stderr || result.stdout}`);
  console.log(`[smoke:deploy] ${name} OK`);
}

function expectExec(name, container, commandArgs, expected) {
  const output = run("docker", ["exec", container, ...commandArgs]);
  if (!output.includes(expected)) fail(`${name} expected ${expected}, got ${output}`);
  console.log(`[smoke:deploy] ${name} OK`);
}

function fail(message) {
  console.error(`[smoke:deploy] ${message}`);
  process.exit(1);
}
