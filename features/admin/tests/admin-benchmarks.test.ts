import { beforeEach, describe, expect, it, vi } from "vitest";

const mockVerifyAdminSession = vi.fn();
vi.mock("@features/admin/server/auth", () => ({
  verifyAdminSession: (...args: unknown[]) => mockVerifyAdminSession(...(args as [])),
}));

const mockCheckRateLimit = vi.fn();
vi.mock("@/lib/ratelimit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

const mockVerifyCsrfToken = vi.fn();
vi.mock("@/lib/csrf", () => ({
  verifyCsrfToken: (...args: unknown[]) => mockVerifyCsrfToken(...(args as [])),
}));

const mockSupabaseFetch = vi.fn();
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (...args: unknown[]) => mockSupabaseFetch(...args),
}));

const mockLogAdminAction = vi.fn();
vi.mock("@features/admin/server/audit", () => ({
  logAdminAction: (...args: unknown[]) => mockLogAdminAction(...args),
}));

const mockFetchMetricValue = vi.fn();
const mockLoadBenchmarkDefinitions = vi.fn();
vi.mock("@features/admin/server/metric-library", () => ({
  ADMIN_METRIC_OPTIONS: [{ key: "completion_rate", label: "Completion Rate" }],
  fetchMetricValue: (...args: unknown[]) => mockFetchMetricValue(...(args as [])),
  loadBenchmarkDefinitions: (...args: unknown[]) => mockLoadBenchmarkDefinitions(...(args as [])),
}));

vi.mock("@/lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GET, POST } from "@/app/api/admin/benchmarks/route";

describe("admin benchmarks route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockVerifyAdminSession.mockResolvedValue({ email: "admin@test.com", role: "admin" });
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 29, resetAt: new Date() });
    mockVerifyCsrfToken.mockResolvedValue(true);
    mockLogAdminAction.mockResolvedValue(undefined);
    mockFetchMetricValue.mockResolvedValue(68);
    mockLoadBenchmarkDefinitions.mockResolvedValue([
      { key: "completion_rate", label: "Completion Rate", targetValue: 72, warningValue: 60 },
    ]);
  });

  it("returns benchmarks with live metric values", async () => {
    mockSupabaseFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          id: 1,
          metric_key: "completion_rate",
          label: "Completion Rate",
          description: "Internal benchmark",
          source_name: "Internal",
          source_url: null,
          benchmark_type: "internal",
          target_value: 72,
          warning_value: 60,
          direction: "higher",
          unit: "percent",
          is_active: true,
          admin_email: "admin@test.com",
          created_at: "2026-03-30T12:00:00.000Z",
          updated_at: "2026-03-30T12:00:00.000Z",
        },
      ],
    });

    const res = await GET(new Request("http://localhost/api/admin/benchmarks"));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.benchmarks[0].current_value).toBe(68);
    expect(json.activeDefinitions[0].key).toBe("completion_rate");
  });

  it("creates a benchmark and writes an audit log", async () => {
    mockSupabaseFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: 7 }],
    });

    const res = await POST(
      new Request("http://localhost/api/admin/benchmarks", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": "token" },
        body: JSON.stringify({
          action: "create",
          metric_key: "completion_rate",
          label: "Completion Rate",
          source_name: "Internal",
          benchmark_type: "internal",
          target_value: 72,
          warning_value: 60,
          direction: "higher",
          unit: "percent",
        }),
      })
    );

    expect(res.status).toBe(200);
    expect(mockSupabaseFetch).toHaveBeenCalledWith(
      "/rest/v1/admin_metric_benchmark",
      expect.objectContaining({ method: "POST" })
    );
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "create_metric_benchmark",
        resource_id: "7",
      })
    );
  });

  it("GET returns 401 without admin session", async () => {
    mockVerifyAdminSession.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/admin/benchmarks"));
    expect(res.status).toBe(401);
  });

  it("GET returns 429 when rate-limited", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: new Date() });
    const res = await GET(new Request("http://localhost/api/admin/benchmarks"));
    expect(res.status).toBe(429);
    expect(mockSupabaseFetch).not.toHaveBeenCalled();
  });

  it("POST returns 403 for viewer role (benchmarks require editor)", async () => {
    mockVerifyAdminSession.mockResolvedValue({ email: "v@test.com", role: "viewer" });
    const res = await POST(
      new Request("http://localhost/api/admin/benchmarks", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": "token" },
        body: JSON.stringify({
          action: "create",
          metric_key: "completion_rate",
          label: "Completion Rate",
          source_name: "Internal",
          benchmark_type: "internal",
          target_value: 72,
          warning_value: 60,
          direction: "higher",
          unit: "percent",
        }),
      })
    );
    expect(res.status).toBe(403);
  });
});
