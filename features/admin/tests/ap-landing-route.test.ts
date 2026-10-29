import { beforeEach, describe, expect, it, vi } from "vitest";

// The landing page's route wiring: what it reads from PostHog for the hero video, over which
// days, and what it sends when PostHog fails.
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
const mockHogql = vi.fn();
vi.mock("@features/ux-review/server/review", () => ({
  hogqlTable: (...args: unknown[]) => mockHogql(...args),
}));
// Pay to start's figures are its own page's, tested with its route: none here.
vi.mock("@features/admin/server/ap/pay-to-start", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@features/admin/server/ap/pay-to-start")>()),
  payToStartFor: vi.fn(async () => null),
}));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GET } from "@/app/api/admin/ap/landing/route";
import { clearFactsCache } from "@features/admin/server/ap/facts";
import type { LandingPayload } from "@features/admin/server/ap/landing";
import { clearTeamCache } from "@features/admin/server/ap/team";

/** A visit of the team's own finished survey: its person is left out of every PostHog figure. */
const TEAM_VISIT = "0192f0aa-7777-7000-8000-000000000007";

const json = (body: unknown, status = 200) => ({
  ok: status < 400,
  status,
  headers: new Headers(),
  json: async () => body,
});
const answer = (rows: unknown[][]) => ({ ok: true, cut: null, rows });

const get = async (from: string, to: string) => {
  const res = await GET(
    new Request(`http://localhost/api/admin/ap/landing?period=custom&from=${from}&to=${to}`)
  );
  expect(res.status).toBe(200);
  return (await res.json()) as LandingPayload;
};

/** The hero video's queries this test sent, their spacing read as single spaces. */
const videoQueries = () =>
  mockHogql.mock.calls
    .map(([q]) => String(q).replace(/\s+/g, " "))
    .filter((q) => q.includes("hero_video_play"));

beforeEach(() => {
  vi.clearAllMocks();
  clearFactsCache();
  clearTeamCache();
  mockVerifyAdminSession.mockResolvedValue({ email: "mb@loveiq.org", role: "admin" });
  mockCheckRateLimit.mockResolvedValue({ allowed: true });
  mockSupabaseFetch.mockImplementation(async (path: string) =>
    path === "/rest/v1/rpc/ap_facts"
      ? json({
          visits: [],
          starts: [],
          subs: [],
          money: [],
          checkouts: [],
          intro: [],
          invites: [],
          quotes: [],
        })
      : path.startsWith("/rest/v1/ap_team_user")
        ? json([{ id: 7 }])
        : path.startsWith("/rest/v1/survey_submission")
          ? json([{ posthog_session_id: TEAM_VISIT }])
          : json(null, 404)
  );
  // The page's other PostHog reads find nothing; the video's finds 14-28 Oct 2026's steps.
  mockHogql.mockImplementation(async (q: string) =>
    q.includes("hero_video_play") ? answer([[364, 0, 8, 6, 3, 2, 0, 0]]) : answer([])
  );
});

describe("GET /api/admin/ap/landing, the hero video", () => {
  it("reads the range's days with the team and forced versions left out, and sends each step", async () => {
    const body = await get("2026-10-14", "2026-10-28");
    expect(body.heroVideo.days).toEqual({ from: "2026-10-14", to: "2026-10-28" });
    const steps = body.heroVideo.steps;
    expect(steps?.ok && steps.value.find((s) => s.key === "started")).toEqual({
      key: "started",
      label: "Started",
      people: 8,
      share: 8 / 364,
    });
    // Read once, over the range's Berlin days.
    const [q, ...more] = videoQueries();
    expect(more).toEqual([]);
    expect(q).toContain(
      "timestamp >= toDateTime('2026-10-13 22:00:00', 'UTC') AND timestamp < toDateTime('2026-10-28 23:00:00', 'UTC')"
    );
    expect(q).toContain(`$session_id IN ('${TEAM_VISIT}')`);
    expect(q).toContain("match(toString(properties.$current_url), '[?&]variant=')");
  });

  it("reads from 13 Oct 2026 for a range starting earlier, and not at all for one before it", async () => {
    const early = await get("2026-10-01", "2026-10-20");
    expect(early.heroVideo.days).toEqual({ from: "2026-10-13", to: "2026-10-20" });
    expect(videoQueries()).toHaveLength(1);
    expect(videoQueries()[0]).toContain(
      "timestamp >= toDateTime('2026-10-12 22:00:00', 'UTC') AND timestamp < toDateTime('2026-10-20 22:00:00', 'UTC')"
    );
    mockHogql.mockClear();
    const before = await get("2026-10-01", "2026-10-12");
    expect(before.heroVideo).toMatchObject({ days: null, steps: null });
    expect(videoQueries()).toEqual([]);
  });

  it("keeps the page when PostHog fails, the block saying so", async () => {
    mockHogql.mockResolvedValue({ ok: false, error: "boom" });
    const body = await get("2026-10-15", "2026-10-21");
    expect(body.heroVideo.steps).toEqual({
      ok: false,
      error: "PostHog could not be read just now. Try again in a minute.",
    });
    expect(body.tiles).toHaveLength(6);
  });
});
