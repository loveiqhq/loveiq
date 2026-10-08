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

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  getDiscountAdjustment,
  getPricingBucketsForPlan,
  getReportPriceQuoteForContext,
  markReportPriceQuotePurchased,
  normalizePriceEnding,
  pricingArmForReport,
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

  describe("price list (Pricing 3.0)", () => {
    // Two products on two price lists, 50/50 (the Pricing_3.0 tab of "Tracking &
    // Pricing"). These assert the exact numbers because they are what the reader is
    // charged; the re-sync migrations carry the same four rows, and the test below
    // reads them out of them so the two cannot drift. List B was lowered on 2026-10-08.
    it("full_report is €29.99 or €4.99, each at its own anchor so neither strikes", () => {
      expect(getPricingBucketsForPlan("full_report")).toEqual([
        { code: "A3", weight: 50, msrpCents: 2999, startingCents: 2999 },
        { code: "B3", weight: 50, msrpCents: 499, startingCents: 499 },
      ]);
    });

    it("all_reports is €39.99 (strike €49.99) or €6.99 (strike €9.99)", () => {
      expect(getPricingBucketsForPlan("all_reports")).toEqual([
        { code: "A3", weight: 50, msrpCents: 4999, startingCents: 3999 },
        { code: "B3", weight: 50, msrpCents: 999, startingCents: 699 },
      ]);
    });

    it("keeps one bucket for each retired plan, so their old rows still rehydrate", () => {
      expect(getPricingBucketsForPlan("essentials")).toEqual([
        { code: "B", weight: 100, msrpCents: 2999, startingCents: 999 },
      ]);
      expect(getPricingBucketsForPlan("core")).toEqual([
        { code: "B", weight: 100, msrpCents: 8700, startingCents: 3900 },
      ]);
    });

    it("re-syncs existing quotes to exactly these prices", () => {
      const migration = (name: string) =>
        readFileSync(join(process.cwd(), "supabase/migrations", name), "utf8");
      const cents = (euros: string) => Math.round(Number(euros) * 100);
      // A3 is still the 3.0 launch re-sync's; B3 is the 2026-10-08 one's, which moves
      // only rows already on B3.
      const launch = [
        ...migration("20261005120100_pricing_3_resync_quotes.sql").matchAll(
          /\('(full_report|all_reports)'(?:::text)?,\s*'(A3)'(?:::text)?,\s*([\d.]+)(?:::numeric)?,\s*([\d.]+)/g
        ),
      ].map(([, plan, code, msrp, starting]) => ({
        plan,
        code,
        msrpCents: cents(msrp),
        startingCents: cents(starting),
      }));
      const listBSql = migration("20261008120000_pricing_3_list_b_lower_resync.sql");
      expect(listBSql).toContain("AND q.experiment_group = 'B3'");
      const listB = [
        ...listBSql.matchAll(
          /\('(full_report|all_reports)'(?:::text)?,\s*([\d.]+)(?:::numeric)?,\s*([\d.]+)/g
        ),
      ].map(([, plan, msrp, starting]) => ({
        plan,
        code: "B3",
        msrpCents: cents(msrp),
        startingCents: cents(starting),
      }));
      const rows = [...launch, ...listB];
      expect(launch).toHaveLength(2);
      expect(listB).toHaveLength(2);
      for (const row of rows) {
        const bucket = getPricingBucketsForPlan(row.plan as "full_report" | "all_reports").find(
          (b) => b.code === row.code
        );
        expect(bucket, `${row.plan} ${row.code}`).toMatchObject({
          msrpCents: row.msrpCents,
          startingCents: row.startingCents,
        });
      }
    });

    it("assigns the arm from the report id exactly as the re-sync's SQL does, 50/50", () => {
      // SQL: (personal_report_id * 2654435761) % 4294967296 < 2147483648 → A3. Exact in
      // a double while the product stays under 2^53, which holds far past any real id.
      let a3 = 0;
      for (let id = 1; id <= 5000; id += 1) {
        const sql = (id * 2654435761) % 4294967296 < 2147483648 ? "A3" : "B3";
        expect(pricingArmForReport(id), `report ${id}`).toBe(sql);
        if (sql === "A3") a3 += 1;
      }
      expect(a3).toBe(2500);
    });

    // Kept from the arm-A era because the rule it guards is not about arm A.
    // normalizePriceEnding snaps a round euro amount UP to a .49/.99 ending, and
    // that only stays invisible because current_price is
    // Math.min(previous, discounted, initial). A future refactor that drops the
    // min should surface here rather than as a 49-cent overcharge in production.
    it("normalizePriceEnding snaps a round €59.00 up, so the min against initial is what holds the price", () => {
      expect(normalizePriceEnding(5900)).toBe(5949);
      expect(Math.min(5900, normalizePriceEnding(5900), 5900)).toBe(5900);
      expect(normalizePriceEnding(3999)).toBe(3999);
      expect(normalizePriceEnding(4999)).toBe(4999);
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

  it("credits the singles already paid on the report against the All 14 quote", async () => {
    const allQuote = {
      id: 78,
      personal_report_id: 9,
      survey_submission_id: 42,
      user_id: 7,
      plan: "all_reports",
      currency: "EUR",
      experiment_group: "B3",
      forced_paywall_arm: null,
      base_price_bucket: "B3",
      base_price: 9.99,
      msrp: 9.99,
      starting_price: 6.99,
      current_price: 6.99,
      initial_price: 6.99,
      discount_step: 0,
      discount_multiplier: 1,
      pricing_cluster_id: "B3-all_reports-B3-tier_2-desktop-google-serious-engaged-d0",
      country_tier: "tier_2",
      country_multiplier: 1,
      device_type: "Desktop",
      device_multiplier: 1,
      traffic_source: "google",
      traffic_multiplier: 1,
      behavioral_bucket: "serious",
      behavioral_multiplier: 1,
      engagement_score: 40,
      engagement_multiplier: 1,
      report_preview_views: 1,
      fantasy_signal_count: 1,
      survey_duration_ms: 600000,
      initial_price_timestamp: "2026-10-06T19:00:00.000Z",
      expires_at: "2026-11-06T19:00:00.000Z",
      checkout_started_at: null,
      purchased_at: null,
      metadata: null,
      view_count: 1,
    };
    mockFetchWithTimeout.mockImplementation(
      async (url: string, options?: { body?: string; method?: string }) => {
        if (url.includes("/rest/v1/payment?personal_report_id=eq.9")) {
          return createJsonResponse([
            {
              amount: 4.99,
              refund_amount: null,
              currency: "EUR",
              metadata: { plan: "full_report" },
            },
          ]);
        }
        if (url.includes("select=metadata")) return createJsonResponse([]);
        if (url.includes("/rest/v1/survey_submission?id=eq.42")) {
          return createJsonResponse([
            {
              id: 42,
              user_id: 7,
              utm_tracker: "utm_source=google",
              duration_ms: 600000,
              app_user: { id: 7, email: "user@example.com", utm_tracker: null, user_profile: null },
            },
          ]);
        }
        if (url.includes("/rest/v1/survey_submission_answer?survey_submission_id=eq.42")) {
          return createJsonResponse([]);
        }
        if (url.includes("/rest/v1/report_session?personal_report_id=eq.9")) {
          return createJsonResponse([{ id: 1 }]);
        }
        if (
          url.includes("/rest/v1/report_price_quote?personal_report_id=eq.9&plan=eq.all_reports")
        ) {
          return createJsonResponse([allQuote]);
        }
        if (options?.method === "PATCH" && url.includes("/rest/v1/report_price_quote?id=eq.78")) {
          const patch = JSON.parse(options.body ?? "{}") as Record<string, unknown>;
          return createJsonResponse([{ ...allQuote, ...patch }]);
        }
        throw new Error(`Unexpected fetch call: ${options?.method ?? "GET"} ${url}`);
      }
    );

    const quote = await getReportPriceQuoteForContext({
      now: new Date("2026-10-07T10:00:00.000Z"),
      plan: "all_reports",
      reportToken: "rpt_ABCDEFGHIJKLMNOPQRST",
    });

    // €6.99 less the €4.99 single bought on this report.
    expect(quote).toEqual(
      expect.objectContaining({ chargedPriceCents: 200, upgradeCreditCents: 499 })
    );
    // The stored quote keeps the list price: the credit is never written back.
    const patches = mockFetchWithTimeout.mock.calls.filter(
      ([, options]) => (options as { method?: string } | undefined)?.method === "PATCH"
    );
    for (const [, options] of patches) {
      expect(JSON.parse((options as { body: string }).body).current_price ?? 6.99).toBe(6.99);
    }
  });

  it("checkout refuses rather than charge All 14 without its credit", async () => {
    mockFetchWithTimeout.mockImplementation(async (url: string) => {
      if (url.includes("/rest/v1/payment?personal_report_id=eq.9")) {
        return { ok: false, status: 503, json: async () => ({}) } as Response;
      }
      if (url.includes("/rest/v1/report_price_quote?id=eq.78")) {
        return createJsonResponse([
          {
            id: 78,
            personal_report_id: 9,
            plan: "all_reports",
            experiment_group: "B3",
            base_price_bucket: "B3",
            base_price: 9.99,
            msrp: 9.99,
            starting_price: 6.99,
            current_price: 6.99,
            initial_price: 6.99,
            discount_step: 0,
            discount_multiplier: 1,
            metadata: null,
          },
        ]);
      }
      if (url.includes("/rest/v1/survey_submission?id=eq.42")) {
        return createJsonResponse([
          { id: 42, user_id: 7, utm_tracker: null, duration_ms: 1, app_user: { id: 7 } },
        ]);
      }
      return createJsonResponse([]);
    });
    const args = {
      now: new Date("2026-10-07T10:00:00.000Z"),
      plan: "all_reports" as const,
      quoteId: 78,
      reportToken: "rpt_ABCDEFGHIJKLMNOPQRST",
    };

    // The pay screen falls back to the full price...
    await expect(getReportPriceQuoteForContext(args)).resolves.toEqual(
      expect.objectContaining({ chargedPriceCents: 699 })
    );
    // ...but checkout must not charge it after the screen may have shown the credit.
    await expect(
      getReportPriceQuoteForContext({ ...args, strictUpgradeCredit: true })
    ).rejects.toThrow("upgrade_credit_lookup_failed");
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

    // Report 9 falls in arm B3, and a fresh quote's bucket is its arm's.
    expect(quote.experimentGroup).toBe("B3");
    expect(quote.basePriceBucket).toBe("B3");
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

  it.each([
    { reportId: 4243, arm: "A3", starting: 3999, msrp: 4999 },
    { reportId: 4242, arm: "B3", starting: 699, msrp: 999 },
  ])(
    "an all_reports fresh quote in $arm is its list's base verbatim (step 0)",
    async ({ reportId, arm, starting, msrp }) => {
      // The reader is charged the flat base `starting` verbatim: no per-user uplift,
      // no decay, no charm-snap. A fresh quote at step 0 → initial == current ==
      // the catalogue starting, on the list the report id's arm picks.
      vi.mocked(ensurePersonalReportForSubmission).mockResolvedValue({ id: reportId });

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
                personal_report_id: reportId,
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

      // This fixture does NOT stub the system_flags fetch, so `pricing_uplift_enabled`
      // resolves to its default — which is the point. That default is `false`, so a
      // Supabase outage leaves the flat base price rather than switching per-visitor
      // boosts on and charging more than the page showed. Flip the default in
      // reportPricing.ts and this assertion fails with an uplifted amount.
      //
      expect(quote.initialPriceCents).toBe(starting);
      expect(quote.currentPriceCents).toBe(starting);
      expect(quote.msrpCents).toBe(msrp);
      expect(quote.chargedPriceCents).toBe(starting);
      expect(quote.basePriceBucket).toBe(arm);
      expect(quote.experimentGroup).toBe(arm);
    }
  );

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

  /**
   * One full_report quote serves the single report for every archetype, so a second
   * single is paid on the same quote. The audit's example, production quote 7897: bought
   * at 19:42:55, and a checkout started on it again at 19:43:15.
   */
  describe("a second purchase on the same quote", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("keeps the first purchase's time and payment id", async () => {
      const row: { metadata: Record<string, unknown>; purchased_at: string | null } = {
        metadata: { generatedAt: "2026-10-06T19:40:00.000Z" },
        purchased_at: null,
      };
      // PostgREST on this one row: a PATCH whose filter the row fails changes nothing.
      mockFetchWithTimeout.mockImplementation(
        async (url: string, options?: { body?: string; method?: string }) => {
          if (options?.method !== "PATCH") return createJsonResponse([row]);
          if (!url.includes("purchased_at=is.null") || row.purchased_at === null) {
            Object.assign(row, JSON.parse(options.body ?? "{}"));
          }
          return createJsonResponse([]);
        }
      );
      vi.useFakeTimers({ toFake: ["Date"] });

      vi.setSystemTime(new Date("2026-10-06T19:42:55.000Z"));
      await markReportPriceQuotePurchased({ paymentId: 101, quoteId: 7897 });
      vi.setSystemTime(new Date("2026-10-06T19:44:02.000Z"));
      await markReportPriceQuotePurchased({ paymentId: 102, quoteId: 7897 });

      expect(row.purchased_at).toBe("2026-10-06T19:42:55.000Z");
      expect(row.metadata).toEqual({ generatedAt: "2026-10-06T19:40:00.000Z", paymentId: 101 });
    });
  });
});
