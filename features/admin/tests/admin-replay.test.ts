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

const mockSupabaseFetch = vi.fn();
const mockFetchAllRows = vi.fn();
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (...args: unknown[]) => mockSupabaseFetch(...args),
  fetchAllRows: (...args: unknown[]) => mockFetchAllRows(...args),
}));

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GET } from "@/app/api/admin/replay/route";

describe("admin replay route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyAdminSession.mockResolvedValue({ email: "admin@test.com", role: "admin" });
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 29, resetAt: new Date() });
  });

  it("returns 401 without admin session", async () => {
    mockVerifyAdminSession.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/admin/replay"));
    expect(res.status).toBe(401);
  });

  it("allows viewer role (read-only behavior replay)", async () => {
    mockVerifyAdminSession.mockResolvedValue({ email: "v@test.com", role: "viewer" });
    mockFetchAllRows.mockResolvedValue([]);
    const res = await GET(new Request("http://localhost/api/admin/replay"));
    expect(res.status).toBe(200);
  });

  it("returns 429 when rate-limited", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: new Date() });
    const res = await GET(new Request("http://localhost/api/admin/replay"));
    expect(res.status).toBe(429);
    expect(mockSupabaseFetch).not.toHaveBeenCalled();
  });

  it("returns 200 with empty list when no behavior events match", async () => {
    mockFetchAllRows.mockResolvedValue([]);
    const res = await GET(new Request("http://localhost/api/admin/replay"));
    expect(res.status).toBe(200);
  });

  it("lists a recent window, newest first", async () => {
    // It read the table with no filter and `order=event_time.asc` behind a
    // 1,000-row cap, so every session an admin could open was from the nine
    // days after launch and nothing since had ever appeared.
    mockFetchAllRows.mockResolvedValue([]);
    await GET(new Request("http://localhost/api/admin/replay"));

    const path = String(mockFetchAllRows.mock.calls[0]?.[0]);
    expect(path).toContain("survey_behavior_event");
    expect(path, "must be windowed").toMatch(/event_time=gte\./);
    expect(path, "newest first").toContain("order=event_time.desc");
  });

  it("reports each session's real first and last event, whatever the row order", async () => {
    // The summary used to take events[0] and events[at end] positionally, which
    // was only right while the query was ascending. Flipping the order would
    // have swapped every session's start and end silently.
    const ev = (t: string) => ({
      session_id: "s1",
      q_id: "q1",
      direction: "forward",
      time_spent_ms: 10,
      answered: true,
      event_time: t,
      question_index: 1,
    });
    mockFetchAllRows.mockResolvedValue([
      ev("2026-09-10T12:00:00.000Z"),
      ev("2026-09-10T10:00:00.000Z"),
      ev("2026-09-10T11:00:00.000Z"),
    ]);

    const body = (await (await GET(new Request("http://localhost/api/admin/replay"))).json()) as {
      sessions: Array<{ firstEvent: string; lastEvent: string }>;
    };

    expect(body.sessions[0]!.firstEvent).toBe("2026-09-10T10:00:00.000Z");
    expect(body.sessions[0]!.lastEvent).toBe("2026-09-10T12:00:00.000Z");
  });
});
