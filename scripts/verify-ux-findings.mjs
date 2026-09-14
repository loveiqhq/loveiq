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
const CRITERIA = [
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
    probes: ["verify-nav-heading-clearance.mjs", "audit-visual.mjs"],
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

/**
 * Claims that name an action we instrument, and the events that must exist if
 * the action really happened.
 *
 * Read a day of findings and the failure mode is consistent: the scanner sees
 * that something changed and invents why. On 2026-09-14 one said "the user
 * clicked 'Unlock full report', which looped them back to the survey" for a
 * session containing no unlock_click, no paywall_initiated and no checkout
 * event — the navigation was real, the cause was fabricated, at 0.9 confidence.
 *
 * This is the cheap deterministic check for that: if the prose names an action,
 * require its event in the same session. Absent means our own telemetry
 * contradicts the claim, and no probe should be spent on it.
 *
 * Deliberately narrow. Only actions with an unambiguous event are listed; a
 * missing entry means "cannot check", never "contradicted".
 */
const CLAIM_EVIDENCE = [
  {
    claim: /clicked? ['"]?unlock|unlock full report|pressed unlock|tapped unlock/i,
    requireAny: ["unlock_click", "paywall_initiated", "sticky_unlock_clicked", "lock_icon_clicked"],
    describes: "an unlock click",
  },
  {
    claim: /checkout|payment modal|stripe/i,
    requireAny: ["checkout_started", "begin_checkout", "paywall_initiated", "unlock_click"],
    describes: "reaching checkout",
  },
  {
    claim: /completed the survey|finished the survey|after completion/i,
    requireAny: ["survey_completed"],
    describes: "completing the survey",
  },
];

/**
 * A session id, or nothing.
 *
 * These reach us through PostHog event properties, but they originate in the
 * visitor's own browser — posthog-js generates them client side — so they are
 * attacker-influenceable text on their way into a HogQL string. Stripping
 * quotes was the first version and is the weak form of this: it tries to make
 * hostile input safe instead of refusing it. UUID-shaped ids are the only thing
 * that can be legitimate here, so anything else is rejected outright.
 */
function safeSessionId(sessionId) {
  return /^[A-Za-z0-9-]{1,64}$/.test(sessionId) ? sessionId : null;
}

/** Events present in one session, for contradicting a claim. */
async function sessionEvents(sessionId) {
  const safe = safeSessionId(sessionId);
  if (!safe)
    throw new Error(`refusing to query a malformed session id: ${String(sessionId).slice(0, 32)}`);
  const rows = await posthog(`
    SELECT DISTINCT event
    FROM events
    WHERE timestamp > now() - INTERVAL 30 DAY
      AND properties.$session_id = '${safe}'
  `);
  return new Set(rows.map((r) => String(r[0])));
}

/** Returns a reason string when our telemetry contradicts the claim. */
function contradiction(reasoning, events) {
  for (const rule of CLAIM_EVIDENCE) {
    if (!rule.claim.test(reasoning)) continue;
    if (rule.requireAny.some((e) => events.has(e))) continue;
    return `the recording describes ${rule.describes}, but the session has none of ${rule.requireAny.join(", ")}`;
  }
  return null;
}

function classify(reasoning) {
  return CRITERIA.find((c) => c.match.test(reasoning)) ?? null;
}

function runProbe(file) {
  try {
    const out = execFileSync("node", [`scripts/probes/${file}`], {
      encoding: "utf8",
      timeout: 10 * 60_000,
      env: { ...process.env, REPORT_ORIGIN: "https://www.loveiq.org" },
    });
    return { file, passed: true, tail: out.trim().split("\n").slice(-3).join(" | ") };
  } catch (err) {
    const out = `${err.stdout ?? ""}${err.stderr ?? ""}`.trim();
    return { file, passed: false, tail: out.split("\n").slice(-3).join(" | ") };
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
    ["the user clicked 'Unlock full report', which looped them back", [], true],
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
    if ((safeSessionId(id) !== null) !== wantOk) {
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
  console.log(bad ? `selftest FAILED (${bad})` : "selftest ok");
  process.exit(bad ? 1 : 0);
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
    const events = await sessionEvents(sessionId);
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

  const results = criterion.probes.map(runProbe);
  const reproduced = results.some((r) => !r.passed);
  if (reproduced) confirmed += 1;

  const verdict = reproduced
    ? `❗ *Reproduced in production* — ${criterion.label} (${criterion.id}). ` +
      results
        .filter((r) => !r.passed)
        .map((r) => `\`${r.file}\` failed: ${r.tail}`)
        .join(" ")
    : `✅ *Could not reproduce* — ${criterion.label} (${criterion.id}) passes in production now ` +
      `(${results.map((r) => `\`${r.file}\``).join(", ")}). The recording may predate a fix, or ` +
      `depend on a device we do not emulate.`;

  console.log(`${reproduced ? "CONFIRM" : "CLEAR  "} ${sessionId}  ${criterion.id}`);
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
