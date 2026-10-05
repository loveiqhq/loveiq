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
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THIS SCRIPT IS NOT IN CI, AND THAT COST SOMETHING. Audited 2026-08-27 and the
 * repo had drifted nine ways since 26 July:
 *
 *   - 4 files whose version stamp disagreed with the ledger row for the same
 *     migration. Cause is mechanical and will recur: applying SQL through the
 *     Supabase MCP `apply_migration` stamps the version with the wall clock,
 *     while the file gets written with a round timestamp. The file must be
 *     RENAMED to the ledger's version afterwards. Fixed by renaming.
 *   - 3 files with no ledger row at all — so `supabase db push` from this repo
 *     would have re-run them. Two are DML re-syncs that rewrite every unpurchased
 *     report_price_quote, and 20260727130000 re-syncs to the pricing 2.0 catalogue
 *     where arm A was the LOW arm. Live quotes are on 2.1 (A 39.99 vs B 29 on
 *     full_report, verified), so a push would have silently reverted the price
 *     test to superseded numbers. Fixed by recording them as applied.
 *   - 2 ledger rows with no file — `arm_cohorts_by_axis` and
 *     `slack_journey_message_question_count`, applied straight to production and
 *     never committed. This is the direction that breaks disaster recovery: prod
 *     had them, any environment rebuilt from this repo would not. Fixed by
 *     recovering both files from `pg_get_functiondef` / the live column set.
 *
 * None of that threw, no test failed, and nothing in `npm run check` looks at it —
 * `check` is lint + test + docs + build, and this script is not in that chain
 * because it needs a live connection. Wiring it into CI needs `SUPABASE_DB_URL`
 * added as a GitHub secret, which is a human action; until then this only runs when
 * someone remembers to. `scripts/check-migrations.ts` DOES run offline and catches
 * duplicate versions and malformed filenames, but it cannot see the ledger.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const MIGRATIONS_DIR = "supabase/migrations";
const CONNECTION_ENV = "SUPABASE_DB_URL";

function listMigrationFiles() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

const FUNCTION_RE = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?(\w+)\s*\(/gi;
const INDEX_RE =
  /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s+ON\s+(?:ONLY\s+)?(?:public\.)?(\w+)/gi;
/**
 * A dropped TABLE takes its indexes, columns and constraints with it.
 *
 * Without this, `CREATE INDEX` in an early migration and `DROP TABLE` in a
 * later one leaves the index in the repo set for ever, and the check reports
 * a deliberate removal as drift — the exact cry-wolf failure that kept this
 * job switched off. Measured 2026-09-19: calendly_webhook_event, dropped on
 * 2026-09-14 along with its route, was the only finding once CONCURRENTLY
 * indexes became visible at all.
 */
const DROP_TABLE_RE = /DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:public\.)?(\w+)/gi;
/**
 * Anchored to the start of a line, unlike the others: "CREATE TABLE" appears in
 * prose often enough that the loose form picks up a table called `rather` from
 * "every NOT NULL is inside CREATE TABLE rather than ADD COLUMN".
 *
 * Tables were the last thing this check could not see. 10 of the repo's 83 —
 * admin_users, survey_question, system_flags, user_profile among them — carry no
 * index, ADD CONSTRAINT or ADD COLUMN of their own, so their absence from live
 * produced no drift of any other kind. calendly_webhook_event was only ever
 * caught through one index it happened to have.
 */
const TABLE_RE = /^[ \t]*CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?(\w+)/gim;
const CONSTRAINT_RE = /ALTER\s+TABLE\s+(?:public\.)?(\w+)\s+ADD\s+CONSTRAINT\s+(\w+)/gi;
const DROP_FUNCTION_RE = /DROP\s+FUNCTION\s+(?:IF\s+EXISTS\s+)?(?:public\.)?(\w+)/gi;
const DROP_INDEX_RE = /DROP\s+INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+EXISTS\s+)?(?:public\.)?(\w+)/gi;
const DROP_CONSTRAINT_RE =
  /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:public\.)?(\w+)\s+DROP\s+CONSTRAINT\s+(?:IF\s+EXISTS\s+)?(\w+)/gi;
