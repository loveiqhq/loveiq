import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/http/csrf", () => ({ verifyCsrfToken: vi.fn().mockResolvedValue(true) }));
vi.mock("@shared/http/ratelimit", () => ({
  checkRateLimit: vi.fn(),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@features/mira/server/session", () => ({ getMiraAccount: vi.fn() }));
vi.mock("@features/mira/server/anon", () => ({
  anonId: vi.fn().mockResolvedValue("anon_test_123456789"),
}));
const db = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@features/admin/server/supabase", () => ({ supabaseFetch: db.fetch }));
vi.mock("@features/mira/server/store", () => ({
  getProfile: vi.fn(),
  listChats: vi.fn(),
  logMiraEvent: vi.fn(),
  rateMessage: vi.fn(),
}));

import { GET } from "@/app/api/mira/coaches/route";
import { POST } from "@/app/api/mira/event/route";
import { readCoachState } from "@features/mira/server/coaches";
import { getMiraAccount } from "@features/mira/server/session";
import { getProfile, listChats, logMiraEvent } from "@features/mira/server/store";
import { checkRateLimit } from "@shared/http/ratelimit";

/** GET /api/mira/coaches and the coaches' events on POST /api/mira/event (22 Nov 2026). */

const LEA = { id: "6f2c4a1e-1111-4222-8333-944455556666", email: "lea@example.com" };
const BROWSER = "browser_lea_1234567890";
type Row = {
  name: string;
  anon_id?: string | null;
  props: Record<string, unknown>;
  created_at: string;
};
const row = (
  name: string,
  props: Record<string, unknown>,
  at: string,
  anon_id: string | null = null
) => ({ name, anon_id, props, created_at: at }) satisfies Row;

/** The person's own events (newest first, as the query orders them), and their browser's. */
let own: Row[];
let browser: Row[];
const json = (body: unknown, ok = true) =>
  ({ ok, status: ok ? 200 : 500, json: async () => body }) as Response;

beforeEach(() => {
  vi.clearAllMocks();
  own = [];
  browser = [];
  db.fetch.mockImplementation(async (path: string) =>
    json(path.includes("user_id=eq.") ? own : path.includes("anon_id=in.") ? browser : [])
  );
  vi.mocked(getMiraAccount).mockResolvedValue(LEA);
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: 9, resetAt: new Date() });
  vi.mocked(getProfile).mockResolvedValue({
    id: LEA.id,
    email: LEA.email,
    name: "Lea",
    remember_chats: true,
  } as never);
  vi.mocked(listChats).mockResolvedValue([
    { id: "c1", title: "Lights off again", updated_at: "2026-11-21T10:00:00Z" },
  ]);
});

describe("readCoachState: the person's own topics and Notify me", () => {
  it("lists their chats' topics newest first, the chat they began before signing up too", async () => {
    own = [
      row("chat_topic", { topic: "weight" }, "2026-11-21T09:00:00Z"),
      row("chat_topic", { topic: "hiding" }, "2026-11-20T09:00:00Z"),
      row("signup_completed", { method: "email" }, "2026-11-19T09:05:00Z", BROWSER),
    ];
    browser = [row("chat_topic", { topic: "clothes" }, "2026-11-19T09:00:00Z", BROWSER)];
    expect((await readCoachState(LEA.id)).topics).toEqual(["weight", "hiding", "clothes"]);
    const paths = db.fetch.mock.calls.map(([p]) => String(p));
    expect(paths[0]).toContain(`user_id=eq.${LEA.id}`);
    expect(paths[1]).toContain(`anon_id=in.(${BROWSER})`);
  });

  it("forgets the topics of chats the person deleted", async () => {
    own = [
      row("chat_topic", { topic: "clothes" }, "2026-11-21T09:00:00Z"),
      row("chats_deleted", {}, "2026-11-20T12:00:00Z"),
      row("chat_topic", { topic: "weight" }, "2026-11-20T09:00:00Z"),
      row("signup_completed", { method: "email" }, "2026-11-19T09:05:00Z", BROWSER),
    ];
    browser = [row("chat_topic", { topic: "hiding" }, "2026-11-19T09:00:00Z", BROWSER)];
    expect((await readCoachState(LEA.id)).topics).toEqual(["clothes"]);
  });

  it("keeps each topic once and only Mira's own topic ids", async () => {
    own = [
      row("chat_topic", { topic: "hiding" }, "2026-11-21T09:00:00Z"),
      row("chat_topic", { topic: "<script>" }, "2026-11-21T08:00:00Z"),
      row("chat_topic", { topic: "hiding" }, "2026-11-20T09:00:00Z"),
    ];
    expect((await readCoachState(LEA.id)).topics).toEqual(["hiding"]);
  });

  it("reads Home's older Notify me labels and the new ids as the same coaches", async () => {
    own = [
      row("notify_me", { coach: "lena" }, "2026-11-22T09:00:00Z"),
      row("notify_me", { coach: "Libido challenges" }, "2026-11-20T09:00:00Z"),
      row("notify_me", { coach: "jonas" }, "2026-11-19T09:00:00Z"),
      row("notify_me", { coach: "Somebody new" }, "2026-11-18T09:00:00Z"),
    ];
    expect((await readCoachState(LEA.id)).notified).toEqual(["lena", "jonas"]);
  });

  it("never puts a browser id it can't vouch for into the query", async () => {
    own = [row("signup_completed", {}, "2026-11-19T09:05:00Z", "x),user_id.neq.(0")];
    await readCoachState(LEA.id);
    expect(db.fetch).toHaveBeenCalledTimes(1);
  });
});

describe("GET /api/mira/coaches", () => {
  const get = () => GET(new Request("http://localhost/api/mira/coaches"));

  it("answers only a signed-in person, about themselves", async () => {
    own = [row("chat_topic", { topic: "hiding" }, "2026-11-21T09:00:00Z")];
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({
      name: "Lea",
      email: LEA.email,
      remember: true,
      topics: ["hiding"],
      notified: [],
      chats: [{ id: "c1", title: "Lights off again", updated_at: "2026-11-21T10:00:00Z" }],
    });
    expect(getProfile).toHaveBeenCalledWith(LEA.id);
    expect(listChats).toHaveBeenCalledWith(LEA.id);

    vi.mocked(getMiraAccount).mockResolvedValue(null);
    expect((await get()).status).toBe(401);
  });

  it("uses no topic while “Remember our conversations” is off", async () => {
    own = [row("chat_topic", { topic: "hiding" }, "2026-11-21T09:00:00Z")];
    vi.mocked(getProfile).mockResolvedValue({
      name: null,
      email: LEA.email,
      remember_chats: false,
    } as never);
    const body = await (await get()).json();
    expect(body).toMatchObject({ remember: false, topics: [] });
  });

  it("is rate limited, and fails with a generic message", async () => {
    vi.mocked(checkRateLimit).mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      resetAt: new Date(),
    });
    expect((await get()).status).toBe(429);
    db.fetch.mockResolvedValue(json({}, false));
    const res = await get();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Unable to load your coaches." });
  });
});

