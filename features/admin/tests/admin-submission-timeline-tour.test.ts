import { beforeEach, describe, expect, it, vi } from "vitest";

const mockVerifyAdminSession = vi.fn();
vi.mock("@features/admin/server/auth", () => ({
  verifyAdminSession: (...args: unknown[]) => mockVerifyAdminSession(...(args as [])),
}));

const mockHasRole = vi.fn();
vi.mock("@features/admin/server/roles", () => ({
  hasRole: (...args: unknown[]) => mockHasRole(...args),
}));

const mockCheckRateLimit = vi.fn();
vi.mock("@shared/http/ratelimit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

const mockSupabaseFetch = vi.fn();
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (...args: unknown[]) => mockSupabaseFetch(...args),
}));

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GET } from "@/app/api/admin/submissions/[id]/timeline/route";

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

/**
 * The guided tour runs on a report's first open. Whether a reader saw it through, or left
 * it and where, belongs beside the rest of their visit, so the team can read one session
 * end to end.
 */
const TOUR_ROWS = [
  {
    event_type: "tour_started",
    event_time: "2026-10-17T09:00:05.000Z",
    metadata: { trigger: "auto", steps: 5 },
  },
  {
    event_type: "tour_skipped",
    event_time: "2026-10-17T09:00:12.000Z",
    metadata: { trigger: "auto", at: 3, id: "chapter_toggle", steps: 5, source: "escape" },
  },
  {
    event_type: "tour_replayed",
    event_time: "2026-10-17T09:04:00.000Z",
    metadata: { source: "drawer" },
  },
  {
    event_type: "tour_completed",
    event_time: "2026-10-17T09:30:00.000Z",
    metadata: { trigger: "auto", steps: 4 },
  },
];

function route() {
  mockSupabaseFetch.mockImplementation(async (path: string) => {
    if (path.includes("/survey_submission?")) {
      return ok([{ id: 2302, created_date_time: "2026-10-17T08:50:00.000Z", status: "completed" }]);
    }
    if (path.includes("/analytics_event?")) {
      // Only rows the route asks for come back, as PostgREST would answer.
      const asked = /event_type=in\.\(([^)]*)\)/.exec(path)?.[1]?.split(",") ?? [];
      return ok(TOUR_ROWS.filter((row) => asked.includes(row.event_type)));
    }
    return ok([]);
  });
}

async function timeline() {
  const res = await GET(new Request("https://example.test/api/admin/submissions/2302/timeline"), {
    params: Promise.resolve({ id: "2302" }),
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as {
    events?: Array<{ label: string; type: string; detail?: string }>;
  };
  return body.events ?? [];
}

describe("admin submission timeline — the guided tour", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockVerifyAdminSession.mockResolvedValue({ email: "ec@loveiq.org", role: "admin" });
    mockHasRole.mockReturnValue(true);
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 29, resetAt: new Date() });
  });

  it("lists the tour started, where it was left and how, a replay, and a finish", async () => {
    route();
    const events = await timeline();
    const byType = Object.fromEntries(events.map((e) => [e.type, e]));
    expect(byType.tour_started?.label).toBe("Report tour started");
    expect(byType.tour_started?.detail).toBe("5 stops");
    expect(byType.tour_skipped?.label).toBe("Report tour skipped");
    expect(byType.tour_skipped?.detail).toBe("at stop 3 of 5 · escape");
    expect(byType.tour_replayed?.label).toBe("Report tour replayed");
    expect(byType.tour_replayed?.detail).toBe("drawer");
    expect(byType.tour_completed?.label).toBe("Report tour finished");
    expect(byType.tour_completed?.detail).toBe("4 stops");
  });
});
