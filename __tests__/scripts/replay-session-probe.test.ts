/**
 * The probe that replays a reader's own route, and the wiring it depends on.
 *
 * Every other probe drives a path somebody here chose, which is why they can
 * all be clean while the report scanner sits at 0 confirmed in 45 — a defect
 * that only appears part way through one reader's sequence is not something
 * they can reach. This one follows the recorded sequence instead, so what it
 * needs is that its verdict is treated as claim-scoped and that it is actually
 * reached.
 *
 * Source tests where the target is a script with top-level await that runs on
 * import, which is the technique verifier-budget.test.ts uses for the same
 * file. Comments are stripped first: three source tests in this repo have
 * passed on a sentence describing the behaviour rather than the behaviour.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CLAIM_SCOPED_PROBES,
  SESSION_REPLAY_PROBES,
  clearIsGroundTruth,
} from "@/scripts/lib/claim-scoped-probes.mjs";

const strip = (raw: string) =>
  raw
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/^\s*--.*$/gm, "");

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const VERIFIER = strip(read("scripts/verify-ux-findings.mjs"));
const HARNESS = strip(read("scripts/verify-probe-falsifiability.mjs"));
const PROBE = strip(read("scripts/probes/replay-session.mjs"));
const TOUCH = strip(read("scripts/probes/touch.mjs"));
const MATRIX = strip(read("scripts/probes/device-matrix.mjs"));

describe("replaying the reader's own route", () => {
  it("names a probe that exists", () => {
    expect(SESSION_REPLAY_PROBES.size).toBeGreaterThan(0);
    for (const file of SESSION_REPLAY_PROBES) {
      expect(existsSync(resolve(process.cwd(), `scripts/probes/${file}`)), file).toBe(true);
    }
  });

  it("is a different set from the click-target probes", () => {
    // They are appended under different conditions — one needs a recorded tap,
    // this one only needs a session. Merging them would either run the replay
    // for sessions that never tapped anything, or stop running it at all.
    for (const f of SESSION_REPLAY_PROBES) expect(CLAIM_SCOPED_PROBES.has(f)).toBe(false);
  });

  it("makes a clean run count as evidence", () => {
    // Without this a replay's `clear` is set aside as "nothing here could have
    // disagreed", and the most session-specific probe in the corpus would be
    // the one whose verdict is ignored.
    expect(
      clearIsGroundTruth({ probe_runs: [{ file: "replay-session.mjs", claimScoped: true }] })
    ).toBe(true);
    // And through the file-name fallback, for rows written before the stamp.
    expect(clearIsGroundTruth({ probe_runs: [{ file: "replay-session.mjs" }] })).toBe(true);
    expect(clearIsGroundTruth({ probe_runs: [{ file: "verify-tap-targets.mjs" }] })).toBe(false);
  });

  it("an explicit claimScoped:false still wins", () => {
    // The stamp is authoritative when present. A run that was not handed a
    // session must not be rescued by its file name.
    expect(
      clearIsGroundTruth({ probe_runs: [{ file: "replay-session.mjs", claimScoped: false }] })
    ).toBe(false);
  });

  it("the verifier hands the probe the session", () => {
    // SESSION_ID is the only thing that makes this run about this reader. The
    // corpus has already shipped a probe that claimed a session-specific
    // verdict while running a hardcoded list, because DEVICES was never passed.
    expect(VERIFIER).toMatch(/SESSION_ID: sessionId/);
    expect(VERIFIER).toMatch(/runProbe\(file, viewport, clickTarget, reportToken, sessionId\)/);
    expect(VERIFIER).toMatch(/SESSION_REPLAY_PROBES\.has\(file\) && Boolean\(sessionId\)/);
  });

  it("only replays when the ordinary probes found nothing", () => {
    // The point is to test a CLEAN verdict. Replaying a finding that already
    // reproduced spends two minutes of browser to confirm what is known, and
    // PROBE_BUDGET allows ten findings against a 25-minute workflow timeout.
    const call = /replaysLeft > 0 &&[\s\S]{0,200}?results\.push\(runProbe\("replay-session\.mjs"/;
    expect(VERIFIER).toMatch(call);
    expect(VERIFIER).toMatch(/!results\.some\(\(r\) => !r\.passed && !r\.inconclusive\)/);
  });

  it("only replays a session that reached a report", () => {
    // The replay drives the report page, so a survey-only session has no route
    // for it to follow — it would spend one of two slots to return
    // inconclusive. The gate is the reader having a report at all.
    const gate = /if \(\s*replaysLeft > 0 &&\s*reportToken &&/;
    expect(VERIFIER).toMatch(gate);
  });

  it("bounds how many replays one run may do", () => {
    const budget = Number(
      /REPLAY_BUDGET\s*=\s*Number\(process\.env\.REPLAY_BUDGET\s*\?\?\s*(\d+)\)/.exec(VERIFIER)?.[1]
    );
    expect(Number.isFinite(budget)).toBe(true);
    expect(budget).toBeGreaterThan(0);
    // A replay is ~2 minutes of real browser against a 25-minute timeout, and
    // the ordinary probes already spend most of it.
    expect(budget).toBeLessThanOrEqual(4);
    expect(VERIFIER).toMatch(/replaysLeft -= 1/);
  });

  it("the contract harness can see it", () => {
    // It is appended to the RESULTS, not to probeFiles, so the harness's
    // original pattern could not find it — and a probe outside that list is
    // never checked for the 0/1/3 contract at all.
    expect(HARNESS).toMatch(/runProbe\\\("\(\[\^"\]\+\)"/);
    expect(existsSync(resolve(process.cwd(), "scripts/probes/replay-session.mjs"))).toBe(true);
  });

  it("the contract harness ignores fixtures", () => {
    // `_selftest-exit.mjs` returns a chosen code to the verifier's own
    // selftest, so it exits 0 on an unreachable site by design. Reading
    // runProbe() call sites pulled it in and it reported a contract breach.
    expect(HARNESS).toMatch(/\.filter\(\(f\) => !f\.startsWith\("_"\)\)/);
  });

  it("the harness gives it a route, or the contract check is vacuous", () => {
    // With no route the probe exits 3 at its first guard, before it tries to
    // reach the site — the check would pass without testing anything.
    expect(HARNESS).toMatch(/REPLAY_STEPS: "/);
    expect(PROBE).toMatch(/process\.env\.REPLAY_STEPS/);
  });

  it("the weekly MUTATE run gives it a route with something checkable", () => {
    /**
     * Without a route it exits 3 before touching the site, so its MUTATE could
     * never show: the weekly falsifiability job failed on its first run. And on
     * the LOCKED report every scroll past 25% opens the paywall, which
     * suppresses every check (a lock behind a dialog is correct) — clean and
     * mutated both said 3. The paid internal report has no paywall.
     */
    const env = /"replay-session\.mjs":\s*\{([\s\S]*?)\}/.exec(HARNESS)?.[1] ?? "";
    expect(env, "PROBE_ENV has no entry for replay-session.mjs").not.toBe("");
    const steps = /REPLAY_STEPS:\s*"([^"]+)"/.exec(env)?.[1]?.split(",") ?? [];
    const minSteps = Number(/MIN_ROUTE_STEPS = (\d+)/.exec(PROBE)?.[1]);
    expect(steps.length, "fewer steps than the probe will judge").toBeGreaterThanOrEqual(minSteps);
    const unlocked = /UNLOCKED_REPORT_TOKEN \?\? "(rpt_[A-Za-z0-9]+)"/.exec(
      read("scripts/probes/verify-unlocked-report.mjs")
    )?.[1];
    expect(unlocked).toBeTruthy();
    expect(env).toContain(`REPLAY_TOKEN: "${unlocked}"`);
  });

  it("does not treat an impression as a step the reader took", () => {
    // `locked_card_price_shown` fires once on mount behind a one-shot ref when
    // a price renders. There is nothing to tap, so it failed on 6 of 6 sessions
    // and cost every run a point of route coverage.
    expect(PROBE).not.toMatch(/"locked_card_price_shown"/);
  });

  it("does not count a page view as something the reader did", () => {
    // Performing it was a no-op that always succeeded, so it padded the
    // denominator with steps that could not fail — 4 of the first session's 9
    // "route steps" were free passes.
    expect(PROBE).not.toMatch(/"\$pageview"/);
  });

  it("reads the device the verifier passes, rather than ignoring it", () => {
    // The session's own events win, because they carry the OS as well as the
    // width and can tell an iPhone from an Android at the same size. But an
    // input that is passed and silently dropped is how a probe ends up running
    // a list nobody chose while its verdict claims otherwise — twelve probes
    // in this corpus did exactly that with DEVICES.
    expect(PROBE).toMatch(/process\.env\.DEVICES/);
    expect(PROBE).toMatch(/process\.env\.DEVICE\b/);
  });

  it("names the probes behind every verdict", () => {
    // The argument of this whole pipeline is that a `clear` only means
    // something when a probe could have disagreed — and the run log printed
    // CLEAR with no indication of what produced it. A run that was supposed to
    // replay the reader's route and quietly did not looked identical to one
    // that did, which is how this went unverified for an afternoon.
    expect(VERIFIER).toMatch(/results\.map\(\(r\) => `\$\{r\.file\}/);
    expect(VERIFIER).toMatch(/r\.claimScoped \? "\*" : ""/);
  });

  it("allowlists the session id rather than stripping it", () => {
    // The first version removed quotes before interpolating into HogQL, which
    // a TRAILING BACKSLASH escapes: SESSION_ID='x\\' produced "unterminated
    // string literal" from PostHog, i.e. the input had reached the SQL. It
    // failed safe, but by accident. Same rule as isSafeSessionId in review.ts.
    expect(PROBE).toMatch(/\^\[A-Za-z0-9-\]\{1,64\}\$/);
    expect(PROBE).toMatch(/isSafeSessionId\(SESSION_ID\)/);
    // And the escapable version is gone.
    expect(PROBE).not.toMatch(/sessionId\.replace\(/);
  });

  it("will not call a run clean when nothing could be examined", () => {
    /**
     * The lock and overlay checks are suppressed whenever a dialog is open,
     * because a locked page behind a modal is correct. On this report that is
     * nearly always: scrolling opens the paywall by itself and it stays open.
     * Measured on four real sessions — 0, 0, 0 and 0 checkable route steps,
     * while the probe printed "clean". That clean was clean because nothing
     * could be seen, and MUTATE=1 on a scroll-only route was invisible three
     * runs out of three.
     */
    expect(PROBE).toMatch(/MIN_EXAMINED/);
    expect(PROBE).toMatch(/examined = routeCheckable \+ tapsPresent/);
    expect(PROBE).toMatch(/examined < MIN_EXAMINED/);
    // And the counter must not mix the two step kinds: deriving checkable as
    // routeDone - suppressed produced -14, -23, -27, because inspect() also
    // runs after dead taps.
    expect(PROBE).toMatch(/!isTap && !seen\.suppressed/);
    expect(PROBE).not.toMatch(/routeDone - suppressed/);
  });

  it("injects a defect each kind of check can see", () => {
    // The scroll lock alone flipped Android and not iOS: WebKit has no CDP so
    // the gesture check is skipped, and the lock check is suppressed by the
    // open paywall. MUTATE then exited 0 while carrying its own defect.
    expect(PROBE).toMatch(/pointer-events/);
    expect(PROBE).toMatch(/aria-disabled/);
    expect(PROBE).toMatch(/setInterval/);
  });

  it("asks again before accusing anyone", () => {
    /**
     * The state read is a snapshot, and a paywall that is OPENING locks the
     * body before its root is visible enough to count as shown. In that window
     * every check fires on correct behaviour.
     *
     * The first CI run of this probe did exactly that:
     *   CONFIRM 01a0c4c6…  D1  "Reproduced in production on Pixel 7 —
     *   after scroll_depth_50/75/100: a real finger could not scroll the page"
     * on a session where scrolling had merely opened the paywall. It was a dry
     * run so it went nowhere; live, that posts "Reproduced in production" under
     * a real reader's submission.
     */
    expect(PROBE).toMatch(/if \(faults\.length > 0\) \{[\s\S]{0,800}?nowOpen/);
    // The second look must only ever REMOVE an accusation.
    expect(PROBE).toMatch(/if \(nowOpen\) return \{ faults: \[\], suppressed: true \}/);
  });

  it("no longer accuses a page of being unscrollable", () => {
    /**
     * The gesture check is gone on its own record: 0 true findings, 3 false
     * positives, every one posted as "Reproduced in production" — a paywall
     * mid-animation, a reader who had read to the bottom, and then a third
     * cause that still fired in CI on session 01a0c4c6 while that same session
     * ran clean locally eight times.
     *
     * Each fix was a guess testable only in CI fifteen minutes later. What it
     * was for is covered by the lock-state check, deterministically and on
     * every engine, and that is the check MUTATE=1 trips.
     */
    expect(PROBE).not.toMatch(/faults\.push\("a real finger could not scroll/);
    expect(PROBE).toMatch(/the page was locked with no dialog open/);
  });

  it("keeps the room helper, because another probe still reads moved <= 0", () => {
    // device-matrix.mjs makes the same `moved <= 0 -> dead` reading twice. It
    // is not a gate probe so it cannot post a finding, but the trap should stay
    // unavailable to whatever gets written next.
    expect(TOUCH).toMatch(/hadRoom/);
    expect(TOUCH).toMatch(/dy >= 0 \? room\.below > 0 : room\.above > 0/);
    for (const m of MATRIX.match(/if \(t2?\.[a-zA-Z]+ && t2?\.moved <= 0\)/g) ?? []) {
      expect(m).toContain("hadRoom");
    }
    expect(MATRIX).not.toMatch(/if \(t2?\.moved <= 0\)/);
  });

  it("keeps the three-way exit contract", () => {
    for (const code of ["process.exit(0)", "process.exit(1)", "process.exit(3)"]) {
      expect(PROBE, `${code} is missing`).toContain(code);
    }
  });

  it("will not call a half-followed route clean", () => {
    // A run that could only perform part of the visit has cleared nothing.
    // "Clear" from a probe that never reached the interesting part is the
    // error this whole corpus exists to stop making.
    expect(PROBE).toMatch(/share < MIN_REPLAYED_SHARE/);
    expect(PROBE).toMatch(/MIN_REPLAYED_SHARE = /);
  });
});

/**
 * 2026-09-24: the replay opened the pipeline's first reproduction PR (#282) and
 * posted "Reproduced in production" under a reader whose only "dead taps" were
 * on prose. Three separate faults, each pinned here.
 */
describe("the replay never operates what it did not mean to tap", () => {
  it("stubs checkout, as every other report probe does", () => {
    // A replayed tap on a bare "svg" landed on an unlock control and started a
    // LIVE Stripe checkout for the internal report (14 abandoned sessions).
    expect(PROBE).toMatch(/ctx\.route\("\*\*\/api\/stripe\/checkout-session"/);
    expect(PROBE).toContain('reason: "checkout_disabled"');
  });

  it("stops at the step that leaves the report, and counts the rest as not followed", () => {
    // Stripe's loading screen covering the viewport read as a stranded overlay.
    const loop = PROBE.slice(PROBE.indexOf("for (const [i, step] of steps.entries())"));
    const leave = loop.indexOf('if (!at.startsWith("/report/"))');
    expect(leave, "no leave-the-report check in the step loop").toBeGreaterThan(0);
    expect(leave, "it must run before the page is inspected").toBeLessThan(
      loop.indexOf("const seen = await inspect(page, cdp)")
    );
    expect(loop.slice(leave, leave + 400)).toMatch(/routeTotal \+= left;[\s\S]*break;/);
  });

  it("does not press a point something else covers", () => {
    const body = TOUCH.slice(TOUCH.indexOf("export async function realTap"));
    const guard = body.indexOf("if (!probe.reaches) return { tapped: false, ...probe };");
    expect(guard, "realTap presses whatever is on top").toBeGreaterThan(0);
    expect(guard).toBeLessThan(body.indexOf("page.touchscreen.tap("));
  });

  it("recognises the consent banner by CookieYes's own class names, not a substring", async () => {
    // `[class*='cky']` matches "sti-cky": the report's sticky unlock bar and its
    // main wrapper counted as the banner, and 1 of a reader's 41 taps resolved.
    for (const src of [TOUCH, PROBE, MATRIX]) expect(src).not.toContain("[class*='cky']");
    const selector = /closest\("(\[class\^='cky-'\], \[class\*=' cky-'\])"\)/.exec(TOUCH)?.[1];
    expect(selector, "the exact CookieYes selector is not in touch.mjs").toBeTruthy();

    const { JSDOM } = await import("jsdom");
    const { document } = new JSDOM(
      `<main class="report-page report-page--sticky"><div class="report-sticky-unlock"><p id="ours">ours</p></div></main>` +
        `<div class="cky-consent-container"><p class="cky-title" id="banner">banner</p></div>`
    ).window;
    const first = [...document.querySelectorAll("p")].find((el) => !el.closest(selector!));
    expect(first?.id).toBe("ours");
    expect(document.getElementById("banner")!.closest(selector!)).not.toBeNull();
    // ...and the old substring would have excluded ours.
    expect(document.getElementById("ours")!.closest("[class*='cky']")).not.toBeNull();
  });
});

describe("a replay-only confirmation waits for a person", () => {
  it("is neither posted into the reader's thread nor turned into a pull request", () => {
    expect(VERIFIER).toContain(
      "const heldForAPerson = reproduced && confirmedByReplayAlone(results);"
    );
    expect(VERIFIER).toMatch(/if \(reproduced && !heldForAPerson && !DRY_RUN/);
    expect(VERIFIER).toContain("const speaks = (reproduced && !heldForAPerson) || inconclusive;");
    // Held BEFORE the pull request is opened, not after.
    expect(VERIFIER.indexOf("const heldForAPerson")).toBeLessThan(
      VERIFIER.indexOf("openReproductionPr({")
    );
  });
});

describe("the replay comes back from a checkout it started", () => {
  it("presses the layer's own button before judging the page, and only then", () => {
    /**
     * 2026-09-25: the stub answers "disabled", the page shows its own status
     * layer with "Back to your report", and the replay reported that layer as
     * covering the page: its second false confirmation, held for a person and
     * ruled out. Proven against a locked report: after Unlock the layer reads
     * "stubbed / Back to your report", and pressing its button clears it.
     */
    const handoff = PROBE.indexOf('page.locator(".report-checkout-handoff")');
    expect(handoff, "the replay must look for the checkout layer").toBeGreaterThan(-1);
    expect(PROBE.slice(handoff, handoff + 400)).toMatch(/handoff\.locator\("button"\)/);
    // After the leave-the-report check and before the page is judged.
    expect(PROBE.indexOf('startsWith("/report/")')).toBeLessThan(handoff);
    expect(handoff).toBeLessThan(PROBE.indexOf("const seen = await inspect(page, cdp);"));
  });
});
