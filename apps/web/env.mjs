import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(fileURLToPath(new URL("../..", import.meta.url)));

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
  const base = parseEnvFile(resolve(rootDir, ".env"));
  const local =
    process.env.NODE_ENV === "production" ? {} : parseEnvFile(resolve(rootDir, ".env.local"));
  for (const [key, value] of Object.entries({ ...base, ...local })) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function isTruthy(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

export function validateWebEnv() {
  loadRootEnv();

  const required = ["API_INTERNAL_URL", "NEXT_PUBLIC_API_URL"];
  const missing = required.filter((key) => !process.env[key]?.trim());
  if (missing.length > 0) {
    throw new Error(`Missing required web environment variable(s): ${missing.join(", ")}`);
  }

  if (process.env.NODE_ENV === "production" && isTruthy(process.env.NEXT_PUBLIC_DEMO_MODE)) {
    throw new Error("NEXT_PUBLIC_DEMO_MODE must be false in production");
  }

  if (
    process.env.NODE_ENV !== "production" &&
    isTruthy(process.env.NEXT_PUBLIC_DEMO_MODE)
  ) {
    const demoRequired = ["NEXT_PUBLIC_DEMO_EMAIL", "NEXT_PUBLIC_DEMO_PASSWORD"];
    const missingDemoVars = demoRequired.filter((key) => !process.env[key]?.trim());
    if (missingDemoVars.length > 0) {
      throw new Error(
        `Missing required demo environment variable(s): ${missingDemoVars.join(", ")}`,
      );
    }
  }
}
