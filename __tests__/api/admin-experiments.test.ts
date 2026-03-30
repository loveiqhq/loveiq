import { beforeEach, describe, expect, it, vi } from "vitest";

const mockVerifyAdminSession = vi.fn();
vi.mock("../../lib/admin/auth", () => ({
  verifyAdminSession: (...args: unknown[]) => mockVerifyAdminSession(...(args as [])),
}));

const mockCheckRateLimit = vi.fn();
vi.mock("../../lib/ratelimit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

const mockVerifyCsrfToken = vi.fn();
vi.mock("../../lib/csrf", () => ({
  verifyCsrfToken: (...args: unknown[]) => mockVerifyCsrfToken(...(args as [])),
}));

const mockSupabaseFetch = vi.fn();
vi.mock("../../lib/admin/supabase", () => ({
  supabaseFetch: (...args: unknown[]) => mockSupabaseFetch(...args),
}));

const mockLogAdminAction = vi.fn();
vi.mock("../../lib/admin/audit", () => ({
  logAdminAction: (...args: unknown[]) => mockLogAdminAction(...args),
}));

const mockFetchMetricValue = vi.fn();
vi.mock("../../lib/admin/metric-library", () => ({
  ADMIN_METRIC_OPTIONS: [{ key: "completion_rate", label: "Completion Rate" }],
  fetchMetricValue: (...args: unknown[]) => mockFetchMetricValue(...(args as [])),
}));

vi.mock("../../lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GET, POST } from "../../app/api/admin/experiments/route";

describe("admin experiments route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockVerifyAdminSession.mockResolvedValue({ email: "admin@test.com", role: "admin" });
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 29, resetAt: new Date() });
    mockVerifyCsrfToken.mockResolvedValue(true);
    mockLogAdminAction.mockResolvedValue(undefined);
    mockFetchMetricValue.mockResolvedValue(72);
  });

  it("returns experiments summary", async () => {
    mockSupabaseFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            id: 1,
            name: "Intro framing",
            hypothesis: "Better framing improves starts.",
            owner_email: "owner@test.com",
            segment_id: 2,
            primary_metric_key: "completion_rate",
            status: "active",
            start_date: null,
            decision_date: "2026-04-05",
            expected_impact: null,
            result_summary: null,
            outcome: null,
            created_at: "2026-03-30T10:00:00.000Z",
            updated_at: "2026-03-30T10:00:00.000Z",
            admin_email: "admin@test.com",
            admin_experiment_metric: [
              { metric_key: "completion_rate", metric_role: "primary" },
              { metric_key: "waitlist_signups", metric_role: "guardrail" },
            ],
          },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: 2, name: "New users" }],
      });

    const res = await GET(new Request("http://localhost/api/admin/experiments"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.summary.active).toBe(1);
    expect(json.experiments[0].segment_name).toBe("New users");
    expect(json.experiments[0].guardrail_metric_keys).toEqual(["waitlist_signups"]);
  });

  it("creates an experiment and writes an audit log", async () => {
    mockSupabaseFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => 42,
    });

    const res = await POST(
      new Request("http://localhost/api/admin/experiments", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": "token" },
        body: JSON.stringify({
          action: "create",
          name: "Pricing copy",
          hypothesis: "Copy change improves conversion.",
          primary_metric_key: "completion_rate",
        }),
      })
    );

    expect(res.status).toBe(200);
    expect(mockSupabaseFetch).toHaveBeenCalledWith(
      "/rest/v1/rpc/admin_upsert_experiment",
      expect.objectContaining({ method: "POST" })
    );
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "create_experiment",
        resource_id: "42",
      })
    );
  });

  it("updates an experiment from normalized metric rows", async () => {
    mockSupabaseFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            id: 42,
            name: "Pricing copy",
            hypothesis: "Copy change improves conversion.",
            owner_email: null,
            segment_id: null,
            primary_metric_key: "completion_rate",
            status: "draft",
            start_date: null,
            decision_date: null,
            expected_impact: null,
            result_summary: null,
            outcome: null,
            created_at: "2026-03-30T10:00:00.000Z",
            updated_at: "2026-03-30T10:00:00.000Z",
            admin_email: "admin@test.com",
            admin_experiment_metric: [
              { metric_key: "completion_rate", metric_role: "primary" },
              { metric_key: "waitlist_signups", metric_role: "guardrail" },
            ],
          },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => 42,
      });

    const res = await POST(
      new Request("http://localhost/api/admin/experiments", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": "token" },
        body: JSON.stringify({
          action: "update",
          experimentId: 42,
          status: "active",
        }),
      })
    );

    expect(res.status).toBe(200);
    expect(mockSupabaseFetch).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("/rest/v1/admin_experiment?id=eq.42"),
      expect.objectContaining({ headers: { Range: "0-0" } })
    );
    expect(mockSupabaseFetch).toHaveBeenNthCalledWith(
      2,
      "/rest/v1/rpc/admin_upsert_experiment",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"p_guardrail_metric_keys":["waitlist_signups"]'),
      })
    );
  });
});
