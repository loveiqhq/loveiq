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
    const gate = /if \(replaysLeft > 0 && reportToken &&/;
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
