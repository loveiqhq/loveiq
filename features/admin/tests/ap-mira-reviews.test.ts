import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * AP › Mira's quote review: staff read the words people agreed to show, and approve them (as
 * written, or with an identifying detail replaced by a visible […]), reject them, or take an
 * approved one down. Against a stand-in for the mira_review table (eq. and in. filters).
 */
type Row = Record<string, unknown> & { id: number };
const db = vi.hoisted(() => ({ rows: [] as Row[] }));
const parse = (path: string) => new URLSearchParams(path.split("?")[1] ?? "");
function matches(row: Row, query: URLSearchParams): boolean {
  for (const [key, value] of query) {
    if (["select", "order", "limit"].includes(key)) continue;
    const v = row[key] === null || row[key] === undefined ? "null" : String(row[key]);
    if (value.startsWith("eq.") && v !== value.slice(3)) return false;
    if (value.startsWith("in.(") && !value.slice(4, -1).split(",").includes(v)) return false;
  }
  return true;
}
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

const mockVerifyAdminSession = vi.fn();
vi.mock("@features/admin/server/auth", () => ({
  verifyAdminSession: (...args: unknown[]) => mockVerifyAdminSession(...(args as [])),
}));
vi.mock("@features/admin/server/supabase", () => ({
  fetchAllRows: vi.fn(async (path: string) => db.rows.filter((r) => matches(r, parse(path)))),
  supabaseFetch: vi.fn(async (path: string, init: { method?: string; body?: string } = {}) => {
    const hit = db.rows.filter((r) => matches(r, parse(path)));
    if (init.method === "PATCH") hit.forEach((r) => Object.assign(r, JSON.parse(init.body!)));
    return json(hit);
  }),
}));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: vi.fn() }));
vi.mock("@shared/http/csrf", () => ({ verifyCsrfToken: vi.fn().mockResolvedValue(true) }));
vi.mock("@shared/http/ratelimit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GET, POST } from "@/app/api/admin/ap/mira/reviews/route";
import { parseFilters } from "@features/admin/server/ap/filters";
import { buildMiraPage, type MiraData, type MiraEventRow } from "@features/admin/server/ap/mira";
import { REVIEW_SELECT, type MiraReviewRow } from "@features/admin/server/ap/mira-ratings";
import { __resetStaffEmailRegexForTests } from "@shared/env/staff-email";
import { verifyCsrfToken } from "@shared/http/csrf";
import { revalidateTag } from "next/cache";

const said = "My husband Tom noticed I stopped hiding.";
const pending = (id: number, over: Partial<Row> = {}): Row => ({
  id,
  stars: 5,
  quote: said,
  published_quote: null,
  display_name: "Lea",
  age_range: "25-34",
  consent_version: "mira-review-2026-11-22",
  consent_at: "2026-11-22T10:00:00Z",
  quote_status: "pending",
  created_at: "2026-11-22T10:00:00Z",
  from_team: false,
  mira_user: { email: "lea@example.com", is_team: false, minor_at: null },
  ...over,
});
const decide = (body: unknown) =>
  POST(
    new Request("http://localhost/api/admin/ap/mira/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": "t" },
      body: JSON.stringify(body),
    })
  );
const list = () => GET(new Request("http://localhost/api/admin/ap/mira/reviews"));

beforeEach(() => {
  vi.clearAllMocks();
  mockVerifyAdminSession.mockResolvedValue({ email: "staff@loveiq.org", role: "editor" });
  db.rows = [pending(1), pending(2, { from_team: true, display_name: "Eman" })];
});

describe("AP › Mira: reading the quotes", () => {
  it("lists the words waiting and shown, for staff only, never with an address", async () => {
    mockVerifyAdminSession.mockResolvedValueOnce(null);
    expect((await list()).status).toBe(401);
    const res = await list();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.quotes).toMatchObject([
      { id: 1, quote: said, name: "Lea", age: "25–34", status: "pending", counts: true },
      // The team's own words: listed for testing, never shown.
      { id: 2, name: "Eman", counts: false },
    ]);
    expect(JSON.stringify(body)).not.toContain("@");
  });
});

