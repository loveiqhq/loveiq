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

// Imported, not restated. The cron posts findings and this verifies them; two
// copies of "does our telemetry contradict this claim" would drift the day one
// of them was tuned. Run under tsx so this TypeScript module is importable.
import {
  contradiction,
  fetchSessionEvents,
  isSafeSessionId,
  sessionClickTarget,
  sessionViewport,
} from "../features/ux-review/server/review.ts";

// The only part of this script that writes to GitHub, kept in its own module so
// it can be tested without running everything else. See scripts/lib/replay-pr.mjs.
import { AUTO_PR_CRITERIA, openReproductionPr } from "./lib/replay-pr.mjs";
import { devicesForSession } from "./lib/session-devices.mjs";

/**
 * Criteria where "what did this reader tap" is the relevant evidence. Narrow on
 * purpose: a dead control is exactly a D1, and an unusable call to action is
 * exactly a V1. Adding it to a scroll or a layout criterion would be running a
 * check that cannot speak to the claim.
 */
const CLICK_TARGET_CRITERIA = new Set(["D1", "V1"]);

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
    /**
     * TWO SURFACES, and until 2026-09-17 only one had a probe.
     *
     * `verify-no-survey-restart.mjs` loads `/report/<token>` and asks whether a
     * VALID report offers a way back to the start of the funnel. That answers
     * the report-side claim ("clicking Unlock reset their session back to the
     * survey start page") and nothing else.
     *
     * The regex above deliberately also matches survey-side loops — "back to
     * the survey start", "beginning of the survey", "initial question" — and
     * those were handed to the report probe, which cannot see the survey. It
     * returned clean every time, so six findings in twelve hours were answered
     * with "loop back to an earlier screen (L1) passes in production now" in
     * six readers' Slack threads. `verify-survey-loop.mjs` is the probe for
     * that half; it reproduces on production today.
     *
     * The verifier treats a finding as reproduced if ANY probe reports the
     * defect, so pairing them costs a second browser run and buys an answer
     * about the surface the reader was actually on.
     */
    probes: ["verify-no-survey-restart.mjs", "verify-survey-loop.mjs"],
  },
  {
    // CTA visibility is Marcus's bullet 8, and it is a PROBE, not a model
    // question: in the first viewport, reachable by a tap, big enough. A model
    // scoring 0.20 on defects it can literally see would be guessing at
    // "immediately obvious".
    id: "V1",
    label: "primary CTA not immediately usable",
    match:
      /cta (is )?(not )?(visible|obvious)|call to action.*(hidden|below|off.screen)|had to scroll to (find|reach)|button (was )?(hidden|off.screen)/i,
    probes: ["verify-cta-visibility.mjs", "verify-consent-banner-clearance.mjs"],
  },
  {
    id: "C1",
    label: "clipped or covered content",
    match: /cover(ed|ing)?|overlap|clipped|cut off|hidden behind|obscur/i,
    probes: [
      "verify-nav-heading-clearance.mjs",
      "verify-narrow-viewport.mjs",
      "verify-consent-banner-clearance.mjs",
    ],
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
function runProbe(file, viewport, clickTarget) {
  const widths = viewport
    ? [...new Set([viewport.min, viewport.max].filter((w) => w >= 200 && w <= 2000))].join(",")
    : "";
  /**
   * DEVICES is what actually makes a run session-specific. WIDTHS is read by
   * ONE gate probe; twelve of the rest read DEVICES and were never given it, so
   * they ran a hardcoded list while the verdict claimed otherwise. Null when
   * the viewport is unknown — then the probe keeps its own defaults rather than
   * being handed a guess.
   */
  const deviceList = devicesForSession(viewport);
  try {
    const out = execFileSync("node", [`scripts/probes/${file}`], {
      encoding: "utf8",
      timeout: 10 * 60_000,
      env: {
        ...process.env,
        REPORT_ORIGIN: "https://www.loveiq.org",
        ...(widths ? { WIDTHS: widths } : {}),
        ...(deviceList ? { DEVICES: deviceList } : {}),
        // The page this reader was on and the element they hit, straight from
        // our own dead_click/rage_click events. Absent for sessions that emitted
        // neither, and a probe that needs them then exits 3 rather than guessing.
        ...(clickTarget
          ? { URL_PATH: clickTarget.pathname, TARGET_SELECTOR: clickTarget.selector }
          : {}),
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
/**
 * Returns HOW it went, not merely whether to finalise the claim.
 *
 * This returned a bare boolean, and `true` for both "posted into the thread" and
 * "there was no thread, so nothing was posted" — deliberately, because both
 * should finalise the claim and only a genuine failure should be retried. But it
 * meant the ledger's `delivered` column was true whenever the verdict had been
 * thrown away, which is the single thing that column exists to record. Sessions
 * with no thread are readers who never submitted the survey: the ones who did
 * not convert, and the most interesting findings we have.
 *
 *   "posted"    it reached the thread
 *   "no_thread" nothing to post into; the claim is still finalised
 *   "failed"    Slack refused; leave the claim open so the next run retries
 */
async function deliverVerdict(sessionId, verdict) {
  if (CLASSIFY_ONLY) return "no_thread";
  if (DRY_RUN) {
    // --dry-run is documented as "verify and print", and it printed the verdict
    // CLASSIFICATION but never the message. The text is the part worth reading
    // before it reaches a thread: it is where the probe's own words, the devices
    // it drove and any PR link end up.
    console.log(`  would post to ${sessionId}:\n    ${verdict.replace(/\n/g, "\n    ")}`);
    // Not "posted": a dry run posts nothing, and saying otherwise would be the
    // same untruth this function was just fixed for.
    return "no_thread";
  }
  try {
    const threadTs = await threadFor(sessionId);
    if (!threadTs) {
      console.log(`  (no survey thread for ${sessionId}; not posted — recorded in ux_finding)`);
      return "no_thread";
    }
    await postThreadReply(threadTs, verdict);
    return "posted";
  } catch (err) {
    console.log(
      `  (slack post failed: ${String(err.message).split("\n")[0].slice(0, 100)} — ` +
        `leaving the claim open so the next run retries)`
    );
    return "failed";
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
/**
 * Record what this pipeline concluded, in a table rather than a Slack message.
 *
 * Before this, a verdict survived only as a thread reply — and when a session
 * had no thread (2 of 8 on the runs measured) it was printed to a CI log and
 * thrown away. `slack_alert_sent` stores DELIVERY only, so a contradicted
 * finding and a reproduced one wrote identical rows, and nobody could ask how
 * often a scanner's claim actually holds up.
 *
 * Upsert on the primary key: the verifier claims each observation once, but a
 * re-run after a failed Slack post must correct the row rather than collide.
 *
 * Best effort, and deliberately so. The ledger is bookkeeping; it must never
 * take down the verification it is recording. A failure is logged and the run
 * continues.
 */
async function recordFinding(row) {
  // Same discipline as markVerified: the offline modes have no side effects.
  if (DRY_RUN || CLASSIFY_ONLY) return;
  try {
    // Inside the try on purpose. requireEnv throws, and a bookkeeping table has
    // no business taking down the verification it exists to record.
    const url = requireEnv("SUPABASE_URL");
    const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const res = await fetch(`${url}/rest/v1/ux_finding?on_conflict=observation_id`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(row),
    });
    if (!res.ok) {
      // PostgREST answers a rejected row with a body worth reading — a CHECK
      // violation here means an outcome this table does not know about.
      console.log(`  (ledger write failed ${res.status}: ${(await res.text()).slice(0, 160)})`);
    }
  } catch (err) {
    console.log(`  (ledger write failed: ${String(err.message).split("\n")[0].slice(0, 100)})`);
  }
}

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
    ["The call to action was hidden below the fold.", "V1"],
    ["The user had to scroll to find the unlock button.", "V1"],
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
  /**
   * The exit-code contract itself. runProbe() is where "reproduced" is decided,
   * and it had no test: until 2026-09-14 a probe that merely failed to load a
   * page was indistinguishable from a confirmed defect, which is how a draft PR
   * could have been opened asserting something nobody saw.
   */
  const exitCases = [
    // [exit code, text the probe printed, expect passed, expect inconclusive]
    [0, "", true, false],
    [1, "FAIL (1)", false, false],
    // Deliberately says NOTHING the text backstop would match: otherwise this
    // case passes on the backstop and tests nothing about exit 3 itself. That
    // mistake survived its first mutation run — collapsing exit 3 into
    // "reproduced" still went green, because the word INCONCLUSIVE was in the
    // output either way.
    [3, "could not reach the control", false, true],
    // The backstop for probes that have not migrated: exit 1 but say so in
    // words. Must NOT read as a reproduction.
    [1, "INCONCLUSIVE: the report did not render", false, true],
    [1, "exception: TimeoutError", false, true],
  ];
  for (const [code, say, wantPassed, wantInconclusive] of exitCases) {
    process.env.SELFTEST_EXIT = String(code);
    process.env.SELFTEST_SAY = say;
    const r = runProbe("_selftest-exit.mjs", null);
    if (r.passed !== wantPassed || Boolean(r.inconclusive) !== wantInconclusive) {
      console.error(
        `selftest FAIL (exit ${code}, "${say}"): passed=${r.passed} ` +
          `inconclusive=${Boolean(r.inconclusive)}, wanted ${wantPassed}/${wantInconclusive}`
      );
      process.exitCode = 1;
    }
  }
  delete process.env.SELFTEST_EXIT;
  delete process.env.SELFTEST_SAY;

  // Computed LAST, after every check. `bad` counts only classifier failures;
  // the claim, session-id and exit-code checks signal through process.exitCode,
  // and a bare process.exit(0) discards them — which it did, silently, until
  // 2026-09-14: the selftest printed "FAIL (claim)" and exited 0, so CI's gate
  // could not fail. Reading it before the later checks run reintroduces exactly
  // that, which is what happened when the exit-code cases were first added.
  const failed = bad > 0 || process.exitCode === 1;
  console.log(failed ? `selftest FAILED (${bad} classifier)` : "selftest ok");
  process.exit(failed ? 1 : 0);
}

const findings = await posthog(`
  SELECT toString(uuid), toString(properties.session_id),
         toString(properties.scanner_name), toString(properties.scanner_output_reasoning),
         toFloat(properties.scanner_output_confidence), toFloat(properties.scanner_version)
  FROM events
  WHERE event = '$recording_observed'
    AND timestamp > now() - INTERVAL ${LOOKBACK_HOURS} HOUR
    AND properties.scanner_output_verdict = 'yes'
  ORDER BY timestamp DESC
  LIMIT 50
`);

console.log(`${findings.length} finding(s) in the last ${LOOKBACK_HOURS}h`);

/**
 * How many findings may actually DRIVE A BROWSER in one run.
 *
 * This was `LIMIT 10` in the query above, which bounded the LOOKBACK rather
 * than the work — the same shape as the cron's `slice(0, MAX_POSTS_PER_RUN)`,
 * fixed earlier today. Newest-first with a 6-hour window on a 3-hour schedule
 * means findings come back on two consecutive runs, and an already-verified one
 * still consumed a slot (it is skipped AFTER the limit, not before). Once ten
 * arrived inside one window every older finding ranked below them and was never
 * fetched at all: not claimed, not verified, not counted, simply absent. The
 * drop arrived exactly when the scanners were busiest.
 *
 * The cost this bounds is a probe run — real browsers on two engines, minutes
 * each — against the workflow's 25-minute timeout. Refutations, gaps and
 * duplicates are cheap and do not count.
 *
 * A deferred finding IS already claimed by this point, and what returns it is
 * the two-phase commit: `claim_slack_alert` writes `delivered = FALSE` and
 * hands the claim to the next caller once it is more than ten minutes old. This
 * workflow runs every three hours, so the claim is always stale by then and the
 * finding comes back. That ten-minute window is load-bearing — raise it above
 * the schedule interval and every deferred finding is skipped forever instead.
 * The count is printed rather than swallowed, so a standing backlog is visible.
 */
const PROBE_BUDGET = Number(process.env.PROBE_BUDGET ?? 10);
let probeRuns = 0;
let deferred = 0;
let gaps = 0;
let confirmed = 0;

let skipped = 0;
let contradicted = 0;
/** (session, criterion) pairs already probed in THIS run. */
const probedThisRun = new Set();

for (const [
  observationId,
  sessionId,
  scannerName,
  reasoning,
  confidence,
  scannerVersion,
] of findings) {
  /** What every outcome records, so no exit point can quietly drop a column. */
  const base = {
    observation_id: observationId,
    session_id: sessionId,
    scanner_name: scannerName,
    scanner_version: Number.isFinite(scannerVersion) ? scannerVersion : null,
    confidence: Number.isFinite(confidence) ? confidence : null,
    reasoning: String(reasoning ?? "").slice(0, 4000),
  };

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
    // Say so when the gate could not run. It fails open by design, but a silent
    // fail-open is how the same finding came back refuted on one run and
    // "Reproduced in production" on the next — the difference was a timeout
    // nobody could see.
    if (events === null) {
      console.log(`  (session events unreadable for ${sessionId}; refusal check did not run)`);
    }
    const why = contradiction(reasoning, events);
    if (why) {
      contradicted += 1;
      console.log(`REFUTED ${sessionId}  ${scannerName} — ${why}`);
      const sent = await deliverVerdict(
        sessionId,
        `🚫 *Contradicted by our own events* — ${why}. Treat the description as ` +
          `unreliable; the scanner reports what changed but infers why.`
      );
      // `sent` is a string now, so a bare truthiness test would finalise the
      // claim even on "failed" and the next run would never retry it.
      if (sent !== "failed") await markVerified(observationId);
      await recordFinding({
        ...base,
        outcome: "contradicted",
        contradiction_reason: why,
        delivered: sent === "posted",
      });
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
    // criterion stays null, which is the finding: a claim the scanners keep
    // raising that nothing can check.
    await recordFinding({ ...base, outcome: "gap" });
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
    const sent = await deliverVerdict(
      sessionId,
      `🔎 *Needs a human* — the scanner reports ${criterion.label} (${criterion.id}). ` +
        `No probe covers this criterion yet, so it has not been reproduced either way.`
    );
    if (sent !== "failed") await markVerified(observationId);
    await recordFinding({
      ...base,
      outcome: "gap",
      criterion: criterion.id,
      delivered: sent === "posted",
    });
    continue;
  }

  /**
   * One session, one criterion, one set of probe runs.
   *
   * The scanners emit an observation per CLAIM, not per session, so two claims
   * about the same recording that both classify to the same criterion each
   * spent the full probe budget. That happened on 2026-09-15: session
   * 01a0a59b was probed twice for L1 in a single run. Probes drive real
   * browsers on two engines and take minutes each, so this is wasted wall clock
   * for an answer already computed — and it posts the same verdict twice into
   * the same thread.
   *
   * The claim above is keyed by OBSERVATION id, deliberately: it exists to stop
   * a later run re-answering a finding. It cannot collapse these, because the
   * criterion is only known after classification.
   */
  const pairKey = `${sessionId}:${criterion.id}`;
  if (probedThisRun.has(pairKey)) {
    console.log(`DUP   ${sessionId}  ${criterion.id} — same criterion already probed this run`);
    await markVerified(observationId);
    await recordFinding({ ...base, outcome: "duplicate", criterion: criterion.id });
    continue;
  }
  if (!CLASSIFY_ONLY && probeRuns >= PROBE_BUDGET) {
    // Deliberately NOT marked verified: the claim goes stale in ten minutes and
    // the next run re-claims it. Marking it here would lose the finding.
    deferred += 1;
    continue;
  }
  probedThisRun.add(pairKey);
  if (!CLASSIFY_ONLY) probeRuns += 1;

  if (CLASSIFY_ONLY) {
    console.log(
      `MATCH ${sessionId}  ${criterion.id} ${criterion.label}  → ${criterion.probes.join(", ")}`
    );
    continue;
  }

  // The reader's own screen, so "could not reproduce" means something.
  const viewport = await sessionViewport(sessionId);
  if (!viewport) {
    // Silent degradation otherwise: the probes fall back to their own device
    // lists and the verdict quietly stops claiming a device. Observed once on
    // 2026-09-17 for a session whose viewport resolves fine on every retry, so
    // this is a transient PostHog read, not missing data — and it is worth
    // seeing a pattern of it in the log. `ux_finding.devices` is null for these.
    console.log(`  (no viewport for ${sessionId}; probes run on their own defaults)`);
  }
  const clickTarget = await sessionClickTarget(sessionId);
  if (!clickTarget && CLICK_TARGET_CRITERIA.has(criterion.id)) {
    // Same silent-degradation risk as the viewport above: without it the
    // dead-click probe is simply not appended, and the run is quietly weaker
    // rather than wrong. `ux_finding.target_selector` is null for these, so the
    // rate is queryable rather than a matter of opinion. Both lookups were
    // measured deterministic in isolation (6/6) and 36 back-to-back PostHog
    // queries all returned 200, so this is a rare transient, not rate limiting.
    console.log(`  (no dead_click/rage_click target for ${sessionId}; that probe is skipped)`);
  }

  /**
   * One probe is added by the SESSION rather than by the criterion.
   *
   * `verify-dead-click-target.mjs` checks the element this reader actually
   * tapped, so it is only meaningful when our own telemetry recorded one. It is
   * appended rather than listed in CRITERIA because a criterion-level entry
   * would run it for every finding, and for the sessions with no click event it
   * would return "could not measure" — which would drag an otherwise clean
   * verdict down to inconclusive on findings it has nothing to say about.
   */
  const probeFiles = [...criterion.probes];
  if (clickTarget && CLICK_TARGET_CRITERIA.has(criterion.id)) {
    probeFiles.push("verify-dead-click-target.mjs");
  }

  const results = probeFiles.map((f) => runProbe(f, viewport, clickTarget));
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

  /**
   * Say what was actually driven. This read "at 262px-715px, the size this
   * reader had" on EVERY verdict, including the thirteen probes that never
   * received the width and ran a hardcoded device list — a claim about the
   * evidence that the evidence did not support. Now the devices are real,
   * naming them is both honest and more useful than a pixel range.
   */
  const ranOn = devicesForSession(viewport);
  const at = ranOn
    ? ` on ${ranOn}, matched to this reader's ${viewport.min}px${
        viewport.max !== viewport.min ? `-${viewport.max}px` : ""
      } screen`
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
  const sent = await deliverVerdict(sessionId, verdict);
  if (sent !== "failed") await markVerified(observationId);

  // The row is written whether or not a thread existed to post into. That gap
  // is the reason this table exists: a session with no survey submission has no
  // Slack thread, and those are the readers who did NOT convert — the most
  // interesting findings we have, and the ones that used to vanish.
  await recordFinding({
    ...base,
    outcome: reproduced ? "reproduced" : inconclusive ? "inconclusive" : "clear",
    criterion: criterion.id,
    probe_runs: results.map((r) => ({
      file: r.file,
      passed: r.passed,
      inconclusive: Boolean(r.inconclusive),
      tail: String(r.tail ?? "").slice(0, 600),
    })),
    devices: ranOn,
    viewport_min: viewport?.min ?? null,
    viewport_max: viewport?.max ?? null,
    os: viewport?.os || null,
    url_path: clickTarget?.pathname ?? null,
    target_selector: clickTarget?.selector ?? null,
    pr_url: prUrl,
    delivered: sent === "posted",
  });
}

console.log(
  `\n${confirmed} reproduced · ${gaps} with no probe coverage` +
    (contradicted ? ` · ${contradicted} contradicted by events` : "") +
    (skipped ? ` · ${skipped} already verified on an earlier run` : "") +
    // Never silent: a deferred finding is the thing that used to disappear.
    (deferred ? ` · ${deferred} left for the next run (probe budget ${PROBE_BUDGET})` : "")
);
