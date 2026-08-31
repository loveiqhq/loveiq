import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    recordingSessionId: null,
    ...overrides,
  };
}

/** Green = reached, red = not reached yet. Named so a recolour is a one-line diff. */
const REACHED = ":large_green_circle:";
const NOT_REACHED = ":red_circle:";

function rail(blocks: SlackBlock[]): string {
  const text = JSON.stringify(blocks);
  const match = new RegExp(`(?:${REACHED}|${NOT_REACHED})[^"]*`).exec(text);
  return match ? match[0] : "";
}

/** The steps rendered as reached, in order. */
function filledSteps(blocks: SlackBlock[]): string[] {
  return rail(blocks)
    .split("\u2192")
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.startsWith(REACHED))
    .map((chunk) => chunk.replace(REACHED, "").trim());
}

describe("journey rail — filled means reached", () => {
  it("fills only the survey step for a fresh completion", () => {
    const message = buildJourneyMessage(journey(), {
      kind: "survey_completed",
      questionCount: 59,
    });
    expect(filledSteps(message.blocks)).toEqual(["Survey done"]);
    // The regression that shipped: the solid marker on everything NOT reached.
    expect(rail(message.blocks)).toContain(`${NOT_REACHED} Report opened`);
    expect(rail(message.blocks)).not.toContain(`${REACHED} Paid`);
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
    expect(rail(message.blocks)).toContain(`${NOT_REACHED} Paid`);
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
    expect(rail(message.blocks)).not.toContain(NOT_REACHED);
  });

  it("never uses the old inverted glyph pair", () => {
    const message = buildJourneyMessage(journey(), {
      kind: "survey_completed",
      questionCount: 59,
    });
    expect(JSON.stringify(message.blocks)).not.toContain(":black_circle:");
  });
});

describe("the two numbers the team scans for", () => {
  /**
   * How long it took and how many questions. Both belong in the HEADER, which is
   * the largest text Block Kit offers — larger than a bolded section, and a
   * header is plain_text so it cannot be bolded anyway.
   *
   * This is pinned because it silently drifted once already: the question count
   * ended up in the `context` block, Slack's smallest and greyest text, while the
   * duration was in the header AND repeated in that same context line — so the
   * more prominent of the two was the one that was duplicated.
   */
  const headerOf = (blocks: unknown[]) =>
    (blocks as Array<{ type: string; text?: { text?: string } }>).find((b) => b.type === "header")
      ?.text?.text ?? "";
  const contextOf = (blocks: unknown[]) =>
    (blocks as Array<{ type: string; elements?: Array<{ text?: string }> }>)
      .filter((b) => b.type === "context")
      .map((b) => (b.elements ?? []).map((e) => e.text ?? "").join(" "))
      .join(" ");

  it("puts the question count AND the duration in the header", () => {
    const message = buildJourneyMessage(journey({ timings: { durationMs: 612_000 } }), {
      kind: "survey_completed",
      questionCount: 59,
    });
    const head = headerOf(message.blocks);
    expect(head).toContain("59 questions");
    expect(head).toContain("10 min");
    // And neither is repeated in the small grey line below it.
    const ctx = contextOf(message.blocks);
    expect(ctx).not.toContain("59 questions");
    expect(ctx).not.toContain("10 min");
    // which still carries identity.
    expect(ctx).toContain("submission #");
  });

  it("drops only the duration when it was never recorded", () => {
    const message = buildJourneyMessage(journey({ timings: { durationMs: null } }), {
      kind: "survey_completed",
      questionCount: 59,
    });
    const head = headerOf(message.blocks);
    expect(head).toContain("59 questions");
    // No dangling separator where the time would have been.
    expect(head).not.toMatch(/·\s*$/);
    expect(head).not.toContain("· ·");
  });

  it("says question, not questions, for a single answer", () => {
    const message = buildJourneyMessage(journey(), {
      kind: "survey_completed",
      questionCount: 1,
    });
    expect(headerOf(message.blocks)).toContain("1 question ");
  });
});

describe("pricing arm — no longer shown", () => {
  /**
   * This block used to assert the pricing row spelled out which SIDE of the price
   * test a buyer was on ("dearer, base EUR 39.99 vs EUR 29.00"), derived from
   * PLAN_BUCKETS so a repricing could not make the label lie. The A/B price test
   * was concluded on 2026-08-31 by retiring the higher-priced arm, so there is no
   * side to be on: every reader sees one list. The row goes for the same reason
   * the paywall and survey-theme rows went — a permanent constant on every
   * message is noise, and presenting it as an experiment is worse than noise.
   */
  it("shows no pricing row, even for a purchase that carries an arm", () => {
    const message = buildJourneyMessage(
      journey({
        arms: { landing: "white", survey: "white", pricing: "A", paywall: null },
        money: { plan: "full_report", amount: 39.99, currency: "EUR" },
        milestones: { ...journey().milestones, purchasedAt: "2026-08-24T19:10:00.000Z" },
      }),
      { kind: "purchase", planLabel: "Just a snapshot", archetype: null, amountText: "EUR 39.99" }
    );
    const text = JSON.stringify(message.blocks);
    // The fixture DOES carry a pricing arm, so this asserts the axis list is what
    // excludes it, not an absent value.
    expect(text).not.toContain("Report pricing");
    expect(text).not.toContain("Pricing A");
    expect(text).not.toContain("dearer");
    expect(text).not.toContain("cheaper");
    // The amount paid is still there — that is the number the row existed to
    // contextualise, and it never came from the arm.
    expect(text).toContain("EUR 39.99");
  });
});

