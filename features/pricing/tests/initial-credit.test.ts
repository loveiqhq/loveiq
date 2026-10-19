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

const quote = (plan: "full_report" | "all_reports", chargedPriceCents: number) =>
  ({
    id: 1,
    plan,
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

  it("is nothing without an initial unlock", async () => {
    mockFetchWithTimeout.mockResolvedValueOnce(
      json([
        { amount: 29.99, refund_amount: null, currency: "EUR", metadata: { plan: "full_report" } },
      ])
    );
    expect((await getReportCredits(165)).initialCents).toBe(0);
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
  }: {
    entitlement: unknown[];
    payments: unknown[];
  }) {
    const created: Record<string, unknown>[] = [];
    mockFetchWithTimeout.mockImplementation(
      async (url: string, options?: { body?: string; method?: string }) => {
        if (url.includes("/rest/v1/prepaid_report_access?consumed_submission_id=eq.42")) {
          return json(entitlement);
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
