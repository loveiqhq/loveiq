#!/usr/bin/env node
/**
 * Rebuilds docs/architecture/TABLES.md from the live database schema.
 *
 * The page is a map for people, so it is generated, not typed: a hand-kept list of about a
 * hundred tables is wrong within a week. The source is PostgREST's OpenAPI document. It names
 * every table and view the API exposes, every column, and every foreign key (as
 * `<fk table='x' column='y'/>` markers in the column description).
 *
 * What that document cannot tell, and the page says so: nullability, unique constraints (so a
 * 1:1 link looks like a 1:N one) and row-level security. Views are found by scanning the
 * migrations for `create view`, then matched against the live names.
 *
 * Read-only: one GET against the schema, no row is read. Needs SUPABASE_URL +
 * SUPABASE_SERVICE_ROLE_KEY and exits 2 without them, rather than writing an empty page.
 *
 *   node scripts/generate-table-map.mjs
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const OUT = "docs/architecture/TABLES.md";

/** The order the page lists areas in. */
export const AREA_ORDER = [
  "Survey and scoring",
  "Reports",
  "Payments and prices",
  "Events and analytics",
  "Email and invites",
  "Company brain",
  "Admin and AP-Analytics",
  "Waitlist (retired)",
  "Operations",
];

/** First match wins, so the narrower prefixes (report_session, report_price_quote) sit first. */
const RULES = [
  [/^brain_/, "Company brain"],
  [/^(admin_|ap_)/, "Admin and AP-Analytics"],
  [/^(payment|report_price_quote|prepaid_report_access)/, "Payments and prices"],
  [
    /^(report_session|analytics_|funnel_|user_interactions|marketing_spend|product_changelog|digest_)/,
    "Events and analytics",
  ],
  [/^(report|personal_report|unlock_feedback)/, "Reports"],
  [
    /^(survey|answer_option|submission_tag|scoring_result|app_user|user_profile)/,
    "Survey and scoring",
  ],
  [/^(email_|invite_|resend_|booking_)/, "Email and invites"],
  [/^waitlist_/, "Waitlist (retired)"],
];

/** The path one reader takes from survey to paid report. The diagram draws only these. */
export const CORE = [
  "app_user",
  "survey_submission",
  "survey_submission_answer",
  "survey_question",
  "answer_option",
  "scoring_result",
  "personal_report",
  "personal_report_section",
  "report",
  "report_section",
  "report_price_quote",
  "payment",
  "payment_item",
  "payment_webhook_event",
];

export function areaOf(name) {
  for (const [re, area] of RULES) if (re.test(name)) return area;
  return "Operations";
}

/**
 * @param {{definitions?: Record<string, {description?: string, properties?: Record<string, {description?: string}>}>}} doc
 * @returns {Map<string, {note: string, columns: {name: string, pk: boolean}[], fks: {column: string, table: string, target: string}[]}>}
 */
export function parseOpenApi(doc) {
  const defs = doc?.definitions;
  if (!defs || typeof defs !== "object") throw new Error("OpenAPI document has no definitions");
  const out = new Map();
  for (const [name, def] of Object.entries(defs)) {
    const columns = [];
    const fks = [];
    for (const [col, prop] of Object.entries(def.properties ?? {})) {
      const text = String(prop.description ?? "");
      columns.push({ name: col, pk: text.includes("<pk/>") });
      const m = /<fk table='([^']+)' column='([^']+)'\/>/.exec(text);
      if (m) fks.push({ column: col, table: m[1], target: m[2] });
    }
    out.set(name, { note: String(def.description ?? ""), columns, fks });
  }
  return out;
}

