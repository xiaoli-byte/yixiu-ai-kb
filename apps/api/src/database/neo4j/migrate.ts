import "reflect-metadata";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import neo4j, { Driver } from "neo4j-driver";
import { loadRootEnv, validateEnv } from "../../config/env";

type Migration = {
  name: string;
  path: string;
};

const migrationsDir = join(__dirname, "migrations");

function splitCypherStatements(text: string) {
  return text
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n")
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

function listMigrations(): Migration[] {
  if (!existsSync(migrationsDir)) {
    throw new Error(`Neo4j migrations directory does not exist: ${migrationsDir}`);
  }

  return readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".cypher"))
    .sort()
    .map((file) => ({
      name: basename(file, ".cypher"),
      path: join(migrationsDir, file),
    }));
}

async function retryVerifyConnectivity(driver: Driver) {
  const maxAttempts = 20;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await driver.verifyConnectivity();
      return;
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }
  }

  throw lastError;
}

async function hasApplied(driver: Driver, name: string) {
  const session = driver.session({ defaultAccessMode: neo4j.session.READ });
  try {
    const result = await session.run(
      "MATCH (m:Neo4jSchemaMigration {name: $name}) RETURN m.name AS name",
      { name },
    );
    return result.records.length > 0;
  } finally {
    await session.close();
  }
}

async function runStatement(driver: Driver, statement: string, params: Record<string, unknown> = {}) {
  const session = driver.session({ defaultAccessMode: neo4j.session.WRITE });
  try {
    await session.run(statement, params);
  } finally {
    await session.close();
  }
}

async function applyMigration(driver: Driver, migration: Migration) {
  if (await hasApplied(driver, migration.name)) {
    console.log(`[neo4j:migrate] skipped ${migration.name}`);
    return;
  }

  const statements = splitCypherStatements(readFileSync(migration.path, "utf8"));
  for (const statement of statements) {
    await runStatement(driver, statement);
  }

  await runStatement(
    driver,
    "MERGE (m:Neo4jSchemaMigration {name: $name}) SET m.appliedAt = datetime()",
    { name: migration.name },
  );
  console.log(`[neo4j:migrate] applied ${migration.name}`);
}

async function main() {
  loadRootEnv();
  const env = validateEnv(process.env);
  const driver = neo4j.driver(
    env.NEO4J_URI,
    neo4j.auth.basic(env.NEO4J_USER, env.NEO4J_PASSWORD),
  );

  try {
    await retryVerifyConnectivity(driver);
    await runStatement(
      driver,
      "CREATE CONSTRAINT neo4j_schema_migration_name IF NOT EXISTS FOR (m:Neo4jSchemaMigration) REQUIRE m.name IS UNIQUE",
    );

    const migrations = listMigrations();
    for (const migration of migrations) {
      await applyMigration(driver, migration);
    }
    console.log(`[neo4j:migrate] complete (${migrations.length} migration(s) checked)`);
  } finally {
    await driver.close();
  }
}

main().catch((error) => {
  console.error("[neo4j:migrate] failed");
  console.error(error);
  process.exit(1);
});
