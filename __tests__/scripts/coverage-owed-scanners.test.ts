import { describe, expect, it } from "vitest";

import {
  owedScanners,
  recordingSettled,
  requeueAction,
  scannersByTrigger,
} from "@/scripts/lib/scanners-by-trigger.mjs";

/**
 * "Opened by some scanner" is not "opened by the one that should have looked".
 * Until 2026-09-24 a reader counted as covered once ANY scanner opened them, so
 * 40 finishers in 14 days, one with 65 dead taps, were never sent back to the
 * survey and report scanners that had skipped them.
 */
describe("which scanners still owe a finished reader a look", () => {
  const TRIGGERS = ["survey_started", "report_viewed", "dead_click", "rage_click"];
  const sc = (id: string, trigger: string, sampling_mode: string) => ({
    id,
    name: id,
    sampling_mode,
    query: { events: [{ id: trigger }] },
  });
  const byTrigger = scannersByTrigger([
    sc("survey", "survey_started", "comprehensive"),
    sc("report", "report_viewed", "comprehensive"),
    sc("dead", "dead_click", "focused"),
    sc("rage", "rage_click", "comprehensive"),
  ]);
  const owed = (counts: number[], seen: string[]) =>
    owedScanners(counts, TRIGGERS, byTrigger, new Set(seen))
      .map((s: { id: string }) => s.id)
      .sort();

  it("owes a comprehensive scanner every session its trigger matched", () => {
    // Submission 2183: opened by the rage-click scanner alone.
    expect(owed([1, 1, 65, 1], ["rage"])).toEqual(["report", "survey"]);
  });

  it("owes nothing to a scanner that already looked, or whose trigger never fired", () => {
    expect(owed([1, 1, 0, 0], ["survey", "report"])).toEqual([]);
    expect(owed([1, 0, 0, 0], ["survey"])).toEqual([]);
  });

  it("owes a focused scanner only a reader nothing else opened", () => {
    // Focused skips by design; that is a spend decision, not a miss.
    expect(owed([1, 0, 3, 0], ["survey"])).toEqual([]);
    expect(owed([1, 0, 3, 0], [])).toEqual(["dead", "survey"]);
  });

  it("names a scanner once even when two of its triggers fired", () => {
    const both = scannersByTrigger([
      {
        id: "x",
        name: "x",
        sampling_mode: "comprehensive",
        query: { events: [{ id: "survey_started" }, { id: "report_viewed" }] },
      },
    ]);
    expect(owedScanners([1, 1, 0, 0], TRIGGERS, both, new Set()).length).toBe(1);
  });
});

/**
 * PostHog keeps one observation per (scanner, session), and /observe/ does
 * nothing once it exists. On 2026-09-25, 39 readers had sat "re-queued" for a
 * week behind temporary failures from 2026-09-18; one retry cleared its row in
 * 49 seconds.
 */
describe("what the re-queue does about an owed pair", () => {
  it("asks for a first look when PostHog has never tried", () => {
    expect(requeueAction(undefined)).toEqual({ action: "observe" });
  });

  it("retries a temporary failure through its own endpoint", () => {
    expect(
      requeueAction({
        id: "o1",
        status: "failed",
        error_reason: "infra_transient:Activity task timed out",
      })
    ).toEqual({ action: "retry", id: "o1" });
  });

  it("reads 'temporary' from what PostHog says, not only its category", () => {
    const retried = (error_reason: string) =>
      requeueAction({ id: "o", status: "failed", error_reason }).action;
    expect(retried("provider_transient:The AI provider could not process the video")).toBe("retry");
    expect(retried("internal_error:Queries are a little too busy right now")).toBe("retry");
  });

  it("does not resend a permanent failure, or one still in progress", () => {
    expect(
      requeueAction({ id: "o2", status: "failed", error_reason: "recording_not_found" }).action
    ).toBe("give-up");
    expect(
      requeueAction({ id: "o3", status: "ineligible", error_reason: "too_short" }).action
    ).toBe("give-up");
    expect(requeueAction({ id: "o4", status: "running" }).action).toBe("wait");
    expect(requeueAction({ id: "o5", status: "succeeded" }).action).toBe("wait");
  });
});

describe("the re-queue's idea of watchable", () => {
  it("is PostHog's minimum, the same bar every coverage figure uses", async () => {
    const { readFileSync } = await import("node:fs");
    const { MIN_WATCHABLE_ACTIVE_MS } = await import("@features/ux-review/server/review");
    const script = readFileSync("scripts/ux-review-coverage.mjs", "utf8");
    expect(script).toContain(`r.active >= ${MIN_WATCHABLE_ACTIVE_MS}`);
  });
});

/**
 * PostHog watches a recording the moment it is asked and keeps that one look,
 * so the re-queue must not ask while the reader is still there. It did: 9 of
 * 567 looks it asked for started before their recording ended.
 */
describe("when the re-queue may ask for a look", () => {
  const now = Date.parse("2026-09-25T18:00:00Z");

  it("only once the recording has been over for an hour", () => {
    expect(recordingSettled("2026-09-25T16:59:59Z", now)).toBe(true);
    expect(recordingSettled("2026-09-25T17:00:01Z", now)).toBe(false);
  });

  it("reads PostHog's timestamps with their offset", () => {
    // Submission 2226: asked at 17:27:18 UTC about a recording that ended at
    // 19:24:23 Berlin time, three minutes before.
    const ended = "2026-09-25T19:24:23.156000+02:00";
    expect(recordingSettled(ended, Date.parse("2026-09-25T17:27:18Z"))).toBe(false);
    expect(recordingSettled(ended, Date.parse("2026-09-25T18:25:00Z"))).toBe(true);
  });

  it("does not ask about a recording whose end it cannot read", () => {
    expect(recordingSettled(null, now)).toBe(false);
    expect(recordingSettled("", now)).toBe(false);
  });

  it("is the rule for finishers and for readers who left", async () => {
    const { readFileSync } = await import("node:fs");
    const script = readFileSync("scripts/ux-review-coverage.mjs", "utf8");
    expect(script.match(/!recordingSettled\(/g) ?? []).toHaveLength(2);
  });
});
