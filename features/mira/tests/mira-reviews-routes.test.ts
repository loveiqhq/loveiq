import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Mira's rating routes against a small stand-in for the mira_review table (PostgREST's eq. and
 * in. filters) and for Next's data cache: a cached value stays until its tag is revalidated, as
 * it does on Vercel. So "a withdrawal hides at once" is tested as what the next visitor sees.
 */
type Row = Record<string, unknown> & { id: number; user_id: string };
const db = vi.hoisted(() => ({ rows: [] as Row[], nextId: 1 }));
const cache = vi.hoisted(() => new Map<string, { value: unknown; tags: string[] }>());

function matches(row: Row, query: URLSearchParams): boolean {
  for (const [key, value] of query) {
    if (["select", "order", "limit"].includes(key)) continue;
    const v = row[key] === null || row[key] === undefined ? "null" : String(row[key]);
    if (value.startsWith("eq.") && v !== value.slice(3)) return false;
    if (value.startsWith("in.(") && !value.slice(4, -1).split(",").includes(v)) return false;
  }
  return true;
}
const parse = (path: string) => new URLSearchParams(path.split("?")[1] ?? "");
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

vi.mock("@features/admin/server/supabase", () => ({
  fetchAllRows: vi.fn(async (path: string) =>
    db.rows.filter((r) => path.startsWith("/rest/v1/mira_review") && matches(r, parse(path)))
  ),
  supabaseFetch: vi.fn(async (path: string, init: { method?: string; body?: string } = {}) => {
    if (!path.startsWith("/rest/v1/mira_review")) return json([]);
    const query = parse(path);
    const hit = db.rows.filter((r) => matches(r, query));
    switch (init.method ?? "GET") {
      case "POST": {
        const body = JSON.parse(init.body!) as Row;
        if (db.rows.some((r) => r.user_id === body.user_id)) return json({ code: "23505" }, 409);
        db.rows.push({ quote_status: "none", ...body, id: db.nextId++ });
        return new Response(null, { status: 201 });
      }
      case "PATCH":
        hit.forEach((r) => Object.assign(r, JSON.parse(init.body!)));
        return json(hit);
      case "DELETE":
        db.rows = db.rows.filter((r) => !hit.includes(r));
        return json(hit);
      default:
        return json(hit);
    }
  }),
}));
vi.mock("next/cache", () => ({
  unstable_cache:
    (fn: () => Promise<unknown>, keys: string[], opts: { tags?: string[] } = {}) =>
    async () => {
      const key = keys.join("|");
      if (!cache.has(key)) cache.set(key, { value: await fn(), tags: opts.tags ?? [] });
      return cache.get(key)!.value;
    },
  // Only what carries the tag goes, as on Vercel.
  revalidateTag: vi.fn((tag: string) => {
    for (const [key, entry] of cache) if (entry.tags.includes(tag)) cache.delete(key);
  }),
}));
vi.mock("@shared/http/csrf", () => ({ verifyCsrfToken: vi.fn().mockResolvedValue(true) }));
vi.mock("@shared/http/ratelimit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: new Date() }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@features/mira/server/session", () => ({ getMiraAccount: vi.fn() }));
vi.mock("@features/mira/server/attribution", () => ({
  fromTeamBrowser: vi.fn().mockResolvedValue(false),
}));
vi.mock("@features/mira/server/store", () => ({
  getProfile: vi.fn().mockResolvedValue({ name: "Lea Marie" }),
  logMiraEvent: vi.fn(),
  updateProfile: vi.fn().mockResolvedValue(undefined),
  deleteChats: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({ set: vi.fn(), get: vi.fn() })) }));
// The real under-18 stop; whether someone was stopped is set per test.
vi.mock("@features/mira/server/minor", async (real) => ({
  ...(await real<typeof import("@features/mira/server/minor")>()),
  isMinor: vi.fn(),
}));

import { POST as postEvent } from "@/app/api/mira/event/route";
import { GET as getPublic, POST } from "@/app/api/mira/reviews/route";
import { DELETE, GET as getMine } from "@/app/api/mira/reviews/mine/route";
import { REVIEW_CONSENT_VERSION } from "@features/mira/reviews";
import { fromTeamBrowser } from "@features/mira/server/attribution";
import { isMinor, stopForMinor } from "@features/mira/server/minor";
import { getMiraAccount } from "@features/mira/server/session";
import { logMiraEvent } from "@features/mira/server/store";
import { verifyCsrfToken } from "@shared/http/csrf";
import { revalidateTag } from "next/cache";

