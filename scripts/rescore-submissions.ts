/**
 * Re-score existing survey submissions with the corrected scoring engine.
 *
 * Run AFTER applying the 20260323_sync_answer_options.sql migration.
 *
 * Usage:
 *   npx tsx scripts/rescore-submissions.ts          # dry-run (default)
 *   npx tsx scripts/rescore-submissions.ts --apply   # actually update DB
 *
 * Requires .env.local with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

// Load .env.local manually (no dotenv dependency)
const envPath = resolve(__dirname, "..", ".env.local");
try {
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed
      .slice(eqIdx + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
} catch {
  console.error(
    "Could not read .env.local — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY manually"
  );
}

import { getScoringConfig } from "../lib/scoring/config";
import { scoreArchetypes } from "../lib/scoring/engine";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY_RUN = !process.argv.includes("--apply");

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const headers: Record<string, string> = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

async function supabaseGet(path: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers });
  if (!res.ok) throw new Error(`GET ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function supabasePatch(path: string, body: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: "PATCH",
    headers: { ...headers, Prefer: "return=minimal" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PATCH ${path}: ${res.status} ${await res.text()}`);
}

async function main() {
  console.log(DRY_RUN ? "=== DRY RUN (pass --apply to update DB) ===" : "=== APPLYING CHANGES ===");

  const scoringResults = await supabaseGet(
    "scoring_result?select=id,survey_submission_id,primary_archetype,engine_version"
  );
  console.log(`Found ${scoringResults.length} scored submissions`);

  if (scoringResults.length === 0) {
    console.log("Nothing to re-score.");
    return;
  }

  const config = getScoringConfig();
  let updated = 0;
  let changed = 0;
  let errors = 0;

  for (const sr of scoringResults) {
    try {
      const answers = await supabaseGet(
        `survey_submission_answer?select=answer_text,normalized_value,answer_option_id,` +
          `survey_question!inner(frontend_qid,type),` +
          `answer_option(option_text),` +
          `survey_submission_answer_options(answer_option(option_text))` +
          `&survey_submission_id=eq.${sr.survey_submission_id}`
      );

      const answersObj: Record<string, unknown> = {};
      for (const a of answers) {
        const qid = a.survey_question.frontend_qid;
        const type = a.survey_question.type;

        switch (type) {
          case "scale":
            answersObj[qid] = a.normalized_value;
            break;
          case "open":
            answersObj[qid] = a.answer_text || "";
            break;
          case "single":
            answersObj[qid] = a.answer_option?.option_text || a.answer_text || "";
            break;
          case "multiple": {
            const opts = (a.survey_submission_answer_options || [])
              .map(
                (o: { answer_option?: { option_text?: string } }) => o.answer_option?.option_text
              )
              .filter(Boolean);
            if (a.answer_text) opts.push(a.answer_text);
            answersObj[qid] = opts;
            break;
          }
        }
      }

      const result = scoreArchetypes(config, answersObj);
      const archetypeChanged = result.primaryArchetype !== sr.primary_archetype;
      if (archetypeChanged) changed++;

      console.log(
        `  #${sr.survey_submission_id}: ${sr.primary_archetype} → ${result.primaryArchetype}` +
          (archetypeChanged ? " [CHANGED]" : " [same]")
      );

      if (!DRY_RUN) {
        await supabasePatch(`scoring_result?id=eq.${sr.id}`, {
          engine_version: "v4",
          primary_archetype: result.primaryArchetype,
          percentages: result.percent,
          raw_scores: result.rawScore,
          diagnostics: result.diagnostics,
          scored_at: new Date().toISOString(),
        });
      }

      updated++;
    } catch (err) {
      console.error(`  #${sr.survey_submission_id}: ERROR — ${(err as Error).message}`);
      errors++;
    }
  }

  console.log(`\nDone: ${updated} re-scored, ${changed} archetype changes, ${errors} errors`);
  if (DRY_RUN) console.log("Pass --apply to write changes to DB.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
