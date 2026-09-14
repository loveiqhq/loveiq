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
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

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
    // Widened 2026-09-14 from REAL claims, not invented ones. A textbook loop —
    // "the survey unexpectedly resets back to the initial question state,
    // landing back at the start of the questionnaire" — matched neither L1 nor
    // B1 and fell through to "no probe covers this claim". Loops are the most
    // common thing these scanners report (3 of the 5 day-one findings), so the
    // classifier missing them is the expensive gap. Every alternative below is
    // taken verbatim from an observation we have actually seen.
    match:
      /loop(ed|s|ing)? back|a loop where|back (to|at) the (survey |questionnaire )?(start|beginning)|beginning of the survey|(returned|sent|taken|redirected)( \w+){0,2} back to|returned to (an )?earlier|reset(s|ting)? back|start(ed)? (the survey )?(over|from scratch)|re-?initiali[sz]ed|already completed|first (introduction |intro )?screen|initial question/i,
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
    // console-audit.mjs is deliberately NOT here: it asserts nothing and always
    // exits 0, so including it only adds a passing result that reads as
    // evidence of health.
    probes: ["verify-checkout-error-copy.mjs"],
  },
  {
    // B1 was listed as "no probe at all" until it fired for real on 2026-09-14:
    // the consent screen's "Return to site" wiped the reader's answers and sent
    // them to the token-less /report. L1 sits above this and catches most loop
    // wording; B1 catches the claims that name a direction rather than a loop.
    id: "B1",
    label: "sent backwards through the funnel",
    match: /backwards|earlier step|previous (screen|step)|start over|back to the (site|home)/i,
    probes: ["verify-consent-return.mjs", "verify-no-survey-restart.mjs"],
  },
  {
    id: "A1",
    label: "text readable through a blur meant to hide it",
    match: /through the blur|readable .*blur|blur(red)? .*(readable|legible)|not fully blurred/i,
    // audit-paywall-layout.mjs now exits on its #2 measurement — legible text
    // under an overlay meant to hide it, which is exactly A1 — so it can gate.
    // Its #1 white-gap measurement stays printed but ungated: that is a layout
    // judgement with a chosen threshold, and gating on it would fire on a
    // deliberate design.
    probes: ["audit-paywall-layout.mjs"],
  },
  {
    id: "M1",
    label: "content that never rendered",
    match:
      /never render|did not render|missing (section|image|content)|blank (section|area)|image .*(broken|did not load)/i,
    // audit-visual.mjs now exits on images that are present but never painted,
    // which is the objective half of M1 — and the half Mark reported twice
    // ("Images/Icons are broken on paywall", "Same on Landing Page"). The other
    // half, a REPORT_SECTION_ORDER anchor that is absent, is covered by
    // reportSectionOrder.test.ts in the unit suite rather than by a probe.
    probes: ["audit-visual.mjs"],
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
    // Exit 3 is the contract, but most probes predate it and exit 1 for
    // "could not measure" too: verify-narrow-viewport and
    // verify-nav-heading-clearance (both C1) and verify-consent-return (B1) all
    // count an unrendered page as a failure — and all three are in
    // AUTO_PR_CRITERIA, so a report that simply did not load would have opened
    // a draft PR claiming a reproduction. They print INCONCLUSIVE or
    // "exception:" when that happens, so read that too until they all exit 3.
    //
    // Known imprecision, chosen deliberately: a probe reports every device in
    // one stream, so a run where ONE device could not measure and ANOTHER
    // genuinely reproduced the defect reads as inconclusive overall. That
    // degrades the finding to "could not check — needs a human", which is still
    // POSTED, not dropped. Erring this way costs a slower human look; erring
    // the other way opens a draft PR asserting a defect that was never seen.
    // The real fix is migrating every probe to exit 3.
    const inconclusive = err.status === 3 || /\bINCONCLUSIVE\b|\bexception:/i.test(out);
    return {
      file,
      passed: false,
      inconclusive,
      tail: out.split("\n").slice(-3).join(" | "),
    };
  }
}

/**
 * Criteria a reproduction may open a pull request for.
 *
 * Narrow on purpose. Each of these has a probe that fails before a fix and
 * passes after, so "reproduced" is a fact rather than a reading. The remaining
 * criteria (E1's wider error class, S1's scroll heuristics, M1) still go to a
 * human in the thread.
 */
const AUTO_PR_CRITERIA = new Set(["C1", "D1", "Z1", "B1"]);

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();

/**
 * Open a DRAFT pull request carrying the reproduction.
 *
 * What this does NOT do is write the fix. A script can reproduce
 * deterministically; choosing the change is judgement, and a generated diff
 * merged on a green probe is how you ship a confident wrong fix. So the PR
 * carries the evidence — which criterion, which session, which viewport, which
 * probe failed and its output — and the fix is added on the branch afterwards.
 * It is never merged automatically.
 *
 * Guarded by UX_REVIEW_OPEN_PR so it cannot fire from a laptop by accident.
 */
