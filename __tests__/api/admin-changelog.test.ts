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

vi.mock("../../lib/admin/format", () => ({
  maskEmail: (value: string) => value.replace(/(^.).+(@.*$)/, "$1***$2"),
}));

vi.mock("../../lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GET, PATCH, POST } from "../../app/api/admin/changelog/route";

describe("admin changelog route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockVerifyAdminSession.mockResolvedValue({ email: "admin@test.com", role: "admin" });
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 29, resetAt: new Date() });
    mockVerifyCsrfToken.mockResolvedValue(true);
    mockLogAdminAction.mockResolvedValue(undefined);
  });

  it("returns changelog, annotations, and decisions", async () => {
    mockSupabaseFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            id: 1,
            title: "Release 5.3",
            description: "Updated scoring rollout.",
            category: "feature",
            admin_email: "admin@test.com",
            event_date: "2026-03-30",
            created_at: "2026-03-30T12:00:00.000Z",
          },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            id: 9,
            admin_email: "admin@test.com",
            owner_email: "owner@test.com",
            title: "Promote scoring calibration v5.3",
            entry_type: "scoring-change",
            status: "monitoring",
            rationale: "Agreement improved in staging.",
            expected_impact: "Raise confidence",
            observed_effect: null,
            change_summary: "Threshold tuning",
            review_window_days: 14,
            linked_release_id: 1,
            linked_experiment_id: null,
            evidence_links: [],
            created_at: "2026-03-30T12:00:00.000Z",
            updated_at: "2026-03-30T12:00:00.000Z",
          },
        ],
      });

    const res = await GET(new Request("http://localhost/api/admin/changelog"));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.summary.changelogCount).toBe(1);
    expect(json.summary.scoringGovernanceCount).toBe(1);
    expect(json.decisions[0].entryType).toBe("scoring-change");
  });

  it("creates a decision journal entry", async () => {
    mockSupabaseFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: 12 }],
    });

    const res = await POST(
      new Request("http://localhost/api/admin/changelog", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": "token" },
        body: JSON.stringify({
          kind: "decision",
          entryType: "decision",
          title: "Ship new intro flow",
          rationale: "Higher start rate in experiment.",
          expectedImpact: "Lift completion",
          status: "approved",
        }),
      })
    );

    expect(res.status).toBe(200);
    expect(mockSupabaseFetch).toHaveBeenCalledWith(
      "/rest/v1/admin_decision_entry",
      expect.objectContaining({ method: "POST" })
    );
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "create_decision_entry",
        resource_id: "12",
      })
    );
  });

  it("updates a decision journal entry", async () => {
    mockSupabaseFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: 12 }],
    });

    const res = await PATCH(
      new Request("http://localhost/api/admin/changelog", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-csrf-token": "token" },
        body: JSON.stringify({
          id: 12,
          status: "validated",
          observedEffect: "Completion improved after release.",
        }),
      })
    );

    expect(res.status).toBe(200);
    expect(mockSupabaseFetch).toHaveBeenCalledWith(
      "/rest/v1/admin_decision_entry?id=eq.12",
      expect.objectContaining({ method: "PATCH" })
    );
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "update_decision_entry",
        resource_id: "12",
      })
    );
  });

  it("GET returns 401 without admin session", async () => {
    mockVerifyAdminSession.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/admin/changelog"));
    expect(res.status).toBe(401);
  });

  it("GET returns 429 when rate-limited", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: new Date() });
    const res = await GET(new Request("http://localhost/api/admin/changelog"));
    expect(res.status).toBe(429);
    expect(mockSupabaseFetch).not.toHaveBeenCalled();
  });

  it("POST returns 403 when CSRF token invalid", async () => {
    mockVerifyCsrfToken.mockResolvedValue(false);
    const res = await POST(
      new Request("http://localhost/api/admin/changelog", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": "token" },
        body: JSON.stringify({
          kind: "decision",
          entryType: "decision",
          title: "x",
          rationale: "x",
          expectedImpact: "x",
          status: "approved",
        }),
      })
    );
    expect(res.status).toBe(403);
  });
});