const DROP_COLUMN_RE =
  /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:public\.)?(\w+)\s+DROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?(\w+)/gi;
const ADD_COLUMN_RE =
  /ALTER\s+TABLE\s+(?:public\.)?(\w+)\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/gi;

/**
 * @param {{file: string, sql: string}[]} [files] in-memory migrations, for tests.
 *   Omitted, it reads the real migrations directory.
 */
export function extractArtifacts(files) {
  const artifacts = {
    functions: new Set(),
    tables: new Set(),
    indexes: new Map(),
    constraints: new Map(),
    columns: new Map(),
  };

  /**
   * Replay CREATEs and DROPs in order, so this is the FINAL state the repo
   * declares — not everything it ever created.
   *
   * It used to add every CREATE and deliberately ignore every DROP, reasoning
   * that "DROP-then-CREATE is fine; final state matters". True inside one file,
   * false across files: an artifact dropped by a LATER migration and never
   * recreated is gone on purpose, and this reported it as drift for ever.
   * Measured 2026-09-19 that was 13 of 13 findings — twelve
   * admin_submission_facts_*_lower_idx indexes dropped by
   * 20260831184946_drop_unused_admin_facts_filter_indexes, and
   * add_unlocked_archetype, dropped in favour of a different signature. All
   * correctly absent from production. A checker that cries wolf on every
   * deliberate removal is one nobody can ever switch on, which is exactly what
   * happened: the job gated itself off and stayed green for months.
   *
   * Ordered by position WITHIN each file too, so `DROP x; CREATE x;` still ends
   * with x present.
   */
  const source =
    files ??
    listMigrationFiles().map((file) => ({
      file,
      sql: readFileSync(join(MIGRATIONS_DIR, file), "utf8"),
    }));
  for (const { sql } of source) {
    const ops = [];
    const collect = (re, apply) => {
      for (const m of sql.matchAll(re)) ops.push({ at: m.index ?? 0, apply: () => apply(m) });
    };
    collect(FUNCTION_RE, (m) => artifacts.functions.add(m[1]));
    collect(TABLE_RE, (m) => artifacts.tables.add(m[1].toLowerCase()));
    collect(INDEX_RE, (m) => artifacts.indexes.set(m[1], m[2].toLowerCase()));
    collect(CONSTRAINT_RE, (m) => artifacts.constraints.set(m[2], m[1]));
    collect(ADD_COLUMN_RE, (m) =>
      artifacts.columns.set(`${m[1]}.${m[2]}`, { table: m[1], column: m[2] })
    );
    collect(DROP_FUNCTION_RE, (m) => artifacts.functions.delete(m[1]));
    collect(DROP_INDEX_RE, (m) => artifacts.indexes.delete(m[1]));
    collect(DROP_CONSTRAINT_RE, (m) => artifacts.constraints.delete(m[2]));
    collect(DROP_COLUMN_RE, (m) => artifacts.columns.delete(`${m[1]}.${m[2]}`));
    collect(DROP_TABLE_RE, (m) => {
      const table = m[1].toLowerCase();
      artifacts.tables.delete(table);
      for (const [name, onTable] of artifacts.indexes) {
        if (onTable === table) artifacts.indexes.delete(name);
      }
      for (const [name, onTable] of artifacts.constraints) {
        if (onTable.toLowerCase() === table) artifacts.constraints.delete(name);
      }
      for (const [key, col] of artifacts.columns) {
        if (col.table.toLowerCase() === table) artifacts.columns.delete(key);
      }
    });
    ops.sort((a, b) => a.at - b.at);
    for (const op of ops) op.apply();
  }

  return artifacts;
}

