import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockFetchWithTimeout = vi.fn();

vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: (...args: Parameters<typeof mockFetchWithTimeout>) =>
    mockFetchWithTimeout(...args),
}));

vi.mock("@shared/http/circuit-breaker", () => ({
  getBreaker: () => ({ fire: (fn: () => Promise<unknown>) => fn() }),
}));

vi.mock("@features/report/server/personalReport", () => ({
  ensurePersonalReportForSubmission: vi.fn(),
  resolveSubmissionAccessContext: vi.fn(),
  lookupReportTokenBySubmissionId: vi.fn().mockResolvedValue(null),
}));

import {
  __testing__,
  getDiscountAdjustment,
  getPricingBucketsForPlan,
  getPricingExperimentGroup,
  getReportPriceQuoteForContext,
  normalizePriceEnding,
} from "@features/pricing/logic/reportPricing";
import {
  ensurePersonalReportForSubmission,
  resolveSubmissionAccessContext,
  lookupReportTokenBySubmissionId,
} from "@features/report/server/personalReport";

function createJsonResponse(body: unknown, ok = true) {
  return {
    ok,
    json: async () => body,
  } as Response;
}

describe("reportPricing", () => {
  const originalSupabaseUrl = process.env.SUPABASE_URL;
  const originalSupabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
    vi.mocked(resolveSubmissionAccessContext).mockResolvedValue({
      submissionId: 42,
      userEmail: "user@example.com",
      userId: 7,
    });
    vi.mocked(ensurePersonalReportForSubmission).mockResolvedValue({
      id: 9,
    });
  });

  afterEach(() => {
    process.env.SUPABASE_URL = originalSupabaseUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalSupabaseServiceRoleKey;
  });

  describe("getDiscountAdjustment — flat (decay ladder retired 2026-06)", () => {
    const initialPriceTimestamp = "2026-04-14T10:00:00.000Z";

    it.each([
      { now: "2026-04-14T10:00:00.000Z" }, // t0
      { now: "2026-04-15T10:00:00.000Z" }, // +24h
      { now: "2026-04-17T10:00:00.000Z" }, // +72h
      { now: "2026-04-21T10:00:00.000Z" }, // +7d
      { now: "2026-04-28T10:00:00.000Z" }, // +14d
    ])("stays at step 0 / ×1 for every plan at $now", ({ now }) => {
      for (const plan of ["essentials", "full_report", "all_reports"] as const) {
        expect(getDiscountAdjustment({ initialPriceTimestamp, now: new Date(now), plan })).toEqual(
          expect.objectContaining({ step: 0, multiplier: 1 })
        );
      }
    });
  });

  describe("bucket catalogue (pricing 2.1)", () => {
    // Per-visitor boosts are paused, so A/B are just two flat base arms from the
    // CSV. Since Pricing 2.1 (2026-08) A is the HIGH arm and B the low one — the
    // reverse of 2.0 — so these assert the numbers, not a direction. Each arm is
    // charged its own bucket base verbatim.
    it("essentials buckets are flat €9.99 (grandfathered, A == B)", () => {
      expect(getPricingBucketsForPlan("essentials")).toEqual([
        { code: "A", weight: 50, msrpCents: 2999, startingCents: 999 },
        { code: "B", weight: 50, msrpCents: 2999, startingCents: 999 },
      ]);
    });

    it("full_report buckets: A €39.99 (strike €45.99), B flat €29", () => {
      expect(getPricingBucketsForPlan("full_report")).toEqual([
        { code: "A", weight: 50, msrpCents: 4599, startingCents: 3999 },
        { code: "B", weight: 50, msrpCents: 2900, startingCents: 2900 },
      ]);
    });

    it("core buckets: A €49.99 (strike €54.99), B €39 (strike €87)", () => {
      expect(getPricingBucketsForPlan("core")).toEqual([
        { code: "A", weight: 50, msrpCents: 5499, startingCents: 4999 },
        { code: "B", weight: 50, msrpCents: 8700, startingCents: 3900 },
      ]);
    });

    it("all_reports buckets: A €59 (strike €64.99), B €49 (strike €58)", () => {
      expect(getPricingBucketsForPlan("all_reports")).toEqual([
        { code: "A", weight: 50, msrpCents: 6499, startingCents: 5900 },
        { code: "B", weight: 50, msrpCents: 5800, startingCents: 4900 },
      ]);
    });

    // €59.00 is the only charged price in the catalogue without a .49/.99
    // ending, so it is the one value where normalizePriceEnding disagrees with
    // the catalogue: it snaps 5900 UP to 5949. That only stays invisible because
    // current_price is Math.min(previous, discounted, initial) and initial is
    // 5900. Guard it, so a future refactor that drops the min surfaces here
    // rather than as a 49-cent overcharge in production.
    it("normalizePriceEnding snaps €59.00 up, so the min against initial is what holds the price", () => {
      expect(normalizePriceEnding(5900)).toBe(5949);
      expect(Math.min(5900, normalizePriceEnding(5900), 5900)).toBe(5900);
      // The other two new arm-A prices are already on a .99 ending.
      expect(normalizePriceEnding(3999)).toBe(3999);
      expect(normalizePriceEnding(4999)).toBe(4999);
    });

    it("weights sum to 100 per plan", () => {
      for (const plan of ["essentials", "full_report", "core", "all_reports"] as const) {
        const total = getPricingBucketsForPlan(plan).reduce((s, b) => s + b.weight, 0);
        expect(total).toBe(100);
      }
    });
  });

  describe("pickBucket invariant — one bucket per user", () => {
    // Locks the post-fix invariant: a single personalReportId hashes to the
    // same bucket code (A/B) across all three plans, so the tier ladder
    // stays monotonic (Full Report ≥ Essentials, All ≥ Full).
    it("returns the same bucket code across all three plans for any personalReportId", () => {
      const plans = ["essentials", "full_report", "all_reports"] as const;
      // Sample a wide range of ids to cover hashString collisions and edge cases.
      const ids = [1, 2, 3, 7, 11, 42, 99, 100, 121, 122, 123, 500, 9_999, 1_234_567];

      for (const id of ids) {
        const codes = plans.map((plan) => __testing__.pickBucket(plan, id).code);
        expect(new Set(codes).size).toBe(1);
      }
    });

    it("distributes buckets across the even A=50% / B=50% spread (no retired C)", () => {
      const counts: Record<"A" | "B" | "C", number> = { A: 0, B: 0, C: 0 };
      const sample = 10_000;
      for (let id = 1; id <= sample; id++) {
        const code = __testing__.pickBucket("essentials", id).code;
        counts[code] += 1;
      }
      // Allow ±3% tolerance for hash skew on a 10k sample.
      expect(counts.A / sample).toBeGreaterThan(0.47);
      expect(counts.A / sample).toBeLessThan(0.53);
      expect(counts.B / sample).toBeGreaterThan(0.47);
      expect(counts.B / sample).toBeLessThan(0.53);
      // C retired — no user should ever be assigned the removed bucket.
      expect(counts.C).toBe(0);
    });
  });

  it("flattens a revisited legacy quote to its starting price (decay ladder retired)", async () => {
    // Legacy row — pre-2026-04 migration, so msrp/starting_price are null.
    // Engine falls back to `base_price` as both the msrp and starting anchor.
    // With the 2026-06 reset there is no decay, so a non-expired revisit keeps
    // the stored initial (€29.99) at step 0 / ×1 — current == initial.
    const initialPriceTimestamp = "2026-04-14T10:00:00.000Z";
    const existingQuote = {
      id: 77,
      personal_report_id: 9,
      survey_submission_id: 42,
      user_id: 7,
      plan: "full_report",
      currency: "EUR",
      experiment_group: "B",
      forced_paywall_arm: "treatment",
      base_price_bucket: "full_center",
      base_price: 29.99,
      msrp: null,
      starting_price: null,
      current_price: 29.99,
      initial_price: 29.99,
      discount_step: 0,
      discount_multiplier: 1,
      pricing_cluster_id: "B-full_report-full_center-tier_2-desktop-google-serious-engaged-d0",
      country_tier: "tier_2",
      country_multiplier: 1,
      device_type: "Desktop",
      device_multiplier: 1.05,
      traffic_source: "google",
      traffic_multiplier: 1.1,
      behavioral_bucket: "serious",
      behavioral_multiplier: 1.2,
      engagement_score: 40,
      engagement_multiplier: 1.1,
      report_preview_views: 1,
      fantasy_signal_count: 1,
      survey_duration_ms: 600000,
      initial_price_timestamp: initialPriceTimestamp,
      expires_at: "2026-05-05T10:00:00.000Z",
      checkout_started_at: null,
      purchased_at: null,
      metadata: null,
      view_count: 1,
    };
    let patchedPayload: Record<string, unknown> | null = null;

    mockFetchWithTimeout.mockImplementation(
      async (url: string, options?: { body?: string; method?: string }) => {
        // Report-wide urgency-window read (no window armed in these fixtures).
        if (url.includes("select=metadata")) {
          return createJsonResponse([]);
        }
        if (url.includes("/rest/v1/survey_submission?id=eq.42")) {
          return createJsonResponse([
            {
              id: 42,
              user_id: 7,
              utm_tracker: "utm_source=google",
              duration_ms: 600000,
              app_user: {
                id: 7,
                email: "user@example.com",
                utm_tracker: null,
                user_profile: {
                  location_primary: "Germany",
                },
              },
            },
          ]);
        }

        if (url.includes("/rest/v1/survey_submission_answer?survey_submission_id=eq.42")) {
          return createJsonResponse([
            {
              answer_option: { option_text: "Germany" },
              answer_text: null,
              normalized_value: null,
              survey_question: { frontend_qid: "15001" },
            },
            {
              answer_option: { option_text: "I want to seriously invest in my sex life" },
              answer_text: null,
              normalized_value: null,
              survey_question: { frontend_qid: "16012" },
            },
          ]);
        }

        if (url.includes("/rest/v1/report_session?personal_report_id=eq.9")) {
          return createJsonResponse([{ id: 1 }]);
        }

        if (
          url.includes("/rest/v1/report_price_quote?personal_report_id=eq.9&plan=eq.full_report")
        ) {
          return createJsonResponse([existingQuote]);
        }

        if (options?.method === "PATCH" && url.includes("/rest/v1/report_price_quote?id=eq.77")) {
          patchedPayload = JSON.parse(options.body ?? "{}") as Record<string, unknown>;
          return createJsonResponse([{ ...existingQuote, ...patchedPayload }]);
        }

        throw new Error(`Unexpected fetch call: ${options?.method ?? "GET"} ${url}`);
      }
    );

    const quote = await getReportPriceQuoteForContext({
      now: new Date("2026-04-15T10:00:00.000Z"),
      plan: "full_report",
      pricingSessionId: "550e8400-e29b-41d4-a716-446655440001",
      reportToken: "rpt_ABCDEFGHIJKLMNOPQRST",
    });

    // Decay ladder retired → current = initial = starting = €29.99, step 0 / ×1.
    expect(quote).toEqual(
      expect.objectContaining({
        currentPriceCents: 2999,
        discountMultiplier: 1,
        discountStep: 0,
        initialPriceCents: 2999,
        initialPriceTimestamp,
        msrpCents: 2999,
        startingPriceCents: 2999,
      })
    );
    expect(patchedPayload).toEqual(
      expect.objectContaining({
        current_price: 29.99,
        discount_multiplier: 1,
        discount_step: 0,
        // Stable: the arm already stamped on the row is preserved on re-quote,
        // never recomputed (even though a token is present this round).
        forced_paywall_arm: "treatment",
      })
    );
    expect(patchedPayload?.metadata).toEqual(
      expect.objectContaining({
        reportToken: "rpt_ABCDEFGHIJKLMNOPQRST",
        sessionLocks: [
          expect.objectContaining({
            pricingSessionId: "550e8400-e29b-41d4-a716-446655440001",
            currentPriceCents: 2999,
            discountMultiplier: 1,
            discountStep: 0,
          }),
        ],
      })
    );
  });

  it("reuses the original same-session quote during checkout validation even after the ladder has stepped down", async () => {
    const pricingSessionId = "550e8400-e29b-41d4-a716-446655440010";
    const storedQuote = {
      id: 77,
      personal_report_id: 9,
      survey_submission_id: 42,
      user_id: 7,
      plan: "full_report",
      currency: "EUR",
      experiment_group: "B",
      base_price_bucket: "B",
      base_price: 59.99,
      msrp: 59.99,
      starting_price: 29.99,
      current_price: 26.99,
      initial_price: 29.99,
      discount_step: 1,
      discount_multiplier: 0.9,
      pricing_cluster_id: "B-full_report-B-tier_2-desktop-google-serious-engaged-d1",
      country_tier: "tier_2",
      country_multiplier: 1,
      device_type: "Desktop",
      device_multiplier: 1.05,
      traffic_source: "google",
      traffic_multiplier: 1.1,
      behavioral_bucket: "serious",
      behavioral_multiplier: 1.2,
      engagement_score: 40,
      engagement_multiplier: 1.1,
      report_preview_views: 1,
      fantasy_signal_count: 1,
      survey_duration_ms: 600000,
      initial_price_timestamp: "2026-04-14T10:00:00.000Z",
      expires_at: "2026-05-05T10:00:00.000Z",
      checkout_started_at: null,
      purchased_at: null,
      metadata: {
        sessionLocks: [
          {
            pricingSessionId,
            currentPriceCents: 2999,
            discountMultiplier: 1,
            discountStep: 0,
            lockedAt: "2026-04-14T10:00:00.000Z",
          },
        ],
      },
      view_count: 2,
    };

    mockFetchWithTimeout.mockImplementation(async (url: string) => {
      // Report-wide urgency-window read (no window armed in these fixtures).
      if (url.includes("select=metadata")) {
        return createJsonResponse([]);
      }
      if (url.includes("/rest/v1/survey_submission?id=eq.42")) {
        return createJsonResponse([
          {
            id: 42,
            user_id: 7,
            utm_tracker: "utm_source=google",
            duration_ms: 600000,
            app_user: {
              id: 7,
              email: "user@example.com",
              utm_tracker: null,
              user_profile: {
                location_primary: "Germany",
              },
            },
          },
        ]);
      }

      if (url.includes("/rest/v1/survey_submission_answer?survey_submission_id=eq.42")) {
        return createJsonResponse([]);
      }

      if (url.includes("/rest/v1/report_session?personal_report_id=eq.9")) {
        return createJsonResponse([{ id: 1 }]);
      }

      if (url.includes("/rest/v1/report_price_quote?id=eq.77&select=*&limit=1")) {
        return createJsonResponse([storedQuote]);
      }

      throw new Error(`Unexpected fetch call: ${url}`);
    });

    const quote = await getReportPriceQuoteForContext({
      plan: "full_report",
      pricingSessionId,
      quoteId: 77,
      reportToken: "rpt_ABCDEFGHIJKLMNOPQRST",
    });

    // Session lock pins the original 29.99 price — ladder progress is ignored
    // within the same pricingSessionId.
    expect(quote).toEqual(
      expect.objectContaining({
        currentPriceCents: 2999,
        discountMultiplier: 1,
        discountStep: 0,
        msrpCents: 5999,
        startingPriceCents: 2999,
      })
    );
  });

  it("persists new msrp + starting_price columns when creating a fresh quote", async () => {
    let createdPayload: Record<string, unknown> | null = null;

    mockFetchWithTimeout.mockImplementation(
      async (url: string, options?: { body?: string; method?: string }) => {
        // Report-wide urgency-window read (no window armed in these fixtures).
        if (url.includes("select=metadata")) {
          return createJsonResponse([]);
        }
        if (url.includes("/rest/v1/survey_submission?id=eq.42")) {
          return createJsonResponse([
            {
              id: 42,
              user_id: 7,
              utm_tracker: "utm_source=google",
              duration_ms: 600000,
              app_user: {
                id: 7,
                email: "user@example.com",
                utm_tracker: null,
                user_profile: { location_primary: "Germany" },
              },
            },
          ]);
        }

        if (url.includes("/rest/v1/survey_submission_answer?survey_submission_id=eq.42")) {
          return createJsonResponse([]);
        }

        if (url.includes("/rest/v1/report_session?personal_report_id=eq.9")) {
          return createJsonResponse([]);
        }

        if (
          url.includes("/rest/v1/report_price_quote?personal_report_id=eq.9&plan=eq.full_report")
        ) {
          return createJsonResponse([]);
        }

        if (options?.method === "POST" && url.includes("/rest/v1/report_price_quote")) {
          createdPayload = JSON.parse(options.body ?? "{}") as Record<string, unknown>;
          return createJsonResponse([
            {
              id: 91,
              personal_report_id: 9,
              survey_submission_id: 42,
              user_id: 7,
              ...createdPayload,
              checkout_started_at: null,
              purchased_at: null,
            },
          ]);
        }

        throw new Error(`Unexpected fetch call: ${options?.method ?? "GET"} ${url}`);
      }
    );

    const quote = await getReportPriceQuoteForContext({
      plan: "full_report",
      pricingSessionId: "550e8400-e29b-41d4-a716-446655440111",
      reportSessionId: "550e8400-e29b-41d4-a716-446655440222",
    });

    expect(quote.experimentGroup).toMatch(/^[AB]$/);
    expect(quote.basePriceBucket).toMatch(/^[ABC]$/);
    expect(quote.msrpCents).toBeGreaterThan(0);
    expect(quote.startingPriceCents).toBeGreaterThan(0);
    // MSRP is always ≥ starting. Pricing 2.0 flat Group-B buckets can have
    // msrp == starting (no strike shown), so this is ≥, not strictly >.
    expect(quote.msrpCents).toBeGreaterThanOrEqual(quote.startingPriceCents);
    expect(createdPayload).toEqual(
      expect.objectContaining({
        experiment_group: quote.experimentGroup,
        base_price_bucket: quote.basePriceBucket,
        msrp: quote.msrpCents / 100,
        starting_price: quote.startingPriceCents / 100,
      })
    );
  });

  it("never stamps a forced-paywall arm on a fresh quote", async () => {
    // The forced-paywall A/B was removed on 2026-08-31. A fresh quote must leave
    // `forced_paywall_arm` unset entirely — writing "control" would look like a
    // live arm to every downstream reader.
    const reportToken = "rpt_SkDN8YcTxXRivawCVtY6";
    let createdPayload: Record<string, unknown> | null = null;

    mockFetchWithTimeout.mockImplementation(
      async (url: string, options?: { body?: string; method?: string }) => {
        // Report-wide urgency-window read (no window armed in these fixtures).
        if (url.includes("select=metadata")) {
          return createJsonResponse([]);
        }
        if (url.includes("/rest/v1/survey_submission?id=eq.42")) {
          return createJsonResponse([
            {
              id: 42,
              user_id: 7,
              utm_tracker: "utm_source=google",
              duration_ms: 600000,
              app_user: {
                id: 7,
                email: "user@example.com",
                utm_tracker: null,
                user_profile: { location_primary: "Germany" },
              },
            },
          ]);
        }
        if (url.includes("/rest/v1/survey_submission_answer?survey_submission_id=eq.42")) {
          return createJsonResponse([]);
        }
        if (url.includes("/rest/v1/report_session?personal_report_id=eq.9")) {
          return createJsonResponse([]);
        }
        if (
          url.includes("/rest/v1/report_price_quote?personal_report_id=eq.9&plan=eq.full_report")
        ) {
          return createJsonResponse([]);
        }
        if (options?.method === "POST" && url.includes("/rest/v1/report_price_quote")) {
          createdPayload = JSON.parse(options.body ?? "{}") as Record<string, unknown>;
          return createJsonResponse([
            {
              id: 92,
              personal_report_id: 9,
              survey_submission_id: 42,
              user_id: 7,
              ...createdPayload,
            },
          ]);
        }
        throw new Error(`Unexpected fetch call: ${options?.method ?? "GET"} ${url}`);
      }
    );

    await getReportPriceQuoteForContext({
      plan: "full_report",
      pricingSessionId: "550e8400-e29b-41d4-a716-446655440111",
      reportToken,
    });

    expect(createdPayload).not.toBeNull();
    expect(Object.keys(createdPayload!)).not.toContain("forced_paywall_arm");
    // Nothing needs the report token for bucketing any more, so the fallback
    // submission-token lookup must not be reached either.
    expect(lookupReportTokenBySubmissionId).not.toHaveBeenCalled();
  });

  it("group A all_reports fresh quote is the €59 base starting verbatim (step 0)", async () => {
    // Group A is charged the flat base `starting` verbatim (no per-user uplift,
    // no charm-snap). Pricing 2.1 base for all_reports is €59.00. A fresh quote
    // at step 0 → initial == current == the catalogue starting (5900). This is
    // also the only end-to-end guard that €59.00 survives normalizePriceEnding
    // snapping it to 5949.
    let groupAId = 0;
    for (let id = 1; id <= 5_000; id++) {
      if (getPricingExperimentGroup(id) === "A") {
        groupAId = id;
        break;
      }
    }
    expect(groupAId).toBeGreaterThan(0);
    vi.mocked(ensurePersonalReportForSubmission).mockResolvedValue({ id: groupAId });

    mockFetchWithTimeout.mockImplementation(
      async (url: string, options?: { body?: string; method?: string }) => {
        // Report-wide urgency-window read (no window armed in these fixtures).
        if (url.includes("select=metadata")) {
          return createJsonResponse([]);
        }
        if (url.includes("/rest/v1/survey_submission?id=eq.42")) {
          return createJsonResponse([
            {
              id: 42,
              user_id: 7,
              utm_tracker: null,
              duration_ms: 0,
              app_user: {
                id: 7,
                email: "user@example.com",
                utm_tracker: null,
                user_profile: { location_primary: "Germany" },
              },
            },
          ]);
        }
        if (url.includes("/rest/v1/survey_submission_answer")) return createJsonResponse([]);
        if (url.includes("/rest/v1/report_session")) return createJsonResponse([]);
        if (
          url.includes("/rest/v1/report_price_quote?personal_report_id=") &&
          url.includes("plan=eq.all_reports") &&
          options?.method !== "POST"
        ) {
          return createJsonResponse([]);
        }
        if (options?.method === "POST" && url.includes("/rest/v1/report_price_quote")) {
          const createdPayload = JSON.parse(options.body ?? "{}") as Record<string, unknown>;
          return createJsonResponse([
            {
              id: 92,
              personal_report_id: groupAId,
              survey_submission_id: 42,
              user_id: 7,
              ...createdPayload,
            },
          ]);
        }
        throw new Error(`Unexpected fetch call: ${options?.method ?? "GET"} ${url}`);
      }
    );

    const quote = await getReportPriceQuoteForContext({
      now: new Date("2026-06-02T10:00:00.000Z"),
      plan: "all_reports",
      pricingSessionId: "550e8400-e29b-41d4-a716-446655440222",
      reportToken: "rpt_ABCDEFGHIJKLMNOPQRST",
    });

    // Group A: €59.00 base verbatim — no uplift, no decay, no charm-snap.
    // Pricing 2.1 all_reports Group A: starting €59.00, strike (msrp) €64.99.
    expect(quote.initialPriceCents).toBe(5900);
    expect(quote.currentPriceCents).toBe(5900);
    expect(quote.msrpCents).toBe(6499);
  });

  // Pricing 2.1 RAISED arm A, and a raise is the one direction the engine
  // resists: current_price is Math.min(previous, discounted, initial), so an
  // existing row stays pinned to its old price until every one of those inputs
  // is rewritten. These two cases are the executable proof that the resync
  // migration (supabase/migrations/*_pricing_2_1_resync_quotes.sql) IS the
  // change and not a tidy-up — drop it and case 2 is what production serves.
  describe("raising a stored group-A quote (pricing 2.1 resync)", () => {
    const storedQuoteBase = {
      id: 77,
      personal_report_id: 9,
      survey_submission_id: 42,
      user_id: 7,
      plan: "full_report",
      currency: "EUR",
      experiment_group: "A",
      forced_paywall_arm: "treatment",
      base_price_bucket: "A",
      discount_step: 0,
      discount_multiplier: 1,
      pricing_cluster_id: "A-full_report-A-tier_2-desktop-direct-zero-standard-d0",
      country_tier: "tier_2",
      country_multiplier: 1,
      device_type: "Desktop",
      device_multiplier: 1,
      traffic_source: "direct",
      traffic_multiplier: 1,
      behavioral_bucket: "zero",
      behavioral_multiplier: 1,
      engagement_score: 0,
      engagement_multiplier: 1,
      report_preview_views: 0,
      fantasy_signal_count: 0,
      survey_duration_ms: 600000,
      initial_price_timestamp: "2026-08-01T10:00:00.000Z",
      // Deliberately NOT expired, so regenerateInitialPrice stays false and the
      // stored values are the ones under test.
      expires_at: "2026-09-30T10:00:00.000Z",
      checkout_started_at: null,
      purchased_at: null,
      metadata: null,
      view_count: 1,
    };

    function mockStoredQuote(moneyColumns: Record<string, number>) {
      const existingQuote = { ...storedQuoteBase, ...moneyColumns };
      mockFetchWithTimeout.mockImplementation(
        async (url: string, options?: { body?: string; method?: string }) => {
          if (url.includes("select=metadata")) return createJsonResponse([]);
          if (url.includes("/rest/v1/survey_submission?id=eq.42")) {
            return createJsonResponse([
              {
                id: 42,
                user_id: 7,
                utm_tracker: null,
                duration_ms: 600000,
                app_user: {
                  id: 7,
                  email: "user@example.com",
                  utm_tracker: null,
                  user_profile: { location_primary: "Germany" },
                },
              },
            ]);
          }
          if (url.includes("/rest/v1/survey_submission_answer?survey_submission_id=eq.42")) {
            return createJsonResponse([]);
          }
          if (url.includes("/rest/v1/report_session?personal_report_id=eq.9")) {
            return createJsonResponse([]);
          }
          if (
            url.includes("/rest/v1/report_price_quote?personal_report_id=eq.9&plan=eq.full_report")
          ) {
            return createJsonResponse([existingQuote]);
          }
          if (options?.method === "PATCH" && url.includes("/rest/v1/report_price_quote?id=eq.77")) {
            const patched = JSON.parse(options.body ?? "{}") as Record<string, unknown>;
            return createJsonResponse([{ ...existingQuote, ...patched }]);
          }
          throw new Error(`Unexpected fetch call: ${options?.method ?? "GET"} ${url}`);
        }
      );
    }

    const readQuote = () =>
      getReportPriceQuoteForContext({
        now: new Date("2026-08-24T10:00:00.000Z"),
        plan: "full_report",
        reportToken: "rpt_ABCDEFGHIJKLMNOPQRST",
      });

    it("serves the raised €39.99 once ALL the money columns are resynced", async () => {
      // What supabase/migrations/20260824120000_pricing_2_1_resync_quotes.sql
      // writes: msrp, base_price, starting_price, initial_price AND
      // current_price together, so all three Math.min inputs are the new price.
      mockStoredQuote({
        base_price: 45.99,
        msrp: 45.99,
        starting_price: 39.99,
        initial_price: 39.99,
        current_price: 39.99,
      });

      const quote = await readQuote();

      expect(quote.currentPriceCents).toBe(3999);
      expect(quote.initialPriceCents).toBe(3999);
      expect(quote.msrpCents).toBe(4599);
    });

    it("stays clamped to the OLD €9.99 when only msrp/starting were raised", async () => {
      // The half-done migration: the strike moved but the charged price did not.
      // Math.min(previous 999, discounted 999, initial 999) = 999.
      mockStoredQuote({
        base_price: 45.99,
        msrp: 45.99,
        starting_price: 39.99,
        initial_price: 9.99,
        current_price: 9.99,
      });

      const quote = await readQuote();

      // Still the old price, and now paired with the new anchor — the paywall
      // would advertise "€9.99, was €45.99", a 78% discount nobody authorised.
      expect(quote.currentPriceCents).toBe(999);
      expect(quote.msrpCents).toBe(4599);
    });
  });
});
