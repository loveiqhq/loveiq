/**
 * The email's link (/api/unlock-feedback/open) and the two posts /why makes (answer, detail),
 * through the real answer and grant code over an in-memory database (fakeDb).
 */
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeDb } from "./fakeDb";

const state = vi.hoisted(() => ({ db: null as unknown as FakeDb, cookie: null as string | null }));

vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: (url: string, init: never) => state.db.fetch(url, init),
}));
vi.mock("@shared/http/circuit-breaker", () => ({
  getBreaker: () => ({ fire: (fn: () => Promise<unknown>) => fn() }),
  CircuitOpenError: class CircuitOpenError extends Error {},
}));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@shared/observability/slack", () => ({
  notifySlack: vi.fn(),
  escapeSlack: (s: string) => s,
  maskEmail: (s: string) => s,
}));
const mockCsrf = vi.fn();
vi.mock("@shared/http/csrf", () => ({
  verifyCsrfToken: (...args: unknown[]) => mockCsrf(...args),
}));
const mockRateLimit = vi.fn();
vi.mock("@shared/http/ratelimit", () => ({
  checkRateLimit: (...args: unknown[]) => mockRateLimit(...args),
  getClientIp: () => "1.2.3.4",
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "uf_t" && state.cookie ? { value: state.cookie } : undefined),
  }),
}));

const { createFakeDb, READER } = await import("./fakeDb");
const { GET: open } = await import("@/app/api/unlock-feedback/open/route");
const { POST: answer } = await import("@/app/api/unlock-feedback/answer/route");
const { POST: detail } = await import("@/app/api/unlock-feedback/detail/route");
const { hashLinkToken } = await import("@features/unlock-feedback/server/link");

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15";
const IPAD = "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";

function post(path: "answer" | "detail", body: unknown, userAgent = IPHONE) {
  return new Request(`http://localhost:3000/api/unlock-feedback/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-csrf-token": "t", "user-agent": userAgent },
    body: JSON.stringify(body),
  });
}

const allowed = { allowed: true, remaining: 9, resetAt: new Date() };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SUPABASE_URL = "https://test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
  mockCsrf.mockResolvedValue(true);
  mockRateLimit.mockResolvedValue(allowed);
  state.db = createFakeDb();
  state.db.seedReader();
  state.cookie = READER.linkToken;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/unlock-feedback/open (the email's link)", () => {
  const link = (query: string) =>
    new NextRequest(`http://localhost:3000/api/unlock-feedback/open?${query}`);

  it("moves the token into an httpOnly cookie and sends the reader to /why without it", async () => {
    const res = await open(link(`r=too_expensive&t=${READER.linkToken}`));

    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("http://localhost:3000/why?r=too_expensive");
    expect(res.headers.get("cache-control")).toBe("no-store");
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`uf_t=${READER.linkToken}`);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=lax/i);
    expect(cookie).toContain("Path=/api/unlock-feedback");
    expect(cookie).toContain("Max-Age=3600");
    expect(cookie).not.toMatch(/Secure/i);
  });

  it("marks the cookie Secure in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const res = await open(link(`r=time_commitment&t=${READER.linkToken}`));
    expect(res.headers.get("set-cookie")).toMatch(/Secure/i);
  });

  it("records nothing: a scanner's GET is not an answer", async () => {
    await open(link(`r=time_commitment&t=${READER.linkToken}`));
    expect(state.db.calls).toHaveLength(0);
    expect(state.db.feedback().answered_at).toBeNull();
  });

  it("a token of the wrong shape: /why with its reason, and no cookie left", async () => {
    const res = await open(link("r=privacy&t=short"));
    expect(res.headers.get("location")).toBe("http://localhost:3000/why?r=privacy");
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("uf_t=;");
    expect(cookie).toContain("Max-Age=0");
  });

  it("an unknown reason: /why on its own, no cookie", async () => {
    const res = await open(link(`r=nope&t=${READER.linkToken}`));
    expect(res.headers.get("location")).toBe("http://localhost:3000/why");
    expect(res.headers.get("set-cookie")).not.toContain(READER.linkToken);
  });

  it("is rate limited", async () => {
    mockRateLimit.mockResolvedValueOnce({ ...allowed, allowed: false });
    const res = await open(link(`r=time_commitment&t=${READER.linkToken}`));
    expect(res.status).toBe(429);
    expect(res.headers.get("set-cookie")).toBeNull();
  });
});

