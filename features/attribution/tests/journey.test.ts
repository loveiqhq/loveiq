import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSupabaseFetch = vi.fn();

vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (...args: Parameters<typeof mockSupabaseFetch>) => mockSupabaseFetch(...args),
}));

import { buildSubmissionJourney } from "@features/attribution/server/journey";

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

const SUBMISSION = {
  id: 1296,
  session_id: "sess-1",
  start_date_time: "2026-08-24T10:00:00.000Z",
  created_date_time: "2026-08-24T10:12:00.000Z",
  status: "completed",
  duration_ms: 720_000,
  utm_tracker: JSON.stringify({
    utm_source: "google",
    utm_medium: "cpc",
    utm_campaign: "spring",
    // must never be echoed anywhere — invite links base64 the referrer's email here
    utm_content: "cmVmZXJyZXJAZXhhbXBsZS5jb20=",
    landing_variant: "white_prev",
    survey_variant: "dark",
  }),
  app_user: { email: "eman@example.com", first_name: "Eman" },
};

const QUOTE_PURCHASED = {
  plan: "core",
  experiment_group: "B",
  base_price_bucket: "B",
  forced_paywall_arm: "treatment",
  device_type: "iOS",
  country_tier: "tier_2",
  current_price: 39,
  currency: "eur",
  purchased_at: "2026-08-24T10:30:00.000Z",
  checkout_started_at: "2026-08-24T10:28:00.000Z",
};

/** Route each PostgREST path to its fixture. */
function route(handlers: {
  sub?: unknown;
  quotes?: unknown;
  events?: unknown;
  reportSessions?: unknown;
}) {
  mockSupabaseFetch.mockImplementation(async (path: string) => {
    if (path.includes("/survey_submission?")) return ok(handlers.sub ?? [SUBMISSION]);
    if (path.includes("/report_price_quote?")) return ok(handlers.quotes ?? []);
    if (path.includes("/analytics_event?")) return ok(handlers.events ?? []);
    if (path.includes("/report_session?")) return ok(handlers.reportSessions ?? []);
    throw new Error(`unexpected path: ${path}`);
  });
}