async function fetchLiveState(client) {
  const fns = await client.query(`
    SELECT proname FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  `);
  const ownFns = await client.query(`
    SELECT DISTINCT p.proname FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
         WHERE d.objid = p.oid AND d.classid = 'pg_proc'::regclass AND d.deptype = 'e')
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
    tables: new Set(columns.rows.map((r) => r.table_name.toLowerCase())),
    ownFunctions: new Set(ownFns.rows.map((r) => r.proname)),
  };
}

/**
 * Compare the migration LEDGER to the filenames.
 *
 * The artifact check above asks "is everything the repo declares actually live".
 * This asks a different question the repo had no check for: does
 * `supabase_migrations.schema_migrations` agree with the files on disk? It went
 * wrong three separate times in one day — once as two files sharing a version
 * (a security migration ended up with no row at all), and twice as a migration
 * applied by name so the tool clock-stamped a version the filename does not
 * have. Nothing caught any of them, because `check-migrations` only ever
 * compares filenames to each other and never reaches the database.
 *
 * The failure it prevents is quiet: `supabase db push` from a clean checkout
 * decides what to apply from these versions, so a mismatched pair is either an
 * out-of-order refusal or a migration that silently never runs.
 */
function checkLedger(rows) {
  const ledgerByName = new Map(rows.map((r) => [r.name, r.version]));
  const fileByName = new Map();
  for (const f of listMigrationFiles()) {
    const base = f.replace(/\.sql$/, "");
    const idx = base.indexOf("_");
    if (idx > 0) fileByName.set(base.slice(idx + 1), base.slice(0, idx));
  }

  const mismatched = [];
  const missingRow = [];
  const missingFile = [];
  for (const [name, fileVersion] of fileByName) {
    const ledgerVersion = ledgerByName.get(name);
    if (!ledgerVersion) missingRow.push(`${fileVersion}_${name}`);
    else if (ledgerVersion !== fileVersion)
      mismatched.push(`${name}: file ${fileVersion} vs ledger ${ledgerVersion}`);
  }
  for (const [name, ledgerVersion] of ledgerByName) {
    if (!fileByName.has(name)) missingFile.push(`${ledgerVersion}_${name}`);
  }
  return { mismatched, missingRow, missingFile };
}

/**
 * The live state WITHOUT a Postgres connection string.
 *
 * This job gated on SUPABASE_DB_URL and therefore never ran — a job whose only
 * step is skipped still reports success, so it was green and blind on every
 * commit. Setting that secret would work, but it is a full read-write
 * connection to production sitting in every workflow run, for five read-only
 * catalogue queries. `get_schema_artifacts()` returns exactly those five
 * results through PostgREST, using the service-role key that is already a
 * repository secret.
 */
async function fetchViaRpc(supabaseUrl, serviceKey) {
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/get_schema_artifacts`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  if (!res.ok) {
    throw new Error(
      `get_schema_artifacts returned ${res.status}. The RPC ships in ` +
        `supabase/migrations/20260919270000_schema_artifacts_for_drift_check.sql — ` +
        `apply it, or set ${CONNECTION_ENV} to use a direct connection instead.`
    );
  }
  const a = await res.json();
  for (const k of ["functions", "indexes", "constraints", "columns", "ledger"]) {
    if (!Array.isArray(a?.[k]))
      throw new Error(`get_schema_artifacts: '${k}' missing or not an array`);
  }
  // An empty catalogue means the read failed, not that the schema is empty —
  // never let that read as "no drift".
  if (a.functions.length === 0 || a.columns.length === 0) {
    throw new Error("get_schema_artifacts returned an empty schema — refusing to report no drift");
  }
  return {
    live: {
      functions: new Set(a.functions),
      indexes: new Set(a.indexes),
      constraints: new Set(a.constraints),
      columns: new Set(a.columns),
      tables: new Set(a.columns.map((c) => c.split(".")[0].toLowerCase())),
      /**
       * NOT `?? []`. An absent key would make the reverse check compare against
       * an empty set, report zero, and pass — the silent-skip failure this whole
       * job exists to avoid. If the RPC predates 20260919280000, say so and stop.
       */
      ownFunctions: new Set(
        a.ownFunctions ??
          (() => {
            console.error(
              "\nget_schema_artifacts() returned no `ownFunctions`. The reverse check " +
                "cannot run,\nand reporting zero would be a false pass. Apply " +
                "20260919280000_schema_artifacts_add_own_functions.sql.\n"
            );
            process.exit(2);
          })()
      ),
    },
    ledgerRows: a.ledger,
  };
}

async function fetchViaPostgres(url) {
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
    const live = await fetchLiveState(client);
    const { rows } = await client.query(
      "SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version"
    );
    return { live, ledgerRows: rows };
  } finally {
    await client.end();
  }
}

