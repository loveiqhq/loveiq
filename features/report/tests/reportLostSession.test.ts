import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A reader who cannot see their report must never be told to redo the survey.
 *
 * Both routes here — a 404 token and a missing browser session — used to offer
 * "Take the survey" as the only way forward, with copy reading "Complete the
 * survey again to generate a fresh report". Opening the report on a second phone
 * is the ordinary way to land there, so someone who had already answered 56
 * questions was invited to answer them again. That is the "users start the
 * survey from scratch" complaint Mark reported on 2026-08-30, and PostHog Replay
 * Vision flagged the same shape on 2026-09-14.
 *
 * Everyone who finishes is emailed a "View your report now" link
 * (features/survey/server/emails/survey-complete.ts), so the email is the way
 * back in. Source-text assertions because these are two literals in a 2,500-line
 * component — the behaviour they guard is one sentence, and the regression is a
 * careless copy edit rather than a logic change.
 */
const RAW = readFileSync(join(__dirname, "..", "ui", "ReportPage.tsx"), "utf8");

/**
 * Comments stripped before asserting. The comments at both call sites quote the
 * old copy verbatim to explain why it changed, and matching those made this test
 * fail against a file that was already correct. Only what a reader can see counts.
 */
const SOURCE = RAW.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("lost report session", () => {
  it("never tells a reader to complete the survey again", () => {
    expect(
      /complete the survey again/i.test(SOURCE),
      "a lost-report screen is asking the reader to redo all 56 questions"
    ).toBe(false);
    expect(/survey again to generate/i.test(SOURCE)).toBe(false);
  });

  it("points at the completion email, which carries their link", () => {
    // Both the 404 branch and the missing-session screen.
    const mentions = SOURCE.match(/We emailed your report link when you finished/g) ?? [];
    expect(mentions.length, "expected both lost-report screens to name the email").toBe(2);
  });

  it("keeps the survey as the secondary option, not the instruction", () => {
    // Someone who genuinely has not taken it still needs a way in — but the
    // label must read as an aside, not as the fix for a lost report.
    expect(SOURCE).toContain("Haven&apos;t taken the test yet?");
    expect(SOURCE).not.toContain('actionLabel: "Take the survey"');
  });
});
