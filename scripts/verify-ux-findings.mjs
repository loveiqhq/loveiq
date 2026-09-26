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
import { existsSync, readFileSync } from "node:fs";

// Imported, not restated. The cron posts findings and this verifies them; two
// copies of "does our telemetry contradict this claim" would drift the day one
// of them was tuned. Run under tsx so this TypeScript module is importable.
import {
  confirmedByReplayAlone,
  contradiction,
  fetchSessionEvents,
  isSafeSessionId,
  paywallLeftOpen,
  sessionClickTarget,
  reportTokenForSession,
  sessionViewport,
  restartForSurveySession,
  surveyRestartWitness,
} from "../features/ux-review/server/review.ts";

// The only part of this script that writes to GitHub, kept in its own module so
// it can be tested without running everything else. See scripts/lib/replay-pr.mjs.
import { AUTO_PR_CRITERIA, openReproductionPr } from "./lib/replay-pr.mjs";
import { devicesForSession } from "./lib/session-devices.mjs";
import { redactReportToken } from "./lib/redact-report-token.mjs";
import { UX_SCANNERS } from "../features/ux-review/server/scanners.ts";
import { withoutTrackingParams } from "../shared/url/utm.ts";
import { hogQuery } from "./lib/hogql.mjs";
// Shared with scripts/replay-bench/score.mjs, which runs under plain node and
// cannot import this file. That module documents what earns a probe a place in
// the set, and why an unscoped `clear` is not evidence about anyone.
import { CLAIM_SCOPED_PROBES, SESSION_REPLAY_PROBES } from "./lib/claim-scoped-probes.mjs";

/**
 * Probes that OPEN A REPORT, and are therefore claim-scoped once they are given
 * the reader's own token rather than the hardcoded internal default.
 *
 * Listed rather than inferred for the same reason CLAIM_SCOPED_PROBES is: "does
 * this file read REPORT_TOKEN" is not observable from here, and a wrong guess
 * marks a canonical-page pass as evidence about a reader.
 */
/**
 * The probes a tap criterion lists that only ever open /report/<token>, so
 * have nothing to say about a tap anywhere else (see probesFor). Measured, not
 * guessed: each references the report and never reads URL_PATH or opens
 * /survey. The selftest re-derives that from the files in both directions, so
 * a probe that changes what it opens, or a new report-only probe added to D1
 * or V1, fails CI instead of quietly judging the wrong page.
 */
const REPORT_ONLY_PROBES = new Set([
  "verify-cta-visibility.mjs",
  "verify-paywall-card-tap.mjs",
  "verify-tap-targets.mjs",
]);

const REPORT_TOKEN_PROBES = new Set([
  "verify-no-survey-restart.mjs",
  "verify-survey-loop.mjs",
  "verify-narrow-viewport.mjs",
  "verify-locked-preview-tap.mjs",
  "verify-stage-carousel-swipe.mjs",
  "audit-visual.mjs",
]);

/**
 * Criteria where "what did this reader tap" is the relevant evidence. Narrow on
 * purpose: a dead control is exactly a D1, and an unusable call to action is
 * exactly a V1. Adding it to a scroll or a layout criterion would be running a
 * check that cannot speak to the claim.
 */
/**
 * How many findings one run may FETCH. Not a work bound — PROBE_BUDGET is that.
 * This only has to be larger than the busiest lookback window will ever be.
 * Measured over the first week: 7, 7, 11, 12, 33, 10, 57 yes-findings a day —
 * so 500 is about 9x the worst real day, not the "two orders" an earlier draft
 * of this comment claimed. A backfill is what produced both spikes, and a
 * backfill is exactly when this would bite, so keep the margin generous. The
 * run shouts if the limit is ever reached; see the check after the query.
 */
const FINDINGS_FETCH_LIMIT = Number(process.env.FINDINGS_FETCH_LIMIT ?? 500);

/**
 * How many own-event groups one run may FETCH. Same discipline as the limit
 * above: not a work bound, just larger than the busiest window. Measured
 * 2026-09-21 — 5 groups over 24h, 11 over 72h, 32 over 33 days.
 */
const OWN_EVENT_FETCH_LIMIT = Number(process.env.OWN_EVENT_FETCH_LIMIT ?? 500);

const CLICK_TARGET_CRITERIA = new Set(["D1", "V1"]);

/**
 * Which probes judge a finding: the criterion's own, less any that answer
 * about a page the reader was not on, plus the one keyed to what they tapped.
 * Pure, so the selftest can pin every branch without a browser.
 */
function probesFor(criterion, clickTarget) {
  /**
   * A PROBE MUST ANSWER ABOUT THE PAGE THE CLAIM IS ON.
   *
   * D1 ("dead control") lists two probes, and both open the REPORT and test its
   * paywall. Of the 46 D1 findings from 2026-09-17 to 2026-09-23, 41 were dead
   * taps on /survey — mostly our own dead_click events on the survey's buttons —
   * and every one was judged partly by whether the report's pricing card opens.
   * 39 came back "could not reproduce", which says nothing about the survey. Two
   * came back INCONCLUSIVE because the report probes found no sticky unlock bar
   * on Desktop Chrome, and one of those reached Slack as "needs a human" while
   * both checks that looked at the reader's actual tap had passed.
   *
   * So for the criteria whose subject IS the tapped element, report-only probes
   * are dropped when the tap was somewhere else. `verify-dead-click-target.mjs`
   * is still appended below and judges the reader's own element on their own
   * page, which is what D1 asks. When the page is unknown nothing is dropped:
   * that would remove the only probes some findings have.
   *
   * Keyed on the session, never on the scanner's text. A second finding for the
   * same session and criterion inherits the first one's answer (pairKey, in the
   * main loop), which is only sound while the probe set depends on nothing a
   * scanner wrote.
   */
  const tapWasOffReport =
    CLICK_TARGET_CRITERIA.has(criterion.id) &&
    clickTarget !== null &&
    !clickTarget.pathname.startsWith("/report");
  const probeFiles = criterion.probes.filter(
    (f) => !(tapWasOffReport && REPORT_ONLY_PROBES.has(f))
  );

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
  if (clickTarget && CLICK_TARGET_CRITERIA.has(criterion.id)) {
    // Spread from the set rather than naming the file again. The two used to be
    // separate literals, and a probe added to one and not the other is invisible:
    // either it runs but never stamps claimScoped, or it stamps a flag for a probe
    // that never runs. Both end as `clear` rows the scorer sets aside, which reads
    // as a healthy, filling ledger.
    probeFiles.push(...CLAIM_SCOPED_PROBES);
  }
  return probeFiles;
}

/**
 * Criteria where "did the survey actually restart" is the question.
 *
 * L1 is "loop back to an earlier screen" and B1 is "sent backwards through the
 * funnel" — both are claims about a journey, which is exactly what a probe
 * driving production today cannot see and what our own log recorded at the
 * time. Narrow on purpose: a restart says nothing about a covered heading.
 */
const RESTART_WITNESS_CRITERIA = new Set(["L1", "B1"]);

/**
 * Evidence that is OUR OWN RECORD of what happened to this reader, not a probe.
 *
 * A probe re-performs a defect on an emulated phone; these read what our own
 * events logged at the time. The verdict says which one confirmed a finding,
 * because "Reproduced in production on Pixel 7" over a finding nothing re-ran
 * on a Pixel 7 is a claim the evidence does not support.
 */
const OWN_RECORD_EVIDENCE = new Set(["survey-behaviour-log", "paywall-exit-log"]);

