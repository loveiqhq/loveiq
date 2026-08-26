#!/usr/bin/env tsx
/**
 * F-13: Migration safety lint.
 *
 * Scans `supabase/migrations/*.sql` for patterns that are dangerous on a
 * live, non-trivial-sized table:
 *   - CREATE INDEX without CONCURRENTLY     (blocks the table)
 *   - ADD COLUMN NOT NULL without DEFAULT    (rewrites the table)
 *   - DROP COLUMN that doesn't look orphaned (data loss)
 *
 * Exits non-zero on any finding so CI can gate merges.
 *
 * Existing migrations are grandfathered: only files whose timestamp prefix is
 * >= CUTOFF_TIMESTAMP get checked. Bump the cutoff after a deliberate clean-up
 * pass. Per-file opt-out (when the cutoff catches a justified exception): the
 * SQL comment `-- migration-lint: ignore` anywhere in the file disables ALL
 * rules for that file. Use sparingly and justify in the PR.
 *
 * Run:
 *   npx tsx scripts/check-migrations.ts
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, extname } from "node:path";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

// Migrations created on/after this timestamp are enforced. Migrations before
// were already applied to prod and are not worth retroactive churn.
const CUTOFF_TIMESTAMP = "20260525120000";

interface Finding {
  file: string;
  rule: string;
  line: number;
  excerpt: string;
}

function lintFile(path: string, contents: string): Finding[] {
  const findings: Finding[] = [];
  const lower = contents.toLowerCase();

  if (lower.includes("-- migration-lint: ignore")) return findings;

  const lines = contents.split(/\r?\n/);
  // Track multi-line statements crudely by walking until the next semicolon.
  let stmtStart = 0;
  let stmtBuf = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (stmtBuf.length === 0) stmtStart = i;
    stmtBuf += " " + line;

    if (line.includes(";")) {
      const stmt = stmtBuf.toLowerCase().replace(/\s+/g, " ").trim();

      if (/\bcreate\s+(unique\s+)?index\b/.test(stmt) && !/\bconcurrently\b/.test(stmt)) {
        findings.push({
          file: path,
          rule: "CREATE INDEX without CONCURRENTLY",
          line: stmtStart + 1,
          excerpt: stmt.slice(0, 120),
        });
      }

      if (
        /\badd\s+column\b/.test(stmt) &&
        /\bnot\s+null\b/.test(stmt) &&
        !/\bdefault\b/.test(stmt) &&
        !/\bif\s+not\s+exists\b/.test(stmt)
      ) {
        // Heuristic: ADD COLUMN ... NOT NULL without DEFAULT and not behind
        // IF NOT EXISTS is the classic "rewrites the entire table" footgun.
        findings.push({
          file: path,
          rule: "ADD COLUMN NOT NULL without DEFAULT",
          line: stmtStart + 1,
          excerpt: stmt.slice(0, 120),
        });
      }

      if (/\bdrop\s+column\b/.test(stmt)) {
        findings.push({
          file: path,
          rule: "DROP COLUMN (data loss — verify column is unread by deployed code)",
          line: stmtStart + 1,
          excerpt: stmt.slice(0, 120),
        });
      }

      stmtBuf = "";
    }
  }

  return findings;
}

function main(): void {
  let files: string[];
  try {
    files = readdirSync(MIGRATIONS_DIR).filter((f) => extname(f) === ".sql");
  } catch (err) {
    console.error(`check-migrations: cannot read ${MIGRATIONS_DIR}: ${(err as Error).message}`);
    process.exit(2);
  }

  // Two files sharing a version prefix is not cosmetic: `supabase_migrations`
  // keys by version, so a replay onto a fresh branch (or a DR restore) applies
  // one and silently considers the other done. That happened once with a
  // security migration revoking anonymous EXECUTE, which would have come back.
  const byVersion = new Map<string, string[]>();
  for (const f of files) {
    const version = f.split("_")[0] ?? "";
    byVersion.set(version, [...(byVersion.get(version) ?? []), f]);
  }
  const collisions = [...byVersion.entries()].filter(([, group]) => group.length > 1);
  if (collisions.length > 0) {
    console.error(`check-migrations: duplicate migration version(s):\n`);
    for (const [version, group] of collisions) {
      console.error(`  ${version}\n${group.map((f) => `    ${f}`).join("\n")}\n`);
    }
    console.error(`Renumber the newer file — only one can own a version.`);
    process.exit(1);
  }

  const enforced = files.filter((f) => {
    const ts = f.split("_")[0] ?? "";
    return ts >= CUTOFF_TIMESTAMP;
  });

  const allFindings: Finding[] = [];
  for (const f of enforced) {
    const full = join(MIGRATIONS_DIR, f);
    const contents = readFileSync(full, "utf8");
    allFindings.push(...lintFile(f, contents));
  }

  if (allFindings.length === 0) {
    console.log(
      `check-migrations: clean (${enforced.length} enforced; ${files.length - enforced.length} grandfathered)`
    );
    return;
  }

  console.error(`check-migrations: ${allFindings.length} finding(s):\n`);
  for (const f of allFindings) {
    console.error(`  ${f.file}:${f.line}  [${f.rule}]`);
    console.error(`    ${f.excerpt}\n`);
  }
  console.error(`Fix or add "-- migration-lint: ignore" to the file with PR justification.`);
  process.exit(1);
}

main();