function openReproductionPr({ criterion, sessionId, viewport, results }) {
  if (process.env.UX_REVIEW_OPEN_PR !== "1") return null;
  if (!AUTO_PR_CRITERIA.has(criterion.id)) return null;
  // Belt and braces: this value becomes a git ref.
  if (!isSafeSessionId(sessionId)) return null;

  const short = sessionId.slice(0, 8);
  const branch = `replay/${criterion.id.toLowerCase()}-${short}`;
  const at = viewport ? `${viewport.min}px-${viewport.max}px` : "unknown viewport";
  const failed = results.filter((r) => !r.passed && !r.inconclusive);

  const record = {
    criterion: criterion.id,
    label: criterion.label,
    session_id: sessionId,
    recording: `https://eu.posthog.com/project/244778/replay/${sessionId}`,
    viewport: viewport ?? null,
    probes: failed.map((r) => ({ file: r.file, output: r.tail })),
    reproduced: true,
  };

  try {
    // A branch that already exists means this reproduction already has a PR.
    const exists = execFileSync("git", ["ls-remote", "--heads", "origin", branch], {
      encoding: "utf8",
    }).trim();
    if (exists) return null;

    const dir = "scripts/replay-bench/reproductions";
    mkdirSync(dir, { recursive: true });
    const file = `${dir}/${criterion.id.toLowerCase()}-${short}.json`;
    writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`);

    git("checkout", "-b", branch);
    git("add", file);
    git(
      "-c",
      "user.name=loveiq-ux-review",
      "-c",
      "user.email=ec@loveiq.org",
      "commit",
      "-m",
      `test(replay): reproduce ${criterion.id} from session ${short}\n\n` +
        `${criterion.label}, reproduced at ${at} — the size this reader had.\n` +
        `${failed.map((r) => `${r.file}: ${r.tail}`).join("\n")}\n\n` +
        `For Marcus: An automatic check found a real problem in a recording of ` +
        `someone using the site, and reproduced it. No fix yet - this just records it.`
    );
    git("push", "origin", branch);

    const body =
      `Reproduced **${criterion.label}** (\`${criterion.id}\`) at **${at}**, the viewport this ` +
      `session reported.\n\n` +
      `- Recording: ${record.recording}\n` +
      `- Probe output:\n\n` +
      failed.map((r) => `\`\`\`\n${r.file}\n${r.tail}\n\`\`\``).join("\n") +
      `\n\n**No fix is included.** The reproduction is deterministic; the fix is not, and a ` +
      `generated diff riding a green probe is how a confident wrong fix ships. Add the change on ` +
      `this branch, then prove it: the probe must FAIL under \`MUTATE=1\` and pass without it.\n\n` +
      `The scanner's criteria have not cleared the benchmark ` +
      `(see \`scripts/replay-bench/results/\`), so treat the diagnosis as unconfirmed even though ` +
      `the reproduction is real.`;

    const url = execFileSync(
      "gh",
      [
        "pr",
        "create",
        "--draft",
        "--base",
        "main",
        "--head",
        branch,
        "--title",
        `${criterion.id}: ${criterion.label} (session ${short})`,
        "--body",
        body,
      ],
      { encoding: "utf8" }
    ).trim();
    return url;
  } catch (err) {
    console.log(`  (could not open a PR: ${String(err.message).split("\n")[0].slice(0, 120)})`);
    return null;
  } finally {
    try {
      git("checkout", "-");
    } catch {
      /* best effort */
    }
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
/**
 * Post a verdict into the submission's thread and say whether the claim may be
 * finalised.
 *
 * postThreadReply throws on an ordinary Slack failure — a rate limit,
 * not_in_channel, a revoked scope. Uncaught, that killed the whole batch: one
 * throttled message and findings later in the run never had their claims
 * attempted, after their probes had already spent real browser minutes.
 *
 * A failed post deliberately does NOT finalise the claim. The claim goes stale
 * after ten minutes and the next run retries, which is the behaviour we want:
 * the verdict still has to reach a human. Only a post that succeeded — or a
 * finding with no thread to post into, where retrying changes nothing — is
 * marked done.
 */
async function deliverVerdict(sessionId, verdict) {
  if (DRY_RUN || CLASSIFY_ONLY) return true;
  try {
    const threadTs = await threadFor(sessionId);
    if (threadTs) {
      await postThreadReply(threadTs, verdict);
    } else {
      console.log(`  (no survey thread for ${sessionId}; not posted)`);
    }
    return true;
  } catch (err) {
    console.log(
      `  (slack post failed: ${String(err.message).split("\n")[0].slice(0, 100)} — ` +
        `leaving the claim open so the next run retries)`
    );
    return false;
  }
}

/**
 * Finalise the claim taken by claimFinding().
 *
 * claim_slack_alert inserts with delivered = FALSE and hands the claim back to
 * ANY caller once claimed_at is older than ten minutes. Without this companion
 * the claim never becomes permanent, so the three-hourly workflow — whose
 * lookback deliberately spans two runs — re-claimed every finding, re-ran its
 * probes (ten minutes of real browser time each) and posted a SECOND, possibly
 * contradictory, reply into the same reader's thread. The overlap exists to
 * survive a failed run; the claim is what stops it double-posting, and a claim
 * that is never delivered does not stop anything.
 *
 * Called on every terminal path, including the ones that post nothing: the work
 * was done either way and must not be repeated.
 */
async function markVerified(observationId) {
  if (DRY_RUN || CLASSIFY_ONLY) return;
  const url = requireEnv("SUPABASE_URL");
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  try {
    await fetch(`${url}/rest/v1/rpc/mark_slack_alert_delivered`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        p_kind: "ux_review_verified",
        p_entity_type: "observation",
        p_entity_id: observationId,
      }),
    });
  } catch {
    // Best effort: a missed finalisation costs a duplicate next run, which is
    // strictly better than aborting the run that already did the work.
  }
}

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
 *  next to the finding rather than at the bottom of the channel. This is the
 *  only copy: review.ts's findThreadTs() was deleted once the cron stopped
 *  posting findings. Unlike that one, this hard-fails on a missing secret
 *  rather than returning null, which is this script's stated contract. */
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
    // Verbatim from real observations. These are the claims the classifier is
    // for; inventing test phrasings is how a gap survives its own test suite.
    [
      "the survey unexpectedly resets back to the initial question state, landing back at the start of the questionnaire",
      "L1",
    ],
    [
      "the user clicked 'Unlock full report', which looped them back to the beginning of the survey",
      "L1",
    ],
    ["the survey unexpectedly looped back to the very first introduction screen", "L1"],
    ["representing a loop where the user is sent back to a screen already completed", "L1"],
    ["redirected the user back to the 18+ age verification consent screen", "L1"],
    // The four criteria added 2026-09-14. B1 sits BELOW L1, so loop wording
    // must still reach L1 — that ordering is the thing these pin.
    ["The CTA sent the user backwards through the funnel.", "B1"],
    ["Text was readable through the blur meant to hide it.", "A1"],
    ["A section never rendered and left a blank area.", "M1"],
    ["The user was looped back to the survey start.", "L1"],
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
  // The session id comes back from PostHog and is about to become a git branch
  // name, a Supabase filter and a HogQL literal. isSafeSessionId was imported
  // and then only ever exercised in the selftest; validate for real, once, so
  // everything downstream inherits it. Refuse rather than sanitise.
  if (!isSafeSessionId(sessionId)) {
    console.log(`SKIP    malformed session id ${JSON.stringify(String(sessionId).slice(0, 40))}`);
    continue;
  }

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
      const delivered = await deliverVerdict(
        sessionId,
        `🚫 *Contradicted by our own events* — ${why}. Treat the description as ` +
          `unreliable; the scanner reports what changed but infers why.`
      );
      if (delivered) await markVerified(observationId);
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
    await markVerified(observationId);
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
    const delivered = await deliverVerdict(
      sessionId,
      `🔎 *Needs a human* — the scanner reports ${criterion.label} (${criterion.id}). ` +
        `No probe covers this criterion yet, so it has not been reproduced either way.`
    );
    if (delivered) await markVerified(observationId);
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

  // A reproduced defect on a narrow criterion becomes a draft PR carrying the
  // evidence. Never merged, and never containing a generated fix.
  // --dry-run and --classify-only must have NO side effects. Without this guard
  // the workflow's own dry_run path would still push a branch and open a PR,
  // because it sets UX_REVIEW_OPEN_PR=1 for both branches of its if.
  const prUrl =
    reproduced && !DRY_RUN && !CLASSIFY_ONLY
      ? openReproductionPr({ criterion, sessionId, viewport, results })
      : null;

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
        .join(" ") +
      (prUrl ? ` Draft PR with the reproduction: ${prUrl}` : "");
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
  if (await deliverVerdict(sessionId, verdict)) await markVerified(observationId);
}

console.log(
  `\n${confirmed} reproduced · ${gaps} with no probe coverage` +
    (contradicted ? ` · ${contradicted} contradicted by events` : "") +
    (skipped ? ` · ${skipped} already verified on an earlier run` : "")
);