describe("POST /api/mira/event for coaches", () => {
  const post = (body: unknown) =>
    POST(
      new Request("http://localhost/api/mira/event", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": "t" },
        body: JSON.stringify(body),
      })
    );
  const logged = () => vi.mocked(logMiraEvent).mock.calls.map(([n, , p]) => [n, p]);

  it("keeps Notify me as one data model: a coming-soon coach's id, Home's old labels included", async () => {
    for (const coach of ["elif", "Libido challenges", "Saying what you want"]) {
      expect((await post({ type: "notify", coach })).status).toBe(200);
    }
    expect(logged()).toEqual([
      ["notify_me", { coach: "elif" }],
      ["notify_me", { coach: "jonas" }],
      ["notify_me", { coach: "ana" }],
    ]);
  });

  it("refuses Notify me for Mira, an unknown coach, or someone we couldn't reach", async () => {
    for (const coach of ["mira", "Somebody new", "x".repeat(61)]) {
      expect((await post({ type: "notify", coach })).status).toBe(400);
    }
    vi.mocked(getMiraAccount).mockResolvedValue(null);
    expect((await post({ type: "notify", coach: "elif" })).status).toBe(401);
    expect(logMiraEvent).not.toHaveBeenCalled();
  });

  it("logs the roster, finder, picks, guide and search moments with ids and numbers only", async () => {
    const ok = [
      { name: "coaches_viewed" },
      { name: "finder_done", detail: "theo" },
      { name: "guide_ask", detail: "2" },
      { name: "search_empty", detail: "roster" },
    ];
    for (const e of ok) expect((await post({ type: "coaches", ...e })).status).toBe(200);
    expect(logged()).toEqual([
      ["coaches_viewed", {}],
      ["finder_done", { coach: "theo" }],
      ["guide_ask", { practice: 2 }],
      ["search_empty", { where: "roster" }],
    ]);
    vi.mocked(logMiraEvent).mockClear();
    for (const bad of [
      { name: "search_empty", detail: "lights off" },
      { name: "chat_started" },
      { name: "guide_ask", detail: "9" },
    ]) {
      expect((await post({ type: "coaches", ...bad })).status).toBe(400);
    }
    expect(logMiraEvent).not.toHaveBeenCalled();
  });
});
