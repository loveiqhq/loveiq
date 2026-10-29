import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createShortLink, listShortLinks, checkRateLimit } = vi.hoisted(() => ({
  createShortLink: vi.fn(),
  listShortLinks: vi.fn(),
  checkRateLimit: vi.fn(),
}));

vi.mock("@features/short-links/server/shortLinks", () => ({ createShortLink, listShortLinks }));
vi.mock("@shared/http/ratelimit", () => ({
  checkRateLimit,
  getClientIp: () => "203.0.113.7",
}));
vi.mock("@shared/observability/logger", () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { GET, POST } from "@/app/api/short-links/route";

const KEY = "k".repeat(64);
const ORIGIN = "https://www.loveiq.org";

function post(body: unknown, key: string | null = KEY) {
  return new Request(`${ORIGIN}/api/short-links`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(key === null ? {} : { authorization: `Bearer ${key}` }),
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function get(query = "", key: string | null = KEY) {
  return new Request(`${ORIGIN}/api/short-links${query}`, {
    headers: key === null ? {} : { authorization: `Bearer ${key}` },
  });
}

const ROW = {
  code: "k3x9p2a",
  influencer: "mila",
  platform: "tiktok",
  placement: "dm",
  meta: { username: "someone_us" },
  clicks: 2,
  first_click_at: "2026-11-02T10:00:00Z",
  last_click_at: "2026-11-02T11:00:00Z",
  created_at: "2026-11-02T09:00:00Z",
};

beforeEach(() => {
  process.env.SHORT_LINK_API_KEY = KEY;
  checkRateLimit.mockResolvedValue({ allowed: true, remaining: 10, resetAt: new Date() });
  createShortLink.mockResolvedValue(ROW);
  listShortLinks.mockResolvedValue([ROW]);
});

afterEach(() => {
  delete process.env.SHORT_LINK_API_KEY;
  vi.clearAllMocks();
});

describe("POST /api/short-links", () => {
  it("creates a link and answers with its short address and where it goes", async () => {
    const res = await POST(
      post({
        influencer: " Mila ",
        platform: "TikTok",
        placement: "DM",
        meta: { username: "someone_us", post: "1102", first: true },
      })
    );
    expect(res.status).toBe(201);
    expect(createShortLink).toHaveBeenCalledWith(
      { influencer: "mila", platform: "tiktok", placement: "dm" },
      { username: "someone_us", post: "1102", first: true }
    );
    const body = await res.json();
    expect(body.url).toBe("https://loveiq.org/k3x9p2a");
    expect(body.target).toBe(
      "https://www.loveiq.org/?utm_source=tiktok&utm_medium=social&utm_campaign=ai_mila&utm_content=dm&utm_term=k3x9p2a"
    );
    expect(body.meta).toEqual({ username: "someone_us" });
    expect(body.clicks).toBe(2);
  });

  it("stores no notes as an empty object", async () => {
    await POST(post({ influencer: "nora", platform: "linkedin", placement: "bio" }));
    expect(createShortLink).toHaveBeenCalledWith(
      { influencer: "nora", platform: "linkedin", placement: "bio" },
      {}
    );
  });

  it("refuses a request without the key, or with the wrong one", async () => {
    for (const key of [null, "wrong", ""]) {
      const res = await POST(
        post({ influencer: "mila", platform: "tiktok", placement: "dm" }, key)
      );
      expect(res.status).toBe(401);
    }
    expect(createShortLink).not.toHaveBeenCalled();
  });

  it("is unavailable, not open, when no key is configured", async () => {
    delete process.env.SHORT_LINK_API_KEY;
    const res = await POST(post({ influencer: "mila", platform: "tiktok", placement: "dm" }));
    expect(res.status).toBe(503);
    expect(createShortLink).not.toHaveBeenCalled();
  });

  it("rate-limits before it looks at the key", async () => {
    checkRateLimit.mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: new Date(Date.now() + 30_000),
    });
    const res = await POST(post({}, "wrong"));
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThanOrEqual(29);
    expect(Number(res.headers.get("Retry-After"))).toBeLessThanOrEqual(30);
  });

  it("refuses input it would have to guess at", async () => {
    const bad = [
      "not json",
      {},
      { influencer: "mila", platform: "myspace", placement: "dm" },
      { influencer: "mila", platform: "tiktok", placement: "email" },
      { influencer: "m", platform: "tiktok", placement: "dm" },
      { influencer: "mila lou", platform: "tiktok", placement: "dm" },
      { influencer: "mila", platform: "tiktok", placement: "dm", meta: { "a-b": "x" } },
      { influencer: "mila", platform: "tiktok", placement: "dm", meta: { nested: { a: 1 } } },
      { influencer: "mila", platform: "tiktok", placement: "dm", meta: { long: "x".repeat(201) } },
      {
        influencer: "mila",
        platform: "tiktok",
        placement: "dm",
        meta: Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`k${i}`, i])),
      },
      // Within 20 keys and 200 characters each, but over the 2,000 characters in all.
      {
        influencer: "mila",
        platform: "tiktok",
        placement: "dm",
        meta: Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`k${i}`, "x".repeat(200)])),
      },
      // Texts the database's jsonb would refuse: a NUL, and half of a surrogate pair.
      { influencer: "mila", platform: "tiktok", placement: "dm", meta: { note: "a\u0000b" } },
      { influencer: "mila", platform: "tiktok", placement: "dm", meta: { note: "a\ud800b" } },
    ];
    for (const body of bad) {
      const res = await POST(post(body));
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    expect(createShortLink).not.toHaveBeenCalled();
  });

  it("answers a failed insert with a generic error", async () => {
    createShortLink.mockRejectedValue(new Error("short_link insert failed (500)"));
    const res = await POST(post({ influencer: "mila", platform: "tiktok", placement: "dm" }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Unable to process request." });
  });
});

describe("GET /api/short-links", () => {
  it("lists links with their clicks, addresses and targets", async () => {
    const res = await GET(get("?influencer=Mila&since=2026-11-01&limit=50"));
    expect(res.status).toBe(200);
    expect(listShortLinks).toHaveBeenCalledWith({
      influencer: "mila",
      since: "2026-11-01",
      limit: 50,
    });
    const { links } = await res.json();
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      code: "k3x9p2a",
      clicks: 2,
      url: "https://loveiq.org/k3x9p2a",
    });
    expect(links[0].target).toContain("utm_term=k3x9p2a");
  });

  it("reads one link by its code, 200 links by default", async () => {
    await GET(get("?code=K3X9P2A"));
    expect(listShortLinks).toHaveBeenCalledWith({ code: "k3x9p2a", limit: 200 });
  });

  it("refuses a request without the key", async () => {
    const res = await GET(get("", null));
    expect(res.status).toBe(401);
    expect(listShortLinks).not.toHaveBeenCalled();
  });

  it("refuses filters it cannot use", async () => {
    for (const query of [
      "?since=yesterday",
      "?since=2026-02-31",
      "?since=2026-13-01",
      "?limit=5000",
      "?limit=0",
      "?limit=abc",
      "?code=abc",
    ]) {
      const res = await GET(get(query));
      expect(res.status, query).toBe(400);
    }
  });
});
