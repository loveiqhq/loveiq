import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const fetchWithTimeout = vi.fn();
vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: (...args: unknown[]) => fetchWithTimeout(...args),
}));

import { complete } from "@features/brain/server/llm";

/**
 * A real free-tier 429, as the OpenAI-compatible Gemini endpoint sends it: a top-level
 * ARRAY, and three `details` entries with `RetryInfo` last — past character 1300.
 */
const REAL_429_BODY = JSON.stringify([
  {
    error: {
      code: 429,
      message:
        "You exceeded your current quota, please check your plan and billing details. " +
        "For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits. " +
        "To monitor your current usage, head to: https://ai.dev/rate-limit. \n" +
        "* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, " +
        "limit: 5, model: gemini-3.6-flash\nPlease retry in 32.652110245s.",
      status: "RESOURCE_EXHAUSTED",
      details: [
        {
          "@type": "type.googleapis.com/google.rpc.Help",
          links: [
            {
              description: "Learn more about Gemini API quotas",
              url: "https://ai.google.dev/gemini-api/docs/rate-limits",
            },
          ],
        },
        {
          "@type": "type.googleapis.com/google.rpc.QuotaFailure",
          violations: [
            {
              quotaMetric: "generativelanguage.googleapis.com/generate_content_free_tier_requests",
              quotaId: "GenerateRequestsPerMinutePerProjectPerModel-FreeTier",
              quotaDimensions: { model: "gemini-3.6-flash", location: "global" },
              quotaValue: "5",
            },
          ],
        },
        { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "32s" },
      ],
    },
  },
]);

beforeEach(() => {
  fetchWithTimeout.mockReset();
  process.env.BRAIN_LLM_KEY = "test-key-not-a-real-credential";
});
afterEach(() => {
  delete process.env.BRAIN_LLM_KEY;
});

describe("complete — what a 429 tells the caller", () => {
  /**
   * THE CALL SITE, not the parser.
   *
   * `parseRetryAfterMs` can be perfect and this still return undefined, because the first
   * version handed it a copy of the body truncated to 600 characters — and `RetryInfo`
   * lands at 1325. The result is a "no hint" that is indistinguishable from a provider
   * that sent none, so the miner never waits and the whole feature is inert while every
   * unit test stays green. Assert on what `complete` actually returns.
   */
  it("surfaces the retry delay from a real 429, whose hint is 1300 characters in", async () => {
    expect(REAL_429_BODY.indexOf("retryDelay")).toBeGreaterThan(600);
    fetchWithTimeout.mockResolvedValue({
      ok: false,
      status: 429,
      headers: { get: () => null },
      text: async () => REAL_429_BODY,
    });

    const res = await complete([{ role: "user", content: "hi" }], 1000);

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe("rate_limited");
    expect(res.retryAfterMs).toBe(32_000);
  });

  it("prefers an explicit retry-after header", async () => {
    fetchWithTimeout.mockResolvedValue({
      ok: false,
      status: 429,
      headers: { get: (h: string) => (h === "retry-after" ? "7" : null) },
      text: async () => REAL_429_BODY,
    });

    const res = await complete([{ role: "user", content: "hi" }], 1000);

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.retryAfterMs).toBe(7_000);
  });

  /** A 429 with nothing to go on stays terminal — the caller must not invent a wait. */
  it("reports no delay when the provider sends no hint at all", async () => {
    fetchWithTimeout.mockResolvedValue({
      ok: false,
      status: 429,
      headers: { get: () => null },
      text: async () => "Too Many Requests",
    });

    const res = await complete([{ role: "user", content: "hi" }], 1000);

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe("rate_limited");
    expect(res.retryAfterMs).toBeUndefined();
  });

  /** A non-429 failure never carries a delay, so it can never be mistaken for a pause. */
  it("never attaches a retry delay to an ordinary error", async () => {
    fetchWithTimeout.mockResolvedValue({
      ok: false,
      status: 503,
      headers: { get: () => "5" },
      text: async () => '{"retryDelay":"5s"}',
    });

    const res = await complete([{ role: "user", content: "hi" }], 1000);

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe("error");
    expect(res.retryAfterMs).toBeUndefined();
  });
});
