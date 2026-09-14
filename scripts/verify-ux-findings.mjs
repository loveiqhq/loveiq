/**
 * Verify Replay Vision findings by running the probe that covers them.
 *
 * A scanner's verdict is a claim about a video. This turns it into evidence, or
 * refuses to: it maps the finding to a criterion from the review protocol, runs
 * that criterion's probe against production, and replies in the Slack thread
 * with what actually happened. No model is involved — a probe cannot
 * hallucinate, which is the entire point.
 *
 *   node scripts/verify-ux-findings.mjs            # verify, post to Slack
 *   node scripts/verify-ux-findings.mjs --dry-run  # verify, print, post nothing
 *
 * WHAT "REPRODUCED" MEANS, EXACTLY. A probe tests production as it is right now,
 * not the recording. So a pass means "the defect the scanner described is NOT
 * present in production today" — which is the question worth answering before
 * anyone writes a fix. It does not prove the reader did not experience it: the
 * bug may have been fixed since, or depend on a device we do not emulate. Both
 * outcomes say so in the message rather than implying more than they know.
 *
 * Secrets are REQUIRED, never optional. Three CI lanes in this repo already skip
 * silently on an unset secret and were dead for weeks before anyone noticed, so
 * this exits non-zero when one is missing instead of reporting success.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// Imported, not restated. The cron posts findings and this verifies them; two
// copies of "does our telemetry contradict this claim" would drift the day one
// of them was tuned. Run under tsx so this TypeScript module is importable.
import {
  contradiction,
  fetchSessionEvents,
  isSafeSessionId,
  sessionViewport,
} from "../features/ux-review/server/review.ts";

const DRY_RUN = process.argv.includes("--dry-run");
/** Map findings to criteria and stop. Probes drive real browsers against
 *  production and take minutes each, so this is the fast way to see whether the
 *  classifier is matching the prose the scanners currently emit. */
const CLASSIFY_ONLY = process.argv.includes("--classify-only");
const PROJECT = "244778";
const LOOKBACK_HOURS = Number(process.env.LOOKBACK_HOURS ?? 6);

/**
 * Criterion → probe, keyed by what the scanner's prose actually says. Crude and
 * transparent on purpose: a regex you can read beats a classifier you cannot
 * audit, and an unmatched finding is reported as a GAP rather than guessed at.
 *
 * Ordered — first match wins — so the specific patterns sit above the general.
 */
export const CRITERIA = [
  {
    // Marcus's headline criterion. Now covered: the mechanism turned out not to
    // be a misfiring CTA but the report's failure screens, which offer "Take the
    // survey" as the only way forward for a 404 or a missing session. The probe
    // asserts a VALID report never shows that door.
    id: "L1",
    label: "loop back to an earlier screen",
    match:
      /loop(ed|s)? back|back to the (survey )?start|returned to (an )?earlier|start(ed)? (the survey )?(over|from scratch)|re-?initiali[sz]ed/i,
    probes: ["verify-no-survey-restart.mjs"],
  },
  {
    id: "C1",
    label: "clipped or covered content",
    match: /cover(ed|ing)?|overlap|clipped|cut off|hidden behind|obscur/i,
    probes: ["verify-nav-heading-clearance.mjs", "verify-narrow-viewport.mjs"],
  },
  {
    id: "D1",
    label: "dead control",
    match: /did not respond|nothing happened|no visible change|dead (click|control)|not tappable/i,
    probes: ["verify-paywall-card-tap.mjs", "verify-tap-targets.mjs"],
  },
  {
    id: "P1",
    label: "modal reappears",
    match: /reappear|popup|modal .*(again|close)|kept showing/i,
    probes: ["verify-paywall-closes.mjs"],
  },
  {
    id: "Z1",
    label: "page magnified",
    match: /magnif|zoom/i,
    probes: ["verify-input-zoom.mjs"],
  },
  {
    id: "S1",
    label: "unproductive scrolling",
    match: /scroll(ed|ing)? (up and down|back and forth)|excessive scroll/i,
    probes: ["verify-reaches-bottom.mjs"],
  },
  {
    id: "E1",
    label: "error message on screen",
    match: /unable to process|error message|something went wrong|failed to/i,
    probes: ["console-audit.mjs"],
  },
];

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`MISSING SECRET: ${name} — refusing to report success without it.`);
    process.exit(2);
  }
  return v;
}

