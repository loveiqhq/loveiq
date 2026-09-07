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
  unlockAllArchetypesForPersonalReport: vi.fn(),
  upsertArchetypeTierForPersonalReport: vi.fn(),
}));

vi.mock("@features/pricing/logic/reportPricing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@features/pricing/logic/reportPricing")>();
  return { ...actual, markReportPriceQuotePurchased: vi.fn() };
});

const { processStripeWebhookEvent } = await import("@features/checkout/server/fulfillment");
const { resolveSubmissionAccessContext, ensurePersonalReportForSubmission } =
  await import("@features/report/server/personalReport");
const { __resetStaffEmailRegexForTests } = await import("@shared/env/staff-email");

const json = (body: unknown, ok = true) => ({
  ok,
  status: ok ? 200 : 500,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

/**
 * Drive one `checkout.session.completed` through fulfillment and hand back the
 * body it tried to INSERT into `payment`.
 */
async function paymentInsertedFor(buyerEmail: string | null) {
  let inserted: Record<string, unknown> | null = null;
  mockFetchWithTimeout.mockReset();
  mockFetchWithTimeout.mockImplementation(
    async (url: string, options?: { method?: string; body?: string }) => {
      const u = String(url);
      if (u.includes("/rest/v1/payment_webhook_event") && (options?.method ?? "GET") === "GET")
        return json([]);
      if (u.includes("/rest/v1/payment_webhook_event")) return json([{ id: 1 }]);
      if (
        u.includes("/rest/v1/payment?stripe_charge_id=eq.") ||
        u.includes("/rest/v1/payment?stripe_payment_intent_id=eq.")
      ) {
        return json([]);
      }
      if (options?.method === "POST" && u.endsWith("/rest/v1/payment")) {
        inserted = JSON.parse(options.body ?? "{}") as Record<string, unknown>;
        return json([{ id: 41 }]);
      }
      if (u.includes("/rest/v1/payment_item"))
        return options?.method === "POST" ? json([{ id: 5 }]) : json([]);
      // everything else this path touches is irrelevant to the flag
      return json([]);
    }
  );

  vi.mocked(resolveSubmissionAccessContext).mockResolvedValue({
    submissionId: 3,
    userId: 11,
    userEmail: "owner@example.com",
  } as never);
  vi.mocked(ensurePersonalReportForSubmission).mockResolvedValue({ id: 7 } as never);

  const session = {
    id: "cs_test_flag",
    amount_total: 0,
    currency: "eur",
    customer: null,
    customer_details: buyerEmail ? { email: buyerEmail } : null,
    discounts: [],
    metadata: {
      plan: "full_report",
      reportToken: "rpt_ABCDEFGHIJKLMNOPQRST",
      requestIp: "127.0.0.1",
      requestUserAgent: "Mozilla/5.0 (Vitest)",
    },
    payment_intent: null,
    payment_status: "no_payment_required",
    total_details: { amount_discount: 0 },
  };

  await processStripeWebhookEvent({
    event: {
      id: `evt_flag_${buyerEmail ?? "none"}`,
      type: "checkout.session.completed",
      data: { object: { id: "cs_test_flag", metadata: session.metadata } },
    } as never,
    stripe: {
      charges: { retrieve: vi.fn() },
      checkout: { sessions: { retrieve: vi.fn().mockResolvedValue(session) } },
      paymentIntents: { retrieve: vi.fn() },
    } as never,
  }).catch(() => {
    /* later fulfillment steps are stubbed out; the INSERT is what is under test */
  });

  return inserted;
}

/**
 * `is_test` gates ~30 admin revenue/KPI/digest queries and nothing wrote it
 * between 2026-05-02 and 2026-09-07, so every internal purchase counted as real
 * revenue. These assert it is decided from the address that actually paid.
 */
describe("payment.is_test is written from the buyer's email", () => {
  beforeEach(() => {
    __resetStaffEmailRegexForTests();
    delete process.env.ADMIN_TEST_EMAIL_REGEX;
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key-for-tests";
  });

  it("flags a staff purchase as a test", async () => {
    const row = await paymentInsertedFor("eman.cickusic@loveiq.org");
    expect(row).not.toBeNull();
    expect(row?.is_test).toBe(true);
  });

  it("does NOT flag a real customer", async () => {
    const row = await paymentInsertedFor("someone@gmail.com");
    expect(row).not.toBeNull();
    expect(row?.is_test).toBe(false);
  });

  it("treats a missing email as a real customer — never hide money", async () => {
    const row = await paymentInsertedFor(null);
    expect(row).not.toBeNull();
    expect(row?.is_test).toBe(false);
  });

  it("honours ADMIN_TEST_EMAIL_REGEX", async () => {
    process.env.ADMIN_TEST_EMAIL_REGEX = "^.+@example\\.test$";
    __resetStaffEmailRegexForTests();
    expect((await paymentInsertedFor("qa@example.test"))?.is_test).toBe(true);
    expect((await paymentInsertedFor("eman.cickusic@loveiq.org"))?.is_test).toBe(false);
  });
});