describe("POST /api/unlock-feedback/answer", () => {
  it("403 without a valid CSRF token, nothing recorded", async () => {
    mockCsrf.mockResolvedValue(false);
    expect((await answer(post("answer", { r: "time_commitment" }))).status).toBe(403);
    expect(state.db.feedback().answered_at).toBeNull();
  });

  it("429 per address, and per link keyed on the token's hash, never the token", async () => {
    mockRateLimit.mockResolvedValueOnce({ ...allowed, allowed: false });
    expect((await answer(post("answer", { r: "time_commitment" }))).status).toBe(429);

    mockRateLimit
      .mockResolvedValueOnce(allowed)
      .mockResolvedValueOnce({ ...allowed, allowed: false });
    expect((await answer(post("answer", { r: "time_commitment" }))).status).toBe(429);
    const keys = mockRateLimit.mock.calls.map(([key]) => key);
    expect(keys).toContain(hashLinkToken(READER.linkToken));
    expect(keys).not.toContain(READER.linkToken);
    expect(state.db.feedback().answered_at).toBeNull();
  });

  it("400 on an unknown reason, and on the two answers taken out on 22.10", async () => {
    for (const r of ["free", "checkout", "later"]) {
      expect((await answer(post("answer", { r }))).status).toBe(400);
    }
    expect(state.db.feedback().answered_at).toBeNull();
  });

  it("404 alike for no cookie, a malformed one, an unknown token and an unsent email", async () => {
    state.cookie = null;
    expect((await answer(post("answer", { r: "time_commitment" }))).status).toBe(404);
    state.cookie = "not-a-token";
    expect((await answer(post("answer", { r: "time_commitment" }))).status).toBe(404);
    state.cookie = "B".repeat(43);
    expect((await answer(post("answer", { r: "time_commitment" }))).status).toBe(404);
    state.cookie = READER.linkToken;
    state.db.feedback().sent_at = null;
    expect((await answer(post("answer", { r: "time_commitment" }))).status).toBe(404);
    expect(state.db.grants()).toHaveLength(0);
  });

  it("records the first answer and unlocks the report", async () => {
    const res = await answer(post("answer", { r: "too_expensive" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      alreadyPaid: false,
      archetypeName: READER.archetype,
      reason: "too_expensive",
      reportPath: `/report/${READER.reportToken}`,
    });
    const [grant] = state.db.grants();
    expect(state.db.feedback()).toMatchObject({
      reason: "too_expensive",
      first_reason: "too_expensive",
      answer_loads: 1,
      device: "mobile",
      already_paid: false,
      payment_id: grant!.id,
    });
    expect(state.db.feedback().answered_at).toEqual(expect.any(String));
    expect(state.db.feedback().unlocked_at).toEqual(expect.any(String));
  });

  it("keeps the first answer when another button is tapped later", async () => {
    await answer(post("answer", { r: "too_expensive" }));
    const res = await answer(post("answer", { r: "time_commitment" }));

    expect((await res.json()).reason).toBe("too_expensive");
    expect(state.db.feedback()).toMatchObject({
      reason: "too_expensive",
      first_reason: "too_expensive",
      answer_loads: 2,
    });
    expect(state.db.grants()).toHaveLength(1);
  });

  it("two posts at the same instant: one first answer, one grant, both counted", async () => {
    const [a, b] = await Promise.all([
      answer(post("answer", { r: "privacy" })),
      answer(post("answer", { r: "result_off" })),
    ]);
    const [bodyA, bodyB] = [await a.json(), await b.json()];

    const first = state.db.feedback().first_reason;
    expect(["privacy", "result_off"]).toContain(first);
    expect(bodyA.reason).toBe(first);
    expect(bodyB.reason).toBe(first);
    expect(state.db.feedback().answer_loads).toBe(2);
    expect(state.db.grants()).toHaveLength(1);
  });

  it("someone who bought since the email: answer kept, nothing unlocked", async () => {
    state.db.buy({ plan: "full_report", amount: 4.99, chargeId: "ch_own" });
    const res = await answer(post("answer", { r: "low_value" }));

    expect((await res.json()).alreadyPaid).toBe(true);
    expect(state.db.feedback()).toMatchObject({
      reason: "low_value",
      already_paid: true,
      unlocked_at: null,
      payment_id: null,
    });
    expect(state.db.grants()).toHaveLength(0);

    // A repeat tap still says so, and still grants nothing.
    expect((await (await answer(post("answer", { r: "low_value" }))).json()).alreadyPaid).toBe(
      true
    );
    expect(state.db.grants()).toHaveLength(0);
  });

  it("tells a tablet from a phone and a computer", async () => {
    await answer(post("answer", { r: "time_commitment" }, IPAD));
    expect(state.db.feedback().device).toBe("tablet");

    for (const [userAgent, touch, device] of [
      [MAC, true, "tablet"],
      [MAC, undefined, "desktop"],
    ] as const) {
      state.db = createFakeDb();
      state.db.seedReader();
      await answer(post("answer", { r: "time_commitment", touch }, userAgent));
      expect(state.db.feedback().device).toBe(device);
    }
  });

  it("500 with a generic message when the database fails", async () => {
    state.db.fetch = async () => new Response("{}", { status: 500 });
    const res = await answer(post("answer", { r: "time_commitment" }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Unable to save your answer." });
  });
});

describe("POST /api/unlock-feedback/detail", () => {
  const answered = () => answer(post("answer", { r: "too_expensive" }));

  it("403 / 429 / 400 before anything is written", async () => {
    await answered();
    mockCsrf.mockResolvedValueOnce(false);
    expect((await detail(post("detail", { chips: [] }))).status).toBe(403);
    mockRateLimit.mockResolvedValueOnce({ ...allowed, allowed: false });
    expect((await detail(post("detail", { chips: [] }))).status).toBe(429);
    expect((await detail(post("detail", { chips: "A little less" }))).status).toBe(400);
    expect(state.db.feedback().detail_at).toBeNull();
  });

  it("404 before the answer is recorded, or without the link's cookie", async () => {
    expect((await detail(post("detail", { chips: [] }))).status).toBe(404);
    await answered();
    state.cookie = null;
    expect((await detail(post("detail", { chips: [] }))).status).toBe(404);
  });

  it("keeps only the reason's own chips, and the words cleaned", async () => {
    await answered();
    const res = await detail(
      post("detail", {
        chips: ["A little less", "Hacked", "A little less", "Payment failed"],
        note: "  Too much\u0000 for\r\nme\u0007\tnow  ",
      })
    );

    expect(res.status).toBe(200);
    expect(state.db.feedback()).toMatchObject({
      reason: "too_expensive",
      chips: ["A little less"],
      note: "Too much for\nme\tnow",
      changed_at: null,
    });
    expect(state.db.feedback().detail_at).toEqual(expect.any(String));
  });

  it("a changed answer replaces the reason, never the first one, and its chips follow it", async () => {
    await answered();
    await detail(post("detail", { reason: "result_off", chips: ["Too broad", "A little less"] }));

    expect(state.db.feedback()).toMatchObject({
      reason: "result_off",
      first_reason: "too_expensive",
      chips: ["Too broad"],
      note: null,
    });
    expect(state.db.feedback().changed_at).toEqual(expect.any(String));
  });

  it("takes 2,000 characters and refuses more", async () => {
    await answered();
    expect((await detail(post("detail", { chips: [], note: "x".repeat(2001) }))).status).toBe(400);
    expect((await detail(post("detail", { chips: [], note: "x".repeat(2000) }))).status).toBe(200);
    expect(state.db.feedback().note).toHaveLength(2000);
  });
});
