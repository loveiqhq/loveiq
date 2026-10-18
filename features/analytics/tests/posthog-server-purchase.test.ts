import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
const mockFetchWithTimeout = vi.fn();
vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: (...args: unknown[]) => mockFetchWithTimeout(...args),
}));

import { sendPosthogPurchaseEvent } from "@features/analytics/server/posthog";

const purchase = {
  email: "Buyer@Example.com",
  transactionId: "cs_test_1",
  value: 29,
  currency: "EUR",
  plan: "full_report",
  itemName: "LoveIQ Survey & Report",
};

function sent(): Array<{
  event: string;
  distinct_id: string;
  properties: Record<string, unknown>;
}> {
  return mockFetchWithTimeout.mock.calls.map(([, init]) =>
    JSON.parse((init as { body: string }).body)
  );
}

beforeEach(() => {
  mockFetchWithTimeout.mockReset();
  mockFetchWithTimeout.mockResolvedValue({ ok: true, text: async () => "" });
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "phc_test");
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://eu.i.posthog.com");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("sendPosthogPurchaseEvent", () => {
  it("links the anonymous visitor to the buyer before the purchase, when it paid first", async () => {
    // Pay to start pays before the survey that identifies the visitor: without the link the
    // purchase sits on a person with no ad and no landing page behind it.
    await sendPosthogPurchaseEvent({ ...purchase, anonDistinctId: "019a-anon-visitor" });
    expect(sent().map((b) => b.event)).toEqual(["$identify", "purchase"]);
    expect(sent()[0]).toMatchObject({
      distinct_id: "buyer@example.com",
      properties: { $anon_distinct_id: "019a-anon-visitor" },
    });
    expect(sent()[1]).toMatchObject({ distinct_id: "buyer@example.com" });
  });

  it("sends the purchase alone without an anonymous id, or when it is the email itself", async () => {
    await sendPosthogPurchaseEvent(purchase);
    await sendPosthogPurchaseEvent({ ...purchase, anonDistinctId: "buyer@example.com" });
    expect(sent().map((b) => b.event)).toEqual(["purchase", "purchase"]);
  });

  it("still sends the purchase when the link fails", async () => {
    mockFetchWithTimeout
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValue({ ok: true, text: async () => "" });
    await sendPosthogPurchaseEvent({ ...purchase, anonDistinctId: "019a-anon-visitor" });
    expect(sent().map((b) => b.event)).toEqual(["$identify", "purchase"]);
  });
});
