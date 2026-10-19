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
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (...args: unknown[]) => mockSupabaseFetch(...args),
  fetchAllRows: vi.fn(),
  countRows: vi.fn(),
  POSTGREST_MAX_ROWS: 1000,
}));
const mockLogger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock("@shared/observability/logger", () => ({ default: mockLogger }));

import { GET } from "@/app/api/admin/ap/unlock-feedback/route";

const json = (body: unknown, status = 200) => ({
  ok: status < 400,
  status,
  headers: new Headers(),
  json: async () => body,
});

const THIS = "2026-10-12";
const PREV = "2026-10-05";
const answered = {
  day: THIS,
  arm: "A",
  sent_at: `${THIS}T08:00:00Z`,
  delivered_at: `${THIS}T08:00:05Z`,
  reason: "later",
  answered_at: `${THIS}T09:00:00Z`,
  loads: 1,
  chips: [],
  note: "Ring me on 0151 2345678",
  unlocked_at: `${THIS}T09:00:01Z`,
  device: "mobile",
  after: { reached: {}, read_ms: 0, closed: 0, ups: 0, downs: 0, shared: false },
};
let previousFails = false;

const url = `http://localhost/api/admin/ap/unlock-feedback?period=custom&from=${THIS}&to=2026-10-18`;

beforeEach(() => {
  vi.clearAllMocks();
  previousFails = false;
  mockVerifyAdminSession.mockResolvedValue({ email: "mb@loveiq.org", role: "viewer" });
  mockCheckRateLimit.mockResolvedValue({ allowed: true });
  mockSupabaseFetch.mockImplementation(async (path: string, init?: { body?: string }) => {
    if (path !== "/rest/v1/rpc/ap_unlock_feedback") return json(null, 404);
    const { p_from } = JSON.parse(init?.body ?? "{}") as { p_from?: string };
    if (p_from === PREV && previousFails) return json({ message: "boom" }, 500);
    return json({
      rows: p_from === THIS ? [answered] : [],
      paid: [],
      first_sent: "2026-09-01",
    });
  });
});

describe("GET /api/admin/ap/unlock-feedback", () => {
  it("answers 401 without a session and 429 over the limit, reading nothing", async () => {
    mockVerifyAdminSession.mockResolvedValueOnce(null);
    expect((await GET(new Request(url))).status).toBe(401);
    mockCheckRateLimit.mockResolvedValueOnce({ allowed: false });
    expect((await GET(new Request(url))).status).toBe(429);
    expect(mockSupabaseFetch).not.toHaveBeenCalled();
    expect(mockCheckRateLimit.mock.calls[0]![1]).toMatchObject({
      bucket: "admin-ap-unlock-feedback",
    });
  });

  it("reads the range and the period before, and is never cached", async () => {
    const res = await GET(new Request(url));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store, max-age=0");
    const bodies = mockSupabaseFetch.mock.calls
      .map(([, init]) => JSON.parse((init as { body: string }).body))
      .sort((a, b) => a.p_from.localeCompare(b.p_from));
    expect(bodies).toEqual([
      { p_from: PREV, p_to: "2026-10-11" },
      { p_from: THIS, p_to: "2026-10-18" },
    ]);
    const body = (await res.json()) as {
      tiles: Array<{ key: string; value: number; prev: number | null }>;
      written: { rows: Array<{ text: string }> };
    };
    expect(body.tiles.find((t) => t.key === "answers")).toMatchObject({ value: 1, prev: 0 });
    expect(body.written.rows[0]!.text).toBe("Ring me on [masked]");
  });

  it("shows the tiles uncompared when the period before can't be read", async () => {
    previousFails = true;
    const res = await GET(new Request(url));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { tiles: Array<{ prev: number | null }> };
    expect(body.tiles.every((t) => t.prev === null)).toBe(true);
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  it("answers a generic 500 when the range can't be read", async () => {
    mockSupabaseFetch.mockResolvedValue(json({ unexpected: true }));
    const res = await GET(new Request(url));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Unable to load the unlock feedback page." });
    expect(mockLogger.error).toHaveBeenCalled();
  });
});
