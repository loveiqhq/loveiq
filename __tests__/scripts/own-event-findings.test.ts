/**
 * The verifier does not need a model to notice a dead control.
 *
 * The scanners measure precision 0.20 and recall 0.50 against bars of 0.80 and
 * 0.60, and the repo has already established that prompt hardening does not fix
 * it. Low precision is survivable — every claim is gated by a probe, so a false
 * one costs CI minutes. Low RECALL is not: measured 2026-09-19, of four sessions
 * where a reader pressed a real, dead control, the dead-click scanner flagged
 * ZERO of them.
 *
 * `dead_click` is our own event and carries the pathname and the CSS selector,
 * so that whole class is mechanical. These assertions pin the three properties
 * that make the synthesised findings safe to put in a reader's thread.
 *
 * A source test because the verifier is a script with top-level await that runs
 * on import — the same technique verifier-budget.test.ts uses for the same file.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const SRC = readFileSync(resolve(process.cwd(), "scripts/verify-ux-findings.mjs"), "utf8");

describe("findings synthesised from our own dead_click events", () => {
  it("only counts a tap on a REAL control, never on decoration", () => {
    const block = /const OWN_EVENT_FINDINGS = await posthog\(`([\s\S]*?)`\);/.exec(SRC)?.[1] ?? "";
    expect(block, "the own-event query is missing").not.toBe("");
    // 807 of 827 sessions with a dead_click tapped a paragraph. Without this
    // filter the verifier would drive a browser for every one of them and the
    // probe would correctly answer "not a control, not a defect" each time.
    expect(block).toContain("'button'");
    expect(block).toContain("'[role=button'");
    expect(block).toContain("event = 'dead_click'");
  });

  it("phrases them so the classifier routes them to the dead-control probe", () => {
    /**
     * The classifier cannot be imported — this module is a script with
     * top-level await and runs on import — so D1's own regex is lifted out of
     * the source and applied to the sentence the code actually builds. A
     * wording change on either side that stopped them matching would otherwise
     * drop the whole class silently, reported as "no probe covers this claim".
     */
    const d1 = /id: "D1",[\s\S]*?match: (\/.+?\/[a-z]*),/.exec(SRC)?.[1];
    expect(d1, "D1's match regex was not found in the source").toBeTruthy();
    const [, body, flags] = /^\/(.*)\/([a-z]*)$/.exec(d1!)!;
    const re = new RegExp(body, flags);

    const built = /`A reader tapped \$\{sel\} on \$\{path\} \$\{n\} time\(s\) and ([^`]*)`/.exec(
      SRC
    );
    expect(built, "the synthesised sentence changed shape").toBeTruthy();
    const sentence = `A reader tapped button.flex-1 on /survey 3 time(s) and ${built![1]}`;
    expect(re.test(sentence), `D1 no longer matches: ${sentence}`).toBe(true);
  });

  it("says where it came from, so a verdict never implies a model saw it", () => {
    expect(SRC).toContain('"our own dead_click events"');
  });

  it("gives each one a stable id, so the once-ever claim holds across runs", () => {
    // A fresh id per run would re-post the same finding into the same thread
    // every three hours.
    expect(SRC).toContain("`own-dead-click:${sid}`");
    expect(SRC).not.toMatch(/own-dead-click:\$\{(Date\.now|Math\.random)/);
  });

  it("does not add a second finding for a session a scanner already flagged", () => {
    expect(SRC).toContain("seenSessions");
    expect(SRC).toMatch(/if \(seenSessions\.has\(String\(sid\)\)\) continue;/);
  });
});

/**
 * THE DEFECT CLASS THE SCANNERS PROVABLY CANNOT FIND.
 *
 * Measured 2026-09-21 over 30 days: 3 of 755 survey sessions were genuinely
 * sent back to the start, all by 56-58 questions. The survey scanner flagged 72
 * findings above the bar in the same window and caught NONE of them — 24x
 * over-reporting and zero recall on the one thing it exists for.
 *
 * Two of the three have NO POSTHOG SESSION. They were never recorded, so no
 * scanner could ever have seen them, and nothing else was looking: they
 * happened on 25 and 26 August and were still unknown a month later. All three
 * have a Slack thread, so all three are reportable.
 */
describe("findings synthesised from our own survey log", () => {
  it("detects the restart without asking a model", () => {
    expect(SRC).toContain("const RESTART_FINDINGS = await ownSurveyRestarts(LOOKBACK_HOURS)");
    // Reuses the tested pure function, so the detector and the corroborator in
    // review.ts cannot disagree about what a restart is.
    expect(SRC).toContain("restartForSurveySession");
  });

  it("reaches a reader whose session was never recorded", () => {
    // The whole point: keyed by submission when there is no PostHog session.
    expect(SRC).toMatch(/`submission:\$\{r\.id\}`/);
    // And threadFor must understand that key, or the finding is recorded and
    // silently never delivered.
    expect(SRC).toMatch(/\^submission:\(\\d\+\)\$/);
  });

  it("never lets a submission key reach a PostHog lookup", () => {
    /**
     * `submission:1781` is not a session id. isSafeSessionId refuses the colon
     * — correctly, because a session id becomes a HogQL literal and a git
     * branch name — so every recording-dependent lookup must be skipped rather
     * than attempted. Without this the guard silently discarded the entire
     * feature: both unrecorded restarts were dropped as "malformed session id".
     */
    expect(SRC).toMatch(/const unrecorded = \/\^submission:/);
    for (const call of [
      "fetchSessionEvents(sessionId)",
      "sessionViewport(sessionId)",
      "sessionClickTarget(sessionId)",
    ]) {
      const guarded = new RegExp(
        `unrecorded \\? null : await ${call.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`
      );
      expect(SRC, `${call} must be skipped when there is no recording`).toMatch(guarded);
    }
    // The refusal gate must get NULL, not an empty set: empty means "we looked
    // and found nothing", which fails closed and would refute every claim.
    expect(SRC).toMatch(/const events = unrecorded \? null :/);
  });

  it("phrases the restart so the classifier routes it to the loop criterion", () => {
    const L1 =
      /loop(ed|s|ing)? back|a loop where|back (to|at) the (survey |questionnaire )?(start|beginning)/i;
    const phrasing =
      "A reader was sent back to the start of the survey: our own log records " +
      "them jumping back 58 questions after 123 transitions.";
    expect(L1.test(phrasing)).toBe(true);
    expect(SRC).toContain("was sent back to the start of the survey");
  });

  it("reads as a sentence in a reader's own Slack thread", () => {
    /**
     * "failed" is probe grammar — a probe that fails has reproduced the defect.
     * The witness is not a probe and does not fail, it CONFIRMS. The first
     * version posted "`survey-behaviour-log` failed: the restart is
     * independently confirmed", which is the kind of sentence that makes a team
     * stop trusting the channel.
     */
    expect(SRC).toMatch(
      /OWN_RECORD_EVIDENCE = new Set\(\["survey-behaviour-log", "paywall-exit-log"\]\)/
    );
    expect(SRC).toMatch(/OWN_RECORD_EVIDENCE\.has\(r\.file\) \? `\$\{r\.tail\}`/);
    expect(SRC).toContain("Our own survey log records the reader jumping back");
    // And the submission key is not truncated by a slice meant for UUIDs.
    expect(SRC).toMatch(/unrecorded \? sessionId : sessionId\.slice\(0, 13\)/);
  });

  it("ranks the lanes by measured yield, not by source", () => {
    // 3 of 3 real restarts from the survey log; 0 of 19 from own dead_clicks;
    // 0 of 3 from the scanners while they flagged 72. The probe budget is the
    // scarce thing, so it goes to the lane that finds real defects.
    expect(SRC).toMatch(/if \(source === "our own survey log"\) return 2;/);
    expect(SRC).toMatch(/findings\.sort\(\(a, b\) => rank\(b\) - rank\(a\)\)/);
  });

  it("bounds the work, not the lookback", () => {
    // The own-event query carried `LIMIT 25` and a 33-day sweep found 32
    // groups, so it was already capable of dropping seven silently — the third
    // time this repo has hit that shape.
    expect(SRC).toContain("LIMIT ${OWN_EVENT_FETCH_LIMIT}");
    expect(SRC).toMatch(/OWN_EVENT_FINDINGS\.length === OWN_EVENT_FETCH_LIMIT/);
    expect(SRC).toMatch(/::error::own-event query returned exactly/);
  });
});

/**
 * Unhandled exceptions in our own bundle, which nothing had ever looked at.
 *
 * Measured 2026-09-21 over 30 days: 33 sessions threw inside our own code
 * against 2 from third parties. Recurring classes nobody had seen — React error
 * #418 (a hydration mismatch) in five groups, ChunkLoadError in four (a reader
 * on a pre-deploy page whose next navigation cannot fetch its chunk), and a
 * SecurityError that fired 24 times in a single session.
 */
describe("findings synthesised from our own error reports", () => {
  it("only reports what we can act on", () => {
    const block = /const EXCEPTION_FINDINGS = await posthog\(`([\s\S]*?)`\);/.exec(SRC)?.[1] ?? "";
    expect(block, "the exception query is missing").not.toBe("");
    // Unhandled only: a caught exception was handled on purpose.
    expect(block).toContain("$exception_handled) = 'false'");
    // "Script error." is the cross-origin placeholder — 15 sessions with no
    // type, no message and no file. Nothing to report and nothing to fix.
    expect(block).toContain("Script error.");
    // Somebody else's bug in somebody else's script.
    for (const vendor of ["gtm.js", "clarity", "googletagmanager", "facebook", "hotjar"]) {
      expect(block, `${vendor} must be excluded`).toContain(vendor);
    }
    // At least one frame in our own bundle. Excluding named vendors cannot
    // exclude an error with no source at all — bots and injected code, 6 of 12
    // sessions in 30 days, each posted as "needs a human".
    expect(block).toMatch(
      /position\(toString\(properties\.\$exception_sources\), '\/_next\/'\) > 0/
    );
    // Grouped so one finding is a CLASS, not one of 24 instances.
    expect(block).toContain("GROUP BY sid, path, typ, val");
  });

  it("routes to a criterion with NO probe, so it asks a human", () => {
    /**
     * A browser check driving production today cannot reproduce a hydration
     * mismatch or a mid-deploy ChunkLoadError. A probe that cannot reproduce it
     * returns a clean verdict — the false evidence this pipeline has been full
     * of. X1 has no probes, which routes to "recognised, no probe covers it"
     * and posts a request for a human.
     */
    expect(SRC).toMatch(/id: "X1",\s*\n\s*label: "unhandled error in our own code",/);
    expect(SRC).toMatch(/id: "X1"[\s\S]{0,200}probes: \[\],/);
    // The phrasing the lane emits must be what X1 matches, or the findings fall
    // through to `gap` and are never delivered.
    expect(SRC).toContain("An unhandled error was thrown in our own code while a reader was on");
    const x1 = /match: \/An unhandled error was thrown in our own code while a reader was on\/i/;
    expect(SRC).toMatch(x1);
  });

  it("does not steal E1's findings", () => {
    // E1 owns error messages a reader can SEE. A loose /error/i here would take
    // them, and E1 has a probe while X1 deliberately does not.
    const x1Match = /id: "X1",[\s\S]{0,400}?match: (\/[^\n]+\/i),/.exec(SRC)?.[1] ?? "";
    expect(x1Match).not.toBe("");
    const re = new RegExp(x1Match.slice(1, -2), "i");
    expect(re.test("An 'Unable to process request.' error message was shown.")).toBe(false);
    expect(re.test("The user reached checkout and saw an error")).toBe(false);
  });

  it("bounds the work here too", () => {
    expect(SRC).toMatch(/EXCEPTION_FINDINGS\.length === OWN_EVENT_FETCH_LIMIT/);
  });
});

/**
 * Back took 7 readers out of their report with the paywall open in the 30 days
 * before #258. Every one was flagged by a scanner, refuted for an invented
 * unlock click, and never looked at again. This lane records the outcome itself.
 */
describe("findings synthesised from our own paywall events", () => {
  const query = /const PAYWALL_EXIT_ROWS = await posthog\(`([\s\S]*?)`\);/.exec(SRC)?.[1] ?? "";

  it("reads the events that open and close the paywall, and the page changes", () => {
    expect(query, "the paywall-exit query is missing").not.toBe("");
    for (const event of [
      "$pageview",
      "$autocapture",
      "price_shown",
      "paywall_initiated",
      "paywall_dismissed",
    ]) {
      expect(query).toContain(`'${event}'`);
    }
    // The pure, unit-tested detector decides — not a second copy of it here.
    expect(SRC).toContain("const PAYWALL_EXITS = paywallLeftOpen(");
  });

  it("bounds the sessions by the lookback and the events by twice it", () => {
    // The report pageview that makes an exit an exit comes before the paywall.
    expect(query).toContain("INTERVAL ${LOOKBACK_HOURS * 2} HOUR");
    expect(query).toMatch(
      /event IN \('price_shown', 'paywall_initiated'\)\s+AND timestamp > now\(\) - INTERVAL \$\{LOOKBACK_HOURS\} HOUR/
    );
    expect(query).toMatch(/ORDER BY sid, at\s+LIMIT \$\{PAYWALL_EXIT_FETCH_LIMIT\}\s*$/);
    expect(SRC).toMatch(/PAYWALL_EXIT_ROWS\.length === PAYWALL_EXIT_FETCH_LIMIT/);
  });

  it("phrases them so the classifier routes them to the loop criterion, unrefuted", async () => {
    // The sentence the code BUILDS, reassembled from its template pieces — a
    // copy typed into this test would keep passing after the real one changed.
    const push = /"our own paywall events",([\s\S]*?)\n\s*1,\n\s*0,\n\s*\]\);/.exec(SRC)?.[1] ?? "";
    const pieces = [...push.matchAll(/`([^`]*)`/g)].map((m) => m[1]);
    expect(pieces.length, "the paywall-exit sentence was not found").toBeGreaterThan(0);
    const sentence = pieces.join("").replace("${redactReportToken(x.to)}", "/survey");
    expect(sentence).not.toContain("${");

    const l1 = /id: "L1",[\s\S]*?match:\s*(\/.+?\/[a-z]*),/.exec(SRC)?.[1];
    expect(l1, "L1's match regex was not found in the source").toBeTruthy();
    const [, body, flags] = /^\/(.*)\/([a-z]*)$/.exec(l1!)!;
    expect(new RegExp(body, flags).test(sentence), `L1 no longer matches: ${sentence}`).toBe(true);
    // It names no press, so the refusal gate has nothing to refute.
    const { contradiction } = await import("../../features/ux-review/server/review");
    expect(contradiction(sentence, new Set(["report_viewed", "price_shown"]))).toBeNull();
  });

  it("gives each one a stable id and redacts where the reader landed", () => {
    expect(SRC).toContain("`own-paywall-exit:${x.sessionId}`");
    expect(SRC).toContain("${redactReportToken(x.to)}");
  });

  it("counts our own record of the exit as the evidence, before any replay", () => {
    const witness = SRC.indexOf('file: "paywall-exit-log"');
    const replay = SRC.indexOf('results.push(runProbe("replay-session.mjs"');
    expect(witness, "the paywall-exit evidence is missing").toBeGreaterThan(0);
    expect(witness, "a confirmed exit must not spend a replay").toBeLessThan(replay);
    expect(SRC).toMatch(
      /file: "paywall-exit-log",\s*passed: false,\s*inconclusive: false,\s*claimScoped: true,/
    );
    expect(SRC).toMatch(/OWN_RECORD_EVIDENCE = new Set\(\[[^\]]*"paywall-exit-log"/);
    expect(SRC).toMatch(/if \(source === "our own paywall events"\) return 2;/);
    // Attached to exactly the findings this lane creates: the same id prefix.
    const prefix = /`(own-paywall-exit:)\$\{x\.sessionId\}`/.exec(SRC)?.[1];
    expect(prefix).toBe("own-paywall-exit:");
    expect(SRC).toContain(`String(observationId).startsWith("${prefix}")`);
  });

  it("is never suppressed because a scanner flagged the same session", () => {
    /**
     * `seenSessions` starts with every scanner-flagged session, and a scanner's
     * finding meets the refusal gate first. Keyed on it, the outcome our own
     * records hold was dropped whenever the scanner's story was refuted — which
     * is how 01a0bbf7's real 56-question restart was filed as the scanner lying.
     */
    const restartLoop = /for \(const r of RESTART_FINDINGS\) \{([\s\S]*?)\n\}/.exec(SRC)?.[1] ?? "";
    const exitLoop = /for \(const x of PAYWALL_EXITS\) \{([\s\S]*?)\n\}/.exec(SRC)?.[1] ?? "";
    for (const [name, loop] of [
      ["restart", restartLoop],
      ["paywall", exitLoop],
    ] as const) {
      expect(loop, `${name} loop not found`).not.toBe("");
      expect(loop, `${name} lane must not skip scanner sessions`).not.toMatch(
        /seenSessions\.has\(/
      );
      expect(loop).toMatch(/if \(ownOutcomeSessions\.has\((sid|x\.sessionId)\)\) continue;/);
    }
    // And they still go first, so a scanner finding on the session inherits their answer.
    expect(SRC).toMatch(/findings\.sort\(\(a, b\) => rank\(b\) - rank\(a\)\)/);
  });
});

describe("a confirmed finding says what confirmed it", () => {
  it("never claims a re-test on a phone when only our own records confirmed it", () => {
    /**
     * The dry run for the paywall lane printed "Reproduced in production on
     * Pixel 7, matched to this reader's 411px screen" over a finding no probe
     * had reproduced: the Pixel 7 was where the unrelated L1 probes ran, and
     * they passed. The evidence was the reader's own record.
     */
    const block = /if \(reproduced\) \{([\s\S]*?)\} else if \(inconclusive\)/.exec(SRC)?.[1] ?? "";
    expect(block, "the reproduced verdict was not found").not.toBe("");
    expect(block).toMatch(/failing\.every\(\(r\) => OWN_RECORD_EVIDENCE\.has\(r\.file\)\)/);
    expect(block).toContain("❗ *Confirmed by our own records* — ");
    expect(block).toContain("❗ *Reproduced in production${at}* — ");
    // The device claim sits only on the probe branch.
    expect(block.indexOf("${at}")).toBeGreaterThan(block.indexOf("Confirmed by our own records"));
  });
});
