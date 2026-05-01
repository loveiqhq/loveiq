#!/usr/bin/env node
/**
 * Migration drift detector.
 *
 * Run via:  npm run check:migration-drift
 *
 * Why: in round 7 of the security review we discovered the
 * `payment_webhook_event_stripe_event_id_unique` constraint had been
 * committed to a migration file ~2 weeks earlier but never applied to the
 * live database. The fulfillment.ts code path was relying on that
 * constraint for atomic webhook idempotency. Repo file existed → ran "git
 * commit" → assumed it was live. It wasn't.
 *
 * This script greps every migration file for SQL artifacts (CREATE
 * FUNCTION, CREATE INDEX, ALTER TABLE ADD CONSTRAINT, ALTER TABLE ADD
 * COLUMN) and asks the live DB whether they exist. Any miss is flagged.
 *
 * Requires SUPABASE_DB_URL (Postgres connection string with service role
 * privileges). For local validation, run against a Supabase shadow branch.
 *
 * Exit codes:
 *   0 — all repo migrations match live DB
 *   1 — drift detected (caller is expected to investigate)
 *   2 — script error (bad config, can't reach DB)
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = "supabase/migrations";
const CONNECTION_ENV = "SUPABASE_DB_URL";

function listMigrationFiles() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

const FUNCTION_RE = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?(\w+)\s*\(/gi;
const INDEX_RE = /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s+ON/gi;
const CONSTRAINT_RE = /ALTER\s+TABLE\s+(?:public\.)?(\w+)\s+ADD\s+CONSTRAINT\s+(\w+)/gi;
const ADD_COLUMN_RE =
  /ALTER\s+TABLE\s+(?:public\.)?(\w+)\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/gi;

function extractArtifacts() {
  const artifacts = {
    functions: new Set(),
    indexes: new Set(),
    constraints: new Map(),
    columns: new Map(),
  };

  for (const file of listMigrationFiles()) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");

    for (const m of sql.matchAll(FUNCTION_RE)) artifacts.functions.add(m[1]);
    for (const m of sql.matchAll(INDEX_RE)) artifacts.indexes.add(m[1]);
    for (const m of sql.matchAll(CONSTRAINT_RE)) {
      artifacts.constraints.set(m[2], m[1]);
    }
    for (const m of sql.matchAll(ADD_COLUMN_RE)) {
      const key = `${m[1]}.${m[2]}`;
      artifacts.columns.set(key, { table: m[1], column: m[2] });
    }
  }

  // DROP statements may legitimately remove things — strip those.
  for (const file of listMigrationFiles()) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    for (const m of sql.matchAll(/DROP\s+FUNCTION\s+(?:IF\s+EXISTS\s+)?(?:public\.)?(\w+)/gi)) {
      // Don't remove from set — DROP-then-CREATE is fine; final state matters.
      void m;
    }
  }

  return artifacts;
}

async function fetchLiveState(client) {
  const fns = await client.query(`
    SELECT proname FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  `);
  const indexes = await client.query(`
    SELECT indexname FROM pg_indexes WHERE schemaname = 'public'
  `);
  const constraints = await client.query(`
    SELECT conname FROM pg_constraint con
    JOIN pg_namespace n ON n.oid = con.connamespace
    WHERE n.nspname = 'public'
  `);
  const columns = await client.query(`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'public'
  `);
  return {
    functions: new Set(fns.rows.map((r) => r.proname)),
    indexes: new Set(indexes.rows.map((r) => r.indexname)),
    constraints: new Set(constraints.rows.map((r) => r.conname)),
    columns: new Set(columns.rows.map((r) => `${r.table_name}.${r.column_name}`)),
  };
}

async function main() {
  const url = process.env[CONNECTION_ENV];
  if (!url) {
    console.error(
      `\n${CONNECTION_ENV} not set. To run drift check, export a Postgres connection string with service-role privileges, e.g.:\n  export ${CONNECTION_ENV}="postgres://postgres.<project-ref>:<password>@aws-0-eu-central-2.pooler.supabase.com:5432/postgres"\n`
    );
    process.exit(2);
  }

  let pgImport;
  try {
    pgImport = await import("pg");
  } catch {
    console.error("Module 'pg' not installed. Add to devDependencies:\n  npm i -D pg @types/pg\n");
    process.exit(2);
  }

  const { Client } = pgImport.default ?? pgImport;
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const repo = extractArtifacts();
    const live = await fetchLiveState(client);

    const drift = {
      functions: [...repo.functions].filter((n) => !live.functions.has(n)),
      indexes: [...repo.indexes].filter((n) => !live.indexes.has(n)),
      constraints: [...repo.constraints.keys()].filter((n) => !live.constraints.has(n)),
      columns: [...repo.columns.keys()].filter((n) => !live.columns.has(n)),
    };

    const total =
      drift.functions.length +
      drift.indexes.length +
      drift.constraints.length +
      drift.columns.length;

    if (total === 0) {
      console.log("✅ No migration drift — repo files match live DB.");
      process.exit(0);
    }

    console.error("❌ Migration drift detected — these artifacts exist in repo but NOT live:\n");
    if (drift.functions.length) console.error("  Functions:", drift.functions.join(", "));
    if (drift.indexes.length) console.error("  Indexes:", drift.indexes.join(", "));
    if (drift.constraints.length) console.error("  Constraints:", drift.constraints.join(", "));
    if (drift.columns.length) console.error("  Columns:", drift.columns.join(", "));
    console.error(
      "\nApply via `supabase db push` or the Supabase dashboard. See round 7 retro: an unapplied UNIQUE constraint silently re-opened a webhook idempotency race.\n"
    );
    process.exit(1);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Drift check failed:", err.message);
  process.exit(2);
});