describe("AP › Mira: deciding on a quote", () => {
  it("approves the words as written, and Mira's pages pick them up at once", async () => {
    expect((await decide({ id: 1, decision: "approve", text: said })).status).toBe(200);
    expect(db.rows[0]).toMatchObject({
      quote_status: "approved",
      published_quote: said,
      reviewed_by: "staff@loveiq.org",
      reviewed_at: expect.any(String),
    });
    expect(revalidateTag).toHaveBeenCalledWith("mira-reviews", { expire: 0 });
  });

  it("allows only taking a detail out, marked […], and refuses any other edit", async () => {
    const edit = "My husband Tom noticed I finally stopped hiding.";
    const res = await decide({ id: 1, decision: "approve", text: edit });
    expect(res.status).toBe(400);
    expect(db.rows[0]!.quote_status).toBe("pending");
    expect(revalidateTag).not.toHaveBeenCalled();
    const cut = "My husband […] noticed I stopped hiding.";
    expect((await decide({ id: 1, decision: "approve", text: cut })).status).toBe(200);
    expect(db.rows[0]).toMatchObject({ published_quote: cut, quote: said });
  });

  it("rejects or takes down by deleting the words, and keeps no words it doesn't show", async () => {
    expect((await decide({ id: 1, decision: "reject", reason: "identifying" })).status).toBe(200);
    expect(db.rows[0]).toMatchObject({
      quote_status: "rejected",
      reject_reason: "identifying",
      quote: null,
      display_name: null,
      age_range: null,
      consent_at: null,
      published_quote: null,
      stars: 5, // the rating itself stays
    });
    db.rows = [pending(3, { quote_status: "approved", published_quote: said })];
    expect((await decide({ id: 3, decision: "reject", reason: "harmful" })).status).toBe(200);
    expect(db.rows[0]).toMatchObject({
      quote_status: "rejected",
      reject_reason: "harmful",
      published_quote: null,
    });
    expect(revalidateTag).toHaveBeenCalledWith("mira-reviews", { expire: 0 });
  });

  it("rejects or takes down only for a reason from the list, never for being critical", async () => {
    db.rows = [pending(1, { stars: 1, quote: "It didn't help me at all." })];
    for (const reason of [undefined, "", "negative", "critical", "toString"]) {
      expect((await decide({ id: 1, decision: "reject", reason })).status, reason).toBe(400);
    }
    expect(db.rows[0]).toMatchObject({
      quote_status: "pending",
      quote: "It didn't help me at all.",
    });
    expect(revalidateTag).not.toHaveBeenCalled();
    for (const [id, reason] of [
      [11, "identifying"],
      [12, "harmful"],
      [13, "off_topic"],
      [14, "spam"],
    ] as const) {
      db.rows = [pending(id)];
      expect((await decide({ id, decision: "reject", reason })).status, reason).toBe(200);
      expect(db.rows[0]).toMatchObject({ quote_status: "rejected", reject_reason: reason });
    }
  });

  it("never approves words the person took back meanwhile", async () => {
    db.rows = [pending(1, { quote_status: "none", quote: null, consent_at: null })];
    expect((await decide({ id: 1, decision: "approve", text: said })).status).toBe(409);
    expect(db.rows[0]!.quote_status).toBe("none");
  });

  it("is for editors, with the CSRF token", async () => {
    mockVerifyAdminSession.mockResolvedValueOnce({ email: "v@loveiq.org", role: "viewer" });
    expect((await decide({ id: 1, decision: "reject", reason: "spam" })).status).toBe(403);
    vi.mocked(verifyCsrfToken).mockResolvedValueOnce(false);
    expect((await decide({ id: 1, decision: "reject", reason: "spam" })).status).toBe(403);
    expect((await decide({ id: "1", decision: "publish" })).status).toBe(400);
    expect(db.rows[0]!.quote_status).toBe("pending");
  });
});

