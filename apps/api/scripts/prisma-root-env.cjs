const { existsSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const { resolve } = require("node:path");
const { config: loadDotenv } = require("dotenv");

const rootDir = resolve(__dirname, "../../..");
const envPath = resolve(rootDir, ".env");
const localEnvPath = resolve(rootDir, ".env.local");

if (existsSync(envPath)) {
  loadDotenv({ path: envPath, override: false });
}
if (process.env.NODE_ENV !== "production" && existsSync(localEnvPath)) {
  loadDotenv({ path: localEnvPath, override: true });
}

const candidates =
  process.platform === "win32"
    ? [
        resolve(__dirname, "../node_modules/.bin/prisma.CMD"),
        resolve(rootDir, "node_modules/.bin/prisma.CMD"),
      ]
    : [
        resolve(__dirname, "../node_modules/.bin/prisma"),
        resolve(rootDir, "node_modules/.bin/prisma"),
      ];

const command = candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
const result = spawnSync(command, process.argv.slice(2), {
  cwd: resolve(__dirname, ".."),
  env: process.env,
  stdio: "inherit",
  shell: process.platform === "win32",
});

if (result.error) {
  console.error(result.error.message);
}

process.exit(result.status ?? 1);
