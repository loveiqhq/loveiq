import { describe, expect, it } from "vitest";

import { buildJourneyMessage, formatDuration } from "@features/attribution/server/slack-journey";
import type { SubmissionJourney } from "@features/attribution/server/journey";
import type { SlackBlock } from "@shared/observability/slack";

/**
 * `slack-journey.ts` had NO test file, which is how two defects shipped and
 * survived in front of the whole team:
 *
 *  1. The progress rail's glyphs were inverted — `:white_circle:` meant done and
 *     `:black_circle:` meant not-done, so the solid dot marked the steps that had
 *     NOT happened. The message said the opposite of the truth.
 *  2. In the survey-completion message the rail can only ever show step 1 of 5,
 *     because report-open / paywall / checkout / paid are all sourced from rows
 *     that do not exist yet at submit time.
 *
 * Neither broke anything, neither threw, and nothing failed. So these assert the
 * RENDERED STRING, not the shape.
 */

function journey(overrides: Partial<SubmissionJourney> = {}): SubmissionJourney {
  return {
    submissionId: 1756,
    firstName: "Kitten",
    emailMasked: "a***@gmail.com",
    arms: { landing: "white", survey: "white", pricing: null, paywall: null },
    traffic: { bucket: "Paid", source: "google", medium: "cpc", campaign: null },
    device: "Desktop",
    countryTier: "tier_2",
    timings: {
      durationMs: 720_000,
      startedAt: "2026-08-24T18:27:00.000Z",
      completedAt: "2026-08-24T18:39:00.000Z",
      msToPurchase: null,
      msCheckoutHesitation: null,
    },
    milestones: {
      reportViewedAt: null,
      paywallInitiatedAt: null,
      checkoutStartedAt: null,
      purchasedAt: null,
    },
    money: null,
    quoteCount: 0,
    ...overrides,
  };
}

function rail(blocks: SlackBlock[]): string {
  const text = JSON.stringify(blocks);
  const match = /(?::large_blue_circle:|:white_circle:)[^"]*/.exec(text);
  return match ? match[0] : "";
}

/** The steps rendered as filled, in order. */
function filledSteps(blocks: SlackBlock[]): string[] {
  return rail(blocks)
    .split("\u2192")
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.startsWith(":large_blue_circle:"))
    .map((chunk) => chunk.replace(":large_blue_circle:", "").trim());
}

describe("journey rail — filled means reached", () => {
  it("fills only the survey step for a fresh completion", () => {
    const message = buildJourneyMessage(journey(), {
      kind: "survey_completed",
      questionCount: 59,
    });
    expect(filledSteps(message.blocks)).toEqual(["Survey done"]);
    // The regression that shipped: the solid marker on everything NOT reached.
    expect(rail(message.blocks)).toContain(":white_circle: Report opened");
    expect(rail(message.blocks)).not.toContain(":large_blue_circle: Paid");
  });

  it("fills every earlier step from the furthest one reached", () => {
    // Checkout started but not paid, and the paywall milestone is MISSING —
    // analytics_event is consent-gated, so this is the common real shape.
    const message = buildJourneyMessage(
      journey({
        milestones: {
          reportViewedAt: null,
          paywallInitiatedAt: null,
          checkoutStartedAt: "2026-08-24T19:00:00.000Z",
          purchasedAt: null,
        },
      }),
      { kind: "survey_completed", questionCount: 59 }
    );
    // Nobody reaches checkout without opening the report and hitting the paywall,
    // so a consent gap must not render as "did not happen".
    expect(filledSteps(message.blocks)).toEqual([
      "Survey done",
      "Report opened",
      "Paywall hit",
      "Checkout",
    ]);
    expect(rail(message.blocks)).toContain(":white_circle: Paid");
  });

  it("fills the whole rail on a purchase, even with no analytics milestones", () => {
    const message = buildJourneyMessage(
      journey({
        milestones: {
          reportViewedAt: null,
          paywallInitiatedAt: null,
          checkoutStartedAt: null,
          purchasedAt: "2026-08-24T19:10:00.000Z",
        },
        money: { plan: "full_report", amount: 39.99, currency: "EUR" },
      }),
      {
        kind: "purchase",
        planLabel: "Just a snapshot",
        archetype: "Spark Seeker",
        amountText: "EUR 39.99",
      }
    );
    expect(filledSteps(message.blocks)).toEqual([
      "Survey done",
      "Report opened",
      "Paywall hit",
      "Checkout",
      "Paid",
    ]);
    // A purchase message that showed "Report opened" hollow would contradict the
    // payment it is announcing.
    expect(rail(message.blocks)).not.toContain(":white_circle:");
  });

  it("never uses the old inverted glyph pair", () => {
    const message = buildJourneyMessage(journey(), {
      kind: "survey_completed",
      questionCount: 59,
    });
    expect(JSON.stringify(message.blocks)).not.toContain(":black_circle:");
  });
});