const LEA = { id: "11111111-2222-4333-8444-555555555555", email: "lea@example.com" };
const call = (method: string, url: string, body?: unknown) =>
  new Request(`http://localhost${url}`, {
    method,
    headers: { "Content-Type": "application/json", "x-csrf-token": "t" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const rate = (body: unknown) => POST(call("POST", "/api/mira/reviews", body));
const words = {
  quote: "Mira helped me stop hiding.",
  name: "Lea",
  ageRange: "25-34",
  consent: REVIEW_CONSENT_VERSION,
};
const user = { email: "x@example.com", is_team: false, minor_at: null };
/** Nineteen other real people's ratings, none with words. */
const others = () =>
  Array.from({ length: 19 }, (_, i) => ({
    id: 1000 + i,
    user_id: `other-${i}`,
    stars: 5,
    quote_status: "none",
    published_quote: null,
    display_name: null,
    age_range: null,
    consent_at: null,
    from_team: false,
    mira_user: user,
  }));
const shown = async () =>
  (await (await getPublic(call("GET", "/api/mira/reviews"))).json()).reviews;
/** Lea's approved words, with 19 others' ratings: Mira's pages show them. */
const live = () => {
  db.rows = [
    ...others(),
    {
      id: 1,
      user_id: LEA.id,
      stars: 5,
      quote: "Mira helped me stop hiding.",
      published_quote: "Mira helped me stop hiding.",
      display_name: "Lea",
      age_range: "25-34",
      consent_version: REVIEW_CONSENT_VERSION,
      consent_at: "2026-11-22T10:00:00Z",
      quote_status: "approved",
      from_team: false,
      mira_user: user,
    },
  ];
};

beforeEach(() => {
  vi.clearAllMocks();
  db.rows = [];
  db.nextId = 1;
  cache.clear();
  vi.mocked(getMiraAccount).mockResolvedValue(LEA);
  vi.mocked(fromTeamBrowser).mockResolvedValue(false);
  vi.mocked(isMinor).mockResolvedValue(false);
});

describe("POST /api/mira/reviews: a signed-in person's one rating", () => {
  it("takes stars alone, from a signed-in person only, and only once", async () => {
    vi.mocked(getMiraAccount).mockResolvedValueOnce(null);
    expect((await rate({ stars: 5 })).status).toBe(401);
    expect(db.rows).toEqual([]);

    expect((await rate({ stars: 4 })).status).toBe(200);
    expect(db.rows).toMatchObject([
      { user_id: LEA.id, stars: 4, quote_status: "none", from_team: false },
    ]);
    expect(db.rows[0]).not.toHaveProperty("quote");
    expect(vi.mocked(logMiraEvent).mock.calls).toEqual([
      ["review_given", { userId: LEA.id }, { words: false }],
    ]);
    // Once: a second rating is refused, the first stays.
    expect((await rate({ stars: 1 })).status).toBe(409);
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0]!.stars).toBe(4);
  });

  it("keeps words only with the consent to show them, in this wording, waiting for the team", async () => {
    for (const bad of [
      { stars: 5, words: { ...words, consent: undefined } },
      { stars: 5, words: { ...words, consent: "mira-review-2020-01-01" } },
      { stars: 5, words: { ...words, name: "" } },
      { stars: 5, words: { ...words, name: "lea@example.com" } },
      { stars: 5, words: { ...words, quote: "x".repeat(161) } },
      { stars: 6 },
      { stars: 5, quote: "words beside the consent" },
    ]) {
      expect((await rate(bad)).status, JSON.stringify(bad)).toBe(400);
    }
    expect(db.rows).toEqual([]);

    expect((await rate({ stars: 5, words })).status).toBe(200);
    expect(db.rows[0]).toMatchObject({
      stars: 5,
      quote: "Mira helped me stop hiding.",
      display_name: "Lea",
      age_range: "25-34",
      consent_version: REVIEW_CONSENT_VERSION,
      consent_at: expect.any(String),
      quote_status: "pending",
    });
    expect(vi.mocked(logMiraEvent).mock.calls[0]![2]).toEqual({ words: true });
  });

  it("marks a rating from a team browser, and needs the CSRF token", async () => {
    vi.mocked(fromTeamBrowser).mockResolvedValueOnce(true);
    await rate({ stars: 5 });
    expect(db.rows[0]!.from_team).toBe(true);
    vi.mocked(verifyCsrfToken).mockResolvedValueOnce(false);
    expect((await rate({ stars: 5 })).status).toBe(403);
  });
});

describe("under 18: nothing shared stays, and nothing more is taken", () => {
  it("an under-18 stop deletes the rating and its words, approved or not, at once", async () => {
    live();
    expect((await shown()).quote.name).toBe("Lea");
    await stopForMinor(LEA.id);
    expect(db.rows.some((r) => r.user_id === LEA.id)).toBe(false);
    expect(await shown()).toBeNull(); // 19 people and no words left: nothing shows
  });

  it("refuses someone Mira stopped as under 18, and refuses when that can't be checked", async () => {
    vi.mocked(isMinor).mockResolvedValue(true);
    expect((await rate({ stars: 5, words })).status).toBe(403);
    expect((await getMine(call("GET", "/api/mira/reviews/mine"))).status).toBe(403);
    expect((await DELETE(call("DELETE", "/api/mira/reviews/mine?what=all"))).status).toBe(403);
    vi.mocked(isMinor).mockRejectedValue(new Error("mira minor read failed (500)"));
    expect((await rate({ stars: 5 })).status).toBe(500);
    expect((await getMine(call("GET", "/api/mira/reviews/mine"))).status).toBe(500);
    expect(db.rows).toEqual([]);
    expect(logMiraEvent).not.toHaveBeenCalled();
  });
});

describe("taking back what you shared", () => {
  it("hides the words everywhere at once, not when the cache next expires", async () => {
    live();
    expect((await shown()).quote).toEqual({
      text: "Mira helped me stop hiding.",
      name: "Lea",
      age: "25–34",
    });
    const res = await DELETE(call("DELETE", "/api/mira/reviews/mine?what=words"));
    expect(res.status).toBe(200);
    // The words are gone from the table, the rating stays...
    const lea = db.rows.find((r) => r.user_id === LEA.id)!;
    expect(lea).toMatchObject({ stars: 5, quote: null, published_quote: null, display_name: null });
    expect(lea.quote_status).toBe("none");
    // ...and the very next visitor no longer sees them (no approved words left: nothing shows).
    expect(await shown()).toBeNull();
    expect(revalidateTag).toHaveBeenCalledWith("mira-reviews", { expire: 0 });
    expect(vi.mocked(logMiraEvent).mock.calls).toEqual([
      ["review_withdrawn", { userId: LEA.id }, { what: "words" }],
    ]);
  });

  it("removes the whole rating, which leaves the count at once", async () => {
    live();
    expect((await shown()).people).toBe(20);
    expect((await DELETE(call("DELETE", "/api/mira/reviews/mine?what=all"))).status).toBe(200);
    expect(db.rows.some((r) => r.user_id === LEA.id)).toBe(false);
    expect(await shown()).toBeNull(); // 19 people: under the threshold again
  });

  it("takes only ?what=words or ?what=all, signed in, with the CSRF token", async () => {
    live();
    for (const q of ["", "?what=", "?what=everything"]) {
      expect((await DELETE(call("DELETE", `/api/mira/reviews/mine${q}`))).status).toBe(400);
    }
    vi.mocked(getMiraAccount).mockResolvedValueOnce(null);
    expect((await DELETE(call("DELETE", "/api/mira/reviews/mine?what=all"))).status).toBe(401);
    vi.mocked(verifyCsrfToken).mockResolvedValueOnce(false);
    expect((await DELETE(call("DELETE", "/api/mira/reviews/mine?what=all"))).status).toBe(403);
    expect(db.rows.some((r) => r.user_id === LEA.id)).toBe(true);
  });

  it("shows the person what they shared, and the first name to sign with", async () => {
    let res = await getMine(call("GET", "/api/mira/reviews/mine"));
    expect(await res.json()).toEqual({ review: null, name: "Lea" });
    live();
    res = await getMine(call("GET", "/api/mira/reviews/mine"));
    expect((await res.json()).review).toMatchObject({
      stars: 5,
      quote: "Mira helped me stop hiding.",
      published: "Mira helped me stop hiding.",
      status: "approved",
      name: "Lea",
      age: "25–34",
    });
  });
});

describe("GET /api/mira/reviews: what any visitor may see", () => {
  it("is nothing under the threshold, and never an address", async () => {
    db.rows = others();
    expect(await shown()).toBeNull();
    db.rows.push({ ...others()[0]!, id: 1, user_id: LEA.id });
    cache.clear(); // a new rating shows when the cache next refreshes
    expect(await shown()).toBeNull(); // 20 people, but no approved words
    const body = JSON.stringify(await (await getPublic(call("GET", "/api/mira/reviews"))).json());
    expect(body).not.toContain("example.com");
  });
});

describe("the ask's moments in the KPI log", () => {
  const track = (name: string) =>
    postEvent(call("POST", "/api/mira/event", { type: "track", name }));

  it("takes the ask shown and put off from the browser, never the server's own events", async () => {
    for (const name of ["review_prompt_shown", "review_prompt_not_now"]) {
      expect((await track(name)).status).toBe(200);
    }
    expect(vi.mocked(logMiraEvent).mock.calls.map(([name]) => name)).toEqual([
      "review_prompt_shown",
      "review_prompt_not_now",
    ]);
    for (const name of ["review_given", "review_withdrawn"]) {
      expect((await track(name)).status).toBe(400);
    }
  });
});
