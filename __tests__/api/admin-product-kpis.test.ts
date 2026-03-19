import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

const mockVerifyAdminSession = vi.fn();
vi.mock("../../lib/admin/auth", () => ({
  verifyAdminSession: (...args: unknown[]) => mockVerifyAdminSession(...(args as [])),
}));

const mockCheckRateLimit = vi.fn();
vi.mock("../../lib/ratelimit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("../../lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GET } from "../../app/api/admin/product-kpis/route";

// --- Helpers ---

function makeRequest() {
  return new Request("http://localhost/api/admin/product-kpis");
}

// --- Tests ---

describe("GET /api/admin/product-kpis", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockVerifyAdminSession.mockResolvedValue({ email: "admin@test.com", role: "admin" });
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 29, resetAt: new Date() });
  });

  it("returns 401 when not authenticated", async () => {
    mockVerifyAdminSession.mockResolvedValue(null);

    const res = await GET(makeRequest());
    expect(res.status).toBe(401);

    const json = await res.json();
    expect(json.error).toBe("Unauthorized.");
  });

  it("returns 403 when role is insufficient", async () => {
    mockVerifyAdminSession.mockResolvedValue({ email: "nobody@test.com", role: "none" });

    const res = await GET(makeRequest());
    expect(res.status).toBe(403);

    const json = await res.json();
    expect(json.error).toBe("Forbidden.");
  });

  it("returns 429 when rate limited", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: new Date() });

    const res = await GET(makeRequest());
    expect(res.status).toBe(429);

    const json = await res.json();
    expect(json.error).toBe("Please try again later.");
  });

  it("returns KPI data with all three datasets", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json).toHaveProperty("reportSections");
    expect(json).toHaveProperty("questions");
    expect(json).toHaveProperty("chapters");
    expect(Array.isArray(json.reportSections)).toBe(true);
    expect(Array.isArray(json.questions)).toBe(true);
    expect(Array.isArray(json.chapters)).toBe(true);
  });

  it("returns correct counts", async () => {
    const res = await GET(makeRequest());
    const json = await res.json();

    expect(json.reportSections.length).toBe(32);
    expect(json.questions.length).toBe(61);
    expect(json.chapters.length).toBe(15);
  });

  it("report sections have expected shape", async () => {
    const res = await GET(makeRequest());
    const json = await res.json();
    const first = json.reportSections[0];

    expect(first).toMatchObject({
      index: 1,
      section: "Welcome",
      reachN: 5000,
    });
    expect(first).toHaveProperty("frictionIndex");
    expect(first).toHaveProperty("dropoffPct");
    expect(first).toHaveProperty("avgActiveTimeS");
  });

  it("chapters with no data have null fields", async () => {
    const res = await GET(makeRequest());
    const json = await res.json();
    // Chapter 4 (Arousal Nonconcordance) has no IYS data
    const ch4 = json.chapters.find((c: { cId: string }) => c.cId === "4");

    expect(ch4).toBeDefined();
    expect(ch4.entryN).toBeNull();
    expect(ch4.completionPct).toBeNull();
    expect(ch4.frictionIndex).toBeNull();
  });

  it("allows viewer role access", async () => {
    mockVerifyAdminSession.mockResolvedValue({ email: "viewer@test.com", role: "viewer" });

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
  });
});
