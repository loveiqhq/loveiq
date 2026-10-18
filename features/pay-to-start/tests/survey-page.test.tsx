import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockHeaders } = vi.hoisted(() => ({ mockHeaders: vi.fn() }));
vi.mock("next/headers", () => ({ headers: () => mockHeaders() }));
vi.mock("@shared/observability/recordVisit", () => ({ recordSurveyPageView: vi.fn() }));
vi.mock("@features/survey/ui/SurveyPage", () => ({ default: () => null }));
vi.mock("@features/pay-to-start/server/entitlement", () => ({ findEntitlementByToken: vi.fn() }));

import Page from "@/app/survey/page";
import {
  findEntitlementByToken,
  type Entitlement,
} from "@features/pay-to-start/server/entitlement";

const TOKEN = `rpp_${"k".repeat(32)}`;

function row(overrides: Partial<Entitlement> = {}): Entitlement {
  return {
    id: 7,
    prepaid_token: TOKEN,
    plan: "full_report",
    status: "succeeded",
    offer: "full",
    landing_variant: "sexual-archetype",
    stripe_session_id: "cs_test_1",
    stripe_payment_intent_id: "pi_test_1",
    payment_id: null,
    consumed_submission_id: null,
    consumed_at: null,
    amount_cents: 2900,
    list_price_cents: 2900,
    currency: "EUR",
    customer_email: "buyer@example.com",
    is_test: false,
    paid_at: "2026-10-18T10:05:00.000Z",
    utm_tracker: null,
    created_at: "2026-10-18T10:00:00.000Z",
    ...overrides,
  };
}

async function journeyFor(cookie: string | null) {
  mockHeaders.mockResolvedValue(new Headers(cookie ? { cookie } : {}));
  const element = (await Page()) as { props: { journey: unknown } };
  return element.props.journey;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("/survey for a visitor who paid before it", () => {
  it("tells the survey about an unused, paid entitlement", async () => {
    vi.mocked(findEntitlementByToken).mockResolvedValue(row());
    expect(await journeyFor(`__Host-liq_pp=${TOKEN}`)).toEqual({
      kind: "pay_to_start",
      paid: true,
    });
  });

  it("and about one whose payment is still settling", async () => {
    vi.mocked(findEntitlementByToken).mockResolvedValue(row({ status: "pending" }));
    expect(await journeyFor(`__liq_pp=${TOKEN}`)).toEqual({ kind: "pay_to_start", paid: false });
  });

  it("says nothing for one already used, refunded or expired", async () => {
    for (const overrides of [
      { consumed_submission_id: 42 },
      { status: "refunded" as const },
      { status: "expired" as const },
    ]) {
      vi.mocked(findEntitlementByToken).mockResolvedValue(row(overrides));
      expect(await journeyFor(`__liq_pp=${TOKEN}`)).toBeNull();
    }
  });

  it("asks nothing of the database without a well-formed cookie", async () => {
    expect(await journeyFor(null)).toBeNull();
    expect(await journeyFor("__liq_pp=rpp_short")).toBeNull();
    expect(findEntitlementByToken).not.toHaveBeenCalled();
  });

  it("leaves the survey as it is when the lookup fails", async () => {
    vi.mocked(findEntitlementByToken).mockRejectedValue(new Error("db down"));
    expect(await journeyFor(`__liq_pp=${TOKEN}`)).toBeNull();
  });
});
