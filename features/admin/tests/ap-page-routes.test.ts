import { beforeEach, describe, expect, it, vi } from "vitest";

// The page routes' own wiring: what each reads for the comparison and the visitor filter.
const mockVerifyAdminSession = vi.fn();
vi.mock("@features/admin/server/auth", () => ({
  verifyAdminSession: (...args: unknown[]) => mockVerifyAdminSession(...(args as [])),
}));
const mockCheckRateLimit = vi.fn();
vi.mock("@shared/http/ratelimit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));
vi.mock("@shared/http/csrf", () => ({ verifyCsrfToken: vi.fn().mockResolvedValue(true) }));
const mockSupabaseFetch = vi.fn();
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (...args: unknown[]) => mockSupabaseFetch(...args),
  fetchAllRows: vi.fn(),
  countRows: vi.fn().mockResolvedValue(0),
  POSTGREST_MAX_ROWS: 1000,
}));
const mockHogql = vi.fn();
vi.mock("@features/ux-review/server/review", () => ({
  hogqlTable: (...args: unknown[]) => mockHogql(...args),
}));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GET as reportGet } from "@/app/api/admin/ap/report/route";
import { clearFactsCache } from "@features/admin/server/ap/facts";

const json = (body: unknown, status = 200) => ({
  ok: status < 400,
  status,
  headers: new Headers(),
  json: async () => body,
});

const finisher = (id: number, day: string) => ({
  id,
  day,
  at: `${day}T10:00:00Z`,
  src: "google",
  med: "cpc",
  openedAt: `${day}T10:05:00Z`,
});
const facts = (subs: unknown[]) => ({
  visits: [],
  starts: [],
  subs,
  money: [],
  intro: [],
  invites: [],
  quotes: [],
});
const extras = (skippers: number[]) => ({
  wizard: [],
  chapters: [],
  feedback: [],
  emails: [],
  wizard_skips: skippers.length ? [{ slide: 0, n: skippers.length, sids: skippers }] : [],
  wizard_skips_from: "2026-09-20",
});

// This week: 4 finishers, 1 pressed Skip Intro. The week before: 4, 2 pressed it.
const THIS = { from: "2026-10-06", subs: [1, 2, 3, 4], skippers: [1] };
const PREV = { from: "2026-09-29", subs: [11, 12, 13, 14], skippers: [11, 12] };
let extrasFails = false;

beforeEach(() => {
  vi.clearAllMocks();
  clearFactsCache();
  extrasFails = false;
  mockVerifyAdminSession.mockResolvedValue({ email: "mb@loveiq.org", role: "admin" });
  mockCheckRateLimit.mockResolvedValue({ allowed: true });
  mockHogql.mockResolvedValue({ ok: false, error: "not in this test" });
  mockSupabaseFetch.mockImplementation(async (path: string, init?: { body?: string }) => {
    const { p_from } = JSON.parse(init?.body ?? "{}") as { p_from?: string };
    const range = p_from === THIS.from ? THIS : p_from === PREV.from ? PREV : null;
    if (path === "/rest/v1/rpc/ap_facts")
      return json(facts(range ? range.subs.map((id) => finisher(id, range.from)) : []));
    if (path === "/rest/v1/rpc/ap_report_extras") {
      if (range === PREV && extrasFails) return json({ message: "boom" }, 500);
      return json(extras(range ? range.skippers : []));
    }
    return json(null, 404);
  });
});

const skipped = async () => {
  const res = await reportGet(
    new Request(
      `http://localhost/api/admin/ap/report?period=custom&from=${THIS.from}&to=2026-10-12`
    )
  );
  expect(res.status).toBe(200);
  const body = (await res.json()) as {
    wizard: { tiles: Array<{ key: string; value: number | null; prev: number | null }> };
  };
  return body.wizard.tiles.find((t) => t.key === "skipped")!;
};

describe("GET /api/admin/ap/report", () => {
  it("compares Skipped intro with the earlier period's own presses", async () => {
    expect(await skipped()).toMatchObject({ value: 1 / 4, prev: 2 / 4 });
    const extrasCalls = mockSupabaseFetch.mock.calls
      .filter(([path]) => path === "/rest/v1/rpc/ap_report_extras")
      .map(([, init]) => JSON.parse((init as { body: string }).body).p_from)
      .sort();
    expect(extrasCalls).toEqual([PREV.from, THIS.from]);
  });

  it("shows the tile uncompared when the earlier period's presses can't be read", async () => {
    extrasFails = true;
    expect(await skipped()).toMatchObject({ value: 1 / 4, prev: null });
  });
});