describe("AP › Mira: the Ratings card", () => {
  const TODAY = "2026-11-30";
  const ev = (name: string, user: string, at: string): MiraEventRow => ({
    name,
    anon_id: null,
    user_id: user,
    at: Date.parse(at),
    detail: null,
  });
  const account = (id: string, email = `${id}@example.com`, over = {}) => ({
    id,
    email,
    created_at: "2026-11-01T09:00:00Z",
    style: {},
    use_assessment: false,
    ...over,
  });
  const review = (user: string, stars: number, over: Partial<MiraReviewRow> = {}) =>
    ({
      id: stars * 100 + user.length,
      user_id: user,
      stars,
      quote_status: "none",
      published_quote: null,
      display_name: null,
      age_range: null,
      consent_at: null,
      from_team: false,
      via: "ask",
      created_at: "2026-11-24T10:00:00Z",
      reviewed_at: null,
      mira_user: { email: `${user}@example.com`, is_team: false, minor_at: null },
      ...over,
    }) as MiraReviewRow;
  const words = { consent_at: "2026-11-24T10:00:00Z", display_name: "Lea" };
  const build = (reviews: MiraReviewRow[] | null) => {
    const data: MiraData = {
      users: [
        account("u1"),
        account("u2"),
        account("u3"),
        account("staff", "eman@loveiq.org"),
        account("tb", "tb@example.com", { is_team: true }),
      ],
      events: [
        ev("review_prompt_shown", "u1", "2026-11-24T09:00:00Z"),
        ev("review_prompt_shown", "u2", "2026-11-25T09:00:00Z"),
        ev("review_prompt_not_now", "u2", "2026-11-25T09:01:00Z"),
        ev("review_given", "u1", "2026-11-24T10:00:00Z"),
        ev("review_withdrawn", "u1", "2026-11-26T10:00:00Z"),
        // The team's: never counted.
        ev("review_prompt_shown", "staff", "2026-11-24T09:00:00Z"),
        ev("review_given", "staff", "2026-11-24T09:05:00Z"),
        // Before the range.
        ev("review_prompt_shown", "u3", "2026-11-10T09:00:00Z"),
      ],
      nudges: [],
      bodyChecks: [],
      withResult: new Set(),
      reviews,
    };
    return buildMiraPage({
      data,
      filters: parseFilters({ period: "custom", from: "2026-11-23", to: "2026-11-29" }, TODAY),
      today: TODAY,
      now: new Date(`${TODAY}T12:00:00Z`),
    }).ratings;
  };

  beforeEach(() => __resetStaffEmailRegexForTests());

  it("counts the asks, ratings, words and withdrawals of the range, never the team's", () => {
    const r = build([
      review("u1", 4, { ...words, quote_status: "pending" }),
      review("u3", 5, {
        ...words,
        quote_status: "approved",
        published_quote: "It helped.",
        reviewed_at: "2026-11-25T10:00:00Z",
        via: "settings", // rated in Settings, not after an ask
      }),
      review("u2", 2, { created_at: "2026-11-01T10:00:00Z" }), // before the range
      review("staff", 1, {
        mira_user: { email: "eman@loveiq.org", is_team: false, minor_at: null },
      }),
      review("tb", 1, { mira_user: { email: "tb@example.com", is_team: true, minor_at: null } }),
      review("u9", 1, { from_team: true }),
    ]);
    expect(r).toEqual({
      read: true,
      asked: 2,
      notNow: 1,
      given: 1,
      withdrawn: 1,
      average: 4.5, // u1's 4 and u3's 5: the range's ratings that still stand
      averaged: 2,
      afterAsk: 1, // u1, after the chat's ask
      fromSettings: 1, // u3
      words: 2,
      approved: 1,
      waiting: 1,
      // What visitors see: 3 real people so far (u1, u2, u3), short of 20, so nothing shows.
      live: { people: 3, quotes: 1, average: null, needs: 20 },
    });
  });

  it("reads where each rating was given, so the ask's share stays true", () => {
    // PostgREST returns only the columns the AP's select names (the account comes embedded).
    const columns = REVIEW_SELECT.split(",").map((c) => c.split("!")[0]);
    const asRead = (row: MiraReviewRow) =>
      Object.fromEntries(
        Object.entries(row).filter(([k]) => columns.includes(k))
      ) as unknown as MiraReviewRow;
    const r = build([asRead(review("u1", 4, { via: "settings" })), asRead(review("u2", 2))]);
    expect(r).toMatchObject({ afterAsk: 1, fromSettings: 1, average: 3 });
  });

  it("says when the ratings table could not be read, rather than showing zeros as real", () => {
    expect(build(null)).toMatchObject({ read: false, average: null, live: { average: null } });
  });
});
