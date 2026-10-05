#!/usr/bin/env node
/**
 * No migration may touch a table that a LATER migration creates.
 *
 * Production never notices: it applies migrations as they are written, when the
 * dependency genuinely already exists. A REPLAY into an empty database applies
 * them in filename order, and a file that runs too early aborts the whole push.
 *
 * Found on 2026-09-20 by the first replay this repo has ever had:
 * 20260531120000_chapter_nudge_flag INSERTed into system_flags, which by then
 * lived at 20260531131852 — eleven hours later in sort order. The break was
 * introduced by renaming system_flags to the version its LEDGER row carried
 * (correct in itself), which moved it past a file that depends on it. The
 * order check at the time only looked for file-version crossings inside a
 * window, so it could not see a semantic dependency at all.
 *
 * Known limitation, deliberately not "fixed": a reference inside a plpgsql
 * function body is reported too. Those are safe — plpgsql bodies are not
 * resolved until first call, which is exactly why the capture migration can
 * create functions before their tables exist. They are allow-listed by file
 * rather than by guessing at SQL scope, because a regex cannot reliably tell a
 * function body from a statement.
 */
import { readFileSync, readdirSync } from "node:fs";

const MIGRATIONS_DIR = "supabase/migrations";

/**
 * Files whose references live inside plpgsql bodies, resolved at call time.
 * Add a file here only after checking every function in it is LANGUAGE plpgsql.
 */
const BODY_ONLY_REFERENCES = new Set([
  "20260307095959_objects_that_predate_the_migration_history.sql",
]);

const CREATE_TABLE_RE = /^[ \t]*CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?(\w+)/gim;
const USE_RE =
  /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|ALTER\s+TABLE(?:\s+IF\s+EXISTS)?|REFERENCES|JOIN|FROM)\s+(?:public\.)?(\w+)/gi;

export function findOutOfOrder(files, read) {
  const createdIn = new Map();
  for (const file of files)
    for (const m of read(file).matchAll(CREATE_TABLE_RE)) {
      const t = m[1].toLowerCase();
      if (!createdIn.has(t)) createdIn.set(t, file);
    }

  const findings = [];
  for (const file of files) {
    if (BODY_ONLY_REFERENCES.has(file)) continue;
    const sql = read(file).replace(/--[^\n]*/g, "");
    const seen = new Set();
    for (const m of sql.matchAll(USE_RE)) {
      const table = m[1].toLowerCase();
      if (seen.has(table)) continue;
      const owner = createdIn.get(table);
      if (owner && owner > file) {
        seen.add(table);
        findings.push({
          file,
          table,
          createdIn: owner,
          line: sql.slice(0, m.index).split("\n").length,
        });
      }
    }
  }
  return findings;
}

if (
  process.argv[1] &&
  import.meta.url === (await import("node:url")).pathToFileURL(process.argv[1]).href
) {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const findings = findOutOfOrder(files, (f) => readFileSync(`${MIGRATIONS_DIR}/${f}`, "utf8"));
  if (findings.length === 0) {
    console.log(`✅ Migration order: ${files.length} files, none touches a table created later.`);
    process.exit(0);
  }
  console.error(
    `\n❌ ${findings.length} migration(s) touch a table created LATER — a replay into an\n   empty database would abort here:\n`
  );
  for (const f of findings)
    console.error(`  ${f.file}:${f.line}\n      uses ${f.table}, created in ${f.createdIn}`);
  console.error(
    `\nRenumber the dependent file to sort after the one that creates the table, and\nmove its ledger row to match. If the reference is inside a plpgsql body it is\nsafe — add the file to BODY_ONLY_REFERENCES with that stated.\n`
  );
  process.exit(1);
}
