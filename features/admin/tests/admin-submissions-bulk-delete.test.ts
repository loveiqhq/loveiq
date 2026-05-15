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

vi.mock("@features/admin/server/audit", () => ({
  logAdminAction: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@features/admin/server/delete-submission", () => ({
  deleteSubmissionCascade: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock("@features/admin/server/test-submission", () => ({
  evaluateTestSubmission: vi.fn().mockReturnValue({ isLikelyTest: true, reasons: ["staff-email"] }),
}));

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { POST } from "@/app/api/admin/submissions/bulk-delete/route";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/admin/submissions/bulk-delete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("admin submissions bulk-delete route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockVerifyAdminSession.mockResolvedValue({ email: "admin@test.com", role: "admin" });
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 4, resetAt: new Date() });
    mockVerifyCsrfToken.mockResolvedValue(true);
  });

  it("returns 401 without admin session", async () => {
    mockVerifyAdminSession.mockResolvedValue(null);
    const res = await POST(makeRequest({ submissionIds: [1, 2] }));
    expect(res.status).toBe(401);
  });

  it("returns 403 for editor role (bulk-delete is admin-only)", async () => {
    mockVerifyAdminSession.mockResolvedValue({ email: "e@test.com", role: "editor" });
    const res = await POST(makeRequest({ submissionIds: [1, 2] }));
    expect(res.status).toBe(403);
  });

  it("returns 403 for viewer role", async () => {
    mockVerifyAdminSession.mockResolvedValue({ email: "v@test.com", role: "viewer" });
    const res = await POST(makeRequest({ submissionIds: [1, 2] }));
    expect(res.status).toBe(403);
  });

  it("returns 403 when CSRF token is invalid", async () => {
    mockVerifyCsrfToken.mockResolvedValue(false);
    const res = await POST(makeRequest({ submissionIds: [1, 2] }));
    expect(res.status).toBe(403);
  });

  it("returns 429 when rate-limited", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: new Date() });
    const res = await POST(makeRequest({ submissionIds: [1, 2] }));
    expect(res.status).toBe(429);
  });

  it("returns 400 when submissionIds is not an array", async () => {
    const res = await POST(makeRequest({ submissionIds: "not-an-array" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when submissionIds is empty", async () => {
    const res = await POST(makeRequest({ submissionIds: [] }));
    expect(res.status).toBe(400);
  });
});
