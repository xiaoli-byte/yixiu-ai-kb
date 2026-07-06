import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const tscBin = resolve("node_modules", "typescript", "bin", "tsc");

const checks = [
  {
    name: "architecture",
    command: "node",
    args: ["scripts/check-architecture.mjs"],
  },
  {
    name: "prisma schema",
    command: "node",
    args: [
      "apps/api/scripts/prisma-root-env.cjs",
      "validate",
      "--schema",
      "src/database/prisma/schema.prisma",
    ],
  },
  {
    name: "api types",
    command: "node",
    args: [tscBin, "-p", "apps/api/tsconfig.json", "--noEmit", "--incremental", "false"],
  },
  {
    name: "web types",
    command: "node",
    args: [tscBin, "-p", "apps/web/tsconfig.json", "--noEmit", "--incremental", "false"],
  },
  {
    name: "production compose config",
    command: "docker",
    args: [
      "compose",
      "-f",
      "docker-compose.prod.yml",
      "--env-file",
      ".env.production.example",
      "config",
      "--services",
    ],
  },
];

for (const check of checks) {
  console.log(`\n[check:ci] ${check.name}`);
  const result = spawnSync(check.command, check.args, {
    stdio: "inherit",
  });
  if (result.error) {
    console.error(`[check:ci] failed to start ${check.name}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log("\n[check:ci] all checks passed");