describe("journey rail — the glyphs themselves", () => {
  it("uses green for reached and red for not-yet, and never colour alone", () => {
    const message = buildJourneyMessage(
      journey({
        milestones: { ...journey().milestones, reportViewedAt: "2026-08-24T19:00:00.000Z" },
      }),
      { kind: "survey_completed", questionCount: 59 }
    );
    const drawn = rail(message.blocks);
    // The literals, so a silent recolour fails here rather than in Slack.
    expect(drawn).toContain(":large_green_circle: Survey done");
    expect(drawn).toContain(":red_circle: Paid");
    expect(drawn).not.toContain(":large_blue_circle:");
    expect(drawn).not.toContain(":white_circle:");
    // Green/red is the worst pair for a colourblind reader, so every step must
    // keep its text label — colour is never the only channel carrying meaning.
    for (const label of ["Survey done", "Report opened", "Paywall hit", "Checkout", "Paid"]) {
      expect(drawn).toContain(label);
    }
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

/**
 * Session-replay deep link (2026-08-27). Asserts the rendered URL, not the shape:
 * the failure that matters is a button that looks fine and opens the wrong page —
 * PostHog's recordings-list form with the id as a query parameter lands on a
 * filtered LIST rather than the recording, and reads as "the link is broken".
 */
describe("session-recording link", () => {
  // Without this adminLink() returns null anyway, so the "no admin button" tests
  // below would pass whether or not the code removed it. Stubbing a real site URL
  // is what makes them mean something.
  beforeEach(() => vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.loveiq.org"));
  afterEach(() => vi.unstubAllEnvs());

  const urls = (blocks: SlackBlock[]): string[] =>
    (JSON.parse(JSON.stringify(blocks)) as SlackBlock[])
      .flatMap((b) => (Array.isArray(b.elements) ? (b.elements as Array<{ url?: string }>) : []))
      .map((e) => e.url)
      .filter((u): u is string => typeof u === "string");

  const buttons = (blocks: SlackBlock[]) =>
    (JSON.parse(JSON.stringify(blocks)) as SlackBlock[]).filter((b) => b.type === "actions");

  it("links straight to the recording when a session id was captured", () => {
    const message = buildJourneyMessage(
      journey({ recordingSessionId: "01a04480-c0ad-7496-9e5a-7cf22106b1a9" }),
      { kind: "survey_completed", questionCount: 59 }
    );

    expect(urls(message.blocks)).toContain(
      "https://eu.posthog.com/project/244778/replay/01a04480-c0ad-7496-9e5a-7cf22106b1a9"
    );
    // The list-with-a-filter form, which does NOT open the recording.
    expect(JSON.stringify(message.blocks)).not.toContain("sessionRecordingId=");
  });

  it("is the ONLY button on a survey message — no admin link", () => {
    // Removed on request. At survey-completion time the "full journey" that button
    // promised does not exist yet: report-open, paywall, checkout and payment have
    // no rows, which is why the progress rail shows one green dot and four red. The
    // facts that DO exist are already in the message, so it was a click to a
    // restatement.
    const message = buildJourneyMessage(journey({ recordingSessionId: "sess_abc" }), {
      kind: "survey_completed",
      questionCount: 59,
    });

    const actionBlocks = buttons(message.blocks);
    expect(actionBlocks).toHaveLength(1);
    expect((actionBlocks[0]!.elements as unknown[]).length).toBe(1);
    expect(JSON.stringify(message.blocks)).not.toContain("/admin/");
    expect(JSON.stringify(message.blocks)).not.toContain("Open full journey");
  });

  it("carries no buttons at all on a survey message with no recording", () => {
    // Both buttons can legitimately be absent now, so the block must not be pushed
    // empty — an actions block with zero elements is rejected by Slack.
    const message = buildJourneyMessage(journey({ recordingSessionId: null }), {
      kind: "survey_completed",
      questionCount: 59,
    });

    expect(JSON.stringify(message.blocks)).not.toContain("posthog.com");
    expect(JSON.stringify(message.blocks)).not.toContain("session recording");
    expect(JSON.stringify(message.blocks)).not.toContain("/admin/");
    expect(buttons(message.blocks)).toHaveLength(0);
    // The message itself still stands on its own — the removal took a button, not
    // the content.
    expect(message.blocks.length).toBeGreaterThan(3);
  });

  /**
   * The PURCHASE message lost the admin link too. Asserted separately from the
   * survey case rather than folded into it: these are two different branches of
   * `buildJourneyMessage`, and the admin link lived outside the branch, so a partial
   * removal that left it on one message would otherwise pass.
   */
  it("is also the only button on a PURCHASE message", () => {
    const message = buildJourneyMessage(journey({ recordingSessionId: "sess_abc" }), {
      kind: "purchase",
      planLabel: "Full report",
      archetype: "Spiritual Lover",
      amountText: "EUR 39.99",
    });

    const actionBlocks = buttons(message.blocks);
    expect(actionBlocks).toHaveLength(1);
    expect((actionBlocks[0]!.elements as unknown[]).length).toBe(1);
    expect(urls(message.blocks)).toEqual(["https://eu.posthog.com/project/244778/replay/sess_abc"]);
    expect(JSON.stringify(message.blocks)).not.toContain("/admin/");
    expect(JSON.stringify(message.blocks)).not.toContain("Open full journey");
  });

  it("leaves a purchase message with no recording carrying no buttons either", () => {
    const message = buildJourneyMessage(journey({ recordingSessionId: null }), {
      kind: "purchase",
      planLabel: "Full report",
      archetype: "Spiritual Lover",
      amountText: "EUR 39.99",
    });
    expect(buttons(message.blocks)).toHaveLength(0);
    // The amount and plan are in the header, so the message still stands alone.
    expect(JSON.stringify(message.blocks)).toContain("EUR 39.99");
  });
});