/**
 * Scanners whose findings are an EXPERIMENT and must not speak to the team.
 *
 * A challenger observes the same recordings as its champion so the two can be
 * compared on identical evidence. Its findings are probed and written to the
 * ledger — that is the whole point, it cannot be scored otherwise — but they
 * never reach a reader's Slack thread and never open a pull request. A prompt
 * being trialled has not earned either.
 *
 * Read from scanners.ts by NAME, because that is what the observation event
 * carries. A scanner missing from git is treated as a champion: the drift
 * check already alerts on it, and the safe default for an unknown scanner is
 * the behaviour we have always had, not silent suppression.
 */
const CHALLENGER_NAMES = new Set(
  UX_SCANNERS.filter((s) => s.role === "challenger").map((s) => s.name)
);
export const isChallenger = (scannerName) => CHALLENGER_NAMES.has(String(scannerName));

const DRY_RUN = process.argv.includes("--dry-run");
/** Map findings to criteria and stop. Probes drive real browsers against
 *  production and take minutes each, so this is the fast way to see whether the
 *  classifier is matching the prose the scanners currently emit. */
const CLASSIFY_ONLY = process.argv.includes("--classify-only");
const PROJECT = "244778";
/**
 * How far back a run looks — and therefore how long a DEFERRED finding stays
 * reachable.
 *
 * This was 6, on the stated reasoning that "this workflow runs every three
 * hours, so the claim is always stale by then and the finding comes back".
 * The schedule says `41 * / 3 * * *`; GitHub actually fires about five of those
 * eight runs a day, with real gaps up to 6h36m — measured 2026-09-20 over the
 * six days since the scanners went live. A gap longer than the window means the
 * findings a run deferred have aged out before the next one looks, so
 * "left for the next run" was a promise nothing kept.
 *
 * It cost 9 of 60 findings (15%). The 2026-09-18 11:48 run printed
 * "21 finding(s) in the last 6h … 7 left for the next run (probe budget 10)";
 * the six oldest of that tail have no ledger row and never will.
 *
 * Widening this is cheap because it does NOT widen the work: PROBE_BUDGET still
 * bounds real browser time, and an already-answered finding is rejected by
 * claimFinding for one Supabase round-trip, before any probe starts. A day is
 * comfortably longer than any gap GitHub has produced, and matches the window
 * the digest already reports on.
 */
const LOOKBACK_HOURS = Number(process.env.LOOKBACK_HOURS ?? 24);

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
      /loop(ed|s|ing)?( \w+){0,2} back|looped( \w+){3} back|a loop where|restart(ed|s)? from the (beginning|start)|reset(s|ting)?( \w+){0,2} to an earlier|back (to|at) the (survey |questionnaire )?(start|beginning)|beginning of the survey|(returned|sent|taken|redirected)( \w+){0,2} back to|returned to (an )?earlier|reset(s|ting)? back|start(ed)? (the survey )?(over|from scratch)|re-?initiali[sz]ed|already completed|first (introduction |intro )?screen|introductory (survey )?(intro )?screen|initial question/i,
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
    /**
     * An unhandled exception in our own bundle. NO PROBE, deliberately.
     *
     * A browser check driving production today cannot reproduce a hydration
     * mismatch, or a ChunkLoadError that hit one reader mid-deploy. A probe
     * that cannot reproduce it would return a clean verdict — the exact false
     * evidence this pipeline has been full of. So this routes to the
     * "recognised, no probe covers it" path, which asks a human instead.
     *
     * Matched on the exact phrasing the exception lane generates rather than on
     * loose words like "error": E1 already owns error messages a reader can
     * SEE, and a broad pattern here would steal its findings.
     */
    id: "X1",
    label: "unhandled error in our own code",
    match: /An unhandled error was thrown in our own code while a reader was on/i,
    probes: [],
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

const posthog = (query) =>
  hogQuery(query, { projectId: PROJECT, apiKey: requireEnv("POSTHOG_API_KEY"), label: "verifier" });

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
function runProbe(file, viewport, clickTarget, reportToken, sessionId) {
  /**
   * Recorded on the run, not inferred later from the file name: whether this
   * probe was actually handed something the scanner claimed. Without the click
   * target the dead-click probe is not appended at all, so the flag is false
   * for every probe in that run and the resulting `clear` is correctly read as
   * "nothing here could have contradicted the claim".
   */
  /**
   * A probe handed THIS reader's report is answering about them, not about a
   * canonical page — which is the property that makes a `clear` mean anything.
   */
  const claimScoped =
    (CLAIM_SCOPED_PROBES.has(file) && Boolean(clickTarget)) ||
    (REPORT_TOKEN_PROBES.has(file) && Boolean(reportToken)) ||
    (SESSION_REPLAY_PROBES.has(file) && Boolean(sessionId));
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
        // The session whose route is being replayed. Only replay-session.mjs
        // reads it; passed unconditionally because every finding has one.
        ...(sessionId ? { SESSION_ID: sessionId } : {}),
        /**
         * This reader's own report. Absent for a survey-only session, and the
         * probe then keeps its hardcoded internal default rather than opening
         * somebody else's report and calling the answer evidence.
         *
         * Passed in the child ENV, which Actions does not print, and masked by
         * the caller before this runs. `redactReportToken` strips it from the
         * probe's output before anything persists.
         */
        ...(reportToken ? { REPORT_TOKEN: reportToken } : {}),
      },
    });
    return {
      file,
      passed: true,
      claimScoped,
      tail: out.trim().split("\n").slice(-3).join(" | "),
    };
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
      claimScoped,
      tail: out.split("\n").slice(-3).join(" | "),
    };
  }
}

/**
 * What a probe run leaves in the ledger.
 *
 * ONE function because there are two call sites — the row this finding writes,
 * and the cache a second scanner's finding on the same (session, criterion)
 * inherits. They were duplicated literals, and a field added to one and not the
 * other would give a challenger a row shaped differently from its champion's:
 * the comparison would then be measuring the bookkeeping, not the prompts.
 */
const probeRunRows = (results) =>
  results.map((r) => ({
    file: r.file,
    passed: r.passed,
    inconclusive: Boolean(r.inconclusive),
    // Whether this run could have said anything else for THIS finding. The
    // scorer reads it to decide whether a `clear` is ground truth or merely the
    // absence of a check. Rows written before 2026-09-21 have no such key, and
    // `undefined` is falsy — so they read as not-claim-scoped, which is exactly
    // what they were.
    claimScoped: Boolean(r.claimScoped),
    // Redacted for the same reason url_path is, two fields over. PR #232
    // closed url_path and left this one: verify-dead-click-target.mjs prints
    // "what this reader tapped at /report/rpt_…" and that lands here verbatim.
    // One live token was already stored this way. The token IS the auth on a
    // report, so anywhere it persists is a credential store.
    tail: redactReportToken(String(r.tail ?? "")).slice(0, 600),
  }));