describe("buildSubmissionJourney", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns null when the submission does not exist", async () => {
    route({ sub: [] });
    expect(await buildSubmissionJourney(999)).toBeNull();
  });

  it("reads all four arms, preserving white_prev", async () => {
    route({ quotes: [QUOTE_PURCHASED] });
    const j = await buildSubmissionJourney(1296);
    expect(j?.arms).toEqual({
      landing: "white_prev",
      survey: "dark",
      pricing: "B",
      paywall: "treatment",
    });
  });

  it("fetches its four sources concurrently, not sequentially", async () => {
    route({ quotes: [QUOTE_PURCHASED] });
    await buildSubmissionJourney(1296);
    // One call per source, issued in one Promise.all wave. report_session is
    // the fourth — the server-side proof that the report was opened.
    expect(mockSupabaseFetch).toHaveBeenCalledTimes(4);
  });

  it("masks the email and never exposes the raw address", async () => {
    route({ quotes: [QUOTE_PURCHASED] });
    const j = await buildSubmissionJourney(1296);
    expect(j?.emailMasked).toBe("e***@example.com");
    expect(JSON.stringify(j)).not.toContain("eman@example.com");
  });

  it("PRIVACY: carries no answer content, no scoring detail, and no utm_content", async () => {
    // The Article 9 boundary. This journey is bound for Slack; it must describe
    // behaviour, never what the person said about their sex life. utm_content is
    // excluded separately because invite links base64 a referrer's email into it.
    route({ quotes: [QUOTE_PURCHASED] });
    const serialized = JSON.stringify(await buildSubmissionJourney(1296));
    expect(serialized).not.toContain("cmVmZXJyZXJAZXhhbXBsZS5jb20=");
    expect(serialized).not.toContain("utm_content");
    for (const forbidden of ["answer", "percentages", "raw_scores", "archetype", "scoring"]) {
      expect(serialized.toLowerCase()).not.toContain(forbidden);
    }
  });

  it("reports money and derived timings for a purchase", async () => {
    route({ quotes: [QUOTE_PURCHASED] });
    const j = await buildSubmissionJourney(1296);
    expect(j?.money).toEqual({ plan: "core", amount: 39, currency: "EUR" });
    expect(j?.timings.msToPurchase).toBe(18 * 60_000); // 10:12 → 10:30
    expect(j?.timings.msCheckoutHesitation).toBe(2 * 60_000); // 10:28 → 10:30
    expect(j?.timings.durationMs).toBe(720_000);
  });

  it("reports no money when nothing was purchased, but still reports the arms", async () => {
    const unpurchased = { ...QUOTE_PURCHASED, purchased_at: null, checkout_started_at: null };
    route({ quotes: [unpurchased] });
    const j = await buildSubmissionJourney(1296);
    expect(j?.money).toBeNull();
    expect(j?.timings.msToPurchase).toBeNull();
    expect(j?.arms.pricing).toBe("B");
  });

  it("falls back to base_price_bucket for a legacy quote with no experiment_group", async () => {
    route({ quotes: [{ ...QUOTE_PURCHASED, experiment_group: null, base_price_bucket: "C" }] });
    expect((await buildSubmissionJourney(1296))?.arms.pricing).toBe("C");
  });

  it("prefers the purchased quote when several plans were quoted", async () => {
    route({
      quotes: [
        { ...QUOTE_PURCHASED, plan: "full_report", current_price: 29, purchased_at: null },
        { ...QUOTE_PURCHASED, plan: "all_reports", current_price: 49 },
      ],
    });
    const j = await buildSubmissionJourney(1296);
    expect(j?.money?.plan).toBe("all_reports");
    expect(j?.quoteCount).toBe(2);
  });

  it("classifies traffic from the stored tracker", async () => {
    route({ quotes: [QUOTE_PURCHASED] });
    const j = await buildSubmissionJourney(1296);
    expect(j?.traffic).toEqual({
      bucket: "Paid",
      source: "google",
      medium: "cpc",
      campaign: "spring",
      isGoogleAds: false,
      keyword: null,
      matchType: null,
      network: null,
    });
  });

  it("surfaces consent-gated milestones when present", async () => {
    route({
      quotes: [QUOTE_PURCHASED],
      events: [
        { event_type: "report_viewed", event_time: "2026-08-24T10:15:00.000Z" },
        { event_type: "paywall_initiated", event_time: "2026-08-24T10:20:00.000Z" },
        { event_type: "report_viewed", event_time: "2026-08-24T10:40:00.000Z" },
      ],
    });
    const j = await buildSubmissionJourney(1296);
    // first occurrence wins
    expect(j?.milestones.reportViewedAt).toBe("2026-08-24T10:15:00.000Z");
    expect(j?.milestones.paywallInitiatedAt).toBe("2026-08-24T10:20:00.000Z");
  });

  /**
   * `report_viewed` in analytics_event is consent-gated and missed 45% of real
   * opens on production (104 of 189 over 2026-08-25 → 09-05), so a reader who
   * declined analytics looked like they never opened their report and every
   * timing derived from it came back blank. `report_session` is written by the
   * report route itself and cannot be suppressed.
   */
  describe("report-open milestone", () => {
    it("uses report_session when the consent-gated event never fired", async () => {
      route({
        quotes: [QUOTE_PURCHASED],
        events: [{ event_type: "paywall_initiated", event_time: "2026-08-24T10:20:00.000Z" }],
        reportSessions: [{ started_at: "2026-08-24T10:14:00.000Z" }],
      });
      const j = await buildSubmissionJourney(1296);
      expect(j?.milestones.reportViewedAt).toBe("2026-08-24T10:14:00.000Z");
    });

    it("takes whichever source saw the open first", async () => {
      route({
        quotes: [QUOTE_PURCHASED],
        events: [{ event_type: "report_viewed", event_time: "2026-08-24T10:15:00.000Z" }],
        reportSessions: [{ started_at: "2026-08-24T10:14:00.000Z" }],
      });
      const j = await buildSubmissionJourney(1296);
      expect(j?.milestones.reportViewedAt).toBe("2026-08-24T10:14:00.000Z");
    });

    it("keeps the consent-gated event as a fallback for rows predating report_session", async () => {
      route({
        quotes: [QUOTE_PURCHASED],
        events: [{ event_type: "report_viewed", event_time: "2026-08-24T10:15:00.000Z" }],
        reportSessions: [],
      });
      const j = await buildSubmissionJourney(1296);
      expect(j?.milestones.reportViewedAt).toBe("2026-08-24T10:15:00.000Z");
    });

    it("is null only when neither source saw an open", async () => {
      route({ quotes: [QUOTE_PURCHASED], events: [], reportSessions: [] });
      const j = await buildSubmissionJourney(1296);
      expect(j?.milestones.reportViewedAt).toBeNull();
    });
  });

  it("still returns a journey when a source fails, rather than throwing", async () => {
    // A slow or broken table must not stop the Slack notification going out.
    mockSupabaseFetch.mockImplementation(async (path: string) => {
      if (path.includes("/survey_submission?")) return ok([SUBMISSION]);
      if (path.includes("/report_price_quote?")) return { ok: false, status: 500 } as Response;
      throw new Error("analytics exploded");
    });
    const j = await buildSubmissionJourney(1296);
    expect(j?.arms.landing).toBe("white_prev"); // from the submission, still there
    expect(j?.arms.pricing).toBeNull(); // quote source degraded to absent
    expect(j?.money).toBeNull();
    expect(j?.milestones.reportViewedAt).toBeNull();
  });

  it("never reports a negative interval from clock skew", async () => {
    route({
      quotes: [{ ...QUOTE_PURCHASED, purchased_at: "2026-08-24T09:00:00.000Z" }],
    });
    // purchase timestamped BEFORE completion — report nothing, not "-72 min"
    expect((await buildSubmissionJourney(1296))?.timings.msToPurchase).toBeNull();
  });

  /**
   * The dwell is MEASURED from the reader's own event stream, anchored on the
   * report open — not read off the furthest milestone crossed, which is what
   * made 79% of live Slack messages say "1+ min" whatever the reader did.
   *
   * Rows arrive deliberately out of order in the first test: the query asks for
   * newest-first so that PostgREST's 1,000-row cap truncates the OLDEST end
   * rather than the tail, and this is the only place the headline number is
   * computed — everything downstream mocks it.
   */
  describe("measured report dwell", () => {
    const at = (t: string) => `2026-08-24T${t}.000Z`;

    it("spans the open to the last thing they did, whatever order the rows arrive in", async () => {
      route({
        events: [
          { event_type: "scroll_depth_75", event_time: at("10:25:00") },
          { event_type: "report_viewed", event_time: at("10:20:00") },
          { event_type: "paywall_dismissed", event_time: at("10:29:26") },
          { event_type: "report_engagement_1min", event_time: at("10:21:00") },
        ],
      });
      // 10:20:00 → 10:29:26 — the shape of submission #2113, which read "1+ min"
      expect((await buildSubmissionJourney(1296))?.timings.reportDwellMs).toBe(566_000);
    });

    it("counts a quiet reader by their heartbeats alone", async () => {
      // No scrolls, no clicks: the 1/5/10-minute milestones are the only
      // evidence that time passed, which is why they stay in the stream.
      route({
        events: [
          { event_type: "report_viewed", event_time: at("10:20:00") },
          { event_type: "report_engagement_1min", event_time: at("10:21:00") },
          { event_type: "report_engagement_5min", event_time: at("10:25:00") },
          { event_type: "report_engagement_10min", event_time: at("10:30:00") },
        ],
      });
      expect((await buildSubmissionJourney(1296))?.timings.reportDwellMs).toBe(600_000);
    });

    it("anchors on report_session when consent withheld report_viewed", async () => {
      // The server-side open is not consent-gated; the events are. A reader who
      // granted consent late still gets measured from the real open.
      route({
        reportSessions: [{ started_at: at("10:20:00") }],
        events: [{ event_type: "scroll_depth_50", event_time: at("10:23:00") }],
      });
      expect((await buildSubmissionJourney(1296))?.timings.reportDwellMs).toBe(180_000);
    });

    it("is null when only the open was recorded, never zero", async () => {
      route({ events: [{ event_type: "report_viewed", event_time: at("10:20:00") }] });
      const j = await buildSubmissionJourney(1296);
      // One timestamp proves they opened it and says nothing about how long they
      // stayed. These events are consent-gated, so a reader who declined
      // analytics must not be rendered as a zero-second visit.
      expect(j?.timings.reportDwellMs).toBeNull();
      // and the widened query must not have disturbed the milestones it shares with
      expect(j?.milestones.reportViewedAt).toBe(at("10:20:00"));
    });

    it("is null when nothing recorded the open at all", async () => {
      route({ events: [{ event_type: "rage_click", event_time: at("10:21:00") }] });
      expect((await buildSubmissionJourney(1296))?.timings.reportDwellMs).toBeNull();
    });

    /**
     * A milestone carries a DURATION, not a timestamp: a `report_engagement_1min`
     * row asserts sixty seconds of ACTIVE time, which is not sixty seconds of
     * wall clock. This is submission #2108 — opened 10:21:47, two events by
     * 10:21:49, then the one-minute milestone 49 minutes later because the tab
     * sat in the background and the timer only counts visible seconds.
     *
     * Measuring the span alone calls that a two-second visit and prints an em
     * dash, which is strictly WORSE than the "1+ min" it replaced. Taking the
     * larger of the two is what makes the new line unable to print less than the
     * old one did.
     */
    it("credits a backgrounded tab with the minute its milestone proves", async () => {
      route({
        events: [
          { event_type: "report_viewed", event_time: at("10:21:47") },
          { event_type: "locked_card_price_shown", event_time: at("10:21:49") },
          { event_type: "report_engagement_1min", event_time: at("11:10:42") },
        ],
      });
      expect((await buildSubmissionJourney(1296))?.timings.reportDwellMs).toBe(60_000);
    });

    it("still counts a milestone when the open itself was never recorded", async () => {
      route({ events: [{ event_type: "report_engagement_5min", event_time: at("10:25:00") }] });
      expect((await buildSubmissionJourney(1296))?.timings.reportDwellMs).toBe(300_000);
    });

    /**
     * The load burst is not a visit. Submission #2112's entire stream: the report
     * opened at 15:26:04.6 and two events landed by 15:26:06.2, then silence.
     * Printing "2s" reads in the channel as "bounced instantly" when all it says
     * is that the page loaded.
     */
    it("says nothing recorded rather than a two-second visit for the load burst", async () => {
      route({
        reportSessions: [{ started_at: "2026-08-24T10:20:04.600Z" }],
        events: [
          { event_type: "locked_card_price_shown", event_time: "2026-08-24T10:20:06.000Z" },
          { event_type: "report_viewed", event_time: "2026-08-24T10:20:06.200Z" },
        ],
      });
      expect((await buildSubmissionJourney(1296))?.timings.reportDwellMs).toBeNull();
    });

    it("sums two sittings instead of billing the gap between them", async () => {
      route({
        events: [
          { event_type: "report_viewed", event_time: at("10:00:00") },
          { event_type: "scroll_depth_50", event_time: at("10:05:00") },
          // came back after lunch — 2h later, a second sitting, not 2h05 of reading
          { event_type: "report_viewed", event_time: at("12:05:00") },
          { event_type: "scroll_depth_100", event_time: at("12:08:00") },
        ],
      });
      expect((await buildSubmissionJourney(1296))?.timings.reportDwellMs).toBe(480_000);
    });

    it("ignores anything stamped before the report opened", async () => {
      route({
        events: [
          // clock skew or a stray pre-report row would otherwise start the first
          // sitting in the past and inflate everything after it
          { event_type: "rage_click", event_time: at("09:00:00") },
          { event_type: "report_viewed", event_time: at("10:20:00") },
          { event_type: "scroll_depth_25", event_time: at("10:22:00") },
        ],
      });
      expect((await buildSubmissionJourney(1296))?.timings.reportDwellMs).toBe(120_000);
    });

    /**
     * `report_session.ended_at` is the only record of the moment the reader
     * actually LEFT. Everything else is the last thing they happened to click,
     * so without this a reader who spends four quiet minutes on the final
     * chapter is credited up to their last scroll and no further.
     */
    it("counts the quiet minutes between the last click and the close", async () => {
      route({
        reportSessions: [{ started_at: at("10:20:00"), ended_at: at("10:34:00") }],
        events: [
          { event_type: "report_viewed", event_time: at("10:20:00") },
          { event_type: "scroll_depth_100", event_time: at("10:30:00") },
        ],
      });
      // 14 min, not the 10 the last scroll would have claimed.
      expect((await buildSubmissionJourney(1296))?.timings.reportDwellMs).toBe(840_000);
    });

    /**
     * The session boundaries are written server-side and are NOT consent-gated,
     * unlike every `analytics_event` row. A reader who declined analytics used
     * to be an em dash forever; now they are measured.
     */
    it("measures a reader who declined analytics entirely", async () => {
      route({
        reportSessions: [{ started_at: at("10:20:00"), ended_at: at("10:27:30") }],
        events: [],
      });
      expect((await buildSubmissionJourney(1296))?.timings.reportDwellMs).toBe(450_000);
    });

    it("sums two visits from their sessions without billing the gap", async () => {
      route({
        reportSessions: [
          { started_at: at("10:00:00"), ended_at: at("10:06:00") },
          { started_at: at("14:00:00"), ended_at: at("14:04:00") },
        ],
        events: [],
      });
      expect((await buildSubmissionJourney(1296))?.timings.reportDwellMs).toBe(600_000);
    });

    it("still reports nothing when a session was opened and never closed", async () => {
      // The beacon can be lost — a killed tab, a crashed browser, a blocked
      // request — and an unclosed session must not become a zero-second visit.
      route({ reportSessions: [{ started_at: at("10:20:00"), ended_at: null }], events: [] });
      expect((await buildSubmissionJourney(1296))?.timings.reportDwellMs).toBeNull();
    });

    it("asks for every session and its close, not just the first open", async () => {
      route({ events: [] });
      await buildSubmissionJourney(1296);
      const sessionQuery = mockSupabaseFetch.mock.calls
        .map((c) => String(c[0]))
        .find((p: string) => p.includes("/report_session?"));
      expect(sessionQuery).toContain("ended_at");
      // `limit=1` would keep the anchor and throw away every close but the
      // first reader's — the value this whole feature exists to record.
      expect(sessionQuery).not.toContain("limit=1&");
      expect(sessionQuery).toContain("limit=50");
    });

    it("asks the database for the newest rows, so a cap cannot eat the tail", async () => {
      route({ events: [] });
      await buildSubmissionJourney(1296);
      const eventQuery = mockSupabaseFetch.mock.calls
        .map((c) => String(c[0]))
        .find((p: string) => p.includes("/analytics_event?"));
      // Ascending would truncate the LAST rows at PostgREST's 1,000-row cap —
      // and the last rows are the entire measurement.
      expect(eventQuery).toContain("order=event_time.desc");
      expect(eventQuery).toContain("limit=500");
      // the wizard fires before the report exists; nothing it writes can count
      expect(eventQuery).toContain("entity_type=neq.survey");
    });
  });

  /**
   * `location_primary` is the visitor's own answer to Q15001: the column is
   * `text` with no length limit and no check constraint, and the answers schema
   * accepts an array of 20 x 500 characters for any key without a selection cap.
   * It is interpolated into a Slack section that is clamped from the END, so an
   * uncapped value here silently truncates whatever renders after it.
   */
  /**
   * A one-character local part must not come back verbatim.
   *
   * `mask()` used `^(.).+(@.+)$`, which needs TWO characters before the `@`, so
   * `a@x.com` never matched and `.replace` was a no-op — the journey carried the
   * raw address under a field named `emailMasked`, and the compact survey ping
   * puts that straight into a Slack channel. 3 of 1,961 live `app_user` rows have
   * one, and `z.string().email()` accepts the shape on the public form.
   */
  it("masks a single-character local part rather than returning it verbatim", async () => {
    for (const [raw, expected] of [
      ["a@x.com", "a***@x.com"],
      ["e@loveiq.org", "e***@loveiq.org"],
      ["ab@x.com", "a***@x.com"],
    ]) {
      route({ sub: [{ ...SUBMISSION, app_user: { ...SUBMISSION.app_user, email: raw } }] });
      const j = await buildSubmissionJourney(1296);
      expect(j?.emailMasked).toBe(expected);
      expect(j?.emailMasked).not.toBe(raw);
    }
  });

  it("caps the country answer before it reaches a renderer", async () => {
    route({
      sub: [
        {
          ...SUBMISSION,
          app_user: {
            ...SUBMISSION.app_user,
            user_profile: { location_primary: "a".repeat(9_000) },
          },
        },
      ],
    });
    expect((await buildSubmissionJourney(1296))?.country).toHaveLength(100);
  });
});
