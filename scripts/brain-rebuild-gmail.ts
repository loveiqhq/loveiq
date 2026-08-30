/**
 * One-off: re-walk every mailbox after a change to the Gmail chunk SHAPE.
 *
 * WHY THIS IS A SCRIPT AND NOT THE CRON. The hourly lane runs under a 60s ceiling
 * and re-walks incrementally, so a builder-version bump across ~3,900 threads in
 * ten mailboxes converges over roughly half a day. That is fine for correctness
 * and useless for tuning: ranking changes that depend on the new field cannot be
 * measured until it exists.
 *
 * Same shape as `brain-rebuild-notion.ts`. Run it whenever GMAIL_BUILDER_VERSION
 * changes, then re-measure.
 *
 *   npx tsx scripts/brain-rebuild-gmail.ts
 */

import { ingestGmail } from "@features/brain/server/ingest/gmail";

async function main(): Promise<void> {
  const t0 = Date.now();
  const budgetMs = Number(process.argv[2] ?? 30 * 60_000);

  // The walk resumes where it stopped, because a thread is only refetched when its
  // stored builder version is stale. So looping is safe and idempotent.
  for (let pass = 1; pass <= 20; pass++) {
    const result = await ingestGmail(new Date().toISOString(), () => Date.now() - t0 > budgetMs);
    console.log(
      `pass ${pass}: ${result.rows} rows, ${result.swept} swept` +
        `${result.skipped ? `, skipped ${result.skipped}` : ""}` +
        ` (${Math.round((Date.now() - t0) / 1000)}s elapsed)`
    );
    // Stop on a credential problem instead of spinning. The local refresh token
    // needs interactive reauth periodically (Google returns `invalid_grant` /
    // `invalid_rapt`), and without this the loop retries twenty times, does no
    // work, and still exits 0 -- which reads like "nothing to do".
    if (result.skipped === "google-token-unavailable" || result.skipped === "gmail-not-configured") {
      console.log(
        `stopping: ${result.skipped}. Production uses Workload Identity Federation and is ` +
          `unaffected; this script needs local Google credentials. Re-run the OAuth flow, ` +
          `or just let the hourly brain-gmail cron re-walk on its own.`
      );
      process.exitCode = 1;
      return;
    }
    if (await noneLeftOnOldShape()) {
      console.log("every mailbox is on the current shape");
      return;
    }
    if (Date.now() - t0 > budgetMs) {
      console.log("hit the budget — run it again to continue where it stopped.");
      return;
    }
  }
}

/** The only "nothing left to rebuild" signal visible from outside the ingester. */
async function noneLeftOnOldShape(): Promise<boolean> {
  const { supabaseFetch } = await import("@features/admin/server/supabase");
  const { GMAIL_BUILDER_VERSION } = await import("@features/brain/server/ingest/gmail");
  const res = await supabaseFetch(
    `/rest/v1/brain_chunk?select=id&source=eq.gmail&meta->>v=neq.${GMAIL_BUILDER_VERSION}&limit=1`,
    { headers: { Prefer: "count=exact", Range: "0-0" } }
  );
  if (!res.ok) return false;
  const total = Number(res.headers.get("content-range")?.split("/")[1] ?? "1");
  if (total > 0) console.log(`      ${total} chunk(s) still on an older shape`);
  return total === 0;
}

void main();