async function posthog(query) {
  const res = await fetch(`https://eu.posthog.com/api/projects/${PROJECT}/query/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireEnv("POSTHOG_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
  });
  if (!res.ok) throw new Error(`posthog ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  // 200-with-error is how PostHog reports a bad query. Treating that as "no
  // findings" would make this verifier look permanently healthy and idle.
  if (json.error) throw new Error(`posthog query error: ${String(json.error).slice(0, 200)}`);
  return json.results ?? [];
}

export function classify(reasoning) {
  return CRITERIA.find((c) => c.match.test(reasoning)) ?? null;
}

/**
 * Run a probe AT THE SIZE THE READER HAD.
 *
 * A defect reproduced on a default phone proves nothing about someone who hit it
 * at 262px. The citation-URL overflow found on 2026-09-14 was invisible at every
 * width the device matrix covered, and only appeared once the probe rendered at
 * the viewport the session actually reported.
 *
 * `viewport` is the session's narrowest and widest — narrowest because that is
 * where layout breaks, widest because a foldable moves mid-session. Probes that
 * understand WIDTHS use them; the rest ignore the variable and run their own
 * device list, which is still better than refusing to check.
 */
function runProbe(file, viewport) {
  const widths = viewport
    ? [...new Set([viewport.min, viewport.max].filter((w) => w >= 200 && w <= 2000))].join(",")
    : "";
  try {
    const out = execFileSync("node", [`scripts/probes/${file}`], {
      encoding: "utf8",
      timeout: 10 * 60_000,
      env: {
        ...process.env,
        REPORT_ORIGIN: "https://www.loveiq.org",
        ...(widths ? { WIDTHS: widths } : {}),
      },
    });
    return { file, passed: true, tail: out.trim().split("\n").slice(-3).join(" | ") };
  } catch (err) {
    const out = `${err.stdout ?? ""}${err.stderr ?? ""}`.trim();
    // Exit 3 means the probe could not MEASURE (no such control on screen, the
    // flow moved, a timeout). That is not the same as reproducing the defect,
    // and conflating them turns a broken probe into a stream of confident false
    // findings — the precise failure this whole gate exists to prevent. An
    // inconclusive run is still never a pass; it goes to a human.
    const inconclusive = err.status === 3;
    return {
      file,
      passed: false,
      inconclusive,
      tail: out.split("\n").slice(-3).join(" | "),
    };
  }
}

/**
 * Claim a finding so it is verified exactly once.
 *
 * The schedule (every 3h) and the lookback (6h) overlap deliberately, so a run
 * that fails or a finding that lands late is still picked up. Without a claim
 * that same overlap posts every verdict to the thread twice — the reason this
 * exists. Reuses `slack_alert_sent`, the table the cron already dedupes on, via
 * the same two-phase RPC.
 *
 * Fails CLOSED: if the claim cannot be taken (Supabase down, RPC changed), the
 * finding is skipped rather than verified. A missed verdict is recoverable on
 * the next run; a duplicate one erodes trust in the channel.
 */
async function claimFinding(observationId) {
  const url = requireEnv("SUPABASE_URL");
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  try {
    const res = await fetch(`${url}/rest/v1/rpc/claim_slack_alert`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        p_kind: "ux_review_verified",
        p_entity_type: "observation",
        p_entity_id: observationId,
      }),
    });
    if (!res.ok) return false;
    return (await res.json()) === true;
  } catch {
    return false;
  }
}

/** The survey notification this recording belongs under, so the verdict lands
 *  next to the finding rather than at the bottom of the channel. Mirrors
 *  findThreadTs() in features/ux-review/server/review.ts. */
async function threadFor(sessionId) {
  const url = requireEnv("SUPABASE_URL");
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const head = { apikey: key, Authorization: `Bearer ${key}` };
  const subs = await fetch(
    `${url}/rest/v1/survey_submission?posthog_session_id=eq.${encodeURIComponent(sessionId)}&select=id&limit=1`,
    { headers: head }
  );
  if (!subs.ok) return null;
  const id = (await subs.json())[0]?.id;
  if (!id) return null;
  const msgs = await fetch(
    `${url}/rest/v1/slack_journey_message?survey_submission_id=eq.${id}&select=message_ts&limit=1`,
    { headers: head }
  );
  if (!msgs.ok) return null;
  return (await msgs.json())[0]?.message_ts ?? null;
}

