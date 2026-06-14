#!/usr/bin/env node
/**
 * check-survey-db-sync.js
 *
 * Guards against the class of bug that silently dropped multi-select answers
 * from 2026-05-19 to 2026-06-14: the survey copy in data/survey-data.ts (what
 * the app sends) drifting out of sync with answer_option.option_text in the DB
 * (what submit_survey matches picks against by exact text).
 *
 * It fetches the live survey_question + answer_option rows via the Supabase REST
 * API and asserts that EVERY option label the client can send exists in the DB
 * for that question (set membership — the exact guarantee the RPC needs). A
 * missing label = future silently-unlinked picks → non-zero exit.
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY. When either is absent the
 * check SKIPS (exit 0) so it never breaks a credential-less CI job — wire it
 * into a scheduled GitHub Action (or run locally) where the secrets exist.
 *
 *   node scripts/check-survey-db-sync.js
 *
 * After any survey-content change, run `node scripts/generate-seed-sql.js`-style
 * sync (or add an UPDATE migration) so the DB option_text matches survey-data.ts,
 * then re-run this check.
 */

const fs = require("fs");
const path = require("path");

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.log("check-survey-db-sync: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — skipping.");
  process.exit(0);
}

// ── Parse the canonical client source ─────────────────────────────────────────
const src = fs.readFileSync(path.join(__dirname, "..", "data", "survey-data.ts"), "utf-8");
const arrMatch = src.match(
  /export\s+const\s+surveyQuestions\s*:\s*SurveyQuestion\[\]\s*=\s*\[([\s\S]*?)\n\];/
);
if (!arrMatch) {
  console.error("check-survey-db-sync: could not parse surveyQuestions from survey-data.ts");
  process.exit(1);
}
const client = new Function(`return [${arrMatch[1]}]`)();

const norm = (s) => (s == null ? "" : String(s));

async function rest(pathAndQuery) {
  const res = await fetch(`${url}/rest/v1/${pathAndQuery}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) {
    throw new Error(`Supabase REST ${pathAndQuery} → ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function main() {
  // Pull active questions + their options. Embed answer_option via PostgREST.
  const rows = await rest(
    "survey_question?status=eq.active&select=frontend_qid,type,question,answer_option(option_text,display_order)"
  );
  const dbByQid = new Map(
    rows.map((q) => [
      q.frontend_qid,
      {
        type: q.type,
        question: q.question,
        options: (q.answer_option || [])
          .slice()
          .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
          .map((o) => o.option_text),
      },
    ])
  );

  let critical = 0;
  const lines = [];
  for (const q of client) {
    const db = dbByQid.get(q.qId);
    if (!db) {
      lines.push(`[CRITICAL] ${q.qId}: active question missing from DB`);
      critical++;
      continue;
    }
    if (q.answerType === "single" || q.answerType === "multiple") {
      const dbSet = new Set((db.options || []).map(norm));
      const missing = (q.options || []).filter((o) => !dbSet.has(norm(o)));
      if (missing.length) {
        critical++;
        lines.push(
          `[CRITICAL] ${q.qId} (${q.answerType}): ${missing.length} client option(s) not in DB:` +
            missing.map((o) => `\n    "${norm(o)}"`).join("")
        );
      }
    }
  }

  if (critical > 0) {
    console.error("Survey DB↔client option drift detected — picks would be silently unlinked:\n");
    console.error(lines.join("\n"));
    console.error(
      `\n${critical} question(s) drifted. Sync answer_option.option_text to survey-data.ts (UPDATE migration) and re-run.`
    );
    process.exit(1);
  }
  console.log(
    `check-survey-db-sync: OK — all client options present in DB across ${client.length} questions.`
  );
}

main().catch((err) => {
  console.error("check-survey-db-sync: error —", err.message);
  process.exit(1);
});
