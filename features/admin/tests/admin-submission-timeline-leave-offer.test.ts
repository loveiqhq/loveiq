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
 * The founder-call offer has no booking webhook: a booking lands in Mark and Marcus's
 * calendar with the reader's email, and the founders find the report in /admin before
 * granting its coupon. This timeline is where they confirm the match, so the offer's
 * events have to be on it.
 */
const LEAVE_ROWS = [
  {
    event_type: "leave_offer_shown",
    event_time: "2026-10-14T09:10:00.000Z",
    metadata: { variant: "founder_call", trigger: "paywall_reached" },
  },
  {
    event_type: "leave_offer_clicked",
    event_time: "2026-10-14T09:10:20.000Z",
    metadata: { variant: "founder_call", trigger: "paywall_reached" },
  },
  {
    event_type: "leave_offer_dismissed",
    event_time: "2026-10-14T09:11:00.000Z",
    metadata: { variant: "founder_call", trigger: "paywall_reached", source: "not_now" },
  },
];

function route() {
  mockSupabaseFetch.mockImplementation(async (path: string) => {
    if (path.includes("/survey_submission?")) {
      return ok([{ id: 2301, created_date_time: "2026-10-14T09:00:00.000Z", status: "completed" }]);
    }
    if (path.includes("/analytics_event?")) {
      // Only rows the route asks for come back, as PostgREST would answer.
      const asked = /event_type=in\.\(([^)]*)\)/.exec(path)?.[1]?.split(",") ?? [];
      return ok(LEAVE_ROWS.filter((row) => asked.includes(row.event_type)));
    }
    return ok([]);
  });
}

async function timeline() {
  const res = await GET(new Request("https://example.test/api/admin/submissions/2301/timeline"), {
    params: Promise.resolve({ id: "2301" }),
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as {
    events?: Array<{ label: string; type: string; detail?: string }>;
  };
  return body.events ?? [];
}

describe("admin submission timeline — the founder-call offer", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockVerifyAdminSession.mockResolvedValue({ email: "ec@loveiq.org", role: "admin" });
    mockHasRole.mockReturnValue(true);
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 29, resetAt: new Date() });
  });

  it("lists the offer shown, the booking page opened and a dismissal, with how", async () => {
    route();
    const events = await timeline();
    const byType = Object.fromEntries(events.map((e) => [e.type, e]));
    expect(byType.leave_offer_shown?.label).toBe("Founder-call offer shown");
    expect(byType.leave_offer_shown?.detail).toBe("paywall_reached");
    expect(byType.leave_offer_clicked?.label).toBe("Founder-call booking page opened");
    expect(byType.leave_offer_dismissed?.label).toBe("Founder-call offer dismissed");
    expect(byType.leave_offer_dismissed?.detail).toBe("paywall_reached · not_now");
  });
});
