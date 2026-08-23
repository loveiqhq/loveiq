import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockFetchWithTimeout = vi.fn();
const mockIsFeatureEnabled = vi.fn();

vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: (...args: Parameters<typeof mockFetchWithTimeout>) =>
    mockFetchWithTimeout(...args),
}));

vi.mock("@shared/http/circuit-breaker", () => ({
  getBreaker: () => ({ fire: (fn: () => Promise<unknown>) => fn() }),
}));

vi.mock("@shared/flags/system-flags", () => ({
  isFeatureEnabled: (...args: Parameters<typeof mockIsFeatureEnabled>) =>
    mockIsFeatureEnabled(...args),
}));

vi.mock("@features/report/server/personalReport", () => ({
  ensurePersonalReportForSubmission: vi.fn(),
  resolveSubmissionAccessContext: vi.fn(),
  lookupReportTokenBySubmissionId: vi.fn().mockResolvedValue(null),
}));

import {
  armReportUrgencyWindow,
  getReportPriceQuoteForContext,
  getReportPriceQuotesForContext,
} from "@features/pricing/logic/reportPricing";
import {
  ensurePersonalReportForSubmission,
  resolveSubmissionAccessContext,
} from "@features/report/server/personalReport";

function createJsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body } as Response;
}

/** A stored quote priced at €26.99, armed or not depending on `deadlineAt`. */
function storedQuote(deadlineAt: string | null) {
  return {
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
    discount_step: 0,
    discount_multiplier: 1,
    pricing_cluster_id: "B-full_report-B-tier_2-desktop-google-serious-engaged-d0",
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
    initial_price_timestamp: "2026-04-14T10:00:00.000Z",
    expires_at: "2099-01-01T00:00:00.000Z",
    checkout_started_at: null,
    purchased_at: null,
    metadata: deadlineAt ? { urgency: { deadlineAt } } : {},
    view_count: 2,
  };
}

/**
 * The surcharge, where it actually decides money: on the quote snapshot the UI renders
 * and the checkout charges from.
 *
 * The engine's `current_price` is monotonically NON-INCREASING by design
 * (`Math.min(previousCurrentPriceCents, …)`), so the surcharge is added at the edges and
 * never written into the row. These tests hold that line — if the surcharge ever leaks
 * into `current_price`, it would be clamped away on the next re-quote and, worse, would
 * freeze the higher price permanently once it stuck.
 */
