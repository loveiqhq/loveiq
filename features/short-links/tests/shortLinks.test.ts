import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/__tests__/__fixtures__/msw-server";
import {
  createShortLink,
  followShortLink,
  listShortLinks,
} from "@features/short-links/server/shortLinks";

/** The table module against a stand-in PostgREST: what it sends, and what it makes of the answer. */

const DB = "https://db.test";
const MILA = { influencer: "mila", platform: "tiktok" as const, placement: "dm" as const };

beforeEach(() => {
  process.env.SUPABASE_URL = DB;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
});

afterEach(() => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

describe("followShortLink", () => {
  it("counts a click through the function, with the service key", async () => {
    let sent: { body: unknown; auth: string | null } | null = null;
    server.use(
      http.post(`${DB}/rest/v1/rpc/short_link_click`, async ({ request }) => {
        sent = { body: await request.json(), auth: request.headers.get("authorization") };
        return HttpResponse.json([MILA]);
      })
    );
    await expect(followShortLink("k3x9p2a", true)).resolves.toEqual(MILA);
    expect(sent).toEqual({ body: { p_code: "k3x9p2a" }, auth: "Bearer service-key" });
  });

  it("only reads the row when the click is not counted", async () => {
    let query = "";
    server.use(
      http.get(`${DB}/rest/v1/short_link`, ({ request }) => {
        query = new URL(request.url).search;
        return HttpResponse.json([MILA]);
      }),
      http.post(`${DB}/rest/v1/rpc/short_link_click`, () => {
        throw new Error("a preview must not count");
      })
    );
    await expect(followShortLink("k3x9p2a", false)).resolves.toEqual(MILA);
    expect(new URLSearchParams(query).get("code")).toBe("eq.k3x9p2a");
    expect(new URLSearchParams(query).get("select")).toBe("influencer,platform,placement");
  });

  it("answers null for a code nobody created", async () => {
    server.use(http.post(`${DB}/rest/v1/rpc/short_link_click`, () => HttpResponse.json([])));
    await expect(followShortLink("zz9zz9z", true)).resolves.toBeNull();
  });

  it("throws when the database fails, so the redirect can fall back", async () => {
    server.use(
      http.post(`${DB}/rest/v1/rpc/short_link_click`, () => new HttpResponse(null, { status: 503 }))
    );
    await expect(followShortLink("k3x9p2a", true)).rejects.toThrow("(503)");
  });
});

describe("createShortLink", () => {
  const ROW = { code: "abc2def", ...MILA, meta: { username: "x" }, clicks: 0 };

  it("inserts the link and returns the stored row", async () => {
    let sent: { body: unknown; prefer: string | null; select: string | null } | null = null;
    server.use(
      http.post(`${DB}/rest/v1/short_link`, async ({ request }) => {
        sent = {
          body: await request.json(),
          prefer: request.headers.get("prefer"),
          select: new URL(request.url).searchParams.get("select"),
        };
        return HttpResponse.json([ROW], { status: 201 });
      })
    );
    await expect(createShortLink(MILA, { username: "x" }, () => "abc2def")).resolves.toEqual(ROW);
    expect(sent).toEqual({
      body: { code: "abc2def", ...MILA, meta: { username: "x" } },
      prefer: "return=representation",
      select:
        "code,influencer,platform,placement,meta,clicks,first_click_at,last_click_at,created_at",
    });
  });

  it("draws a new code when one is taken", async () => {
    const codes = ["taken22", "free222"];
    const tried: string[] = [];
    server.use(
      http.post(`${DB}/rest/v1/short_link`, async ({ request }) => {
        const { code } = (await request.json()) as { code: string };
        tried.push(code);
        return code === "taken22"
          ? HttpResponse.json({ code: "23505" }, { status: 409 })
          : HttpResponse.json([{ ...ROW, code }], { status: 201 });
      })
    );
    const row = await createShortLink(MILA, {}, () => codes.shift()!);
    expect(tried).toEqual(["taken22", "free222"]);
    expect(row.code).toBe("free222");
  });

  it("gives up after three taken codes", async () => {
    server.use(http.post(`${DB}/rest/v1/short_link`, () => HttpResponse.json({}, { status: 409 })));
    await expect(createShortLink(MILA, {}, () => "taken22")).rejects.toThrow("three codes");
  });

  it("throws on any other failure", async () => {
    server.use(http.post(`${DB}/rest/v1/short_link`, () => HttpResponse.json({}, { status: 400 })));
    await expect(createShortLink(MILA, {}, () => "abc2def")).rejects.toThrow("(400)");
  });
});

describe("listShortLinks", () => {
  it("filters, orders newest first and limits", async () => {
    let params = new URLSearchParams();
    server.use(
      http.get(`${DB}/rest/v1/short_link`, ({ request }) => {
        params = new URL(request.url).searchParams;
        return HttpResponse.json([]);
      })
    );
    await listShortLinks({ influencer: "mila", since: "2026-11-01", code: "k3x9p2a", limit: 50 });
    expect(params.get("influencer")).toBe("eq.mila");
    expect(params.get("created_at")).toBe("gte.2026-11-01");
    expect(params.get("code")).toBe("eq.k3x9p2a");
    expect(params.get("order")).toBe("created_at.desc");
    expect(params.get("limit")).toBe("50");
  });

  it("throws when the database fails", async () => {
    server.use(http.get(`${DB}/rest/v1/short_link`, () => new HttpResponse(null, { status: 500 })));
    await expect(listShortLinks({ limit: 10 })).rejects.toThrow("(500)");
  });
});