/** Known, pre-existing ledger discrepancies. Empty when the file is absent. */
function loadBaseline() {
  try {
    return JSON.parse(readFileSync("scripts/migration-drift-baseline.json", "utf8"));
  } catch {
    return { mismatched: [], missingRow: [], missingFile: [] };
  }
}

async function main() {
  const url = process.env[CONNECTION_ENV];
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  /**
   * Two ways in, and NEITHER is optional.
   *
   * This used to exit(2) with advice when the connection string was absent, and
   * the CI job turned that into a skip — so the check reported success while
   * reading nothing, on every commit since it was written. There is no longer a
   * quiet path: with no source at all it fails.
   */
  let source;
  if (url) {
    source = await fetchViaPostgres(url);
  } else if (supabaseUrl && serviceKey) {
    source = await fetchViaRpc(supabaseUrl, serviceKey);
  } else {
    console.error(
      `\nNo way to read the live schema. Set EITHER:\n` +
        `  SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY  (preferred — read-only RPC, no DB password)\n` +
        `  ${CONNECTION_ENV}                          (direct Postgres connection)\n`
    );
    process.exit(2);
  }

  {
    const { live, ledgerRows } = source;
    const repo = extractArtifacts();

    /**
     * The REVERSE direction: what production has that no migration can rebuild.
     *
     * Everything else here asks "does live have what the repo declares". This
     * asks the opposite, and it is the one that decides whether this repo can
     * stand up a database at all — for a staging environment, or for disaster
     * recovery.
     *
     * Nothing checked it until 2026-09-20, and the answer was no. Five
     * functions and four tables existed only in production, so a push into an
     * empty project stopped dead at 20260329231617_admin_security_hardening,
     * which does `RAISE EXCEPTION 'Function not found: %'` over a list that
     * includes three of them. Captured in
     * 20260307095959_objects_that_predate_the_migration_history.sql.
     *
     * Extension-provided functions are excluded via `ownFunctions` — 149 of the
     * 230 in `public` come from pgvector and pg_trgm and are never declared by
     * a migration, so including them would bury the real finding in noise.
     */
    const unrebuildable = {
      functions: [...live.ownFunctions].filter((n) => !repo.functions.has(n)).sort(),
      tables: [...live.tables].filter((n) => !repo.tables.has(n)).sort(),
    };

    const drift = {
      functions: [...repo.functions].filter((n) => !live.functions.has(n)),
      tables: [...repo.tables].filter((n) => !live.tables.has(n)),
      indexes: [...repo.indexes.keys()].filter((n) => !live.indexes.has(n)),
      constraints: [...repo.constraints.keys()].filter((n) => !live.constraints.has(n)),
      columns: [...repo.columns.keys()].filter((n) => !live.columns.has(n)),
    };

    /**
     * The ledger backlog is GRANDFATHERED, the way check-migrations already
     * grandfathers old migration files.
     *
     * This job has never run, so 127 ledger discrepancies accumulated unseen:
     * ~78 version stamps that disagree with their filename (what applying
     * through the Supabase MCP produces when the file is not renamed after), 21
     * files with no ledger row, 28 rows with no file. Every one predates this
     * check. Failing on them would mean the job goes red on its first run and
     * gets switched off again, which is how it ended up gated off in the first
     * place.
     *
     * So: everything already in the baseline is REPORTED and does not fail.
     * Anything new fails. Fixing a baselined entry and deleting its line is a
     * ratchet — it can never come back silently.
     *
     * Artifact drift (functions, indexes, constraints, columns) is NOT
     * grandfathered: it is currently zero and stays enforced.
     */
    const rawLedger = checkLedger(ledgerRows);
    const baseline = loadBaseline();
    const isNew = (kind, entry) => !baseline[kind]?.includes(entry);
    const ledger = {
      mismatched: rawLedger.mismatched.filter((m) => isNew("mismatched", m)),
      missingRow: rawLedger.missingRow.filter((m) => isNew("missingRow", m)),
      missingFile: rawLedger.missingFile.filter((m) => isNew("missingFile", m)),
    };
    const known =
      rawLedger.mismatched.length +
      rawLedger.missingRow.length +
      rawLedger.missingFile.length -
      (ledger.mismatched.length + ledger.missingRow.length + ledger.missingFile.length);
    if (known > 0) {
      console.log(
        `ℹ️  ${known} pre-existing ledger discrepancies are grandfathered ` +
          `(scripts/migration-drift-baseline.json). Fix one and delete its line to ratchet.`
      );
    }
    const ledgerTotal =
      ledger.mismatched.length + ledger.missingRow.length + ledger.missingFile.length;

    const total =
      drift.functions.length +
      drift.tables.length +
      drift.indexes.length +
      drift.constraints.length +
      drift.columns.length;

    if (ledgerTotal > 0) {
      console.error("⚠️  Migration LEDGER does not match the files on disk:\n");
      for (const m of ledger.mismatched) console.error(`  version mismatch  ${m}`);
      for (const m of ledger.missingRow) console.error(`  file, no ledger row  ${m}`);
      for (const m of ledger.missingFile) console.error(`  ledger row, no file  ${m}`);
      console.error(
        "\nA mismatched pair makes `supabase db push` from a clean checkout either refuse\n" +
          "(out-of-order) or skip the migration entirely. Fix the LEDGER to match the\n" +
          "filename — it is metadata, so no DDL re-runs:\n" +
          "  UPDATE supabase_migrations.schema_migrations SET version = '<from filename>'\n" +
          "   WHERE name = '<name>';\n"
      );
    }

    const unrebuildableTotal = unrebuildable.functions.length + unrebuildable.tables.length;
    if (unrebuildableTotal > 0) {
      console.error(
        `\n❌ ${unrebuildableTotal} object(s) exist in PRODUCTION that no migration creates —\n` +
          `   this repo cannot rebuild the database (staging, db reset, disaster recovery):\n`
      );
      if (unrebuildable.functions.length)
        console.error("  Functions:", unrebuildable.functions.join(", "));
      if (unrebuildable.tables.length) console.error("  Tables:", unrebuildable.tables.join(", "));
      console.error(
        `\nCapture the LIVE definition into a migration — pg_get_functiondef and\n` +
          `pg_get_constraintdef, written straight to the file, never retyped. Date it\n` +
          `before the first migration that references it, and insert a ledger row so\n` +
          `production skips it. See 20260307095959_objects_that_predate_the_migration_history.sql.\n`
      );
      process.exit(1);
    }

    if (total === 0 && ledgerTotal === 0) {
      console.log("✅ No migration drift — repo files match live DB, ledger matches filenames.");
      process.exit(0);
    }
    if (total === 0) process.exit(1);

    console.error("❌ Migration drift detected — these artifacts exist in repo but NOT live:\n");
    if (drift.functions.length) console.error("  Functions:", drift.functions.join(", "));
    if (drift.tables.length) console.error("  Tables:", drift.tables.join(", "));
    if (drift.indexes.length) console.error("  Indexes:", drift.indexes.join(", "));
    if (drift.constraints.length) console.error("  Constraints:", drift.constraints.join(", "));
    if (drift.columns.length) console.error("  Columns:", drift.columns.join(", "));
    console.error(
      "\nApply via `supabase db push` or the Supabase dashboard. See round 7 retro: an unapplied UNIQUE constraint silently re-opened a webhook idempotency race.\nThis check is the guard for payment_webhook_event_stripe_event_id_unique — the integration test that used to assert it needed a paid Supabase branch and never once ran.\n"
    );
    process.exit(1);
  }
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main().catch((err) => {
    console.error("Drift check failed:", err.message);
    process.exit(2);
  });
}
