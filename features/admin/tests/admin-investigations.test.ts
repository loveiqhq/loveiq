import { beforeEach, describe, expect, it, vi } from "vitest";

const mockVerifyAdminSession = vi.fn();
vi.mock("@features/admin/server/auth", () => ({
  verifyAdminSession: (...args: unknown[]) => mockVerifyAdminSession(...(args as [])),
}));

const mockCheckRateLimit = vi.fn();
vi.mock("@shared/http/ratelimit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

const mockVerifyCsrfToken = vi.fn();
vi.mock("@shared/http/csrf", () => ({
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

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GET, POST } from "@/app/api/admin/investigations/route";

function makeGetRequest(queryString = "") {
  return new Request(`http://localhost/api/admin/investigations${queryString}`);
}

function makePostRequest(body: unknown) {
  return new Request("http://localhost/api/admin/investigations", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-csrf-token": "token" },
    body: JSON.stringify(body),
  });
}

describe("admin investigations route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockVerifyAdminSession.mockResolvedValue({ email: "admin@test.com", role: "admin" });
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 29, resetAt: new Date() });
    mockVerifyCsrfToken.mockResolvedValue(true);
    mockLogAdminAction.mockResolvedValue(undefined);
  });

  it("returns cases with open, overdue, and priority summary counts", async () => {
    mockSupabaseFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          id: 1,
          title: "Drop in completion",
          summary: null,
          status: "needs-review",
          priority: "high",
          owner_email: "owner@test.com",
          due_date: "2000-01-01",
          submission_id: 11,
          segment_id: null,
          created_by: "admin@test.com",
          created_at: "2026-03-01T00:00:00.000Z",
          updated_at: "2026-03-02T00:00:00.000Z",
        },
        {
          id: 2,
          title: "Monitor source quality",
          summary: null,
          status: "monitoring",
          priority: "medium",
          owner_email: null,
          due_date: "2999-01-01",
          submission_id: null,
          segment_id: 5,
          created_by: "admin@test.com",
          created_at: "2026-03-03T00:00:00.000Z",
          updated_at: "2026-03-04T00:00:00.000Z",
        },
        {
          id: 3,
          title: "Closed item",
          summary: null,
          status: "closed",
          priority: "high",
          owner_email: null,
          due_date: "2000-01-01",
          submission_id: null,
          segment_id: null,
          created_by: "admin@test.com",
          created_at: "2026-03-05T00:00:00.000Z",
          updated_at: "2026-03-06T00:00:00.000Z",
        },
      ],
    });

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.cases).toHaveLength(3);
    expect(json.summary).toEqual({
      total: 3,
      open: 2,
      overdue: 1,
      highPriority: 1,
    });
  });

  it("creates an investigation case and writes an audit log", async () => {
    mockSupabaseFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: 42 }],
    });

    const res = await POST(
      makePostRequest({
        action: "create",
        title: "Question 4 regression",
        summary: "Large drop after wording change.",
        status: "needs-review",
        priority: "high",
        owner_email: "owner@test.com",
        due_date: "2026-04-10",
        submission_id: 7,
        segment_id: 2,
      })
    );

    expect(res.status).toBe(200);
    expect(mockSupabaseFetch).toHaveBeenCalledWith(
      "/rest/v1/admin_investigation_case",
      expect.objectContaining({
        method: "POST",
        headers: { Prefer: "return=representation" },
      })
    );

    const body = JSON.parse(mockSupabaseFetch.mock.calls[0][1].body);
    expect(body).toMatchObject({
      title: "Question 4 regression",
      created_by: "admin@test.com",
      priority: "high",
      submission_id: 7,
      segment_id: 2,
    });
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "create_investigation_case",
        resource_id: "42",
      })
    );
  });

  it("GET returns 401 without admin session", async () => {
    mockVerifyAdminSession.mockResolvedValue(null);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
  });

  it("GET returns 429 when rate-limited", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: new Date() });
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(429);
    expect(mockSupabaseFetch).not.toHaveBeenCalled();
  });

  it("POST returns 403 when CSRF token invalid", async () => {
    mockVerifyCsrfToken.mockResolvedValue(false);
    const res = await POST(
      makePostRequest({
        action: "create",
        title: "x",
        status: "needs-review",
        priority: "low",
      })
    );
    expect(res.status).toBe(403);
  });
});
