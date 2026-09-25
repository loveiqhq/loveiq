#!/usr/bin/env node
/**
 * Every PostgREST column reference in the codebase — `select=`, a filter, or
 * `order=` — must name a column that exists live.
 *
 * PostgREST answers an unknown column with `400 column <t>.<c> does not exist`,
 * and almost every caller here turns a failed fetch into a neutral value — 0,
 * null, an empty array — so the metric reads as "no data" instead of "broken".
 * Nothing else catches it: TypeScript types the response shape we *assert*, not
 * the one the database returns, and a mocked fetch in a unit test happily
 * replies to a query the real API would reject.
 *
 * Found on 2026-09-19, all three live in production and all three silent:
 *   email_suppression.id          digest reported 0 unsubscribes; real answer 94
 *   survey_question.question_text admin scorecard 500'd on every load
 *   payment.survey_submission_id  median time-to-purchase always null
 *
 * Scope: literal select lists only. A list built with a template expression or
 * `*` is skipped and counted — this is a lint, not a type system. Embedded
 * resources (`rel(a,b)`, `rel!fk_hint(a,b)`) are stripped with balanced-paren
 * scanning, not a regex, because the naive version invents columns called `)`.
 *
 * Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY. Exits 2 without them, rather
 * than passing — a check that skips silently is how the drift lane stayed green
 * for months while reading nothing.
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { pathToFileURL } from "node:url";

/** Drop every `rel(...)` / `rel!hint(...)` embed, honouring nested parens. */
export function stripEmbeds(select) {
  let out = "";
  let depth = 0;
  for (const c of select) {
    if (c === "(") {
      if (depth === 0) out = out.replace(/[\w!]+$/, "");
      depth++;
      continue;
    }
    if (c === ")") {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth === 0) out += c;
  }
  return out;
}

/**
 * @param {string[]} files
 * @param {Map<string, Set<string>>} liveColumns table -> its live column names
 * @param {(f: string) => string} [read]
 * @returns {{
 *   findings: {file: string, line: number, table: string, column: string}[],
 *   checked: number,
 *   skipped: number,
 * }}
 */
export function findBadColumns(files, liveColumns, read = (f) => readFileSync(f, "utf8")) {
  const RE = /\/rest\/v1\/(\w+)\?([^`"'\n]*)/g;
  /** PostgREST query parameters that are not column names. */
  const RESERVED = new Set([
    "select",
    "order",
    "limit",
    "offset",
    "and",
    "or",
    "not",
    "on_conflict",
    "columns",
  ]);
  const findings = [];
  let checked = 0;
  let skipped = 0;
  for (const file of files) {
    const lines = read(file).split("\n");
    for (const [i, line] of lines.entries()) {
      for (const m of line.matchAll(RE)) {
        const table = m[1];
        const columns = liveColumns.get(table);
        if (!columns) {
          skipped++;
          continue;
        }
        const note = (column) => findings.push({ file, line: i + 1, table, column });

        /**
         * Filters and order= reject an unknown column exactly like select does.
         * survey_submission.app_user_id sat in the GDPR export AND erasure paths
         * — the column is user_id — so a data export silently omitted every
         * submission and an erasure skipped everything linked to one.
         */
        for (const part of m[2].split("&")) {
          const eq = part.indexOf("=");
          if (eq < 1) continue;
          const key = part.slice(0, eq);
          const value = part.slice(eq + 1);
          if (key === "order") {
            if (value.includes("${")) {
              skipped++;
              continue;
            }
            for (const seg of value.split(",")) {
              const c = seg.split(".")[0].trim();
              if (!c || c.includes("${")) {
                skipped++;
                continue;
              }
              checked++;
              if (!columns.has(c)) note(c);
            }
            continue;
          }
          if (RESERVED.has(key)) continue;
          // `col->>key` / `col->key` filter a JSONB path; only the base column
          // has to exist, and the key inside it is data, not schema.
          const base = key.split("->")[0].trim();
          if (!base || base.includes("${") || base.includes("(") || base.includes(".")) {
            skipped++;
            continue;
          }
          checked++;
          if (!columns.has(base)) note(base);
        }

        const select = m[2].match(/select=([^&]*)/);
        if (!select) continue;
        if (select[1].includes("${") || select[1].includes("*")) {
          skipped++;
          continue;
        }
        for (const raw of stripEmbeds(select[1]).split(",")) {
          // `out:col->>key` reads a JSONB path: as with a filter, only the base column is
          // schema. A `::type` cast is not part of the name either.
          const column = raw
            .trim()
            .replace(/^\w+:(?!:)/, "")
            .split("->")[0]
            .split("::")[0]
            .trim();
          if (!column || column.includes(".")) continue;
          checked++;
          if (!columns.has(column)) findings.push({ file, line: i + 1, table, column });
        }
      }
    }
  }
  return { findings, checked, skipped };
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "\ncheck-postgrest-columns: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required.\n"
    );
    process.exit(2);
  }

  const res = await fetch(`${url}/rest/v1/rpc/get_schema_artifacts`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: "{}",
  });
  if (!res.ok) {
    console.error(`check-postgrest-columns: schema read failed (HTTP ${res.status})`);
    process.exit(2);
  }
  const live = new Map();
  for (const entry of (await res.json()).columns) {
    const [table, column] = entry.split(".");
    if (!live.has(table)) live.set(table, new Set());
    live.get(table).add(column);
  }

  const files = execSync(
    `grep -rl "rest/v1/" app features shared scripts --include=*.ts --include=*.tsx 2>/dev/null || true`,
    { encoding: "utf8", shell: "/bin/bash" }
  )
    .trim()
    .split("\n")
    .filter(Boolean)
    .filter((f) => !/\.test\.|\/tests\//.test(f));

  const { findings, checked, skipped } = findBadColumns(files, live);

  if (findings.length === 0) {
    console.log(
      `✅ PostgREST columns: ${checked} literal columns across ${files.length} files all exist live ` +
        `(${skipped} dynamic or \`*\` selects skipped).`
    );
    process.exit(0);
  }

  console.error(
    `\n❌ PostgREST select= names ${findings.length} column(s) that do NOT exist live:\n`
  );
  for (const f of findings) console.error(`  ${f.file}:${f.line}  ${f.table}.${f.column}`);
  console.error(
    `\nPostgREST answers these with 400, and the caller usually turns that into 0/null/[],\n` +
      `so the failure is invisible. Fix the column name or embed through the owning table.\n`
  );
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
