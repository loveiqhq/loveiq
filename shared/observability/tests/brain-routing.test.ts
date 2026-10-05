import { describe, expect, it } from "vitest";

import { isBrainMessage } from "@shared/observability/logger";

/**
 * WHICH ERRORS BELONG TO THE BRAIN, decided on the message because the mirror in
 * logger.ts sees only what was logged.
 *
 * The company brain was posting more to #prod-alerts than everything else combined, and
 * a channel nobody reads is worse than no channel. Its failures now route to their own
 * webhook. That routing had no test: every brain cron succeeded for the rest of the day,
 * so "nothing brain-shaped in #prod-alerts" was true for the wrong reason — nothing had
 * fired at all.
 *
 * The strings below are NOT invented. They are the distinct `api_5xx` messages actually
 * posted to #prod-alerts, read out of the channel on 2026-09-14.
 */
describe("isBrainMessage — routing real production errors", () => {
  /** Every brain-shaped message the channel has actually carried. */
  const BRAIN = [
    "brain-notion failed",
    "brain retrieval failed",
    "brain llm returned an error",
    "brain-brief failed",
    "brain: count_context failed",
    "brain_search RPC failed",
    "brain: browse_context failed",
    "MCP tool call failed",
    "brain-fast: source failed",
    "brain-gmail failed",
    "brain-drive failed",
    "brain-fast: embedding new chunks failed",
    "brain llm request failed",
    "brain: decision mining failed",
  ];

  /** Real messages that must KEEP going to ops — a site or money failure. */
  const OPS = [
    "Sweep: top-level failure",
    "Stripe checkout session creation failed",
    "anomaly-watcher cron failed",
    "google oauth: delegated token exchange refused — check domain-wide delegation",
    "Error processing Stripe webhook",
    "Contact form failed",
  ];

  it.each(BRAIN)("routes %j to the brain channel", (msg) => {
    expect(isBrainMessage(msg)).toBe(true);
  });

  it.each(OPS)("keeps %j in ops", (msg) => {
    expect(isBrainMessage(msg)).toBe(false);
  });

  /**
   * Anchored at the start on purpose. A payment failure that happens to mention the brain
   * mid-sentence is still a payment failure, and must not be filed away in the quiet
   * channel — that is the direction of this mistake that actually costs something.
   */
  it("does not reroute an ops failure that merely mentions the brain", () => {
    expect(isBrainMessage("Stripe webhook failed while the brain was ingesting")).toBe(false);
    expect(isBrainMessage("Payment fulfillment failed — see brain logs")).toBe(false);
  });

  /** A bare word is not a prefix. "brainstorm" is not the company brain. */
  it("is not fooled by a word that merely starts with the same letters", () => {
    expect(isBrainMessage("brainstorming session export failed")).toBe(false);
    expect(isBrainMessage("mcpherson integration failed")).toBe(false);
  });

  it("is case-insensitive, because log messages are written by hand", () => {
    expect(isBrainMessage("Brain-notion failed")).toBe(true);
    expect(isBrainMessage("mcp tool call failed")).toBe(true);
  });
});
