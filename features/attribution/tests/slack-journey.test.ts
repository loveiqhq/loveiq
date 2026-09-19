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
    country: null,
    countryTier: "tier_2",
    timings: {
      durationMs: 720_000,
      startedAt: "2026-08-24T18:27:00.000Z",
      completedAt: "2026-08-24T18:39:00.000Z",
      msToPurchase: null,
      msCheckoutHesitation: null,
      reportDwellMs: null,
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

describe("the compact incoming-survey layout", () => {
  /**
   * Marcus's layout, requested in #all-loveiq on 2026-09-11. Asserted as the
   * RENDERED STRING and in ORDER, because the point of the request was the shape
   * of the message, and a shape is exactly what a structural assertion misses.
   *
   * The previous layout put every label on its own line above its value and
   * reflowed into two ragged columns, because it used a Block Kit `fields` grid.
   * These tests exist so a well-meaning return to `fields` fails loudly.
   */
  const soleSection = (blocks: unknown[]) =>
    (blocks as Array<{ type: string; text?: { text?: string } }>).find((b) => b.type === "section")
      ?.text?.text ?? "";

  it("renders one section, with Marcus's lines in his order", () => {
    const message = buildJourneyMessage(
      journey({
        country: "United States",
        device: "iOS",
        arms: { landing: "white_prev", survey: null, pricing: null, paywall: null },
        timings: { durationMs: 1_080_000, reportDwellMs: 300_000 },
      }),
      { kind: "survey_completed", questionCount: 58 }
    );

    expect(soleSection(message.blocks).split("\n")).toEqual([
      "Survey submission *#1756* `a***@gmail.com`",
      "Survey time: *18 min*  |  Report time: *5 min*",
      "Came from: *Paid* — google / cpc",
      "Device: *iOS*",
      // The arm is retired as of 2026-09-19 — the landing test concluded in favour
      // of V2 — and a historical submission that came in on V1 should say so
      // rather than read as if the design were still being served.
      "Landing page design: *Landing Page V1* (First Design) _(retired arm)_",
      "Country (self-reported): *United States*",
      `${NOT_REACHED} Survey done  →  ${NOT_REACHED} Report opened  →  ${NOT_REACHED} Paywall hit  →  ${NOT_REACHED} Checkout  →  ${NOT_REACHED} Paid`,
    ]);
  });

  /**
   * The rail is the LAST line of the one section the compact layout renders, and
   * `clampBlock` truncates a section from the END at 2,900 characters. So any
   * unbounded value ABOVE the rail can push it off the message entirely — and the
   * old `fields` layout could not do this, because each field was clamped
   * independently at 2,000 and the rail was its own block.
   *
   * `country` is the one such value: it is the visitor's own answer to Q15001,
   * `user_profile.location_primary` is `text` with no length limit and no check
   * constraint, and `surveyAnswersSchema` accepts an array of 20 x 500 characters
   * for any key without a selection cap — 10,000 characters into the column.
   *
   * Asserted on the RAIL surviving rather than on a character count, because the
   * budget is the thing that may legitimately change.
   */
  it("keeps the progress rail even when the country answer is absurdly long", () => {
    const message = buildJourneyMessage(journey({ country: "a".repeat(10_000), device: "iOS" }), {
      kind: "survey_completed",
      questionCount: 58,
    });
    const section = soleSection(message.blocks);
    expect(section).toContain("Survey done");
    expect(section).toContain("Paid");
    // Still inside Slack's cap — the country is what gives, not the message.
    expect(section.length).toBeLessThanOrEqual(2900);
  });

  /**
   * An arm is a RAW string off `utm_tracker` that the survey route stores
   * verbatim when no arm cookie is present, so `constructor` and every other
   * `Object.prototype` member is attacker-reachable. `armLabel` used to hand back
   * that inherited member, whose `short` is `undefined`, and the bolding helper
   * called `.indexOf()` on it and threw.
   *
   * A notification builder must never throw: the survey route builds this inside
   * a fire-and-forget task (so the ping is lost outright, fallback included), and
   * the backfill cron wraps its whole loop in one try/catch, so one poisoned row
   * abandons every remaining submission in the run and re-poisons the next one.
   */
  it.each(["constructor", "__proto__", "toString", "valueOf"])(
    "does not throw on an arm named %s",
    (poisoned) => {
      const j = journey({
        arms: { landing: poisoned, survey: null, pricing: null, paywall: null },
      });
      expect(() =>
        buildJourneyMessage(j, { kind: "survey_completed", questionCount: 58 })
      ).not.toThrow();
      expect(() =>
        buildJourneyMessage(j, {
          kind: "purchase",
          planLabel: "Full report",
          archetype: null,
          amountText: "EUR 39.00",
        })
      ).not.toThrow();
      const section = soleSection(
        buildJourneyMessage(j, { kind: "survey_completed", questionCount: 58 }).blocks
      );
      expect(section).toContain("Landing page design: *Not recorded*");
      expect(section).not.toContain("undefined");
    }
  );

  /**
   * The guard is `typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0`, and
   * the absent-field test above only exercises the FIRST clause. These are the
   * other two: a journey whose dwell arrives as NaN, Infinity, zero or negative
   * must read as unrecorded, never as a confident "NaN min" or a "0s" that
   * asserts a visit nobody measured.
   */
  it.each([
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["zero", 0],
    ["negative", -60_000],
  ])("says nothing recorded rather than a number for %s", (_label, ms) => {
    const message = buildJourneyMessage(journey({ timings: { reportDwellMs: ms } }), {
      kind: "survey_completed",
      questionCount: 58,
    });
    expect(soleSection(message.blocks)).toContain("Report time: *—*");
    const rendered = JSON.stringify(message.blocks);
    expect(rendered).not.toContain("NaN");
    expect(rendered).not.toContain("Infinity");
    expect(rendered).not.toContain("Report time: *0");
  });

  /**
   * The Google Ads branch renders ~150 messages a month and had no test at all.
   *
   * Its qualifiers used to print Google's ValueTrack codes verbatim — "(x)",
   * "(p, g)" — in a message whose stated audience is a non-technical reader. Over
   * 30 days the channel got "x" 146 times, "p" 70 and "e" 41.
   */
  describe("Google Ads detail", () => {
    const ads = (over: Record<string, unknown>) =>
      journey({
        traffic: {
          bucket: "Paid",
          source: "google",
          medium: "cpc",
          campaign: "performance_max",
          isGoogleAds: true,
          keyword: null,
          matchType: null,
          network: null,
          ...over,
        } as SubmissionJourney["traffic"],
      });

    const cameFrom = (j: SubmissionJourney) =>
      soleSection(buildJourneyMessage(j, { kind: "survey_completed", questionCount: 58 }).blocks)
        .split("\n")
        .find((l) => l.startsWith("Came from:")) ?? "";

    it.each([
      ["x", "cross-network"],
      ["g", "Google search"],
      ["s", "search partner"],
      ["d", "Display"],
      ["ytv", "YouTube"],
      ["vp", "video partner"],
    ])("says %s in words: %s", (code, words) => {
      expect(cameFrom(ads({ network: code }))).toBe(
        `Came from: *Google Ads* — performance_max (${words})`
      );
    });

    it.each([
      ["e", "exact match"],
      ["p", "phrase match"],
      ["b", "broad match"],
    ])("says match type %s in words: %s", (code, words) => {
      expect(cameFrom(ads({ matchType: code }))).toBe(
        `Came from: *Google Ads* — performance_max (${words})`
      );
    });

    it("keeps the keyword and both qualifiers together, in order", () => {
      expect(cameFrom(ads({ keyword: "couples therapy", matchType: "p", network: "g" }))).toBe(
        'Came from: *Google Ads* — performance_max / "couples therapy" (phrase match, Google search)'
      );
    });

    /**
     * A code we do not recognise falls through to itself rather than to a guess —
     * and is still escaped, because these arrive as URL parameters and are fully
     * attacker-controlled.
     */
    it("passes an unknown code through, escaped", () => {
      expect(cameFrom(ads({ network: "<b>zz</b>" }))).toContain("(&lt;b&gt;zz&lt;/b&gt;)");
    });

    it("names the gap when auto-tagging sent no campaign", () => {
      expect(cameFrom(ads({ campaign: null }))).toBe(
        "Came from: *Google Ads* — campaign not tagged (auto-tagging sends only the click id)"
      );
    });
  });

  it("carries the masked email beside the submission number", () => {
    const message = buildJourneyMessage(journey({ emailMasked: "c***@gmail.com" }), {
      kind: "survey_completed",
      questionCount: 59,
    });
    // A code span, as Marcus wrote it. Inside backticks the three asterisks of
    // the mask are literal, so nothing needs escaping and nothing can be re-read
    // as emphasis beside the bold submission number.
    expect(soleSection(message.blocks).split("\n")[0]).toBe(
      "Survey submission *#1756* `c***@gmail.com`"
    );
  });

  it("closes the code span even if the address carries a backtick", () => {
    const message = buildJourneyMessage(journey({ emailMasked: "`x***@`evil.com" }), {
      kind: "survey_completed",
      questionCount: 59,
    });
    // The mask keeps the address's own first character and its whole domain, so
    // the one character that could close the span early is caller-supplied.
    const title = soleSection(message.blocks).split("\n")[0];
    expect(title).toBe("Survey submission *#1756* `x***@evil.com`");
    expect(title.split("`").length - 1).toBe(2);
  });

  /**
   * Through `codeSpan`, not a hand-rolled span.
   *
   * Stripping backticks is only half of it — the helper also escapes `&`, `<` and
   * `>`, which still matter inside a span (see its own comment). A hand-rolled
   * version rendered `a***@x<y&z.com` raw here while the purchase branch of this
   * same builder, twenty lines below, escaped it — two renderings of one value in
   * one file. The survey form cannot produce these, but the admin submission
   * PATCH validates with a regex that accepts all of them and writes straight to
   * `app_user.email`.
   */
  it("escapes the HTML trio in the address, as the purchase branch does", () => {
    const line0 = (j: string) =>
      soleSection(
        buildJourneyMessage(journey({ emailMasked: j }), {
          kind: "survey_completed",
          questionCount: 59,
        }).blocks
      ).split("\n")[0];
    expect(line0("a***@x<y&z.com")).toBe("Survey submission *#1756* `a***@x&lt;y&amp;z.com`");
    expect(line0("a***@x>y.com")).toBe("Survey submission *#1756* `a***@x&gt;y.com`");
    // unchanged for an ordinary address
    expect(line0("a***@gmail.com")).toBe("Survey submission *#1756* `a***@gmail.com`");
  });

  it("leaves no dangling separator when the submission has no email", () => {
    const message = buildJourneyMessage(journey({ emailMasked: null }), {
      kind: "survey_completed",
      questionCount: 59,
    });
    expect(soleSection(message.blocks).split("\n")[0]).toBe("Survey submission *#1756*");
  });

  it("never renders a header or a fields grid on the survey message", () => {
    const message = buildJourneyMessage(journey(), {
      kind: "survey_completed",
      questionCount: 58,
    });
    const types = (message.blocks as Array<{ type: string }>).map((b) => b.type);
    expect(types).not.toContain("header");
    expect(types).not.toContain("context");
    expect(JSON.stringify(message.blocks)).not.toContain("Experiments they were in");
  });

  /**
   * Both time columns always render, even unknown, so the line keeps one shape
   * down the channel. At post time the report has not been opened yet, so an em
   * dash on the right is the NORMAL first state of every message.
   */
  it("keeps both time columns, with an em dash for whichever is unrecorded", () => {
    const message = buildJourneyMessage(
      journey({ timings: { durationMs: null, reportDwellMs: null } }),
      { kind: "survey_completed", questionCount: 58 }
    );
    expect(soleSection(message.blocks)).toContain("Survey time: *—*  |  Report time: *—*");
  });

  /**
   * A MEASURED duration, rendered by the same `formatDuration` as the survey
   * time beside it — no plus sign, because it is no longer a bucket.
   *
   * The old behaviour is the bug this replaced: three milestone events at
   * 1/5/10 minutes meant 79% of live messages read "1+ min" whatever the reader
   * did, so a nine-minute read and a seventy-second one were indistinguishable
   * in the channel. 566_000 is the real submission (#2113) that was reported.
   */
  it.each([
    [45_000, "45s"],
    [60_000, "1 min"],
    [300_000, "5 min"],
    [566_000, "9 min"],
    [600_000, "10 min"],
    [4_260_000, "1h 11m"],
  ])("renders a measured dwell of %ims as %s", (ms, expected) => {
    const message = buildJourneyMessage(journey({ timings: { reportDwellMs: ms } }), {
      kind: "survey_completed",
      questionCount: 58,
    });
    expect(soleSection(message.blocks)).toContain(`Report time: *${expected}*`);
  });

  /**
   * Regression guard for the defect these very tests caught during development:
   * a journey assembled without the new field arrives as `undefined`, and
   * arithmetic on it is NaN — which rendered a confident
   * "Report time: *NaN+ min*" in front of the whole team rather than failing.
   */
  it("says nothing recorded rather than NaN when the field is absent entirely", () => {
    const stripped = journey();
    // @ts-expect-error — deliberately modelling a journey built before this field existed.
    delete stripped.timings.reportDwellMs;
    const message = buildJourneyMessage(stripped, {
      kind: "survey_completed",
      questionCount: 58,
    });
    expect(soleSection(message.blocks)).toContain("Report time: *—*");
    expect(JSON.stringify(message.blocks)).not.toContain("NaN");
  });

  /**
   * The name and the question count are gone from the message by request — the
   * mock shows them as an absence and promotes the submission number in their
   * place. The count survives where it still earns its place: the notification
   * text nobody reads in-channel.
   *
   * The masked email was dropped with them and then asked back
   * (#incoming-surveys, 15 Sep), so it is asserted PRESENT here. The negative
   * assertion this replaced was NOT stale: the address renders literally inside
   * the code span, so `not.toContain("a***@gmail.com")` went red the moment the
   * title carried it — it was a live guard doing its job, and it is replaced
   * because the behaviour changed, not because it had stopped working.
   */
  it("drops name and question count from the message but keeps the count in the text", () => {
    const message = buildJourneyMessage(journey(), {
      kind: "survey_completed",
      questionCount: 58,
    });
    const rendered = JSON.stringify(message.blocks);
    expect(rendered).not.toContain("Kitten");
    expect(rendered).not.toContain("58 question");
    expect(message.text).toContain("58 questions");
    expect(soleSection(message.blocks).split("\n")[0]).toContain("`a***@gmail.com`");
  });

  it("says question, not questions, for a single answer", () => {
    const message = buildJourneyMessage(journey(), {
      kind: "survey_completed",
      questionCount: 1,
    });
    expect(message.text).toContain("1 question");
    expect(message.text).not.toContain("1 questions");
  });

  /**
   * Only the incoming-survey hook was asked to be compacted. The purchase ping
   * is a different job and keeps its fields layout; this fails if someone
   * compacts it as a side effect.
   */
  it("leaves the purchase message on its header + fields layout", () => {
    const message = buildJourneyMessage(journey({ country: "Germany" }), {
      kind: "purchase",
      planLabel: "Full report",
      archetype: "Tender Devotee",
      amountText: "EUR 29.00",
    });
    const types = (message.blocks as Array<{ type: string }>).map((b) => b.type);
    expect(types).toContain("header");
    expect(types).toContain("context");
    /**
     * No "Experiments they were in" section, because there is no experiment.
     * The landing axis concluded 2026-09-19 and was the last one randomised, so
     * this heading would sit over a `section` with `fields: []` — which Slack
     * rejects outright, failing the whole message rather than the block.
     */
    expect(JSON.stringify(message.blocks)).not.toContain("Experiments they were in");
    // And no dwell line leaked across.
    expect(JSON.stringify(message.blocks)).not.toContain("Report time");
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
  /**
   * Both of these now assert against the PURCHASE message. The survey message no
   * longer renders a name or an email at all, so the escaping they guard has
   * moved rather than stopped mattering.
   *
   * A NAME IS ESCAPED FOR LINKS, NOT FOR EMPHASIS. Slack has no escape for `*`,
   * and the backslash form this used to assert did not produce one: Slack read
   * `*Ki\*tt\*en*` as bold "Ki\" and then loose text — the same break as the raw
   * string, with a visible backslash added to every ordinary name that happened
   * to contain an underscore. What IS defusable is the dangerous form, and that
   * is what this pins.
   */
  it("defuses a link injection in a name, and adds no backslash to an ordinary one", () => {
    const attack = buildJourneyMessage(journey({ firstName: "<https://evil.example|Support>" }), {
      kind: "purchase",
      planLabel: "Full report",
      archetype: null,
      amountText: "EUR 29.00",
    });
    const attackText = JSON.stringify(attack.blocks);
    expect(attackText).toContain("&lt;https://evil.example|Support&gt;");
    expect(attackText).not.toContain("<https://evil.example");

    const ordinary = buildJourneyMessage(journey({ firstName: "Jean_Luc" }), {
      kind: "purchase",
      planLabel: "Full report",
      archetype: null,
      amountText: "EUR 29.00",
    });
    expect(JSON.stringify(ordinary.blocks)).toContain("Jean_Luc");
  });

  it("puts the masked email in a code span, not through the markup escaper", () => {
    // escapeSlack(maskEmail(...)) renders literal backslashes in Slack mrkdwn —
    // "e\\*\\*\\*@example.com" — so the mask has to travel as code.
    const message = buildJourneyMessage(journey(), {
      kind: "purchase",
      planLabel: "Full report",
      archetype: null,
      amountText: "EUR 29.00",
    });
    const text = JSON.stringify(message.blocks);
    expect(text).toContain("`a***@gmail.com`");
    expect(text).not.toContain("a\\\\*\\\\*\\\\*@gmail.com");
  });

  /**
   * utm values are fully attacker-controlled — they arrive on the landing URL —
   * and the compact layout interpolates the traffic detail straight into a line
   * it also bolds.
   *
   * The link form is the one that can do harm in an internal channel, and the
   * old backslash escaping left it completely live: `\<https://…|…\>` is still a
   * Slack link. The underscore case is the one that was hurting every day —
   * "performance_max" went out as "performance\_max" 146 times in 30 days.
   */
  it("defuses a link in a campaign name, and leaves an ordinary one alone", () => {
    const render = (campaign: string) =>
      JSON.stringify(
        buildJourneyMessage(
          journey({ traffic: { bucket: "Paid", source: "google", medium: "cpc", campaign } }),
          { kind: "survey_completed", questionCount: 59 }
        ).blocks
      );

    expect(render("<https://evil.example|Click here>")).toContain(
      "&lt;https://evil.example|Click here&gt;"
    );
    expect(render("<https://evil.example|Click here>")).not.toContain("<https://");
    expect(render("performance_max")).toContain("performance_max");
    expect(render("performance_max")).not.toContain("performance\\\\_max");
  });

  /**
   * Building a notification must never throw.
   *
   * `classifyTraffic` assigns a bucket on every branch, so this is unreachable
   * from real data — but it was reachable from a test fixture, and the failure
   * mode was not cosmetic: the survey route builds this message inside a
   * fire-and-forget task, and the backfill cron wraps the whole run in one
   * try/catch, so a single malformed journey turned into a 500 that abandoned
   * every remaining submission.
   */
  it("renders rather than throwing when the traffic bucket is missing", () => {
    const broken = journey();
    // @ts-expect-error — deliberately modelling a journey assembled incorrectly.
    broken.traffic = { source: null, medium: null, campaign: null };
    expect(() =>
      buildJourneyMessage(broken, { kind: "survey_completed", questionCount: 59 })
    ).not.toThrow();
    const message = buildJourneyMessage(broken, {
      kind: "survey_completed",
      questionCount: 59,
    });
    expect(JSON.stringify(message.blocks)).toContain("Came from: *Not recorded*");
    expect(JSON.stringify(message.blocks)).not.toContain("undefined");
  });

  /**
   * The PURCHASE branch renders the same traffic through the flat `trafficLine`,
   * which kept the old unguarded shape and rendered a literal "undefined". Two
   * branches of one builder must not disagree about what a malformed journey
   * looks like.
   */
  it("renders the same fallback on the purchase message, not a literal undefined", () => {
    const broken = journey();
    // @ts-expect-error — deliberately modelling a journey assembled incorrectly.
    broken.traffic = { source: "google", medium: "cpc", campaign: null };
    const message = buildJourneyMessage(broken, {
      kind: "purchase",
      planLabel: "Full report",
      archetype: null,
      amountText: "EUR 39.00",
    });
    expect(JSON.stringify(message.blocks)).toContain("Not recorded \u2014 google / cpc");
    expect(JSON.stringify(message.blocks)).not.toContain("undefined");
  });

  /**
   * Restored coverage. The compact survey message renders no name, and rendered
   * no email either until Marcus asked for one back onto the title line — but
   * both fallbacks are still live on the purchase path, where a journey with no
   * `app_user` row must read as "anonymous" rather than as an empty bold run.
   */
  it("still names the nameless on a purchase — anonymous, and no email", () => {
    const message = buildJourneyMessage(journey({ firstName: null, emailMasked: null }), {
      kind: "purchase",
      planLabel: "Full report",
      archetype: null,
      amountText: "EUR 39.00",
    });
    const rendered = JSON.stringify(message.blocks);
    expect(rendered).toContain("anonymous");
    expect(rendered).toContain("no email");
    expect(message.text).toContain("anonymous");
    expect(rendered).not.toContain("**");
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
          reportDwellMs: null,
        },
        traffic: { bucket: "Direct", source: null, medium: null, campaign: null },
      }),
      { kind: "survey_completed", questionCount: 0 }
    );
    expect(message.blocks.length).toBeGreaterThan(0);
    // Every optional row is gone, but the message is still a message: it names
    // the submission, keeps both time columns and still carries the rail.
    const rendered = JSON.stringify(message.blocks);
    expect(rendered).toContain("Survey submission *#1756*");
    expect(rendered).toContain("Came from: *Direct*");
    expect(rendered).toContain("Survey time: *—*  |  Report time: *—*");
    expect(rendered).toContain("Survey done");
    // No empty label left behind by a dropped value.
    expect(rendered).not.toContain("Device:");
    expect(rendered).not.toContain("Country (self-reported):");
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
    // the content. The compact layout is a single section, so this is now a
    // content assertion rather than a block count.
    expect(message.blocks).toHaveLength(1);
    expect(JSON.stringify(message.blocks)).toContain("Survey submission *#1756*");
    expect(rail(message.blocks)).toContain("Survey done");
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
