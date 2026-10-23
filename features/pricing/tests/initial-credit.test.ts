import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFetchWithTimeout = vi.fn();
vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: (...args: Parameters<typeof mockFetchWithTimeout>) =>
    mockFetchWithTimeout(...args),
}));
vi.mock("@shared/http/circuit-breaker", () => ({
  getBreaker: () => ({ fire: (fn: () => Promise<unknown>) => fn() }),
}));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@features/report/server/personalReport", () => ({
  ensurePersonalReportForSubmission: vi.fn(),
  resolveSubmissionAccessContext: vi.fn(),
  lookupReportTokenBySubmissionId: vi.fn().mockResolvedValue(null),
}));

import {
  applyInitialCredit,
  getReportCredits,
  getReportPriceQuoteForContext,
  pricingArmForReport,
  type ReportPriceQuoteSnapshot,
} from "@features/pricing/logic/reportPricing";
import {
  ensurePersonalReportForSubmission,
  resolveSubmissionAccessContext,
} from "@features/report/server/personalReport";

const json = (body: unknown, ok = true) => ({ ok, json: async () => body }) as Response;

const quote = (
  plan: "full_report" | "all_reports",
  chargedPriceCents: number,
  experimentGroup: "A3" | "B3" = "A3"
) =>
  ({
    id: 1,
    plan,
    experimentGroup,
    chargedPriceCents,
    currentPriceCents: chargedPriceCents,
  }) as ReportPriceQuoteSnapshot;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SUPABASE_URL = "https://test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
});

/** The initial unlock: EUR 1.99 for the Core Archetype, and EUR 10 off the full report. */
describe("the initial unlock's credit", () => {
  it("is EUR 10 for a report with a paid initial unlock, beside the All 14 credit", async () => {
    mockFetchWithTimeout.mockResolvedValueOnce(
      json([{ amount: 1.99, refund_amount: null, currency: "EUR", metadata: { plan: "initial" } }])
    );
    expect(await getReportCredits(165)).toEqual({ upgradeCents: 199, initialCents: 1000 });
  });

  it("goes with a refund in full, but survives a partial one", async () => {
    mockFetchWithTimeout.mockResolvedValueOnce(
      json([{ amount: 1.99, refund_amount: 1.99, currency: "EUR", metadata: { plan: "initial" } }])
    );
    expect((await getReportCredits(165)).initialCents).toBe(0);
    mockFetchWithTimeout.mockResolvedValueOnce(
      json([{ amount: 1.99, refund_amount: 0.5, currency: "EUR", metadata: { plan: "initial" } }])
    );
    expect((await getReportCredits(165)).initialCents).toBe(1000);
  });

  it("is EUR 10 for the day-4 gift too (E07): a EUR 0 initial row marked gifted", async () => {
    mockFetchWithTimeout.mockResolvedValueOnce(
      json([
        {
          amount: 0,
          refund_amount: null,
          currency: "EUR",
          metadata: { plan: "initial", gifted: "e07", unlockSource: "e07_gift" },
        },
      ])
    );
    expect(await getReportCredits(165)).toEqual({ upgradeCents: 0, initialCents: 1000 });
  });

  it("counts only succeeded, non-test rows, and no other EUR 0 initial row", async () => {
    mockFetchWithTimeout.mockResolvedValueOnce(
      json([{ amount: 0, refund_amount: null, currency: "EUR", metadata: { plan: "initial" } }])
    );
    expect((await getReportCredits(165)).initialCents).toBe(0);
    // A refunded or a staff test row never comes back from the read at all.
    const url = String(mockFetchWithTimeout.mock.calls[0]![0]);
    expect(url).toContain("status=eq.succeeded");
    expect(url).toContain("is_test=is.false");
  });

  it("is nothing without an initial unlock", async () => {
    mockFetchWithTimeout.mockResolvedValueOnce(
      json([
        { amount: 29.99, refund_amount: null, currency: "EUR", metadata: { plan: "full_report" } },
      ])
    );
    expect((await getReportCredits(165)).initialCents).toBe(0);
  });

  it("is used up by the first full report bought: one EUR 10, not one per report", async () => {
    // Marcus, 14.10: a EUR 10 voucher toward the full report. Bought once (own archetype or
    // another's), the next single report is quoted at its list price; All 14 still counts
    // every euro paid.
    mockFetchWithTimeout.mockResolvedValueOnce(
      json([
        { amount: 1.99, refund_amount: null, currency: "EUR", metadata: { plan: "initial" } },
        {
          amount: 19.99,
          refund_amount: null,
          currency: "EUR",
          metadata: { plan: "full_report", initialCredit: "10.00" },
        },
      ])
    );
    expect(await getReportCredits(165)).toEqual({ upgradeCents: 2198, initialCents: 0 });
  });

  it("comes back when that full report is refunded: the refunded row is no longer read", async () => {
    mockFetchWithTimeout.mockResolvedValueOnce(
      json([{ amount: 1.99, refund_amount: null, currency: "EUR", metadata: { plan: "initial" } }])
    );
    expect((await getReportCredits(165)).initialCents).toBe(1000);
    expect(String(mockFetchWithTimeout.mock.calls[0]![0])).toContain("status=eq.succeeded");
  });

  it("takes EUR 10 off the full report: EUR 29.99 is EUR 19.99", () => {
    const credited = applyInitialCredit(quote("full_report", 2999), 1000);
    expect(credited.chargedPriceCents).toBe(1999);
    expect(credited.upgradeCreditCents).toBe(1000);
    expect(credited.creditKind).toBe("initial");
  });

  it("never goes below nothing, and credits a remainder under Stripe's minimum", () => {
    expect(applyInitialCredit(quote("full_report", 499), 1000).chargedPriceCents).toBe(0);
    expect(applyInitialCredit(quote("full_report", 1040), 1000).chargedPriceCents).toBe(0);
    expect(applyInitialCredit(quote("full_report", 1040), 1000).upgradeCreditCents).toBe(1040);
  });

  it("credits arm A3 alone: a B3 full report (EUR 4.99) is never made free", () => {
    const b3 = quote("full_report", 499, "B3");
    expect(applyInitialCredit(b3, 1000)).toBe(b3);
  });

  it("leaves All 14, and a report without the unlock, as they are", () => {
    const all = quote("all_reports", 3999);
    expect(applyInitialCredit(all, 1000)).toBe(all);
    const single = quote("full_report", 2999);
    expect(applyInitialCredit(single, 0)).toBe(single);
  });
});