describe("urgency surcharge on the quote", () => {
  const PAST = "2026-08-23T12:00:00.000Z";
  const FUTURE = "2099-01-01T00:00:00.000Z";

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
    mockIsFeatureEnabled.mockResolvedValue(true);
    vi.mocked(resolveSubmissionAccessContext).mockResolvedValue({
      submissionId: 42,
      userEmail: "user@example.com",
      userId: 7,
    });
    vi.mocked(ensurePersonalReportForSubmission).mockResolvedValue({ id: 9 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockQuoteFetch(row: ReturnType<typeof storedQuote>) {
    mockFetchWithTimeout.mockImplementation(async (url: string, init?: RequestInit) => {
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
        return createJsonResponse([{ id: 1 }]);
      }
      if (url.includes("/rest/v1/report_price_quote?id=eq.77")) {
        return createJsonResponse([row]);
      }
      if (url.includes("/rest/v1/report_price_quote?personal_report_id=eq.9")) {
        return createJsonResponse([row]);
      }
      if (url.includes("/rest/v1/report_price_quote") && init?.method === "PATCH") {
        return createJsonResponse({});
      }
      throw new Error(`Unexpected fetch call: ${url}`);
    });
  }

  it("adds two euros once the window has closed, without touching the base price", async () => {
    mockQuoteFetch(storedQuote(PAST));

    const quote = await getReportPriceQuoteForContext({
      plan: "full_report",
      quoteId: 77,
      reportToken: "rpt_ABCDEFGHIJKLMNOPQRST",
    });

    expect(quote).toEqual(
      expect.objectContaining({
        currentPriceCents: 2699, // the base the engine derived — unchanged
        surchargeCents: 200,
        chargedPriceCents: 2899, // what the reader sees and pays
        urgencyDeadlineAt: PAST,
      })
    );
  });

  it("charges the base price while the window is still open", async () => {
    mockQuoteFetch(storedQuote(FUTURE));

    const quote = await getReportPriceQuoteForContext({
      plan: "full_report",
      quoteId: 77,
      reportToken: "rpt_ABCDEFGHIJKLMNOPQRST",
    });

    expect(quote).toEqual(
      expect.objectContaining({
        currentPriceCents: 2699,
        surchargeCents: 0,
        chargedPriceCents: 2699,
      })
    );
  });

  it("charges the base price when the reader never reached the paywall", async () => {
    mockQuoteFetch(storedQuote(null));

    const quote = await getReportPriceQuoteForContext({
      plan: "full_report",
      quoteId: 77,
      reportToken: "rpt_ABCDEFGHIJKLMNOPQRST",
    });

    expect(quote?.urgencyDeadlineAt).toBeNull();
    expect(quote?.chargedPriceCents).toBe(2699);
  });

  it("charges the base price with the flag off, however long ago the window closed", async () => {
    mockIsFeatureEnabled.mockResolvedValue(false);
    mockQuoteFetch(storedQuote(PAST));

    const quote = await getReportPriceQuoteForContext({
      plan: "full_report",
      quoteId: 77,
      reportToken: "rpt_ABCDEFGHIJKLMNOPQRST",
    });

    expect(quote).toEqual(expect.objectContaining({ surchargeCents: 0, chargedPriceCents: 2699 }));
  });

  it("never writes the surcharge into the stored price", async () => {
    mockQuoteFetch(storedQuote(PAST));

    await getReportPriceQuoteForContext({
      plan: "full_report",
      quoteId: 77,
      reportToken: "rpt_ABCDEFGHIJKLMNOPQRST",
    });

    // 28.99 must appear in no write. `current_price` is clamped downward on every
    // re-quote, so a raised value would either vanish or freeze — see the file header.
    for (const [, init] of mockFetchWithTimeout.mock.calls) {
      const body = typeof init?.body === "string" ? init.body : "";
      expect(body).not.toContain("28.99");
      expect(body).not.toContain('"current_price":28.99');
    }
  });

  it("surcharges the Group B bucket that is priced AT its own anchor", async () => {
    // "B €29 (no strike)" in PLAN_BUCKETS: msrp 2900, charged 2900. The increase applies
    // here exactly like everywhere else — €29.00 becomes €31.00. The only thing this
    // bucket does differently is show no struck-through anchor, and it already showed
    // none before the surcharge existed (2900 > 2900 is false), so nothing was lost.
    mockQuoteFetch({
      ...storedQuote(PAST),
      base_price_bucket: "B",
      msrp: 29.0,
      starting_price: 29.0,
      current_price: 29.0,
      initial_price: 29.0,
    });

    const quote = await getReportPriceQuoteForContext({
      plan: "full_report",
      quoteId: 77,
      reportToken: "rpt_ABCDEFGHIJKLMNOPQRST",
    });

    expect(quote).toEqual(
      expect.objectContaining({
        currentPriceCents: 2900,
        surchargeCents: 200,
        chargedPriceCents: 3100,
        msrpCents: 2900,
      })
    );
  });

  describe("arming the window", () => {
    it("stores a deadline on the quote and returns it", async () => {
      mockQuoteFetch(storedQuote(null));

      const deadline = await armReportUrgencyWindow({
        now: new Date("2026-08-23T12:00:00.000Z"),
        plan: "full_report",
        reportToken: "rpt_ABCDEFGHIJKLMNOPQRST",
      });

      // 12:00:00 + the three-minute window the visible timer uses
      expect(deadline).toBe("2026-08-23T12:03:00.000Z");
      const patches = mockFetchWithTimeout.mock.calls.filter(
        ([, init]) => init?.method === "PATCH"
      );
      expect(patches).toHaveLength(1);
      expect(String(patches[0]?.[1]?.body)).toContain("2026-08-23T12:03:00.000Z");
    });

    it("returns the existing deadline and writes nothing when already armed", async () => {
      mockQuoteFetch(storedQuote(FUTURE));

      const deadline = await armReportUrgencyWindow({
        plan: "full_report",
        reportToken: "rpt_ABCDEFGHIJKLMNOPQRST",
      });

      expect(deadline).toBe(FUTURE);
      expect(mockFetchWithTimeout.mock.calls.filter(([, i]) => i?.method === "PATCH")).toHaveLength(
        0
      );
    });

    it("does not extend a window that has already closed", async () => {
      // Otherwise reopening the report would hand back the lower price.
      mockQuoteFetch(storedQuote(PAST));

      const deadline = await armReportUrgencyWindow({
        now: new Date("2027-01-01T00:00:00.000Z"),
        plan: "full_report",
        reportToken: "rpt_ABCDEFGHIJKLMNOPQRST",
      });

      expect(deadline).toBe(PAST);
      expect(mockFetchWithTimeout.mock.calls.filter(([, i]) => i?.method === "PATCH")).toHaveLength(
        0
      );
    });
  });

  /**
   * "Does the +€2 land on EVERY plan?" — the reader's window belongs to the reader, not
   * to a plan, so one expired deadline has to surcharge all four tiers at once. The
   * per-plan rows are separate rows, which is exactly how the first version of this got
   * it wrong: only the plan whose own row carried the deadline was surcharged.
   */
  describe("across every plan", () => {
    const PLANS = ["essentials", "full_report", "core", "all_reports"] as const;
    // one distinct base per plan so a mixed-up row cannot pass by coincidence
    const BASE: Record<(typeof PLANS)[number], number> = {
      essentials: 9.99,
      full_report: 26.99,
      core: 39,
      all_reports: 49,
    };
    const ROW_ID: Record<(typeof PLANS)[number], number> = {
      essentials: 101,
      full_report: 102,
      core: 103,
      all_reports: 104,
    };

    function mockAllPlans(deadlineAt: string | null) {
      mockFetchWithTimeout.mockImplementation(async (url: string, init?: RequestInit) => {
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
          return createJsonResponse([{ id: 1 }]);
        }
        // the reader-wide deadline scan: only ONE plan's row carries the window,
        // proving the deadline is not read per-plan
        if (url.includes("select=metadata")) {
          return createJsonResponse([
            { metadata: {} },
            { metadata: deadlineAt ? { urgency: { deadlineAt } } : {} },
            { metadata: {} },
            { metadata: {} },
          ]);
        }
        // a distinct row id per plan, so the persist PATCH (which addresses the row
        // by id, not by plan) can be answered with the right plan's row
        const rowFor = (plan: (typeof PLANS)[number]) => ({
          ...storedQuote(null),
          id: ROW_ID[plan],
          plan,
          current_price: BASE[plan],
          initial_price: BASE[plan],
          starting_price: BASE[plan],
        });
        const planMatch = /plan=eq\.([a-z_]+)/.exec(url);
        if (planMatch) {
          return createJsonResponse([rowFor(planMatch[1] as (typeof PLANS)[number])]);
        }
        const idMatch = /id=eq\.(\d+)/.exec(url);
        if (idMatch) {
          const plan = PLANS.find((candidate) => ROW_ID[candidate] === Number(idMatch[1]));
          if (plan) return createJsonResponse([rowFor(plan)]);
        }
        if (init?.method === "PATCH" || init?.method === "POST") {
          return createJsonResponse({});
        }
        throw new Error(`Unexpected fetch call: ${url}`);
      });
    }

    it("adds two euros to all four plans from a single expired window", async () => {
      mockAllPlans(PAST);

      const quotes = await getReportPriceQuotesForContext({
        reportToken: "rpt_ABCDEFGHIJKLMNOPQRST",
      });

      for (const plan of PLANS) {
        const base = Math.round(BASE[plan] * 100);
        expect(quotes[plan], plan).toEqual(
          expect.objectContaining({
            currentPriceCents: base,
            surchargeCents: 200,
            chargedPriceCents: base + 200,
            urgencyDeadlineAt: PAST,
          })
        );
      }
    });

    it("leaves all four plans at their base price while the window is open", async () => {
      mockAllPlans(FUTURE);

      const quotes = await getReportPriceQuotesForContext({
        reportToken: "rpt_ABCDEFGHIJKLMNOPQRST",
      });

      for (const plan of PLANS) {
        const base = Math.round(BASE[plan] * 100);
        expect(quotes[plan], plan).toEqual(
          expect.objectContaining({ surchargeCents: 0, chargedPriceCents: base })
        );
      }
    });

    it("leaves all four plans at their base price with the flag off", async () => {
      mockIsFeatureEnabled.mockResolvedValue(false);
      mockAllPlans(PAST);

      const quotes = await getReportPriceQuotesForContext({
        reportToken: "rpt_ABCDEFGHIJKLMNOPQRST",
      });

      for (const plan of PLANS) {
        expect(quotes[plan], plan).toEqual(
          expect.objectContaining({
            surchargeCents: 0,
            chargedPriceCents: Math.round(BASE[plan] * 100),
          })
        );
      }
    });
  });
});
