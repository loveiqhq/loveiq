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
function route(handlers: { sub?: unknown; quotes?: unknown; events?: unknown }) {
  mockSupabaseFetch.mockImplementation(async (path: string) => {
    if (path.includes("/survey_submission?")) return ok(handlers.sub ?? [SUBMISSION]);
    if (path.includes("/report_price_quote?")) return ok(handlers.quotes ?? []);
    if (path.includes("/analytics_event?")) return ok(handlers.events ?? []);
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

  it("fetches its three sources concurrently, not sequentially", async () => {
    route({ quotes: [QUOTE_PURCHASED] });
    await buildSubmissionJourney(1296);
    // One call per source, issued in one Promise.all wave.
    expect(mockSupabaseFetch).toHaveBeenCalledTimes(3);
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
});
