import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const rules = JSON.parse(readFileSync(join(root, "config/env-rules.json"), "utf8"));
const failures = [];

const ignoredDirs = new Set([
  ".agents",
  ".codex-runtime",
  ".cursor",
  ".git",
  ".next",
  ".pnpm-store",
  ".trae",
  ".turbo",
  ".vscode",
  "coverage",
  "dist",
  "knowledge-management-design",
  "node_modules",
]);

function rel(path) {
  return relative(root, path).replace(/\\/g, "/");
}

function addFailure(message) {
  failures.push(message);
}

function walk(dir, visit) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    const relativePath = rel(fullPath);
    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name)) walk(fullPath, visit);
      continue;
    }
    visit(fullPath, relativePath);
  }
}

function readText(path) {
  return readFileSync(path, "utf8");
}

function checkAppEnvFiles() {
  walk(join(root, "apps"), (_path, relativePath) => {
    if (relativePath.split("/").some((part) => part.startsWith(".env"))) {
      addFailure(`App-level env file is not allowed: ${relativePath}`);
    }
  });
}

function checkLegacyEnvKeys() {
  const skip = new Set(["config/env-rules.json", "scripts/check-architecture.mjs"]);
  const targets = ["apps", "docs", "infra", "README.md", ".env.example", ".env.production.example"];
  for (const target of targets) {
    const fullTarget = join(root, target);
    if (!existsSync(fullTarget)) continue;
    const stat = statSync(fullTarget);
    const visit = (path, relativePath) => {
      if (skip.has(relativePath) || relativePath.endsWith("pdf.worker.min.mjs")) return;
      const text = readText(path);
      for (const key of rules.legacyEnvKeys || []) {
        if (text.includes(key)) {
          addFailure(`Legacy env key ${key} found in ${relativePath}`);
        }
      }
    };
    if (stat.isDirectory()) walk(fullTarget, visit);
    else visit(fullTarget, rel(fullTarget));
  }
}

function checkProductionCompose() {
  const path = join(root, "docker-compose.prod.yml");
  const text = readText(path);
  if (/\$\{[A-Z0-9_]+:-/.test(text)) {
    addFailure("Production compose must not use ${VAR:-default} fallbacks");
  }
  if (/^\s*env_file:/m.test(text)) {
    addFailure("Production compose must not use broad env_file injection");
  }
  if (/NEO4J_AUTH:\s*["']?none["']?/i.test(text)) {
    addFailure("Production Neo4j must not disable authentication");
  }
}

function checkPostgresDdl() {
  const allowedPrefixes = [
    "apps/api/src/database/prisma/migrations/",
    "infra/docker/postgres/init.sql",
  ];
  const scanRoots = ["apps/api/src", "infra/docker/postgres"];
  const ddlPattern = /\b(CREATE|ALTER|DROP)\s+(TABLE|INDEX)\b/i;
  for (const scanRoot of scanRoots) {
    walk(join(root, scanRoot), (path, relativePath) => {
      if (allowedPrefixes.some((prefix) => relativePath.startsWith(prefix))) return;
      if (relativePath.startsWith("apps/api/src/database/neo4j/")) return;
      if (!/\.(sql|ts|js|cjs|mjs)$/.test(relativePath)) return;
      if (ddlPattern.test(readText(path))) {
        addFailure(`PostgreSQL DDL must live in Prisma migrations, not ${relativePath}`);
      }
    });
  }
}

function checkNeo4jDdl() {
  const allowedPrefixes = ["apps/api/src/database/neo4j/migrations/"];
  const allowedFiles = new Set(["apps/api/src/database/neo4j/migrate.ts"]);
  const scanRoots = ["apps/api/src", "infra/docker/neo4j"];
  const ddlPattern = /\bCREATE\s+(CONSTRAINT|INDEX)\b/i;
  for (const scanRoot of scanRoots) {
    walk(join(root, scanRoot), (path, relativePath) => {
      if (allowedFiles.has(relativePath)) return;
      if (allowedPrefixes.some((prefix) => relativePath.startsWith(prefix))) return;
      if (!/\.(cypher|ts|js|cjs|mjs)$/.test(relativePath)) return;
      if (ddlPattern.test(readText(path))) {
        addFailure(`Neo4j schema DDL must live in Neo4j migrations, not ${relativePath}`);
      }
    });
  }
}

function checkPackageScripts() {
  walk(root, (path, relativePath) => {
    if (!relativePath.endsWith("package.json")) return;
    const pkg = JSON.parse(readText(path));
    for (const [name, command] of Object.entries(pkg.scripts || {})) {
      if (/\bprisma\s+db\s+push\b|\bdb\s+push\b/.test(String(command))) {
        addFailure(`Package script ${relativePath}#${name} must not use prisma db push`);
      }
    }
  });
}

checkAppEnvFiles();
checkLegacyEnvKeys();
checkProductionCompose();
checkPostgresDdl();
checkNeo4jDdl();
checkPackageScripts();

if (failures.length > 0) {
  console.error("Architecture checks failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Architecture checks passed");
