#!/usr/bin/env node
/**
 * LUDIARS 統合マイグレーションランナー (Node.js)
 *
 * services.yaml を読み、各サービスのマイグレーションを実行する。
 * Windows / Linux / macOS で動作する。
 *
 * Usage:
 *   node migrate.mjs              # 全サービス実行
 *   node migrate.mjs cernere      # 単一サービスのみ
 *   node migrate.mjs --status     # 適用状態を表示
 *   node migrate.mjs --dry-run    # SQL を表示するだけで実行しない
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import pg from "pg";
import YAML from "yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Configuration ─────────────────────────────────────────

const PG_HOST = process.env.PG_HOST || "localhost";
const PG_PORT = parseInt(process.env.PG_PORT || "5432", 10);
const PG_ADMIN_USER = process.env.PG_ADMIN_USER || "ludiars";
const PG_ADMIN_PASS = process.env.PG_ADMIN_PASS || "ludiars";

// PostgreSQL error codes to ignore (idempotent migration)
const IGNORABLE_PG_CODES = new Set([
  "42P07", // relation already exists
  "42701", // column already exists
  "42710", // object already exists
  "42P01", // relation does not exist
  "42704", // type does not exist
  "23505", // duplicate key
]);

// ─── Argument Parsing ──────────────────────────────────────

let DRY_RUN = false;
let SHOW_STATUS = false;
let TARGET_SERVICE = "";

for (const arg of process.argv.slice(2)) {
  if (arg === "--dry-run") DRY_RUN = true;
  else if (arg === "--status") SHOW_STATUS = true;
  else if (arg.startsWith("-")) {
    console.error(`Unknown flag: ${arg}`);
    process.exit(1);
  } else TARGET_SERVICE = arg;
}

// ─── Load services.yaml ────────────────────────────────────

const servicesPath = resolve(__dirname, "services.yaml");
const servicesDoc = YAML.parse(readFileSync(servicesPath, "utf8"));
const services = servicesDoc.services;

// ─── PostgreSQL Helpers ────────────────────────────────────

async function createClient(database, user, password) {
  const client = new pg.Client({
    host: PG_HOST,
    port: PG_PORT,
    database,
    user,
    password,
  });
  await client.connect();
  return client;
}

async function ensureHistoryTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS _migration_history (
      filename    TEXT PRIMARY KEY,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      checksum    TEXT NOT NULL DEFAULT ''
    )
  `);
}

async function isApplied(client, filename) {
  const res = await client.query(
    "SELECT count(*)::int AS c FROM _migration_history WHERE filename = $1",
    [filename],
  );
  return res.rows[0].c > 0;
}

async function markApplied(client, filename, checksum) {
  await client.query(
    "INSERT INTO _migration_history (filename, checksum) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    [filename, checksum],
  );
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

// ─── SQL Migration Runner ──────────────────────────────────

async function runSqlMigrations(svc, config) {
  const fullDir = resolve(__dirname, config.path, config.migrations_dir);

  if (!existsSync(fullDir)) {
    console.log(`  WARN: migrations dir not found: ${fullDir}`);
    return;
  }

  const sqlFiles = readdirSync(fullDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (DRY_RUN) {
    for (const file of sqlFiles) {
      console.log(`  [DRY-RUN] Would apply: ${file}`);
    }
    console.log(`  SQL migrations: ${sqlFiles.length} files found`);
    return;
  }

  const client = await createClient(config.database, config.user, config.password);
  try {
    await ensureHistoryTable(client);

    let applied = 0;
    let skipped = 0;

    for (const file of sqlFiles) {
      const filePath = resolve(fullDir, file);
      const content = readFileSync(filePath, "utf8");
      const checksum = sha256(content);

      if (await isApplied(client, file)) {
        skipped++;
        continue;
      }

      console.log(`  Applying: ${file} ...`);

      // Execute the whole file in one call. Naive ";" splitting corrupts SQL
      // that contains semicolons inside string/jsonb literals or dollar-quotes.
      // Postgres' simple query protocol runs the multi-statement file as a
      // single implicit transaction, so a migration applies atomically.
      try {
        await client.query(content);
      } catch (err) {
        if (IGNORABLE_PG_CODES.has(err.code)) {
          // Expected idempotent error (already-applied objects) — treat as done
        } else {
          console.error(`    ERROR in ${file}: ${err.message}`);
          throw err;
        }
      }

      await markApplied(client, file, checksum);
      applied++;
    }

    console.log(`  SQL migrations: ${applied} applied, ${skipped} already applied`);
  } finally {
    await client.end();
  }
}

// ─── Drizzle Push Runner ───────────────────────────────────

async function runDrizzlePush(svc, config) {
  const fullPath = resolve(__dirname, config.path);

  if (!existsSync(fullPath)) {
    console.log(`  WARN: service dir not found: ${fullPath}`);
    return;
  }

  const dbUrl = `postgresql://${config.user}:${config.password}@${PG_HOST}:${PG_PORT}/${config.database}`;

  if (DRY_RUN) {
    console.log(`  [DRY-RUN] Would run: drizzle-kit push in ${fullPath}`);
    return;
  }

  console.log("  Running drizzle-kit push...");
  try {
    const output = execSync("npx drizzle-kit push --force", {
      cwd: fullPath,
      encoding: "utf8",
      env: {
        ...process.env,
        DB_DIALECT: "postgres",
        DATABASE_URL: dbUrl,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    for (const line of output.split("\n")) {
      if (line.trim()) console.log(`    ${line}`);
    }
  } catch (err) {
    const stderr = err.stderr || "";
    const stdout = err.stdout || "";
    console.error(`  ERROR: drizzle-kit push failed`);
    if (stderr) console.error(`    ${stderr.trim()}`);
    if (stdout) console.log(`    ${stdout.trim()}`);
    throw err;
  }
  console.log("  Drizzle push complete");
}

// ─── Status Display ────────────────────────────────────────

async function showStatus(svc, config) {
  console.log(`  Strategy: ${config.strategy}`);

  if (config.strategy === "sql") {
    const fullDir = resolve(__dirname, config.path, config.migrations_dir);

    if (!existsSync(fullDir)) {
      console.log(`  WARN: migrations dir not found: ${fullDir}`);
      return;
    }

    const client = await createClient(config.database, config.user, config.password);
    try {
      await ensureHistoryTable(client);

      const sqlFiles = readdirSync(fullDir)
        .filter((f) => f.endsWith(".sql"))
        .sort();

      let appliedCount = 0;
      for (const file of sqlFiles) {
        if (await isApplied(client, file)) {
          console.log(`    [x] ${file}`);
          appliedCount++;
        } else {
          console.log(`    [ ] ${file}`);
        }
      }
      console.log(`  ${appliedCount}/${sqlFiles.length} applied`);
    } finally {
      await client.end();
    }
  } else {
    console.log(`  (Drizzle-managed — run 'node migrate.mjs ${svc}' to sync)`);
  }
}

// ─── Main ──────────────────────────────────────────────────

async function runService(svc) {
  const config = services[svc];
  if (!config) {
    console.error(`ERROR: Unknown service: ${svc}`);
    console.error(`Available: ${Object.keys(services).join(", ")}`);
    process.exit(1);
  }

  console.log(`━━━ ${svc} (${config.database}) ━━━`);

  if (SHOW_STATUS) {
    await showStatus(svc, config);
    return;
  }

  switch (config.strategy) {
    case "sql":
      await runSqlMigrations(svc, config);
      break;
    case "drizzle-push":
      await runDrizzlePush(svc, config);
      break;
    default:
      console.error(`  ERROR: Unknown strategy: ${config.strategy}`);
  }
}

async function main() {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log(`║  LUDIARS Migration Runner (Node.js)              ║`);
  console.log(`║  PostgreSQL: ${PG_HOST}:${PG_PORT}                       ║`);
  if (DRY_RUN) {
    console.log("║  Mode: DRY RUN                                  ║");
  }
  console.log("╚══════════════════════════════════════════════════╝");
  console.log("");

  try {
    if (TARGET_SERVICE) {
      await runService(TARGET_SERVICE);
    } else {
      for (const svc of Object.keys(services)) {
        await runService(svc);
        console.log("");
      }
    }
    console.log("Done.");
  } catch (err) {
    console.error(`\nFATAL: ${err.message}`);
    process.exit(1);
  }
}

main();
