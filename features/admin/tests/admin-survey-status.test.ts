import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

const mockVerifyAdminSession = vi.fn();
vi.mock("@features/admin/server/auth", () => ({
  verifyAdminSession: (...args: unknown[]) => mockVerifyAdminSession(...(args as [])),
}));

vi.mock("@features/admin/server/audit", () => ({
  logAdminAction: vi.fn().mockResolvedValue(undefined),
}));

const mockSupabaseFetch = vi.fn();
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (...args: unknown[]) => mockSupabaseFetch(...args),
}));

const mockVerifyCsrf = vi.fn<() => Promise<boolean>>();
vi.mock("@/lib/csrf", () => ({
  verifyCsrfToken: (...args: unknown[]) => mockVerifyCsrf(...(args as [])),
}));

const mockCheckRateLimit = vi.fn();
vi.mock("@/lib/ratelimit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("@/lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GET, PATCH } from "@/app/api/admin/survey-status/route";

// --- Helpers ---

function makeGetRequest() {
  return new Request("http://localhost/api/admin/survey-status");
}

function makePatchRequest(body: unknown) {
  return new Request("http://localhost/api/admin/survey-status", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// --- Tests ---

describe("GET /api/admin/survey-status", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockVerifyAdminSession.mockResolvedValue({ email: "admin@test.com", role: "admin" });
    mockVerifyCsrf.mockResolvedValue(true);
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 29, resetAt: new Date() });
  });

  it("returns 401 when not authenticated", async () => {
    mockVerifyAdminSession.mockResolvedValue(null);

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
  });

  it("returns 500 when Supabase query fails", async () => {
    mockSupabaseFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(500);

    const json = await res.json();
    expect(json.error).toBe("Unable to load status.");
  });

  it("returns 404 when no survey exists", async () => {
    mockSupabaseFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(404);

    const json = await res.json();
    expect(json.error).toBe("No survey found.");
  });

  it("returns active: true for active survey", async () => {
    mockSupabaseFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: 1, status: "active" }],
    });

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json).toEqual({ id: 1, active: true });
  });

  it("returns active: false for closed survey", async () => {
    mockSupabaseFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: 1, status: "closed" }],
    });

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json).toEqual({ id: 1, active: false });
  });

  it("returns 429 when rate-limited", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: new Date() });
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(429);
    expect(mockSupabaseFetch).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/admin/survey-status", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.SURVEY_CLOSE_PASSWORD = "test-close-pw";
    mockVerifyAdminSession.mockResolvedValue({ email: "admin@test.com", role: "admin" });
    mockVerifyCsrf.mockResolvedValue(true);
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 29, resetAt: new Date() });
  });

  it("returns 401 when not authenticated", async () => {
    mockVerifyAdminSession.mockResolvedValue(null);

    const res = await PATCH(makePatchRequest({ active: true }));
    expect(res.status).toBe(401);
  });

  it("returns 403 when CSRF is invalid", async () => {
    mockVerifyCsrf.mockResolvedValue(false);

    const res = await PATCH(makePatchRequest({ active: true }));
    expect(res.status).toBe(403);

    const json = await res.json();
    expect(json.error).toBe("Invalid request.");
  });

  it("returns 400 when active is not a boolean", async () => {
    const res = await PATCH(makePatchRequest({ active: "yes" }));
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error).toBe("Invalid input.");
  });

  it("returns 400 when active is missing", async () => {
    const res = await PATCH(makePatchRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 404 when no survey exists", async () => {
    mockSupabaseFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });

    const res = await PATCH(makePatchRequest({ active: true }));
    expect(res.status).toBe(404);

    const json = await res.json();
    expect(json.error).toBe("No survey found.");
  });

  it("returns success when toggling to active", async () => {
    // Survey lookup
    mockSupabaseFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: 1 }],
    });
    // PATCH update
    mockSupabaseFetch.mockResolvedValueOnce({ ok: true });

    const res = await PATCH(makePatchRequest({ active: true }));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
  });

  it("returns success when toggling to closed with correct password", async () => {
    mockSupabaseFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: 1 }],
    });
    mockSupabaseFetch.mockResolvedValueOnce({ ok: true });

    const res = await PATCH(makePatchRequest({ active: false, closePassword: "test-close-pw" }));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
  });

  it("returns 403 when closing without password", async () => {
    const res = await PATCH(makePatchRequest({ active: false }));
    expect(res.status).toBe(403);

    const json = await res.json();
    expect(json.error).toBe("Invalid authorization password.");
  });

  it("returns 403 when closing with wrong password", async () => {
    const res = await PATCH(makePatchRequest({ active: false, closePassword: "wrong" }));
    expect(res.status).toBe(403);

    const json = await res.json();
    expect(json.error).toBe("Invalid authorization password.");
  });

  it("returns 403 when SURVEY_CLOSE_PASSWORD env var is not set", async () => {
    delete process.env.SURVEY_CLOSE_PASSWORD;

    const res = await PATCH(makePatchRequest({ active: false, closePassword: "anything" }));
    expect(res.status).toBe(403);
  });

  it("returns 500 when survey lookup fails", async () => {
    mockSupabaseFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    const res = await PATCH(makePatchRequest({ active: true }));
    expect(res.status).toBe(500);

    const json = await res.json();
    expect(json.error).toBe("Unable to find survey.");
  });

  it("returns 500 when PATCH update fails", async () => {
    mockSupabaseFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: 1 }],
    });
    mockSupabaseFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    const res = await PATCH(makePatchRequest({ active: true }));
    expect(res.status).toBe(500);

    const json = await res.json();
    expect(json.error).toBe("Unable to update.");
  });
});