async function postThreadReply(threadTs, text) {
  const token = requireEnv("SLACK_BOT_TOKEN");
  const channel = requireEnv("SLACK_JOURNEY_CHANNEL_ID");
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ channel, thread_ts: threadTs, text }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`slack: ${json.error}`);
}

if (process.argv.includes("--selftest")) {
  // The classifier is the one piece of judgement here, so it gets a check that
  // fails when a pattern stops matching the prose the scanners actually emit.
  const cases = [
    ["The chapter bar covered the heading at the top.", "C1"],
    ["The user tapped the card twice and nothing happened.", "D1"],
    ["The pricing modal reappeared after the user closed it.", "P1"],
    ["The page became magnified after tapping the input.", "Z1"],
    ["An 'Unable to process request.' error message was shown.", "E1"],
    ["The user scrolled up and down over the same section.", "S1"],
    ["The survey looped back to the very first introduction screen.", "L1"],
    ["The user was returned to an earlier screen after pressing continue.", "L1"],
    ["The reader simply finished reading the chapter.", null],
  ];
  const claimCases = [
    // The real 2026-09-14 fabrication: an unlock click in a session with none.
    // The event set must be non-empty — an EMPTY set means we could not read
    // the session at all, which fails open by design (see contradiction()).
    [
      "the user clicked 'Unlock full report', which looped them back",
      ["report_viewed", "locked_card_price_shown"],
      true,
    ],
    // An outage must never look like a refutation.
    ["the user clicked 'Unlock full report', which looped them back", [], false],
    ["the user clicked 'Unlock full report'", ["unlock_click"], false],
    ["the user reached checkout and saw an error", ["begin_checkout"], false],
    ["the user reached checkout and saw an error", ["report_viewed"], true],
    // No rule covers this, so it must NOT be reported as contradicted.
    ["the heading was covered by the chapter bar", [], false],
  ];
  for (const [text, events, wantContradiction] of claimCases) {
    const got = contradiction(text, new Set(events)) !== null;
    if (got !== wantContradiction) {
      console.error(`selftest FAIL (claim): "${text.slice(0, 40)}" → ${got}`);
      process.exitCode = 1;
    }
  }

  for (const [id, wantOk] of [
    ["01a09e04-dfaa-7a3e-9622-0d7ca5285017", true],
    ["abc-123", true],
    ["' OR 1=1 --", false],
    ["a'; DROP TABLE events; --", false],
    ["../../etc/passwd", false],
    ["", false],
  ]) {
    if (isSafeSessionId(id) !== wantOk) {
      console.error(`selftest FAIL (session id): ${JSON.stringify(id)}`);
      process.exitCode = 1;
    }
  }

  let bad = 0;
  for (const [text, want] of cases) {
    const got = classify(text)?.id ?? null;
    if (got !== want) {
      bad += 1;
      console.error(`selftest FAIL: "${text.slice(0, 40)}" → ${got}, wanted ${want}`);
    }
  }
  // `bad` counts ONLY classifier failures. The claim and session-id checks
  // above signal through process.exitCode, and a bare process.exit(0) would
  // discard them — which it did, silently, until 2026-09-14: the selftest
  // printed "FAIL (claim)" and exited 0, so CI's gate could not fail.
  const failed = bad > 0 || process.exitCode === 1;
  console.log(failed ? `selftest FAILED (${bad} classifier)` : "selftest ok");
  process.exit(failed ? 1 : 0);
}

const findings = await posthog(`
  SELECT toString(uuid), toString(properties.session_id),
         toString(properties.scanner_name), toString(properties.scanner_output_reasoning)
  FROM events
  WHERE event = '$recording_observed'
    AND timestamp > now() - INTERVAL ${LOOKBACK_HOURS} HOUR
    AND properties.scanner_output_verdict = 'yes'
  ORDER BY timestamp DESC
  LIMIT 10
`);

console.log(`${findings.length} finding(s) in the last ${LOOKBACK_HOURS}h`);
let gaps = 0;
let confirmed = 0;