describe("a pay-to-start reader's quotes", () => {
  // Report 9 falls in arm B3 by its hash (reportPricing.test.ts).
  beforeEach(() => {
    vi.mocked(resolveSubmissionAccessContext).mockResolvedValue({
      submissionId: 42,
      userEmail: "user@example.com",
      userId: 7,
    });
    vi.mocked(ensurePersonalReportForSubmission).mockResolvedValue({ id: 9 } as never);
  });

  function routeQuoteFetches({
    entitlement,
    payments,
    cohortAt = null,
    storedQuote = null,
  }: {
    entitlement: unknown[];
    payments: unknown[];
    cohortAt?: string | null;
    storedQuote?: Record<string, unknown> | null;
  }) {
    const created: Record<string, unknown>[] = [];
    mockFetchWithTimeout.mockImplementation(
      async (url: string, options?: { body?: string; method?: string }) => {
        if (url.includes("/rest/v1/prepaid_report_access?consumed_submission_id=eq.42")) {
          return json(entitlement);
        }
        if (url.includes("/rest/v1/personal_report?id=eq.9&select=initial_gate_cohort_at")) {
          return json([{ initial_gate_cohort_at: cohortAt, initial_gate_seen_at: null }]);
        }
        if (
          storedQuote &&
          url.includes("/rest/v1/report_price_quote?personal_report_id=eq.9&plan=eq.full_report")
        ) {
          return json([storedQuote]);
        }
        if (
          storedQuote &&
          options?.method === "PATCH" &&
          url.includes(`/rest/v1/report_price_quote?id=eq.${String(storedQuote.id)}`)
        ) {
          return json([{ ...storedQuote, ...(JSON.parse(options.body ?? "{}") as object) }]);
        }
        if (url.includes("/rest/v1/payment?personal_report_id=eq.9")) return json(payments);
        if (url.includes("select=metadata")) return json([]);
        if (url.includes("/rest/v1/system_flags")) return json([]);
        if (url.includes("/rest/v1/survey_submission?id=eq.42")) {
          return json([
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
          return json([]);
        }
        if (url.includes("/rest/v1/report_session?personal_report_id=eq.9")) return json([]);
        if (url.includes("/rest/v1/report_price_quote?personal_report_id=eq.9&plan=eq.")) {
          return json([]);
        }
        if (options?.method === "POST" && url.includes("/rest/v1/report_price_quote")) {
          const payload = JSON.parse(options.body ?? "{}") as Record<string, unknown>;
          created.push(payload);
          return json([
            {
              id: 91,
              personal_report_id: 9,
              survey_submission_id: 42,
              user_id: 7,
              ...payload,
              checkout_started_at: null,
              purchased_at: null,
            },
          ]);
        }
        throw new Error(`Unexpected fetch call: ${options?.method ?? "GET"} ${url}`);
      }
    );
    return created;
  }

  it("prices a pay-to-start report on arm A3, whatever its hash", async () => {
    expect(pricingArmForReport(9)).toBe("B3");
    const created = routeQuoteFetches({ entitlement: [{ id: 5, offer: "pre" }], payments: [] });
    const result = await getReportPriceQuoteForContext({ plan: "full_report", submissionId: 42 });
    expect(result?.experimentGroup).toBe("A3");
    expect(result?.chargedPriceCents).toBe(2999);
    expect(created[0]).toEqual(expect.objectContaining({ experiment_group: "A3" }));
  });

  it("leaves every other reader on their hash arm", async () => {
    routeQuoteFetches({ entitlement: [], payments: [] });
    const result = await getReportPriceQuoteForContext({ plan: "full_report", submissionId: 42 });
    expect(result?.experimentGroup).toBe("B3");
  });

  it("prices a reader of the EUR 1.99 gate on arm A3, when the report route says so", async () => {
    const created = routeQuoteFetches({ entitlement: [], payments: [] });
    const result = await getReportPriceQuoteForContext({
      initialGateCohort: true,
      plan: "full_report",
      submissionId: 42,
    });
    expect(result?.experimentGroup).toBe("A3");
    expect(created[0]).toEqual(expect.objectContaining({ experiment_group: "A3" }));
    // Told, so not asked: no read of the cohort stamp.
    const urls = mockFetchWithTimeout.mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.includes("select=initial_gate_cohort_at"))).toBe(false);
  });

  it("looks the gate's cohort up when the caller does not say (a cron's first quote)", async () => {
    routeQuoteFetches({ entitlement: [], payments: [], cohortAt: "2026-10-20T09:00:00.000Z" });
    const result = await getReportPriceQuoteForContext({ plan: "full_report", submissionId: 42 });
    expect(result?.experimentGroup).toBe("A3");
  });

  it("prices an initial unlock's holder on arm A3: EUR 19.99 for the full report", async () => {
    routeQuoteFetches({
      entitlement: [],
      payments: [
        { amount: 1.99, refund_amount: null, currency: "EUR", metadata: { plan: "initial" } },
      ],
    });
    const result = await getReportPriceQuoteForContext({ plan: "full_report", submissionId: 42 });
    expect(result?.experimentGroup).toBe("A3");
    expect(result?.chargedPriceCents).toBe(1999);
    expect(result?.creditKind).toBe("initial");
  });

  it("keeps a stored B3 quote's arm: EUR 4.99 and no credit, initial unlock or not", async () => {
    routeQuoteFetches({
      entitlement: [],
      payments: [
        { amount: 1.99, refund_amount: null, currency: "EUR", metadata: { plan: "initial" } },
      ],
      cohortAt: "2026-10-20T09:00:00.000Z",
      storedQuote: STORED_B3_FULL_REPORT,
    });
    const result = await getReportPriceQuoteForContext({
      now: new Date("2026-10-21T10:00:00.000Z"),
      plan: "full_report",
      submissionId: 42,
    });
    expect(result?.experimentGroup).toBe("B3");
    expect(result?.chargedPriceCents).toBe(499);
    expect(result?.upgradeCreditCents).toBeUndefined();
    expect(result?.creditKind).toBeUndefined();
  });

  it("quotes the initial unlock's buyer EUR 19.99 for the full report", async () => {
    routeQuoteFetches({
      entitlement: [{ id: 5, offer: "pre" }],
      payments: [
        { amount: 1.99, refund_amount: null, currency: "EUR", metadata: { plan: "initial" } },
      ],
    });
    const result = await getReportPriceQuoteForContext({
      plan: "full_report",
      strictUpgradeCredit: true,
      submissionId: 42,
    });
    expect(result?.chargedPriceCents).toBe(1999);
    expect(result?.upgradeCreditCents).toBe(1000);
    expect(result?.creditKind).toBe("initial");
  });
});

/** A full-report quote already stored on arm B3 (EUR 4.99), as in reportPricing.test.ts. */
const STORED_B3_FULL_REPORT = {
  id: 77,
  personal_report_id: 9,
  survey_submission_id: 42,
  user_id: 7,
  plan: "full_report",
  currency: "EUR",
  experiment_group: "B3",
  forced_paywall_arm: null,
  base_price_bucket: "B3",
  base_price: 4.99,
  msrp: 4.99,
  starting_price: 4.99,
  current_price: 4.99,
  initial_price: 4.99,
  discount_step: 0,
  discount_multiplier: 1,
  pricing_cluster_id: "B3-full_report-B3-tier_2-desktop-google-serious-engaged-d0",
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
  initial_price_timestamp: "2026-10-20T09:00:00.000Z",
  expires_at: "2026-11-20T09:00:00.000Z",
  checkout_started_at: null,
  purchased_at: null,
  metadata: null,
  view_count: 1,
};
