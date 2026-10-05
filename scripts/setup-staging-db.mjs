#!/usr/bin/env node
/**
 * Stand up a staging database that matches production's SHAPE and none of its data.
 *
 * Why a separate database at all: staging.loveiq.org and www.loveiq.org are two
 * Vercel projects pointed at ONE Supabase project, so anything staging writes
 * lands in real data. A second database separates them.
 *
 * Why it is free: Supabase bills per organization, and plans cannot be mixed
 * within one. A second project inside the Pro org costs a second compute
 * instance (~$10/mo), and a Preview branch is $0.01344/hour — not covered by
 * the Spend Cap and not offset by compute credits. A separate FREE organization
 * with one project costs nothing. Free projects pause after 7 days of low
 * activity and are resumed with one click.
 *
 * Why 500 MB is enough: production is 438 MB, but 291 MB of that is the brain
 * corpus. Staging needs the schema and the seed the migrations carry, which is
 * a few MB. It deliberately gets NO production rows — copying real survey
 * answers into a second environment doubles the GDPR footprint for no benefit,
 * and the migrations already seed the entire survey (132 questions, 197 answer
 * options) so the app works without them.
 *
 * Usage:
 *   STAGING_DB_URL='postgresql://postgres:PW@db.REF.supabase.co:5432/postgres' \
 *   SUPABASE_URL=<prod url> SUPABASE_SERVICE_ROLE_KEY=<prod key> \
 *   node scripts/setup-staging-db.mjs [--apply]
 *
 * Without --apply it only reports (dry run). Prod credentials are READ-ONLY
 * here: they are used solely to fetch the object inventory to compare against.
 */
import { execFileSync } from "node:child_process";

const stagingDbUrl = process.env.STAGING_DB_URL;
const prodUrl = process.env.SUPABASE_URL;
const prodKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const apply = process.argv.includes("--apply");

if (!stagingDbUrl) {
  console.error("\nSTAGING_DB_URL is required (Supabase → staging project → Connect → URI).\n");
  process.exit(2);
}
if (!prodUrl || !prodKey) {
  console.error(
    "\nSUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (production) are required to compare against.\n"
  );
  process.exit(2);
}

/**
 * Refuse to touch production, however the URL is spelled.
 *
 * `db push` against prod would be catastrophic — it re-runs every migration
 * whose version is absent from the remote ledger. This compares project refs,
 * not the whole string, so a pooler host or a different port cannot slip past.
 */
const refOf = (s) => (s.match(/(?:db\.)?([a-z]{20})\.supabase\.(?:co|com)/) ?? [])[1];
const stagingRef = refOf(stagingDbUrl);
const prodRef = refOf(prodUrl);
if (!stagingRef) {
  console.error("\nCould not read a project ref out of STAGING_DB_URL. Refusing to guess.\n");
  process.exit(2);
}
if (stagingRef === prodRef) {
  console.error(
    `\n❌ STAGING_DB_URL points at PRODUCTION (${prodRef}). Refusing.\n` +
      `   A push here would re-run every migration missing from the ledger.\n`
  );
  process.exit(2);
}
console.log(`  production ref : ${prodRef}`);
console.log(`  staging ref    : ${stagingRef}\n`);

const supabase = (args) =>
  execFileSync("npx", ["--yes", "supabase@latest", ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

console.log(
  apply ? "→ Applying migrations to staging…\n" : "→ DRY RUN (pass --apply to execute)\n"
);
try {
  const out = supabase([
    "db",
    "push",
    "--db-url",
    stagingDbUrl,
    "--include-all",
    ...(apply ? [] : ["--dry-run"]),
  ]);
  console.log(out.split("\n").slice(-25).join("\n"));
} catch (err) {
  console.error("\n❌ db push failed:\n" + (err.stdout ?? "") + (err.stderr ?? ""));
  process.exit(1);
}

if (!apply) {
  console.log("\nDry run only. Re-run with --apply, then this script verifies parity.\n");
  process.exit(0);
}

// ── parity: every object production has, staging must have too ──────────────
const fetchArtifacts = async (url, key) => {
  const r = await fetch(`${url}/rest/v1/rpc/get_schema_artifacts`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: "{}",
  });
  if (!r.ok) throw new Error(`get_schema_artifacts on ${url}: HTTP ${r.status}`);
  return r.json();
};

const stagingRest = `https://${stagingRef}.supabase.co`;
const stagingKey = process.env.STAGING_SERVICE_ROLE_KEY;
if (!stagingKey) {
  console.log(
    "\n⚠️  Set STAGING_SERVICE_ROLE_KEY to run the parity check. Migrations are applied.\n"
  );
  process.exit(0);
}

const [prod, staging] = await Promise.all([
  fetchArtifacts(prodUrl, prodKey),
  fetchArtifacts(stagingRest, stagingKey),
]);

const tablesOf = (a) => new Set(a.columns.map((c) => c.split(".")[0]));
const report = [];
const compare = (label, prodSet, stagingSet) => {
  const missing = [...prodSet].filter((x) => !stagingSet.has(x)).sort();
  report.push({ label, total: prodSet.size, missing });
};
compare("functions (ours)", new Set(prod.ownFunctions), new Set(staging.ownFunctions));
compare("tables", tablesOf(prod), tablesOf(staging));
compare("columns", new Set(prod.columns), new Set(staging.columns));
compare("constraints", new Set(prod.constraints), new Set(staging.constraints));
compare("indexes", new Set(prod.indexes), new Set(staging.indexes));

console.log("\n── parity with production ──");
let bad = 0;
for (const r of report) {
  const ok = r.missing.length === 0;
  if (!ok) bad++;
  console.log(
    `  ${ok ? "✅" : "❌"} ${r.label.padEnd(18)} ${r.total - r.missing.length}/${r.total}`
  );
  for (const m of r.missing.slice(0, 15)) console.log(`       missing: ${m}`);
  if (r.missing.length > 15) console.log(`       … and ${r.missing.length - 15} more`);
}

console.log("\n── data (staging must NOT have production rows) ──");
for (const t of ["survey_submission", "personal_report", "payment", "app_user"]) {
  const r = await fetch(`${stagingRest}/rest/v1/${t}?select=*`, {
    method: "HEAD",
    headers: {
      apikey: stagingKey,
      Authorization: `Bearer ${stagingKey}`,
      Prefer: "count=exact",
      Range: "0-0",
    },
  });
  const n = r.headers.get("content-range")?.split("/")[1] ?? "?";
  console.log(`  ${n === "0" ? "✅" : "⚠️ "} ${t.padEnd(20)} ${n} rows`);
}

process.exit(bad === 0 ? 0 : 1);