/** One short sentence of a table comment, safe inside a markdown table cell. */
export function firstSentence(text, max = 110) {
  const flat = String(text).replace(/\s+/g, " ").replace(/[`|]/g, "").trim();
  const end = flat.search(/[.!?](\s|$)/);
  const sentence = end === -1 ? flat : flat.slice(0, end + 1);
  return sentence.length > max ? `${sentence.slice(0, max - 3).trimEnd()}...` : sentence;
}

/** Names that some migration creates as a view or materialized view. */
export function findViews(sqlTexts) {
  const re =
    /create\s+(?:or\s+replace\s+)?(?:materialized\s+)?view\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z_0-9]+)"?/gi;
  const names = new Set();
  for (const sql of sqlTexts) for (const m of sql.matchAll(re)) names.add(m[1].toLowerCase());
  return names;
}

/** A flowchart of the foreign keys between the core tables, each edge labelled by its column. */
export function coreFlow(schema, core = CORE) {
  const inCore = new Set(core.filter((n) => schema.has(n)));
  const lines = ["flowchart LR"];
  for (const name of core) {
    if (!inCore.has(name)) continue;
    for (const fk of schema.get(name).fks) {
      if (inCore.has(fk.table)) lines.push(`  ${name} -->|${fk.column}| ${fk.table}`);
    }
  }
  return lines.join("\n");
}

export function render(schema, { date, views = new Set() }) {
  const byArea = new Map(AREA_ORDER.map((a) => [a, []]));
  for (const name of [...schema.keys()].sort()) byArea.get(areaOf(name)).push(name);
  let columns = 0;
  let fks = 0;
  for (const t of schema.values()) {
    columns += t.columns.length;
    fks += t.fks.length;
  }
  const out = [
    "# Database tables",
    "",
    // Table comments are quoted from the database, so the spell check would flag their words
    // every time the page is rebuilt.
    "<!-- cspell:disable -->",
    "",
    `> **Generated:** ${date} | **Source:** the live schema (PostgREST OpenAPI) | ${schema.size} relations, ${columns} columns, ${fks} foreign keys`,
    "",
    "A map of every table and view the API exposes. It is generated, so it matches production on the day shown. Rebuild it with `node scripts/generate-table-map.mjs` (read-only; needs the Supabase URL and service key).",
    "",
    '"Points to" means this relation has a column that holds the id of a row in that one (a foreign key). The page does not show nullability, unique constraints (so a 1:1 link looks like a 1:N one) or row-level security. Read `supabase/migrations/` for those.',
    "",
    "## The core path",
    "",
    "One reader, from the survey to a paid report. Each arrow is a foreign key, labelled with its column.",
    "",
    "```mermaid",
    coreFlow(schema),
    "```",
  ];
  for (const area of AREA_ORDER) {
    const names = byArea.get(area);
    if (names.length === 0) continue;
    out.push("", `## ${area} (${names.length})`, "");
    out.push("| Relation | Columns | Points to | What it holds |", "| --- | --- | --- | --- |");
    for (const name of names) {
      const t = schema.get(name);
      const parents = [...new Set(t.fks.map((f) => f.table))].sort();
      const label = `\`${name}\`${views.has(name) ? " (view)" : ""}`;
      const to = parents.map((p) => `\`${p}\``).join(", ");
      out.push(`| ${label} | ${t.columns.length} | ${to} | ${firstSentence(t.note)} |`);
    }
  }
  out.push("");
  return out.join("\n");
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("\ngenerate-table-map: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required.\n");
    process.exit(2);
  }
  const res = await fetch(`${url}/rest/v1/`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/openapi+json" },
  });
  if (!res.ok) {
    console.error(`generate-table-map: schema read failed (HTTP ${res.status})`);
    process.exit(2);
  }
  const schema = parseOpenApi(await res.json());
  const sql = readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .map((f) => readFileSync(`supabase/migrations/${f}`, "utf8"));
  const date = new Date().toISOString().slice(0, 10);
  writeFileSync(OUT, render(schema, { date, views: findViews(sql) }));
  execFileSync("npx", ["prettier", "--write", OUT], { stdio: "inherit" });
  console.log(`generate-table-map: wrote ${OUT} (${schema.size} relations)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
