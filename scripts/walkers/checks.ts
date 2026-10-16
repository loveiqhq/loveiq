/**
 * What a walk proves without anyone's judgement: it finished or it did not, the report
 * named the persona's archetype or another one, paying unlocked something or nothing.
 * These are facts measured by the walk itself, so they are reported whatever the judge
 * (scripts/walkers/judge.ts) says, and the judge is told them before it looks.
 */
import type { Walk } from "./walk";

export interface Check {
  ok: boolean;
  /** One plain sentence, read in Slack as it stands. */
  what: string;
}

/**
 * Console noise that belongs to staging, not to the product. Vercel's preview toolbar
 * loads a script our CSP refuses, on every preview deployment and never on loveiq.org.
 */
export const STAGING_NOISE: RegExp[] = [/vercel\.live\/_next-live/];

const minutes = (ms: number) => `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
const distinct = (xs: string[], n = 3) => [...new Set(xs)].slice(0, n);

export function checkWalk(w: Walk): Check[] {
  const checks: Check[] = [];
  checks.push(
    w.finished
      ? { ok: true, what: `Reached the end in ${minutes(w.durationMs ?? 0)}.` }
      : { ok: false, what: `Stopped before the end: ${w.stoppedAt ?? "no reason recorded"}.` }
  );
  // The server's answer is the score; the page's is what the reader was told. Both count,
  // but only the server's can pass: a page reading that happens to match proves nothing.
  const reachedReport = w.finished || w.steps.some((s) => s.kind === "report");
  if (w.serverArchetype !== undefined) {
    checks.push(
      w.serverArchetype === w.persona
        ? { ok: true, what: `The report named ${w.persona}, as the answers should.` }
        : {
            ok: false,
            what: `Answered as ${w.persona}, but the report named ${w.serverArchetype ?? "no archetype"}.`,
          }
    );
  } else if (reachedReport) {
    checks.push({
      ok: false,
      what: `Reached the report but never saw its score from the server${w.assignedArchetype ? `; the page led with ${w.assignedArchetype}` : ""}.`,
    });
  }
  if (w.serverArchetype && w.assignedArchetype && w.serverArchetype !== w.assignedArchetype) {
    checks.push({
      ok: false,
      what: `The server scored ${w.serverArchetype}, but the page led with ${w.assignedArchetype}.`,
    });
  }
  if (w.plan && w.paid) {
    const before = w.locksBefore ?? -1;
    const after = w.locksAfter ?? -1;
    checks.push(
      before > 0 && after >= 0 && after < before
        ? {
            ok: true,
            what: `Paying for ${w.plan} unlocked ${before - after} of ${before} locked parts.`,
          }
        : {
            ok: false,
            what: `Paid for ${w.plan}, but the locked parts went from ${before} to ${after}.`,
          }
    );
    if (w.boughtPlan !== undefined && w.boughtPlan !== w.plan) {
      checks.push({
        ok: false,
        what: `Meant to buy ${w.plan}, but the receipt page named ${w.boughtPlan ?? "no plan"}.`,
      });
    }
  } else if (w.plan && w.finished === false && w.steps.some((s) => s.kind === "stripe-checkout")) {
    checks.push({
      ok: false,
      what: `Reached Stripe for ${w.plan} but the payment did not complete.`,
    });
  }
  // Another archetype's report bought first (walk.ts --sequence): every failed check is a
  // defect, and only a walk that got through all of them, to the end, passes.
  if (w.sequence) {
    const bought = w.sequence.other ?? "another archetype";
    const failed = w.sequence.checks.filter((c) => !c.ok);
    for (const c of failed) {
      checks.push({
        ok: false,
        what: `Buying ${bought} first: expected ${c.what}; saw ${c.observed}.`,
      });
    }
    if (!failed.length && w.finished) {
      checks.push(
        w.sequence.checks.length
          ? {
              ok: true,
              what: `Bought ${bought} from Other Archetypes, then the own report: all ${w.sequence.checks.length} sequence checks held.`,
            }
          : { ok: false, what: "The purchase sequence recorded no checks." }
      );
    }
  }
  const errors = w.consoleErrors.filter((e) => !STAGING_NOISE.some((re) => re.test(e)));
  if (errors.length) {
    checks.push({
      ok: false,
      what: `${errors.length} console error${errors.length === 1 ? "" : "s"}: ${distinct(errors.map((e) => e.slice(0, 120))).join(" | ")}`,
    });
  }
  if (w.failedRequests.length) {
    checks.push({
      ok: false,
      what: `${w.failedRequests.length} failed request${w.failedRequests.length === 1 ? "" : "s"}: ${distinct(w.failedRequests).join(", ")}`,
    });
  }
  if (w.slowRequests.length) {
    checks.push({
      ok: false,
      what: `Slow server calls (over 3s): ${distinct(w.slowRequests, 4).join(", ")}`,
    });
  }
  if (w.scrollLocked) {
    checks.push({
      ok: false,
      what: "The free report stopped scrolling: the page was locked (overflow:hidden) with nothing open.",
    });
  }
  const wide = w.steps.filter((s) => s.overflowX).map((s) => s.kind);
  if (wide.length) {
    checks.push({
      ok: false,
      what: `The page scrolls sideways on: ${distinct(wide, 5).join(", ")}`,
    });
  }
  if (w.missingOptions.length) {
    checks.push({
      ok: false,
      what: `Answers this checkout knows were not on screen: ${distinct(w.missingOptions).join(" | ")}`,
    });
  }
  return checks;
}
