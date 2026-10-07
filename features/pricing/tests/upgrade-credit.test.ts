import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFetchWithTimeout = vi.fn();
vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: (...args: unknown[]) => mockFetchWithTimeout(...args),
}));
vi.mock("@shared/http/circuit-breaker", () => ({
  getBreaker: () => ({ fire: (fn: () => Promise<unknown>) => fn() }),
}));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  applyUpgradeCredit,
  getUpgradeCreditCents,
  type ReportPriceQuoteSnapshot,
} from "@features/pricing/logic/reportPricing";

const payments = (...rows: Array<Record<string, unknown>>) => ({
  ok: true,
  json: async () => rows,
});

const quote = (plan: "full_report" | "all_reports", chargedPriceCents: number) =>
  ({
    id: 1,
    plan,
    chargedPriceCents,
    currentPriceCents: chargedPriceCents,
  }) as ReportPriceQuoteSnapshot;

/**
 * Two singles on the lower list (€29.98) cost more than All 14 (€19.99), and report 165
 * bought three in one night: All 14 now credits what was already paid on the report.
 */
describe("upgrade credit towards All 14", () => {
  beforeEach(() => {
    mockFetchWithTimeout.mockReset();
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key-for-tests";
  });

  it("adds up the singles paid, less refunds, and nothing else", async () => {
    mockFetchWithTimeout.mockResolvedValueOnce(
      payments(
        { amount: 14.99, refund_amount: null, currency: "eur", metadata: { plan: "full_report" } },
        {
          amount: "29.99",
          refund_amount: "10.00",
          currency: "EUR",
          metadata: { plan: "full_report" },
        },
        // The plan being bought never credits itself.
        { amount: 19.99, refund_amount: null, currency: "EUR", metadata: { plan: "all_reports" } },
        // A comp or a team test adds nothing.
        { amount: 0, refund_amount: null, currency: "EUR", metadata: { plan: "full_report" } },
        { amount: 9.99, refund_amount: null, currency: "USD", metadata: { plan: "full_report" } },
        // Legacy plans count like singles.
        { amount: 5.49, refund_amount: null, currency: "EUR", metadata: { plan: "essentials" } }
      )
    );
    expect(await getUpgradeCreditCents(165)).toBe(1499 + 1999 + 549);
    const url = String(mockFetchWithTimeout.mock.calls[0]![0]);
    expect(url).toContain("personal_report_id=eq.165");
    expect(url).toContain("status=eq.succeeded");
    expect(url).toContain("is_test=is.false");
  });

  it("takes a single off All 14: €19.99 after a €14.99 single is €5.00", () => {
    const credited = applyUpgradeCredit(quote("all_reports", 1999), 1499);
    expect(credited.chargedPriceCents).toBe(500);
    expect(credited.upgradeCreditCents).toBe(1499);
  });

  it("makes All 14 free when the singles already cost more, never negative", () => {
    const credited = applyUpgradeCredit(quote("all_reports", 1999), 2998);
    expect(credited.chargedPriceCents).toBe(0);
    expect(credited.upgradeCreditCents).toBe(1999);
  });

  it("credits a remainder under Stripe's €0.50 minimum too", () => {
    const credited = applyUpgradeCredit(quote("all_reports", 1999), 1960);
    expect(credited.chargedPriceCents).toBe(0);
    expect(credited.upgradeCreditCents).toBe(1999);
  });

  it("leaves a single, and All 14 with nothing paid, as they are", () => {
    const single = quote("full_report", 1499);
    expect(applyUpgradeCredit(single, 1499)).toBe(single);
    const all = quote("all_reports", 1999);
    expect(applyUpgradeCredit(all, 0)).toBe(all);
  });
});