let skipped = 0;
let contradicted = 0;
for (const [observationId, sessionId, scannerName, reasoning] of findings) {
  // Claim before classifying: probes are minutes of real browser time, and a
  // second run must not spend them again on a finding already answered.
  if (!DRY_RUN && !CLASSIFY_ONLY && !(await claimFinding(observationId))) {
    skipped += 1;
    continue;
  }

  // Contradicted claims never reach a probe: minutes of real browser time spent
  // on something our own events say did not happen.
  {
    const events = await fetchSessionEvents(sessionId);
    const why = contradiction(reasoning, events);
    if (why) {
      contradicted += 1;
      console.log(`REFUTED ${sessionId}  ${scannerName} — ${why}`);
      if (!DRY_RUN && !CLASSIFY_ONLY) {
        const ts = await threadFor(sessionId);
        if (ts) {
          await postThreadReply(
            ts,
            `🚫 *Contradicted by our own events* — ${why}. Treat the description as ` +
              `unreliable; the scanner reports what changed but infers why.`
          );
        }
      }
      continue;
    }
  }

  const criterion = classify(reasoning);
  if (!criterion) {
    // A criterion the scanner can raise but no probe can check is a hole in the
    // protocol, not a defect. Say so — silently dropping it is how a claim ends
    // up believed because nobody contradicted it.
    gaps += 1;
    console.log(`GAP   ${sessionId}  ${scannerName}  — no probe covers this claim`);
    continue;
  }

  if (criterion.probes.length === 0) {
    // Checked BEFORE the classify-only shortcut, so a dry classification cannot
    // print "MATCH" for a criterion nothing can actually verify.
    gaps += 1;
    console.log(
      `GAP   ${sessionId}  ${criterion.id} ${criterion.label} — recognised, no probe covers it`
    );
    // CLASSIFY_ONLY must never post — it is the offline way to check the
    // classifier, and it ran as far as the Supabase lookup before this guard.
    if (!DRY_RUN && !CLASSIFY_ONLY) {
      const ts = await threadFor(sessionId);
      if (ts) {
        await postThreadReply(
          ts,
          `🔎 *Needs a human* — the scanner reports ${criterion.label} (${criterion.id}). ` +
            `No probe covers this criterion yet, so it has not been reproduced either way.`
        );
      }
    }
    continue;
  }

  if (CLASSIFY_ONLY) {
    console.log(
      `MATCH ${sessionId}  ${criterion.id} ${criterion.label}  → ${criterion.probes.join(", ")}`
    );
    continue;
  }

  // The reader's own screen, so "could not reproduce" means something.
  const viewport = await sessionViewport(sessionId);
  const results = criterion.probes.map((f) => runProbe(f, viewport));
  const inconclusive = results.some((r) => r.inconclusive);
  // A probe that could not measure has NOT reproduced anything.
  const reproduced = results.some((r) => !r.passed && !r.inconclusive);
  if (reproduced) confirmed += 1;

  const at = viewport
    ? ` at ${viewport.min}px${viewport.max !== viewport.min ? `-${viewport.max}px` : ""}, the size this reader had`
    : "";
  let verdict;
  if (reproduced) {
    verdict =
      `❗ *Reproduced in production${at}* — ${criterion.label} (${criterion.id}). ` +
      results
        .filter((r) => !r.passed && !r.inconclusive)
        .map((r) => `\`${r.file}\` failed: ${r.tail}`)
        .join(" ");
  } else if (inconclusive) {
    // Never report this as a clean pass. The probe did not measure the thing,
    // so we know nothing either way — and saying "passes in production now"
    // would retire a real defect on the strength of a broken probe.
    verdict =
      `🔎 *Could not check${at}* — ${criterion.label} (${criterion.id}). The probe did not reach ` +
      `what it measures, so this is neither confirmed nor cleared; it needs a human. ` +
      results
        .filter((r) => r.inconclusive)
        .map((r) => `\`${r.file}\`: ${r.tail}`)
        .join(" ");
  } else {
    verdict =
      `✅ *Could not reproduce${at}* — ${criterion.label} (${criterion.id}) passes in production now ` +
      `(${results.map((r) => `\`${r.file}\``).join(", ")}). The recording may predate a fix, or ` +
      `depend on a device we do not emulate.`;
  }

  console.log(
    `${reproduced ? "CONFIRM" : inconclusive ? "UNKNOWN" : "CLEAR  "} ${sessionId}  ${criterion.id}`
  );
  if (!DRY_RUN) {
    const threadTs = await threadFor(sessionId);
    if (threadTs) await postThreadReply(threadTs, verdict);
    else console.log(`  (no survey thread for ${sessionId}; not posted)`);
  }
}

console.log(
  `\n${confirmed} reproduced · ${gaps} with no probe coverage` +
    (contradicted ? ` · ${contradicted} contradicted by events` : "") +
    (skipped ? ` · ${skipped} already verified on an earlier run` : "")
);
