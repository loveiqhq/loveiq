/**
 * Close the loop: a merged PR means the finding was real, a closed one means it
 * was a false alarm.
 *
 * The ledger records what the PROBE concluded, which is the best evidence we can
 * gather without a person. A human pressing merge is better evidence still, and
 * it is free — nobody has to label anything, they just do the thing they were
 * going to do anyway. That is the whole design in the plan: the merge click IS
 * the training data.
 *
 * It was never wired up. Measured 2026-09-19: 37 findings in the ledger, 0 with
 * a human label, because nothing ever wrote one back.
 *
 * Matched on `pr_url`, not on the branch name. The branch encodes a criterion
 * and eight characters of a session id, and parsing it back would tie this to a
 * naming scheme that replay-pr.mjs is free to change; the url is what the ledger
 * actually stored.
 *
 *   node scripts/label-findings-from-prs.mjs            # report only
 *   node scripts/label-findings-from-prs.mjs --write    # write the labels
 *
 * Exit 0 clean · 2 could not measure.
 */
import { execFileSync } from "node:child_process";

const WRITE = process.argv.includes("--write");

const need = (n) => {
  const v = process.env[n];
  if (!v) {
    console.error(`missing ${n}`);
    process.exit(2);
  }
  return v;
};

for (const signal of ["unhandledRejection", "uncaughtException"]) {
  process.on(signal, (err) => {
    console.error(`could not measure: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(2);
  });
}

const SUPABASE_URL = need("SUPABASE_URL");
const KEY = need("SUPABASE_SERVICE_ROLE_KEY");
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

const rows = await (
  await fetch(
    `${SUPABASE_URL}/rest/v1/ux_finding?select=observation_id,pr_url,outcome,human_label` +
      `&pr_url=not.is.null&human_label=is.null&limit=200`,
    { headers: H }
  )
).json();

if (!Array.isArray(rows)) {
  console.error(`supabase: ${JSON.stringify(rows).slice(0, 200)}`);
  process.exit(2);
}
if (rows.length === 0) {
  console.log("no unlabelled findings with a pull request — nothing to do");
  process.exit(0);
}

console.log(`${rows.length} finding(s) with a PR and no label yet\n`);

let labelled = 0;
let stillOpen = 0;
for (const row of rows) {
  const num = /\/pull\/(\d+)/.exec(String(row.pr_url))?.[1];
  if (!num) {
    console.log(`  skipped — could not read a PR number from ${row.pr_url}`);
    continue;
  }
  let pr;
  try {
    pr = JSON.parse(
      execFileSync("gh", ["api", `repos/loveiqhq/loveiq/pulls/${num}`], { encoding: "utf8" })
    );
  } catch (err) {
    console.log(`  skipped — could not read PR #${num}: ${String(err.message).slice(0, 80)}`);
    continue;
  }

  if (pr.state === "open") {
    stillOpen += 1;
    continue;
  }
  /**
   * `merged` rather than `state === "closed"`. GitHub reports a merged PR as
   * closed too, so reading state alone would label every merge a false alarm —
   * inverting the signal this whole mechanism exists to collect.
   *
   * The vocabulary is the ledger's own: `human_label` is CHECK-constrained
   * to 'agree' / 'disagree' in 20260917143510_ux_finding_ledger.sql. Writing
   * anything else is refused with a 400, which is how the first version of
   * this was caught — by running it, not by reading it.
   */
  const label = pr.merged ? "agree" : "disagree";
  console.log(
    `  #${num} ${pr.merged ? "merged" : "closed"} → ${label}  (probe said ${row.outcome})`
  );

  if (WRITE) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/ux_finding?observation_id=eq.${encodeURIComponent(row.observation_id)}`,
      {
        method: "PATCH",
        headers: { ...H, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ human_label: label, labelled_at: new Date().toISOString() }),
      }
    );
    if (!res.ok) {
      console.error(`  FAILED to label ${row.observation_id}: ${res.status}`);
      process.exit(2);
    }
  }
  labelled += 1;
}

console.log(
  `\n${labelled} label(s) ${WRITE ? "written" : "would be written (dry — pass --write)"}` +
    (stillOpen ? `, ${stillOpen} still open` : "")
);
process.exit(0);