describe("pricing arm — which side of the test, in words and numbers", () => {
  function pricingRow(blocks: SlackBlock[]): string {
    const text = JSON.stringify(blocks);
    const m = /Report pricing[^"]*/.exec(text);
    return m ? m[0] : "";
  }

  it("names the dearer side for arm A, which is dearer since pricing 2.1", () => {
    // Derived from PLAN_BUCKETS, not from a label: arm A is 39.99 on the entry
    // tier against arm B's 29.00. The old labels said "Pricing A (lower)" and
    // kept saying it after 2.1 inverted the test.
    const message = buildJourneyMessage(
      journey({
        arms: { landing: "white", survey: "white", pricing: "A", paywall: null },
        money: { plan: "full_report", amount: 39.99, currency: "EUR" },
        milestones: { ...journey().milestones, purchasedAt: "2026-08-24T19:10:00.000Z" },
      }),
      { kind: "purchase", planLabel: "Just a snapshot", archetype: null, amountText: "EUR 39.99" }
    );
    const row = pricingRow(message.blocks);
    expect(row).toContain("dearer");
    expect(row).not.toContain("cheaper");
    expect(row).toContain("EUR 39.99");
    expect(row).toContain("EUR 29.00");
  });

  it("names the cheaper side for arm B", () => {
    const message = buildJourneyMessage(
      journey({
        arms: { landing: "white", survey: "white", pricing: "B", paywall: null },
        money: { plan: "full_report", amount: 29, currency: "EUR" },
        milestones: { ...journey().milestones, purchasedAt: "2026-08-24T19:10:00.000Z" },
      }),
      { kind: "purchase", planLabel: "Just a snapshot", archetype: null, amountText: "EUR 29.00" }
    );
    const row = pricingRow(message.blocks);
    expect(row).toContain("cheaper");
    expect(row).not.toContain("dearer");
  });

  it("compares on the plan actually bought, not always the entry tier", () => {
    // all_reports: A 59.00 vs B 49.00 — different numbers from the entry tier, so
    // a hardcoded reference plan would print the wrong pair here.
    const message = buildJourneyMessage(
      journey({
        arms: { landing: "white", survey: "white", pricing: "A", paywall: null },
        money: { plan: "all_reports", amount: 59, currency: "EUR" },
        milestones: { ...journey().milestones, purchasedAt: "2026-08-24T19:10:00.000Z" },
      }),
      {
        kind: "purchase",
        planLabel: "For you & your partner",
        archetype: null,
        amountText: "EUR 59.00",
      }
    );
    const row = pricingRow(message.blocks);
    expect(row).toContain("EUR 59.00");
    expect(row).toContain("EUR 49.00");
  });

  it("says so when both sides cost the same rather than inventing a direction", () => {
    // essentials is grandfathered at one price for both arms.
    const message = buildJourneyMessage(
      journey({
        arms: { landing: "white", survey: "white", pricing: "A", paywall: null },
        money: { plan: "essentials", amount: 9.99, currency: "EUR" },
        milestones: { ...journey().milestones, purchasedAt: "2026-08-24T19:10:00.000Z" },
      }),
      { kind: "purchase", planLabel: "Essentials", archetype: null, amountText: "EUR 9.99" }
    );
    const row = pricingRow(message.blocks);
    expect(row).toContain("same base price both sides");
    expect(row).not.toContain("dearer");
    expect(row).not.toContain("cheaper");
  });

  it("adds nothing when the arm is not known yet", () => {
    // At survey-completion time there is no quote, so there is no arm to describe.
    const message = buildJourneyMessage(journey(), {
      kind: "survey_completed",
      questionCount: 59,
    });
    const row = pricingRow(message.blocks);
    expect(row).toContain("Not recorded");
    expect(row).not.toContain("dearer");
    expect(row).not.toContain("cheaper");
  });
});

describe("journey message safety", () => {
  it("escapes a name containing Slack markup so the layout cannot break", () => {
    const message = buildJourneyMessage(journey({ firstName: "Ki*tt*en" }), {
      kind: "survey_completed",
      questionCount: 59,
    });
    expect(JSON.stringify(message.blocks)).toContain("Ki\\\\*tt\\\\*en");
  });

  it("puts the masked email in a code span, not through the markup escaper", () => {
    // escapeSlack(maskEmail(...)) renders literal backslashes in Slack mrkdwn —
    // "e\\*\\*\\*@example.com" — so the mask has to travel as code.
    const message = buildJourneyMessage(journey(), {
      kind: "survey_completed",
      questionCount: 59,
    });
    const text = JSON.stringify(message.blocks);
    expect(text).toContain("`a***@gmail.com`");
    expect(text).not.toContain("a\\\\*\\\\*\\\\*@gmail.com");
  });

  it("keeps the fallback text standalone — it is the only thing dead-lettered", () => {
    const message = buildJourneyMessage(journey(), {
      kind: "survey_completed",
      questionCount: 59,
    });
    // Blocks are NOT dead-lettered, and the first 100 chars are the dedup key, so
    // the submission id has to appear early.
    expect(message.text).toContain("#1756");
    expect(message.text.indexOf("1756")).toBeLessThan(100);
  });

  it("survives a journey with nothing recorded rather than rendering blanks", () => {
    const message = buildJourneyMessage(
      journey({
        firstName: null,
        emailMasked: null,
        device: null,
        countryTier: null,
        timings: {
          durationMs: null,
          startedAt: null,
          completedAt: null,
          msToPurchase: null,
          msCheckoutHesitation: null,
        },
        traffic: { bucket: "Direct", source: null, medium: null, campaign: null },
      }),
      { kind: "survey_completed", questionCount: 0 }
    );
    expect(message.blocks.length).toBeGreaterThan(0);
    expect(message.text).toContain("anonymous");
    expect(JSON.stringify(message.blocks)).toContain("no email");
  });
});

describe("formatDuration", () => {
  it("renders seconds, minutes and hours, and omits nonsense", () => {
    expect(formatDuration(45_000)).toBe("45s");
    expect(formatDuration(720_000)).toBe("12 min");
    expect(formatDuration(3_840_000)).toBe("1h 4m");
    expect(formatDuration(null)).toBeNull();
    expect(formatDuration(-1)).toBeNull();
    expect(formatDuration(Number.NaN)).toBeNull();
  });
});
