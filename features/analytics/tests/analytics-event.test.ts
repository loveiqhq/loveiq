import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@shared/http/csrf", () => ({
  verifyCsrfToken: vi.fn().mockResolvedValue(true),
  verifyCsrfTokenFromBody: vi.fn().mockResolvedValue(true),
}));

vi.mock("@shared/http/ratelimit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 59, resetAt: new Date() }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

const mockSupabaseFetch = vi.fn();
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (...args: unknown[]) => mockSupabaseFetch(...args),
}));

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { POST } from "@/app/api/analytics-event/route";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/analytics-event", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-csrf-token": "valid-token",
    },
    body: JSON.stringify(body),
  });
}

function mockSubmissionLookup(submissionId: number) {
  mockSupabaseFetch.mockImplementation((url: string) => {
    if (url.includes(`/rest/v1/survey_submission?id=eq.${submissionId}`)) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([{ id: submissionId }]),
      });
    }
    if (url.includes("/rest/v1/analytics_event")) {
      return Promise.resolve({ ok: true });
    }
    return Promise.resolve({ ok: false, status: 500 });
  });
}

describe("POST /api/analytics-event — allowlist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSubmissionLookup(42);
  });

  it("accepts price_shown with full pricing-cluster metadata", async () => {
    const res = await POST(
      makeRequest({
        event_type: "price_shown",
        submission_id: 42,
        metadata: {
          plan: "full_report",
          price: 9.99,
          currency: "EUR",
          bucket: "A",
          pricing_cluster_id: "B-full_report-A-tier_2-iOS-google-engaged-d0",
          discount_step: 0,
          experiment_group: "B",
          msrp: 69.99,
          initial_price: 9.99,
        },
      })
    );
    expect(res.status).toBe(204);
    expect(mockSupabaseFetch).toHaveBeenCalledWith(
      "/rest/v1/analytics_event",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"event_type":"price_shown"'),
      })
    );
  });

  it("rejects unknown event types with 400", async () => {
    const res = await POST(
      makeRequest({
        event_type: "made_up_event",
        submission_id: 42,
      })
    );
    expect(res.status).toBe(400);
    expect(mockSupabaseFetch).not.toHaveBeenCalled();
  });

  it("does not allowlist landing_page_view server-side (GA4-only event)", async () => {
    // landing_page_view fires before any submission exists; it has no FK target
    // and so is intentionally not persisted to analytics_event.
    const res = await POST(
      makeRequest({
        event_type: "landing_page_view",
        submission_id: 42,
      })
    );
    expect(res.status).toBe(400);
    expect(mockSupabaseFetch).not.toHaveBeenCalled();
  });
});
