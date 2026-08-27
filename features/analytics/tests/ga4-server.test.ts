import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockFetchWithTimeout = vi.fn();
vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: (...args: unknown[]) => mockFetchWithTimeout(...args),
}));

import { sendGa4PurchaseEvent } from "@features/analytics/server/ga4";

const baseInput = {
  clientId: "123456789.1600000000",
  sessionId: "1600000000",
  consentGranted: true,
  transactionId: "cs_test_abc123",
  value: 14.99,
  currency: "EUR",
  itemName: "Full Report",
};

describe("sendGa4PurchaseEvent", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.GA4_API_SECRET = "test-secret";
    delete process.env.GA4_MEASUREMENT_ID;
    // Every test below asserts behaviour of the LIVE site, so it has to look like
    // the live site: the send now refuses to run anywhere else. Without these two
    // the three "skips when X" tests would pass for the wrong reason — the
    // environment guard would short-circuit before their condition was ever read.
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.loveiq.org");
    mockFetchWithTimeout.mockResolvedValue({ ok: true, status: 204 });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  /**
   * The one analytics send that is not gated by app/layout.tsx, because it runs in
   * the Stripe webhook rather than in a browser. Staging shares the production
   * Supabase database and can receive Stripe test-mode webhooks, so without this a
   * sandbox test purchase would arrive in the real GA4 property as revenue — and
   * GA4 purchases feed Google Ads, so it would arrive as a conversion the bidding
   * algorithm optimises on.
   */
  it.each([
    ["staging", "https://staging.loveiq.org"],
    ["a Vercel preview", "https://loveiq-abc123-loveiq.vercel.app"],
    ["a local production build", "http://localhost:3000"],
  ])("refuses to send from %s, even with the secret and consent present", async (_name, url) => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", url);
    await sendGa4PurchaseEvent(baseInput);
    expect(mockFetchWithTimeout).not.toHaveBeenCalled();
  });

  it("refuses to send from local dev", async () => {
    vi.stubEnv("NODE_ENV", "development");
    await sendGa4PurchaseEvent(baseInput);
    expect(mockFetchWithTimeout).not.toHaveBeenCalled();
  });

  it("skips (no send) when GA4_API_SECRET is unset", async () => {
    delete process.env.GA4_API_SECRET;
    await sendGa4PurchaseEvent(baseInput);
    expect(mockFetchWithTimeout).not.toHaveBeenCalled();
  });

  it("skips when analytics consent was not granted", async () => {
    await sendGa4PurchaseEvent({ ...baseInput, consentGranted: false });
    expect(mockFetchWithTimeout).not.toHaveBeenCalled();
  });

  it("skips when there is no GA client_id", async () => {
    await sendGa4PurchaseEvent({ ...baseInput, clientId: null });
    expect(mockFetchWithTimeout).not.toHaveBeenCalled();
  });

  it("posts a well-formed purchase event when secret + consent + client_id are present", async () => {
    await sendGa4PurchaseEvent({
      ...baseInput,
      params: { plan: "full_report", experiment_group: "B" },
    });

    expect(mockFetchWithTimeout).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetchWithTimeout.mock.calls[0]!;
    expect(url).toContain("https://www.google-analytics.com/mp/collect");
    expect(url).toContain("measurement_id=G-QTYY69L46N");
    expect(url).toContain("api_secret=test-secret");

    const body = JSON.parse((options as { body: string }).body);
    expect(body.client_id).toBe("123456789.1600000000");
    expect(body.events).toHaveLength(1);
    const event = body.events[0];
    expect(event.name).toBe("purchase");
    expect(event.params.transaction_id).toBe("cs_test_abc123");
    expect(event.params.value).toBe(14.99);
    expect(event.params.currency).toBe("EUR");
    expect(event.params.session_id).toBe("1600000000");
    expect(event.params.engagement_time_msec).toBe(1);
    expect(event.params.items).toEqual([{ item_name: "Full Report", price: 14.99, quantity: 1 }]);
    expect(event.params.plan).toBe("full_report");
    expect(event.params.experiment_group).toBe("B");
  });

  it("uses GA4_MEASUREMENT_ID override when set", async () => {
    process.env.GA4_MEASUREMENT_ID = "G-OVERRIDE99";
    await sendGa4PurchaseEvent(baseInput);
    const [url] = mockFetchWithTimeout.mock.calls[0]!;
    expect(url).toContain("measurement_id=G-OVERRIDE99");
  });

  it("omits session_id when absent and drops empty/undefined extra params", async () => {
    await sendGa4PurchaseEvent({
      ...baseInput,
      sessionId: null,
      params: { plan: "essentials", archetype: undefined, traffic_source: "" },
    });
    const body = JSON.parse((mockFetchWithTimeout.mock.calls[0]![1] as { body: string }).body);
    const params = body.events[0].params;
    expect(params.session_id).toBeUndefined();
    expect(params.plan).toBe("essentials");
    expect("archetype" in params).toBe(false);
    expect("traffic_source" in params).toBe(false);
  });

  it("never throws when the network call rejects", async () => {
    mockFetchWithTimeout.mockRejectedValue(new Error("network down"));
    await expect(sendGa4PurchaseEvent(baseInput)).resolves.toBeUndefined();
  });

  it("does not throw on a non-2xx response", async () => {
    mockFetchWithTimeout.mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve("bad request"),
    });
    await expect(sendGa4PurchaseEvent(baseInput)).resolves.toBeUndefined();
  });
});
