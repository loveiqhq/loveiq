/**
 * Re-ask every claim of the last UX digest that was delivered, from a source
 * the digest did not use. Why, and what it does not check:
 * features/ux-review/server/digest-audit.ts.
 *
 *   npx tsx --env-file=.env.local scripts/audit-ux-digest.mjs    # print only
 *   npx tsx scripts/audit-ux-digest.mjs --post                   # and alert
 *
 * Exit 0 every claim held, 1 at least one did not, 3 could not measure.
 * `--post` sends a false claim to SLACK_WEBHOOK_URL. MUTATE=1 overstates the
 * digest's finisher count by one, so a run that cannot fail is caught.
 */
import {
  checkDigest,
  digestAuditMessage,
  gatherDigestFacts,
} from "../features/ux-review/server/digest-audit.ts";
import {
  markSlackAlertDelivered,
  tryClaimSlackAlert,
} from "../shared/observability/slack-alert-dedup.ts";

const bad = process.argv.slice(2).filter((a) => a !== "--post");
if (bad.length > 0) {
  console.error(`unknown argument(s): ${bad.join(" ")}`);
  process.exit(3);
}

const got = await gatherDigestFacts();
if (!got) {
  console.error("could not measure: a source was unreadable or a secret is missing");
  process.exit(3);
}

const checks =
  "missing" in got
    ? [{ claim: "A digest went out today", ok: false, detail: got.missing }]
    : checkDigest(
        process.env.MUTATE === "1"
          ? {
              ...got.facts,
              coverage: { ...got.facts.coverage, submissions: got.facts.coverage.submissions + 1 },
            }
          : got.facts
      );

for (const c of checks) console.log(`${c.ok ? "PASS" : "FAIL"}  ${c.claim} — ${c.detail}`);
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length} of ${checks.length} claims held.`);

if (failed.length > 0 && process.argv.includes("--post") && process.env.MUTATE !== "1") {
  const hook = process.env.SLACK_WEBHOOK_URL;
  const { GITHUB_SERVER_URL: host, GITHUB_REPOSITORY: repo, GITHUB_RUN_ID: run } = process.env;
  const text = digestAuditMessage(
    "facts" in got ? got.facts.at : Date.now(),
    failed,
    host && repo && run ? `${host}/${repo}/actions/runs/${run}` : undefined
  );
  /**
   * ONCE PER DIGEST. The workflow runs this three times a day because GitHub
   * drops scheduled runs (the first day, 2026-09-25, it never ran at 08:53),
   * so the post is claimed first. A failed post leaves the claim undelivered,
   * and the next run may take it again after ten minutes.
   */
  const key =
    "facts" in got
      ? new Date(got.facts.at).toISOString()
      : `missing:${new Date().toISOString().slice(0, 10)}`;
  if (!hook) console.log("SLACK_WEBHOOK_URL not set — nothing posted.");
  else if (!(await tryClaimSlackAlert("ux_digest_audit", "digest", key))) {
    console.log("this digest's disagreement was already posted — not posting again");
  } else {
    const res = await fetch(hook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (res.ok) await markSlackAlertDelivered("ux_digest_audit", "digest", key);
    console.log(res.ok ? "posted the disagreement to Slack" : `Slack refused: ${res.status}`);
  }
}
process.exit(failed.length > 0 ? 1 : 0);
