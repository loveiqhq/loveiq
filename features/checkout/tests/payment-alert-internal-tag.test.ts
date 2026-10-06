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
 * Drives one fully-discounted `checkout.session.completed` through fulfillment and hands
 * back every line it posted to the ops Slack channel.
 */
let runCounter = 0;

async function opsAlertsFor(buyerEmail: string | null): Promise<string[]> {
  const posted: string[] = [];
  // notifySlack suppresses an identical (channel, kind, first-100-chars) line for 60
  // seconds, and every promo alert here is identical but for the tag. Give each run its
  // own code so that dedup — which is correct, and which we are not testing — stays out
  // of the way.
  const code = `LIQ-100-TESTONLY-${(runCounter += 1)}`;
  mockFetchWithTimeout.mockReset();
  mockFetchWithTimeout.mockImplementation(
    async (url: string, options?: { method?: string; body?: string }) => {
      const u = String(url);
      if (u.includes("hooks.slack.com")) {
        const payload = JSON.parse(options?.body ?? "{}") as { text?: string };
        if (payload.text) posted.push(payload.text);
        return { ok: true, status: 200, json: async () => ({}), text: async () => "ok" };
      }
      if (u.includes("/rest/v1/payment_webhook_event") && (options?.method ?? "GET") === "GET")
        return json([]);
      if (u.includes("/rest/v1/payment_webhook_event")) return json([{ id: 1 }]);
      if (
        u.includes("/rest/v1/payment?stripe_charge_id=eq.") ||
        u.includes("/rest/v1/payment?stripe_payment_intent_id=eq.")
      ) {
        return json([]);
      }
      if (options?.method === "POST" && u.endsWith("/rest/v1/payment")) return json([{ id: 395 }]);
      if (u.includes("/rest/v1/payment_item"))
        return options?.method === "POST" ? json([{ id: 5 }]) : json([]);
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
    id: `cs_test_tag_${runCounter}`,
    amount_total: 0,
    currency: "eur",
    customer: null,
    customer_details: buyerEmail ? { email: buyerEmail } : null,
    // A 100%-off promotion code, exactly the shape behind the 35 pings.
    discounts: [
      {
        promotion_code: { id: `promo_${runCounter}`, code },
        coupon: { id: "nurture_100", name: "Post-call unlock", percent_off: 100 },
      },
    ],
    metadata: {
      plan: "full_report",
      reportToken: "rpt_ABCDEFGHIJKLMNOPQRST",
      promoStage: "post_call",
      requestIp: "127.0.0.1",
      requestUserAgent: "Mozilla/5.0 (Vitest)",
    },
    payment_intent: null,
    payment_status: "no_payment_required",
    total_details: { amount_discount: 2900 },
  };

  await processStripeWebhookEvent({
    event: {
      id: `evt_tag_${runCounter}`,
      type: "checkout.session.completed",
      data: { object: { id: `cs_test_tag_${runCounter}`, metadata: session.metadata } },
    } as never,
    stripe: {
      charges: { retrieve: vi.fn() },
      checkout: { sessions: { retrieve: vi.fn().mockResolvedValue(session) } },
      paymentIntents: { retrieve: vi.fn() },
    } as never,
  }).catch(() => {
    /* later fulfillment steps are stubbed; the Slack line is what is under test */
  });

  return posted;
}

const promoLine = (lines: string[]) => lines.find((t) => t.includes("redeemed")) ?? "";

/**
 * In the fortnight to 2026-09-14, THIRTY-FIVE of the thirty-eight
 * ":tag: Promo redeemed (100% off)" messages in #prod-alerts were internal sandbox runs,
 * written to the database as `is_test = true` and posted to Slack as though they were
 * customer money. The database knew; the alert did not say.
 */
describe("an ops alert says when the payment was one of ours", () => {
  beforeEach(() => {
    __resetStaffEmailRegexForTests();
    delete process.env.ADMIN_TEST_EMAIL_REGEX;
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key-for-tests";
    process.env.NODE_ENV = "production";
    process.env.SLACK_OPS_WEBHOOK_URL = "https://hooks.slack.com/services/T000/B000/not-real";
  });

  it("marks a staff purchase as internal", async () => {
    const line = promoLine(await opsAlertsFor("eman.cickusic@loveiq.org"));
    expect(line).toContain("redeemed");
    expect(line).toContain("[internal]");
  });

  /** The half that matters most: real money must never be dismissed as a test. */
  it("does NOT mark a real customer's purchase", async () => {
    const line = promoLine(await opsAlertsFor("buyer@gmail.com"));
    expect(line).toContain("redeemed");
    expect(line).not.toContain("[internal]");
  });

  /** No address is not evidence of a test. Same rule as the `is_test` column. */
  it("treats a missing email as a real customer", async () => {
    const line = promoLine(await opsAlertsFor(null));
    expect(line).toContain("redeemed");
    expect(line).not.toContain("[internal]");
  });

  it("honours ADMIN_TEST_EMAIL_REGEX, like the column does", async () => {
    process.env.ADMIN_TEST_EMAIL_REGEX = "^qa@partner\\.example$";
    __resetStaffEmailRegexForTests();
    expect(promoLine(await opsAlertsFor("qa@partner.example"))).toContain("[internal]");
    expect(promoLine(await opsAlertsFor("eman.cickusic@loveiq.org"))).not.toContain("[internal]");
  });
});
