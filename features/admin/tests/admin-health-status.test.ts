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

const mockBuildHealthStatusSnapshot = vi.fn();
vi.mock("@features/admin/server/health", () => ({
  buildHealthStatusSnapshot: (...args: unknown[]) => mockBuildHealthStatusSnapshot(...args),
}));

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GET } from "@/app/api/admin/health/status/route";

describe("admin health/status route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyAdminSession.mockResolvedValue({ email: "admin@test.com", role: "admin" });
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 59, resetAt: new Date() });
    mockBuildHealthStatusSnapshot.mockResolvedValue({ services: [] });
  });

  it("returns 401 without admin session", async () => {
    mockVerifyAdminSession.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/admin/health/status"));
    expect(res.status).toBe(401);
  });

  it("returns 403 for viewer role (health is admin-only)", async () => {
    mockVerifyAdminSession.mockResolvedValue({ email: "v@test.com", role: "viewer" });
    const res = await GET(new Request("http://localhost/api/admin/health/status"));
    expect(res.status).toBe(403);
  });

  it("returns 429 when rate-limited", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: new Date() });
    const res = await GET(new Request("http://localhost/api/admin/health/status"));
    expect(res.status).toBe(429);
    expect(mockBuildHealthStatusSnapshot).not.toHaveBeenCalled();
  });

  it("returns 200 with the snapshot payload", async () => {
    const snapshot = { services: [{ name: "Survey Pipeline", status: "healthy" }] };
    mockBuildHealthStatusSnapshot.mockResolvedValue(snapshot);
    const res = await GET(new Request("http://localhost/api/admin/health/status"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(snapshot);
  });

  it("returns 500 when the snapshot builder throws", async () => {
    mockBuildHealthStatusSnapshot.mockRejectedValue(new Error("downstream"));
    const res = await GET(new Request("http://localhost/api/admin/health/status"));
    expect(res.status).toBe(500);
  });
});
