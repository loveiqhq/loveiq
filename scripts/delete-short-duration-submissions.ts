/**
 * One-time cleanup: delete completed survey submissions with duration_ms <= 120s.
 *
 * Rationale: real production data shows the fastest legitimate completion is
 * ~60s, the median ~3.5min. Anything in 0-2min is bots, rapid-click junk, or
 * staff smoke tests. Partial (mid-survey-abandoned) rows live in
 * survey_partial_save and are NOT touched.
 *
 * Note: this threshold (120s) is decoupled from the test-submission flag
 * threshold (60s) in lib/admin/test-submission.ts. The flag stays at 60s so
 * existing is_likely_test labelling is unchanged.
 *
 * Usage:
 *   npx tsx scripts/delete-short-duration-submissions.ts          # dry-run (default)
 *   npx tsx scripts/delete-short-duration-submissions.ts --apply  # actually delete
 *
 * Requires .env.local with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 *
 * Skips any submission with an existing personal_report (paid). Cascade is
 * delegated to deleteSubmissionCascade in lib/admin/delete-submission.ts so
 * the delete order matches the admin UI bulk-delete path.
 *
 * After --apply you must REFRESH the materialized view used by /api/admin/activity:
 *   REFRESH MATERIALIZED VIEW CONCURRENTLY public.admin_submission_facts;
 * (Run in Supabase SQL editor.)
 */

import { readFileSync } from "fs";
import { resolve } from "path";

// Load .env.local manually (no dotenv dependency) — must run BEFORE any import
// that reads process.env at module-load time.
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

import { deleteSubmissionCascade } from "../features/admin/server/delete-submission";
import { logAdminAction } from "../features/admin/server/audit";
import { maskEmail } from "../features/admin/server/format";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY_RUN = !process.argv.includes("--apply");

const DURATION_THRESHOLD_MS = 120_000; // 2 min — anything under this is junk per real data distribution
const FETCH_BATCH_SIZE = 10_000;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

interface CandidateRow {
  id: number;
  duration_ms: number | null;
  start_date_time: string | null;
  created_date_time: string;
  status: string;
  app_user: { email: string } | null;
  personal_report: Array<{ id: number }> | null;
}

async function fetchCandidates(): Promise<CandidateRow[]> {
  const select =
    "id,duration_ms,start_date_time,created_date_time,status," +
    "app_user!fk_survey_submission_user(email)," +
    "personal_report(id)";
  const url =
    `${SUPABASE_URL}/rest/v1/survey_submission` +
    `?select=${encodeURIComponent(select)}` +
    `&status=eq.completed` +
    `&duration_ms=lte.${DURATION_THRESHOLD_MS}` +
    `&order=created_date_time.desc`;

  const res = await fetch(url, {
    headers: {
      apikey: SERVICE_KEY!,
      Authorization: `Bearer ${SERVICE_KEY!}`,
      Prefer: "count=exact",
      Range: `0-${FETCH_BATCH_SIZE - 1}`,
    },
  });
  if (!res.ok) {
    throw new Error(`Candidate query failed: ${res.status} ${await res.text()}`);
  }

  const contentRange = res.headers.get("content-range") ?? "";
  const total = Number(contentRange.split("/")[1]);
  if (Number.isFinite(total) && total > FETCH_BATCH_SIZE) {
    console.warn(
      `⚠ Candidate count (${total}) exceeds batch size (${FETCH_BATCH_SIZE}). ` +
        `Re-run with a larger FETCH_BATCH_SIZE or paginate.`
    );
  }

  return (await res.json()) as CandidateRow[];
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  // sorted.length > 0 above; mid and mid-1 are valid indices.
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

async function main() {
  console.log(DRY_RUN ? "=== DRY RUN (pass --apply to delete) ===" : "=== APPLYING DELETIONS ===");
  console.log(`Threshold: duration_ms <= ${DURATION_THRESHOLD_MS}`);

  const all = await fetchCandidates();
  console.log(`Fetched ${all.length} candidate rows.`);
  if (all.length === 0) {
    console.log("Nothing to delete.");
    return;
  }

  const skippedPaid: CandidateRow[] = [];
  const toDelete: CandidateRow[] = [];
  for (const row of all) {
    if (row.personal_report && row.personal_report.length > 0) {
      skippedPaid.push(row);
    } else {
      toDelete.push(row);
    }
  }

  console.log("\n--- Preview ---");
  console.log("id │ duration_ms │ created_date_time │ email │ skipped?");
  for (const row of all) {
    const isSkipped = row.personal_report && row.personal_report.length > 0;
    const email = row.app_user?.email ? maskEmail(row.app_user.email) : "(no user)";
    console.log(
      `${row.id} │ ${row.duration_ms ?? "null"} │ ${row.created_date_time} │ ${email} │ ${
        isSkipped ? "PAID — skipped" : ""
      }`
    );
  }

  const durations = toDelete
    .map((r) => r.duration_ms)
    .filter((d): d is number => typeof d === "number");
  const minD = durations.length > 0 ? Math.min(...durations) : 0;
  const maxD = durations.length > 0 ? Math.max(...durations) : 0;
  const medD = median(durations);

  console.log("\n--- Totals ---");
  console.log(`to_delete       = ${toDelete.length}`);
  console.log(`skipped_paid    = ${skippedPaid.length}`);
  console.log(`total_candidates = ${all.length}`);
  console.log(`duration_ms     min=${minD}  median=${medD}  max=${maxD}`);

  if (DRY_RUN) {
    console.log("\nDry run only. Re-run with --apply to delete.");
    return;
  }

  if (toDelete.length === 0) {
    console.log("\nNo non-paid rows to delete.");
    return;
  }

  console.log("\n--- Deleting ---");
  let deleted = 0;
  let failed = 0;

  for (const row of toDelete) {
    const result = await deleteSubmissionCascade(row.id);
    if (result.ok) {
      deleted += 1;
      await logAdminAction({
        admin_email: "system@cleanup",
        action: "delete_submission_short_duration_cleanup",
        resource_type: "submission",
        resource_id: String(row.id),
        metadata: {
          duration_ms: row.duration_ms,
          reason: "short_duration",
          script: "delete-short-duration-submissions",
        },
        ip: "script",
      });
      if (deleted % 50 === 0) {
        console.log(`  …deleted ${deleted}/${toDelete.length}`);
      }
    } else {
      failed += 1;
      console.error(`  ✗ id=${row.id} failed: reason=${result.reason} status=${result.status}`);
    }
  }

  console.log("\n--- Final summary ---");
  console.log(`deleted      = ${deleted}`);
  console.log(`failed       = ${failed}`);
  console.log(`skipped_paid = ${skippedPaid.length}`);
  console.log(
    "\n⚠ Now refresh the admin materialized view in the Supabase SQL editor:\n" +
      "    REFRESH MATERIALIZED VIEW CONCURRENTLY public.admin_submission_facts;"
  );
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