/**
 * Claim a finding so it is verified exactly once.
 *
 * The schedule (hourly) and the lookback (6h) overlap deliberately, so a run
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
 * the claim never becomes permanent, so the hourly workflow — whose
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

/**
 * true: ours to verify. false: already verified, or held by a run that claimed
 * it under ten minutes ago (a deferral comes back after that). null: the claim
 * could not be made at all.
 *
 * null used to be false, so a claim table that stopped answering read as every
 * finding "already verified": the run probed nothing and still reported success.
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
    if (!res.ok) return null;
    return (await res.json()) === true;
  } catch {
    return null;
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
  /**
   * A defect in a session PostHog never recorded still happened to a person.
   *
   * Two of the three real survey restarts found in 30 days have no
   * posthog_session_id, so this lookup could never reach them — and they all
   * have a Slack thread. The restart detector keys those as `submission:<id>`
   * so the finding lands under the reader's own entry rather than being
   * recorded and silently dropped.
   */
  const direct = /^submission:(\d+)$/.exec(sessionId);
  let id = direct ? Number(direct[1]) : null;
  if (id === null) {
    const subs = await fetch(
      `${url}/rest/v1/survey_submission?posthog_session_id=eq.${encodeURIComponent(sessionId)}&select=id&limit=1`,
      { headers: head }
    );
    if (!subs.ok) return null;
    id = (await subs.json())[0]?.id ?? null;
  }
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
    /**
     * THE CHALLENGER'S OWN VOCABULARY.
     *
     * The observation-only challenger (see scanners.ts) is forbidden from
     * naming a control or a motive, so its findings read as screen states
     * rather than explanations. That is the point — but it is only worth
     * running if `classify()` can still route what it writes to a probe. An
     * unclassified finding is recorded as a `gap`, which the ledger score
     * EXCLUDES, so a challenger nobody can classify would silently score on a
     * handful of rows and look better than the champion for the wrong reason.
     *
     * These are sentences written to the challenger's format rule (what is
     * wrong on screen · where · timestamp) with every causal clause removed.
     */
    ["The paywall card was tapped three times and nothing happened. Lower third, t=112s.", "D1"],
    ["The same chapter row was tapped twice with no visible change. Mid report, t=54s.", "D1"],
    ["The screen returned back to the survey start view shown earlier. t=203s.", "L1"],
    ["The view shown at t=20s is visible again at t=95s, the first introduction screen.", "L1"],
    ["The chapter pill covers the heading text. Top of the viewport, t=8s.", "C1"],
    ["Body text is clipped at the right edge. t=41s.", "C1"],
    ["The pricing modal is closed and the same modal is visible again, twice. t=77s.", "P1"],
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
    // Verbatim from the four findings nothing could check (all loop claims): the
    // pattern wanted "looped back" adjacent and knew no "restarted from".
    ["At, the survey restarted from the beginning, dropping the user back.", "L1"],
    ["At, the view resets entirely to an earlier preparation screen previously shown at.", "L1"],
    ["the application looped them back to the exact same 'Before we begin' consent screen", "L1"],
    ["the paywall or navigation looped the user back into taking the survey again", "L1"],
    // Verbatim, 2026-09-26: three words between "looped" and "back", and an
    // "introductory survey intro screen" the pattern did not know. It fell through
    // to "no test for that kind of problem" while the same session's L1 was clear.
    [
      "instead of presenting the unlocked report, the site looped the user entirely back " +
        "to the introductory survey intro screen at.",
      "L1",
    ],
    // The paywall-exit lane's own sentence: it must reach L1 or every one is a gap.
    [
      "A reader was sent back to /survey from their report while the paywall was still open, " +
        "with no tap before it: the back button left the report instead of closing the paywall.",
      "L1",
    ],
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

  /**
   * CLAIM SCOPING, pinned at both ends.
   *
   * Two ways this dies silently, and neither shows up as a failure anywhere:
   *
   *  - The set names a file that has been RENAMED. `has()` then matches
   *    nothing, every run is stamped claimScoped:false, and score.mjs sets every
   *    `clear` aside as unchecked. The scanners stop being scored at all and the
   *    report still prints a precision.
   *  - The flag stops being COPIED into the ledger row. Same end state, reached
   *    from the other side.
   *
   * So: every member must exist on disk, must be one the verifier can actually
   * append, and must survive the trip through probeRunRows().
   */
  const probeDir = new URL("./probes/", import.meta.url);
  for (const file of CLAIM_SCOPED_PROBES) {
    // The path is built from CLAIM_SCOPED_PROBES, a constant in this repo, and
    // this runs only under --selftest — no user input reaches it.
    if (!existsSync(new URL(file, probeDir))) {
      console.error(`selftest FAIL (claim-scoped): scripts/probes/${file} does not exist`);
      process.exitCode = 1;
    }
  }
  const stamped = probeRunRows([
    { file: "verify-tap-targets.mjs", passed: true, claimScoped: false, tail: "" },
    { file: "verify-dead-click-target.mjs", passed: true, claimScoped: true, tail: "" },
  ]);
  if (stamped[0].claimScoped !== false || stamped[1].claimScoped !== true) {
    console.error(`selftest FAIL (claim-scoped): probeRunRows dropped the flag`);
    process.exitCode = 1;
  }
  // A probe outside the set is never claim-scoped, WITH a click target present.
  // Without this the flag could be "clickTarget ? true : false" and pass above.
  const unscopedRun = runProbe("_selftest-exit.mjs", null, {
    pathname: "/report/x",
    selector: "div.a",
  });
  if (unscopedRun.claimScoped !== false) {
    console.error(`selftest FAIL (claim-scoped): a probe outside the set was stamped scoped`);
    process.exitCode = 1;
  }

  /**
   * PROBE ROUTING, one case per branch of probesFor().
   *
   * The defect was a /survey dead tap judged by probes that open the report.
   * Each case is a branch that, if it regressed, either brings those back or
   * silently takes away the only probe a finding has.
   */
  const d1 = CRITERIA.find((c) => c.id === "D1");
  const c1 = CRITERIA.find((c) => c.id === "C1");
  const tapProbes = [...CLAIM_SCOPED_PROBES];
  const routes = [
    ["D1, tap on /survey", d1, { pathname: "/survey", selector: "button.a" }, tapProbes],
    [
      "D1, tap on /report",
      d1,
      { pathname: "/report/x", selector: "div.a" },
      [...d1.probes, ...tapProbes],
    ],
    ["D1, no tap recorded", d1, null, d1.probes],
    ["C1 is not about the tap", c1, { pathname: "/survey", selector: "p.a" }, c1.probes],
  ];
  for (const [name, criterion, target, want] of routes) {
    const got = probesFor(criterion, target);
    if (got.join() !== want.join()) {
      console.error(
        `selftest FAIL (routing: ${name}): ${got.join(", ")}, wanted ${want.join(", ")}`
      );
      process.exitCode = 1;
    }
  }
  /**
   * The list, checked against what the files do rather than trusted.
   *
   * A member that starts reading URL_PATH or opening /survey would be dropped
   * for exactly the findings it can now answer. A report-only probe added to a
   * tap criterion without joining the list would run on survey taps again. And
   * a member no tap criterion lists is dead weight nobody would notice.
   */
  const probeCode = (file) =>
    readFileSync(new URL(file, probeDir), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
  const opensOnlyTheReport = (file) => {
    const code = probeCode(file);
    return code.includes("/report") && !code.includes("URL_PATH") && !code.includes("/survey");
  };
  const tapCriteriaProbes = new Set(
    CRITERIA.filter((c) => CLICK_TARGET_CRITERIA.has(c.id)).flatMap((c) => c.probes)
  );
  for (const file of REPORT_ONLY_PROBES) {
    if (
      !existsSync(new URL(file, probeDir)) ||
      !opensOnlyTheReport(file) ||
      !tapCriteriaProbes.has(file)
    ) {
      console.error(
        `selftest FAIL (report-only): ${file} is missing, opens another page, or is unused`
      );
      process.exitCode = 1;
    }
  }
  for (const file of tapCriteriaProbes) {
    if (!REPORT_ONLY_PROBES.has(file) && opensOnlyTheReport(file)) {
      console.error(`selftest FAIL (report-only): a tap criterion lists ${file}, not in the set`);
      process.exitCode = 1;
    }
  }

  // Computed LAST, after every check. `bad` counts only classifier failures;
  // the claim, session-id and exit-code checks signal through process.exitCode,
  // and a bare process.exit(0) discards them — which it did, silently, until
  // 2026-09-14: the selftest printed "FAIL (claim)" and exited 0, so CI's gate
  // could not fail. Reading it before the later checks run reintroduces exactly
  // that, which is what happened when the exit-code cases were first added.
  const failed = bad > 0 || process.exitCode === 1;
  // A marker no imported module shares. "selftest ok" is printed by hogql.mjs
  // and claim-scoped-probes.mjs too, so grepping for it in CI would be
  // satisfied by a run where this block never executed — which is exactly
  // what happened on 2026-09-21 when an imported selftest called
  // process.exit(0) during import and took the whole gate with it.
  console.log(failed ? `selftest FAILED (${bad} classifier)` : "verify-ux-findings selftest ok");
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
  -- OLDEST FIRST. Newest-first plus a budget is a starvation queue: on a busy
  -- day the newest ten always outrank the tail, so the same findings are
  -- deferred every run until they leave the window. Oldest-first drains it —
  -- arrivals run ~11/day against a budget of 10 on ~5 runs, so nothing waits
  -- long, and the thing that waits is the thing with the most slack left.
  ORDER BY timestamp ASC
  LIMIT ${FINDINGS_FETCH_LIMIT}
`);

/**
 * THE FETCH MUST NOT BE A SECOND LOOKBACK BOUND.
 *
 * `LIMIT 50` with `ORDER BY timestamp ASC` is the mirror of the bug the
 * ordering fixed. Oldest-first stops the tail starving; a LIMIT below the
 * number of findings in the window then starves the HEAD instead — the newest
 * are never fetched at all, so they are not claimed, not verified, not counted
 * and nothing says they existed.
 *
 * It bit within hours of the window widening 6h -> 24h: 57 findings in the
 * window, 50 returned, and the 7 newest — including both findings from the
 * challenger this pipeline had just been set up to measure — silently absent.
 *
 * The existing budget test asserts LIMIT > PROBE_BUDGET (50 > 10) and passes
 * happily through all of that, because that invariant is about the WORK. This
 * one is about the WINDOW: the fetch has to be able to return everything in it.
 * Bound the work, never the lookback — and a LIMIT is part of the lookback
 * whenever it can bite before the budget does.
 */
if (findings.length >= FINDINGS_FETCH_LIMIT) {
  console.log(
    `::error::the findings fetch returned ${findings.length} rows, its own limit — ` +
      `the newest findings in the ${LOOKBACK_HOURS}h window were NOT fetched. ` +
      `Raise FINDINGS_FETCH_LIMIT above the busiest window.`
  );
}

/**
 * Findings we do not need a model for.
 *
 * The scanners measure precision 0.20 and recall 0.50 against bars of 0.80 and
 * 0.60, and the repo has already established that prompt hardening does not fix
 * it — the v2 prompts carry both an anti-inference rule and a HARD RULE and the
 * model broke both. Low precision is survivable, because every claim is gated by
 * a probe and a false one costs CI minutes rather than a reader's trust. Low
 * RECALL is not: a defect the scanner never flags is never looked at by anything.
 *
 * But for one whole class we are not guessing. `dead_click` is our own event,
 * emitted by shared/observability/uxSignals.ts when a reader taps a control that
 * cannot respond, and it carries the pathname and the CSS selector. Measured
 * 2026-09-19: of four sessions where a reader pressed a real, dead control, the
 * dead-click scanner flagged ZERO. Asking a language model to notice what we
 * already recorded is the expensive way to be wrong.
 *
 * So these are synthesised directly from the events. They are not a second
 * opinion on the scanner's output; they are the mechanical half of the detector,
 * and they carry `scannerName` saying so, because a verdict in a reader's thread
 * should not imply a model saw something it did not.
 *
 * Deliberately narrow: only dead clicks on a REAL control. A tap on a paragraph
 * is not a defect — the scanner prompt's HARD RULE says so, the probe agrees,
 * and 807 of 827 sessions with a dead_click are exactly that.
 */
const OWN_EVENT_FINDINGS = await posthog(`
  SELECT toString($session_id) AS sid,
         toString(properties.pathname) AS path,
         toString(properties.target_selector) AS sel,
         count() AS n
  FROM events
  WHERE event = 'dead_click'
    AND timestamp > now() - INTERVAL ${LOOKBACK_HOURS} HOUR
    AND $session_id IS NOT NULL
    AND (
      startsWith(toString(properties.target_selector), 'button')
      OR startsWith(toString(properties.target_selector), 'a.')
      OR startsWith(toString(properties.target_selector), 'a#')
      OR toString(properties.target_selector) = 'a'
      OR startsWith(toString(properties.target_selector), '[data-track-id')
      OR startsWith(toString(properties.target_selector), '[role=button')
    )
  GROUP BY sid, path, sel
  ORDER BY n DESC
  LIMIT ${OWN_EVENT_FETCH_LIMIT}
`);

/**
 * Reached the limit = findings silently dropped, and this query bounded the
 * LOOKBACK rather than the work — the shape this repo has now paid for three
 * times. PROBE_BUDGET is what bounds real browser time; this only has to sit
 * above the busiest window. 25 was the old value and a 33-day sweep found 32
 * groups, so it was already capable of dropping seven.
 */
if (OWN_EVENT_FINDINGS.length === OWN_EVENT_FETCH_LIMIT) {
  console.log(
    `::error::own-event query returned exactly ${OWN_EVENT_FETCH_LIMIT} groups — ` +
      `dead-control findings are being dropped. Raise OWN_EVENT_FETCH_LIMIT.`
  );
}

/**
 * THE DEFECT CLASS THE SCANNERS PROVABLY CANNOT FIND.
 *
 * Measured 2026-09-21 over 30 days: 3 of 755 survey sessions were genuinely
 * sent back to the start, all by 56-58 questions. The survey scanner flagged 72
 * findings above the bar in the same window and caught NONE of the three —
 * roughly 24x over-reporting and zero recall on the one thing it exists for.
 *
 * TWO OF THE THREE HAVE NO POSTHOG SESSION AT ALL. They were never recorded, so
 * no scanner could ever have observed them, and nothing else was looking: they
 * happened on 25 and 26 August and were still unknown a month later. A pipeline
 * that can only see what was recorded cannot find them by any amount of prompt
 * work. Our own survey log recorded all three.
 *
 * So this does not ask a model. `survey_behavior_event` stores question_index
 * per transition and a restart leaves a drop; `biggestIndexDrop` is the same
 * tested function the witness uses, so the detector and the corroborator cannot
 * disagree.
 *
 * Keyed by SUBMISSION when there is no recording, which is what makes the
 * unrecorded two reachable — all three have a Slack thread, so all three can be
 * reported to the reader's own entry.
 */
async function ownSurveyRestarts(lookbackHours) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return [];
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  const since = new Date(Date.now() - lookbackHours * 3_600_000).toISOString();
  const res = await fetch(
    `${url}/rest/v1/survey_submission?select=id,session_id,posthog_session_id` +
      `&created_date_time=gte.${since}&session_id=not.is.null&limit=500`,
    { headers }
  );
  if (!res.ok) {
    console.log(`  (restart detector: submissions read ${res.status} — skipped this run)`);
    return [];
  }
  const subs = await res.json();
  if (subs.length === 500) {
    console.log(`::error::restart detector read exactly 500 submissions — window is truncated`);
  }
  const out = [];
  // One query per session rather than one big IN: PostgREST caps a list read at
  // 1,000 rows and a busy day is ~25 sessions x ~114 transitions, which is
  // comfortably past it. Bounded work, no silent truncation.
  for (const sub of subs) {
    const witness = await restartForSurveySession(String(sub.session_id));
    if (witness) out.push({ ...sub, ...witness });
  }
  return out;
}

const RESTART_FINDINGS = await ownSurveyRestarts(LOOKBACK_HOURS);

/**
 * READERS BACK TOOK OUT OF THEIR REPORT WITH THE PAYWALL OPEN.
 *
 * Found by hand on 2026-09-23 and by nothing here: 7 readers in 30 days, all
 * flagged by a scanner as "looped back to the survey", every one refuted for
 * the unlock click it invented. The outcome was real and no check asked about
 * it. #258 made Back close the paywall, so each of these is now a regression —
 * on a device, or in an in-app browser, the end-to-end tests do not emulate.
 *
 * The events are the evidence: the paywall was open and the page changed with
 * no tap before it. `paywallLeftOpen` (review.ts) decides, and is unit tested.
 *
 * Twice the lookback for EVENTS, because the report pageview that makes an exit
 * an exit can come well before the paywall opens; only the sessions are bounded
 * by the lookback. PostHog caps a query at 50,000 rows, which a backfill wider
 * than about two weeks will reach — the check below says so rather than
 * silently reading a truncated window.
 */
const PAYWALL_EXIT_FETCH_LIMIT = 50_000;
const PAYWALL_EXIT_ROWS = await posthog(`
  SELECT toString($session_id) AS sid,
         toUnixTimestamp64Milli(timestamp) AS at,
         event,
         toString(properties.$pathname) AS path
  FROM events
  WHERE timestamp > now() - INTERVAL ${LOOKBACK_HOURS * 2} HOUR
    AND event IN ('$pageview', '$autocapture', 'price_shown', 'paywall_initiated', 'paywall_dismissed')
    AND $session_id IN (
      SELECT $session_id FROM events
      WHERE event IN ('price_shown', 'paywall_initiated')
        AND timestamp > now() - INTERVAL ${LOOKBACK_HOURS} HOUR
    )
  ORDER BY sid, at
  LIMIT ${PAYWALL_EXIT_FETCH_LIMIT}
`);
if (PAYWALL_EXIT_ROWS.length === PAYWALL_EXIT_FETCH_LIMIT) {
  console.log(
    `::error::paywall-exit query returned exactly ${PAYWALL_EXIT_FETCH_LIMIT} rows — ` +
      `the oldest sessions are being dropped. Narrow LOOKBACK_HOURS.`
  );
}
const PAYWALL_EXITS = paywallLeftOpen(
  PAYWALL_EXIT_ROWS.map(([sid, at, event, path]) => [
    String(sid),
    Number(at),
    String(event),
    String(path),
  ])
);

/**
 * Unhandled exceptions in OUR OWN code, which nothing has ever looked at.
 *
 * `$exception` carries the type, the message and the source file, and 33
 * sessions over 30 days threw inside our own bundles against 2 from third
 * parties. Recurring classes nobody had seen: React error #418 (a hydration
 * mismatch) in five separate groups, ChunkLoadError in four — a reader on a
 * page from before a deploy, whose next navigation cannot fetch its chunk — and
 * a SecurityError that fired 24 times in one session.
 *
 * FILTERED, because most of the volume is not a defect we can act on:
 *  - "Script error." is the cross-origin placeholder: 15 sessions with no type,
 *    no message and no file. Nothing to report and nothing to fix.
 *  - Third-party sources (gtm.js, clarity.js and friends) are somebody else's
 *    bug in somebody else's script.
 *  - `handled` exceptions were caught by our own code on purpose.
 *  - An error with NO frame in our bundle is not ours, whatever it says. The
 *    vendor list above can only exclude sources it names, so an exception with
 *    no source file at all passed as "our own code": 6 of the 12 sessions with
 *    an unhandled error in the 30 days to 2026-09-23 had none — Microsoft's
 *    link scanner ("Object Not Found Matching Id:1, MethodName:update"),
 *    injected `<anonymous>` code on Chromebooks — and every one reached Slack
 *    as "needs a human". Our bundles are served from `/_next/`, so at least one
 *    frame must be.
 *
 * Grouped by type and message so one finding is a CLASS, not an instance —
 * twenty-four SecurityErrors in a session are one problem.
 */
const EXCEPTION_FINDINGS = await posthog(`
  SELECT toString($session_id) AS sid,
         toString(properties.$pathname) AS path,
         replaceAll(replaceAll(toString(properties.$exception_types), '[', ''), ']', '') AS typ,
         replaceAll(replaceAll(toString(properties.$exception_values), '[', ''), ']', '') AS val,
         count() AS n
  FROM events
  WHERE event = '$exception'
    AND timestamp > now() - INTERVAL ${LOOKBACK_HOURS} HOUR
    AND $session_id IS NOT NULL
    AND toString(properties.$exception_handled) = 'false'
    AND toString(properties.$exception_values) NOT LIKE '%Script error.%'
    AND toString(properties.$exception_sources) NOT LIKE '%gtm.js%'
    AND toString(properties.$exception_sources) NOT LIKE '%clarity%'
    AND toString(properties.$exception_sources) NOT LIKE '%googletagmanager%'
    AND toString(properties.$exception_sources) NOT LIKE '%facebook%'
    AND toString(properties.$exception_sources) NOT LIKE '%hotjar%'
    AND toString(properties.$exception_sources) NOT LIKE '%cookieyes%'
    AND toString(properties.$exception_sources) NOT LIKE '%trustpilot%'
    AND position(toString(properties.$exception_sources), '/_next/') > 0
  GROUP BY sid, path, typ, val
  ORDER BY n DESC
  LIMIT ${OWN_EVENT_FETCH_LIMIT}
`);

if (EXCEPTION_FINDINGS.length === OWN_EVENT_FETCH_LIMIT) {
  console.log(
    `::error::exception query returned exactly ${OWN_EVENT_FETCH_LIMIT} groups — findings are being dropped.`
  );
}

/** Only one per session: the same reader tapping the same dead thing is one defect. */
const seenSessions = new Set(findings.map((f) => String(f[1])));
for (const [sid, rawPath, sel, n] of OWN_EVENT_FINDINGS) {
  // Older events still carry the ad click's parameters; see withoutTrackingParams.
  const path = withoutTrackingParams(String(rawPath));
  if (seenSessions.has(String(sid))) continue;
  seenSessions.add(String(sid));
  findings.push([
    // Stable id, so the once-ever claim holds across runs. Not a PostHog uuid:
    // nothing else keys on this and a collision with a real one is impossible.
    `own-dead-click:${sid}`,
    String(sid),
    "our own dead_click events",
    `A reader tapped ${sel} on ${path} ${n} time(s) and it did not respond. ` +
      `Recorded by our own instrumentation, not inferred from a recording.`,
    1,
    0,
  ]);
}

/**
 * A SCANNER'S FLAG MUST NOT SUPPRESS OUR OWN EVIDENCE.
 *
 * `seenSessions` starts with every session a scanner flagged. That is right for
 * the dead-click lane above, and it was wrong for the two lanes below, which
 * record the OUTCOME itself. The scanner's finding meets the refusal gate
 * first, and the report scanner invents an unlock click in most of what it
 * writes — so the session was refuted, and the restart our own log recorded
 * for it was never looked at. 01a0bbf7's 56-question restart was filed as the
 * scanner lying exactly this way.
 *
 * So these two dedupe only against each other. They rank first and route to
 * the same criterion, so a scanner finding for the same session that survives
 * the gate inherits their answer (pairKey) instead of posting a second verdict.
 */
const ownOutcomeSessions = new Set();

for (const r of RESTART_FINDINGS) {
  // `submission:<id>` when the session was never recorded. threadFor()
  // understands both, so a reader whose session PostHog never saw still gets
  // the finding under their own entry.
  const sid = r.posthog_session_id ? String(r.posthog_session_id) : `submission:${r.id}`;
  if (ownOutcomeSessions.has(sid)) continue;
  ownOutcomeSessions.add(sid);
  seenSessions.add(sid);
  findings.push([
    `own-survey-restart:${r.session_id}`,
    sid,
    "our own survey log",
    // Phrased so classify() routes it to L1 — "back to the start of the survey"
    // is one of that criterion's own alternatives, taken from real observations.
    `A reader was sent back to the start of the survey: our own log records ` +
      `them jumping back ${r.drop} questions after ${r.steps} transitions. ` +
      `Recorded by our own instrumentation, not inferred from a recording` +
      (r.posthog_session_id
        ? "."
        : " — this session was never recorded, so no scanner could see it."),
    1,
    0,
  ]);
}

for (const x of PAYWALL_EXITS) {
  if (ownOutcomeSessions.has(x.sessionId)) continue;
  ownOutcomeSessions.add(x.sessionId);
  seenSessions.add(x.sessionId);
  findings.push([
    `own-paywall-exit:${x.sessionId}`,
    x.sessionId,
    "our own paywall events",
    // Phrased so classify() routes it to L1 ("sent back to"). The path is
    // redacted because a share link carries a report token in its path too.
    `A reader was sent back to ${redactReportToken(x.to)} from their report while the paywall ` +
      `was still open, with no tap before it: the back button left the report instead of ` +
      `closing the paywall. Recorded by our own instrumentation, not inferred from a recording.`,
    1,
    0,
  ]);
}

/**
 * MECHANICAL FINDINGS GO FIRST, because the probe budget is the scarce thing.
 *
 * They were pushed onto the end of a list the model had already filled, so they
 * ranked last and were the first deferred whenever the budget ran out —
 * observed on a 33-day sweep, where all three real survey restarts were
 * deferred behind 148 model findings. The lane being starved is the one that
 * works: over 30 days our own events found 3 of 3 real restarts and the
 * scanners found 0 of 3 while flagging 72.
 *
 * Stable within each group, so the oldest-first drain that stops the tail
 * starving still holds inside them.
 */
/**
 * Ranked by MEASURED yield, not by source.
 *
 * 2 — the survey log. 3 real restarts found in 30 days, 3 of 3 confirmed, and
 *     two of them in sessions no scanner could ever observe.
 * 1 — our own dead_click events. Mechanical and cheap, but 0 of 19 confirmed.
 * 0 — the scanners. 72 flagged in the same window, 0 of the 3 real ones found.
 *
 * Re-rank this when the numbers move, and only then.
 */
const rank = (f) => {
  const source = String(f[2]);
  if (source === "our own survey log") return 2;
  // Every one is a defect by construction: the paywall was open when Back left.
  if (source === "our own paywall events") return 2;
  return source.startsWith("our own") ? 1 : 0;
};
findings.sort((a, b) => rank(b) - rank(a));

for (const [sid, path, typ, val, n] of EXCEPTION_FINDINGS) {
  const key = String(sid);
  if (seenSessions.has(key)) continue;
  seenSessions.add(key);
  const what = `${String(typ).replace(/"/g, "").trim()}: ${String(val).replace(/"/g, "").trim()}`;
  findings.push([
    `own-exception:${sid}`,
    key,
    "our own error reports",
    // Phrased to hit X1, which has no probe and therefore asks a human — an
    // unhandled exception is not something a browser check can reproduce from
    // the outside, and pretending otherwise would manufacture a clean verdict.
    `An unhandled error was thrown in our own code while a reader was on ` +
      `${path}: ${what.slice(0, 200)} (${n} time(s) in this session). ` +
      `Recorded by our own error reporting, not inferred from a recording.`,
    1,
    0,
  ]);
}

console.log(
  `${findings.length} finding(s) in the last ${LOOKBACK_HOURS}h ` +
    `(${OWN_EVENT_FINDINGS.length} from our own dead_click events, ` +
    `${RESTART_FINDINGS.length} from our own survey log, ` +
    `${PAYWALL_EXITS.length} from our own paywall events, ` +
    `${EXCEPTION_FINDINGS.length} from our own error reports — all probed first)`
);

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
 * workflow runs every hour, so the claim is always stale by then and the
 * finding comes back. That ten-minute window is load-bearing — raise it above
 * the schedule interval and every deferred finding is skipped forever instead.
 * The count is printed rather than swallowed, so a standing backlog is visible.
 */
const PROBE_BUDGET = Number(process.env.PROBE_BUDGET ?? 10);

/**
 * How many findings one run may REPLAY, on top of its ordinary probes.
 *
 * Small because a replay is expensive — it performs the reader's whole visit,
 * ninety seconds to two minutes of real browser — and PROBE_BUDGET already
 * allows ten findings against a 25-minute workflow timeout. Replaying every
 * one would add up to twenty minutes and blow it.
 *
 * Spent where it answers something. A replay only runs when the ordinary
 * probes came back CLEAN, which is the case the report scanner is stuck in:
 * 0 confirmed in 45, every probe clean, and no way to tell "nothing is wrong"
 * from "nothing we run can see it". A finding already reproduced needs no
 * second opinion.
 */
const REPLAY_BUDGET = Number(process.env.REPLAY_BUDGET ?? 2);
let replaysLeft = REPLAY_BUDGET;

/**
 * How many draft pull requests one run may open.
 *
 * The per-branch check in replay-pr.mjs stops the SAME reproduction opening a
 * second PR, but nothing bounded the total, and the blast radius grew today:
 * findings are now also synthesised from our own dead_click events, so a run
 * can carry up to 25 of them and spend its whole probe budget on one criterion.
 * A systemic probe fault would then open ten PRs before anyone saw the first.
 *
 * That is not hypothetical. Hours ago `verify-dead-click-target.mjs` reported
 * the survey consent gate as a defect because the button is deliberately
 * disabled — correct behaviour, reproduced convincingly, and D1 is in
 * AUTO_PR_CRITERIA. The probe is fixed, but "the probe was wrong in a way that
 * reproduces" is now a known shape rather than a theoretical one, and the cheap
 * guard against a whole class of it is a cap.
 *
 * Two, because a genuine day rarely holds more than one or two distinct
 * reproduced defects. Nothing is lost when it bites: every verdict still
 * reaches the reader's thread and the ledger, and the deferred reproduction
 * opens its PR on the next run.
 */
const MAX_PRS_PER_RUN = Number(process.env.MAX_PRS_PER_RUN ?? 2);
let prsOpened = 0;
let prsSkipped = 0;
let probeRuns = 0;
let deferred = 0;
let gaps = 0;
let confirmed = 0;

let skipped = 0;
let claimAttempts = 0;
let unclaimed = 0;
let contradicted = 0;
/** (session, criterion) pairs already probed in THIS run. */
const probedThisRun = new Set();
/** What that probe concluded, so a second scanner's finding inherits it. */
const outcomeThisRun = new Map();

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

  /**
   * A finding about a session PostHog never recorded is keyed `submission:<id>`.
   *
   * It is NOT a session id and must never reach the places one goes — a HogQL
   * literal, a git branch name, a PostHog filter — so isSafeSessionId keeps
   * refusing the colon and this is matched as its own shape, digits only.
   * Everything that needs a recording is skipped below rather than attempted
   * against an id no recording exists for.
   *
   * Without this the guard silently discarded the whole point of the restart
   * detector: two of the three real restarts found in 30 days have no PostHog
   * session, and both were dropped here as "malformed session id".
   */
  const unrecorded = /^submission:\d+$/.test(String(sessionId));
  // The session id comes back from PostHog and is about to become a git branch
  // name, a Supabase filter and a HogQL literal. isSafeSessionId was imported
  // and then only ever exercised in the selftest; validate for real, once, so
  // everything downstream inherits it. Refuse rather than sanitise.
  if (!unrecorded && !isSafeSessionId(sessionId)) {
    console.log(`SKIP    malformed session id ${JSON.stringify(String(sessionId).slice(0, 40))}`);
    continue;
  }

  // Claim before classifying: probes are minutes of real browser time, and a
  // second run must not spend them again on a finding already answered.
  if (!DRY_RUN && !CLASSIFY_ONLY) {
    claimAttempts += 1;
    const claim = await claimFinding(observationId);
    if (claim === null) {
      unclaimed += 1;
      continue;
    }
    if (!claim) {
      skipped += 1;
      continue;
    }
  }

  // Contradicted claims never reach a probe: minutes of real browser time spent
  // on something our own events say did not happen.
  {
    // No recording means no PostHog events, so the refusal gate has nothing to
    // read. NULL, not an empty set: empty means "we looked and found nothing",
    // which fails CLOSED and would refute every checkable claim.
    const events = unrecorded ? null : await fetchSessionEvents(sessionId);
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
      /**
       * RECORDED, NOT ANNOUNCED. This used to post into the reader's thread.
       *
       * Measured 2026-09-21: 80 messages had been posted under people's
       * submissions and 2 of them reported a real problem. 22 were this one —
       * a note saying our own scanner had described something that never
       * happened. That is a fact about our tooling, published under a
       * customer's name, and it buries the two that matter.
       *
       * Nothing is lost: the row still goes to the ledger, and the daily digest
       * already reports the count in aggregate ("13 were contradicted by our
       * own records"). The team learns the same thing without a per-person
       * message saying the AI was wrong about them.
       */
      const sent = "suppressed";
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
    /**
     * REPLAY THE ANSWER, DO NOT DISCARD IT.
     *
     * This used to record `outcome: "duplicate"`, which the ledger score
     * EXCLUDES — correct while every finding came from a different scanner, and
     * wrong the moment a champion and a challenger watch the same recording.
     * Both would flag one session, the second would be filed as a duplicate,
     * and the challenger would be scored on whatever was left. The comparison
     * would have measured which scanner happened to be fetched first.
     *
     * A probe's answer depends on the session, the criterion and the devices —
     * never on which scanner raised it — so the second finding is entitled to
     * the first one's result. One probe run, two rows, a real comparison.
     *
     * Still not re-delivered: the reader's thread gets one verdict, as before.
     */
    const answered = outcomeThisRun.get(pairKey);
    console.log(
      `DUP   ${sessionId}  ${criterion.id} — already probed this run` +
        (answered ? ` → recorded as ${answered.outcome}` : "")
    );
    await markVerified(observationId);
    await recordFinding(
      answered
        ? { ...base, ...answered, criterion: criterion.id, delivered: false }
        : // No cached answer means the first finding never reached a probe
          // (classify-only, or a deferral). Nothing to inherit.
          { ...base, outcome: "duplicate", criterion: criterion.id }
    );
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
  const viewport = unrecorded ? null : await sessionViewport(sessionId);
  if (!viewport) {
    // Silent degradation otherwise: the probes fall back to their own device
    // lists and the verdict quietly stops claiming a device. Observed once on
    // 2026-09-17 for a session whose viewport resolves fine on every retry, so
    // this is a transient PostHog read, not missing data — and it is worth
    // seeing a pattern of it in the log. `ux_finding.devices` is null for these.
    console.log(`  (no viewport for ${sessionId}; probes run on their own defaults)`);
  }
  const clickTarget = unrecorded ? null : await sessionClickTarget(sessionId);
  if (!clickTarget && CLICK_TARGET_CRITERIA.has(criterion.id)) {
    // Same silent-degradation risk as the viewport above: without it the
    // dead-click probe is simply not appended, and the run is quietly weaker
    // rather than wrong. `ux_finding.target_selector` is null for these, so the
    // rate is queryable rather than a matter of opinion. Both lookups were
    // measured deterministic in isolation (6/6) and 36 back-to-back PostHog
    // queries all returned 200, so this is a rare transient, not rate limiting.
    console.log(`  (no dead_click/rage_click target for ${sessionId}; that probe is skipped)`);
  }

  const probeFiles = probesFor(criterion, clickTarget);

  /**
   * This reader's own report, masked before it is used.
   *
   * `::add-mask::` tells Actions to redact the value from every subsequent log
   * line in the job. This repository is PUBLIC, so its Actions logs are world
   * readable and a token that reached one would be a working key to somebody's
   * report. Belt and braces: the env is not printed, this masks anything that
   * echoes it anyway, and redactReportToken strips it from probe output before
   * it is stored or posted.
   *
   * Emitted once per finding, before the first probe starts.
   */
  const reportToken = await reportTokenForSession(sessionId);
  if (reportToken) console.log(`::add-mask::${reportToken}`);

  const results = probeFiles.map((f) => runProbe(f, viewport, clickTarget, reportToken, sessionId));

  /**
   * The paywall lane's evidence is the defect itself, recorded when it
   * happened: no probe can re-perform one reader's Back press on one phone.
   * Added before the replay so a confirmed finding does not spend one.
   */
  if (String(observationId).startsWith("own-paywall-exit:")) {
    results.push({
      file: "paywall-exit-log",
      passed: false,
      inconclusive: false,
      claimScoped: true,
      tail:
        "Our own events record the paywall still open when the page changed, with no tap " +
        "before it — Back took the reader out of their report instead of closing the paywall.",
    });
  }

  /**
   * THE READER'S OWN ROUTE, when nothing else found anything.
   *
   * Every probe above drives a path we chose. A defect that only appears part
   * way through this reader's particular sequence is not something they can
   * reach, so their agreement is weaker evidence than it looks — and a run
   * where they all pass is exactly where that matters.
   *
   * Needs a report: the replay drives the report page, so a survey-only
   * session has no route for it to follow.
   */
  if (replaysLeft > 0 && reportToken && !results.some((r) => !r.passed && !r.inconclusive)) {
    replaysLeft -= 1;
    results.push(runProbe("replay-session.mjs", viewport, clickTarget, reportToken, sessionId));
  }

  /**
   * OUR OWN LOG, asked whether the thing actually happened.
   *
   * Every probe here drives production as it is NOW. None of them can observe
   * what this reader experienced, which is why 26 of 27 return the same verdict
   * whoever raised the finding. `survey_behavior_event` can: it recorded this
   * session's question order at the time, and a reader sent back to the start
   * leaves a drop in it.
   *
   * Counted as a probe run because that is what it is — a check that either
   * fires or does not — and it is claim-scoped by construction: it reads THIS
   * session and its answer cannot be the same for everyone. That is the
   * property a `clear` needs before it is evidence of anything.
   *
   * Only for loop criteria. A restart says nothing about a covered heading.
   */
  if (RESTART_WITNESS_CRITERIA.has(criterion.id)) {
    // An unrecorded finding came FROM the survey log and its observation id
    // carries the survey session, so ask the log directly rather than bridging
    // through a PostHog session that does not exist.
    const surveySession = unrecorded
      ? String(observationId).replace(/^own-survey-restart:/, "")
      : null;
    const witness = surveySession
      ? await restartForSurveySession(surveySession)
      : await surveyRestartWitness(sessionId);
    results.push({
      file: "survey-behaviour-log",
      passed: !witness,
      inconclusive: false,
      claimScoped: true,
      tail: witness
        ? `Our own survey log records the reader jumping back ${witness.drop} questions ` +
          `(${witness.steps} transitions) — the restart is independently confirmed`
        : "Our own survey log records no backwards jump; it neither confirms nor refutes.",
    });
    if (witness) {
      console.log(
        `  WITNESS ${unrecorded ? sessionId : sessionId.slice(0, 13)} — survey log confirms a ${witness.drop}-question restart`
      );
    }
  }
  const inconclusive = results.some((r) => r.inconclusive);
  // A probe that could not measure has NOT reproduced anything.
  const reproduced = results.some((r) => !r.passed && !r.inconclusive);
  // Recorded and named in the digest, but not posted and no PR: see review.ts.
  const heldForAPerson = reproduced && confirmedByReplayAlone(results);
  if (reproduced) confirmed += 1;

  // A reproduced defect on a narrow criterion becomes a draft PR carrying the
  // evidence. Never merged, and never containing a generated fix.
  // --dry-run and --classify-only must have NO side effects. Without this guard
  // the workflow's own dry_run path would still push a branch and open a PR,
  // because it sets UX_REVIEW_OPEN_PR=1 for both branches of its if.
  let prUrl = null;
  if (reproduced && !heldForAPerson && !DRY_RUN && !CLASSIFY_ONLY && !isChallenger(scannerName)) {
    if (prsOpened >= MAX_PRS_PER_RUN) {
      prsSkipped += 1;
      console.log(
        `  PR capped — ${prsOpened} already opened this run, ${sessionId.slice(0, 13)} ` +
          `(${criterion.id}) deferred to the next one`
      );
    } else {
      prUrl = openReproductionPr({ criterion, sessionId, viewport, results });
      // Counted on an actual PR, not on an attempt: the helper returns null
      // when the flag is off or the branch already exists, and counting those
      // would spend the cap on runs that opened nothing.
      if (prUrl) prsOpened += 1;
    }
  }

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
    const failing = results.filter((r) => !r.passed && !r.inconclusive);
    verdict =
      (failing.every((r) => OWN_RECORD_EVIDENCE.has(r.file))
        ? `❗ *Confirmed by our own records* — `
        : `❗ *Reproduced in production${at}* — `) +
      `${criterion.label} (${criterion.id}). ` +
      failing
        /**
         * "failed" is probe grammar — a probe that fails has reproduced the
         * defect. The survey-log witness is not a probe and does not fail: it
         * CONFIRMS. Reading "`survey-behaviour-log` failed: the restart is
         * independently confirmed" in a reader's own Slack thread is the kind
         * of sentence that makes a team stop trusting the channel.
         */
        .map((r) =>
          OWN_RECORD_EVIDENCE.has(r.file) ? `${r.tail}` : `\`${r.file}\` failed: ${r.tail}`
        )
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

  /**
   * NAME THE PROBES, because a verdict without them cannot be read.
   *
   * The whole argument of this pipeline is that a `clear` only means something
   * when a probe could have disagreed — and the run log printed `CLEAR` with no
   * indication of what produced it, so the one thing you need in order to
   * believe or disbelieve a line was the thing it left out. A run that was
   * supposed to replay the reader's route and quietly did not looks identical
   * to one that did.
   *
   * Claim-scoped probes are marked, since that is the distinction that decides
   * whether the verdict is evidence or a constant.
   */
  const ran = results.map((r) => `${r.file}${r.claimScoped ? "*" : ""}`).join(" ");
  console.log(
    `${reproduced ? "CONFIRM" : inconclusive ? "UNKNOWN" : "CLEAR  "} ${sessionId}  ${criterion.id}` +
      `  [${ran || "no probes"}]`
  );
  // A challenger is being measured, not consulted. Its verdict is recorded and
  // scored; it does not appear under a reader's submission, because a prompt on
  // trial has not earned a place in the channel — and two scanners posting the
  // same verdict twice is how a useful thread becomes noise.
  /**
   * ONLY A REPRODUCTION, OR AN HONEST "I COULD NOT CHECK", REACHES A PERSON.
   *
   * "Could not reproduce" was 55 of the 80 messages ever posted into readers'
   * threads, against 2 that reported a real problem. It was added so a finding
   * was never silently dropped — and that reason expired when the ledger
   * landed, because every verdict is now recorded whether or not anyone is
   * told. What was left was 55 notes saying nothing happened, under the names
   * of people something may well have happened to.
   *
   * `inconclusive` still posts: that one is a request for a human, not a
   * result, and there have been two of them in total.
   */
  const speaks = (reproduced && !heldForAPerson) || inconclusive;
  const sent =
    isChallenger(scannerName) || !speaks ? "suppressed" : await deliverVerdict(sessionId, verdict);
  // One reason, not two. The second branch had no challenger test, so every
  // suppressed verdict — including a champion's ordinary "could not reproduce" —
  // printed "(challenger — …)" as well. Reading a run log is how the re-queue
  // bug and the lost-findings bug were both found; a log that mislabels which
  // scanner it is talking about is the wrong thing to hand that job.
  if (sent === "suppressed") {
    console.log(
      isChallenger(scannerName)
        ? `  (challenger — recorded in ux_finding, not posted)`
        : heldForAPerson
          ? `  (HELD — only the route replay saw it; recorded for a person to check, not posted, no PR)`
          : `  (could not reproduce — recorded in ux_finding, not posted)`
    );
  }
  if (sent !== "failed") await markVerified(observationId);

  // The row is written whether or not a thread existed to post into. That gap
  // is the reason this table exists: a session with no survey submission has no
  // Slack thread, and those are the readers who did NOT convert — the most
  // interesting findings we have, and the ones that used to vanish.
  await recordFinding({
    ...base,
    outcome: reproduced ? "reproduced" : inconclusive ? "inconclusive" : "clear",
    criterion: criterion.id,
    probe_runs: probeRunRows(results),
    devices: ranOn,
    viewport_min: viewport?.min ?? null,
    viewport_max: viewport?.max ?? null,
    os: viewport?.os || null,
    url_path: redactReportToken(clickTarget?.pathname ?? null),
    target_selector: clickTarget?.selector ?? null,
    pr_url: prUrl,
    delivered: sent === "posted",
  });

  // What a second scanner's finding on this same (session, criterion) inherits.
  // Everything here describes the PROBE, never the scanner that raised it.
  outcomeThisRun.set(pairKey, {
    outcome: reproduced ? "reproduced" : inconclusive ? "inconclusive" : "clear",
    probe_runs: probeRunRows(results),
    devices: ranOn,
    viewport_min: viewport?.min ?? null,
    viewport_max: viewport?.max ?? null,
    os: viewport?.os || null,
    url_path: redactReportToken(clickTarget?.pathname ?? null),
    target_selector: clickTarget?.selector ?? null,
    pr_url: null,
  });
}

console.log(
  `\n${confirmed} reproduced · ${gaps} with no probe coverage` +
    (contradicted ? ` · ${contradicted} contradicted by events` : "") +
    (skipped ? ` · ${skipped} already verified, or held by a run under ten minutes old` : "") +
    (unclaimed ? ` · ${unclaimed} could not be claimed, so were not verified` : "") +
    // Never silent: a deferred finding is the thing that used to disappear.
    (deferred ? ` · ${deferred} left for the next run (probe budget ${PROBE_BUDGET})` : "") +
    (prsOpened ? ` · ${prsOpened} draft PR(s) opened` : "") +
    // A capped PR is deferred work, not a dropped finding — say so either way.
    (prsSkipped ? ` · ${prsSkipped} PR(s) held back by the cap of ${MAX_PRS_PER_RUN}` : "")
);

// Every claim failing is a broken claim table, not a quiet day. Exit 2, as for a
// missing secret, rather than report success on a run that verified nothing. A
// single failed claim is printed above and retried next run.
if (claimAttempts > 0 && unclaimed === claimAttempts) {
  console.error(`no finding could be claimed (${unclaimed} tried): refusing to report success.`);
  process.exit(2);
}
