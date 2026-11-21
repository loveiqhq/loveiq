import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: vi.fn(),
  fetchAllRows: vi.fn(),
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
vi.mock("@features/mira/server/minor", () => ({ isMinor: vi.fn() }));
vi.mock("@features/mira/server/store", () => ({ logMiraEvent: vi.fn(), getProfile: vi.fn() }));

import { supabaseFetch } from "@features/admin/server/supabase";
import { isMinor } from "@features/mira/server/minor";
import { makeToken } from "@features/mira/server/nudges";
import { getMiraAccount } from "@features/mira/server/session";
import { getProfile, logMiraEvent } from "@features/mira/server/store";
import { verifyCsrfToken } from "@shared/http/csrf";
import { DELETE, GET, PATCH, PUT } from "@/app/api/mira/journal/route";
import { GET as visitStop, POST as stop } from "@/app/api/mira/journal/reminder/route";

process.env.UNSUBSCRIBE_SECRET = "test-secret-for-mira-journal-0123456789";

const LEA = { id: "11111111-2222-4333-8444-555555555555", email: "lea@example.com" };
const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status });
/** What the database answers, by request; anything else is an empty list. */
let answer: (path: string, init: { method?: string; body?: string }) => Response | undefined;
const calls = () =>
  vi.mocked(supabaseFetch).mock.calls.map(([path, init]) => ({
    method: init?.method ?? "GET",
    path,
    body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null,
  }));
const writes = () => calls().filter((c) => c.method !== "GET");
const events = () =>
  vi.mocked(logMiraEvent).mock.calls.map(([name, , props]) => ({ name, props: props ?? {} }));

const call = (method: string, query = "", body?: unknown) =>
  new Request(`http://localhost/api/mira/journal${query}`, {
    method,
    headers: { "Content-Type": "application/json", "x-csrf-token": "t" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

/** The day a check-in can be started for right now, by UTC. */
const today = () => new Date().toISOString().slice(0, 10);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getMiraAccount).mockResolvedValue(LEA);
  vi.mocked(isMinor).mockResolvedValue(false);
  vi.mocked(verifyCsrfToken).mockResolvedValue(true);
  answer = () => undefined;
  vi.mocked(supabaseFetch).mockImplementation(
    async (path: string, init: { method?: string; body?: string } = {}) =>
      answer(path, init) ?? json([])
  );
});

describe("the journal's routes, for everyone", () => {
  it("need a signed-in account", async () => {
    vi.mocked(getMiraAccount).mockResolvedValue(null);
    for (const res of [
      await GET(call("GET")),
      await PUT(call("PUT", "", { day: today(), mood: 3 })),
      await PATCH(call("PATCH", "", { share: "scores" })),
      await DELETE(call("DELETE", "?all=1")),
    ]) {
      expect(res.status).toBe(401);
    }
    expect(supabaseFetch).not.toHaveBeenCalled();
  });

  it("refuse an account Mira stopped as under 18, and touch nothing", async () => {
    vi.mocked(isMinor).mockResolvedValue(true);
    for (const res of [
      await GET(call("GET")),
      await PUT(call("PUT", "", { day: today(), mood: 3 })),
      await PATCH(call("PATCH", "", { reminderTime: "20:00" })),
      await DELETE(call("DELETE", "?all=1")),
    ]) {
      expect(res.status).toBe(403);
    }
    expect(isMinor).toHaveBeenCalledWith(LEA.id);
    expect(supabaseFetch).not.toHaveBeenCalled();
  });

  it("need the CSRF token to change anything", async () => {
    vi.mocked(verifyCsrfToken).mockResolvedValue(false);
    expect((await PUT(call("PUT", "", { day: today(), mood: 3 }))).status).toBe(403);
    expect((await PATCH(call("PATCH", "", { share: "scores" }))).status).toBe(403);
    expect((await DELETE(call("DELETE", "?all=1"))).status).toBe(403);
    expect(supabaseFetch).not.toHaveBeenCalled();
  });
});

describe("GET /api/mira/journal", () => {
  it("answers the account's own entries and settings, uncached", async () => {
    answer = (path) =>
      path.startsWith("/rest/v1/mira_user")
        ? json([
            { journal_share: "scores", journal_reminder_time: "20:00", time_zone: "Europe/Berlin" },
          ])
        : path.startsWith("/rest/v1/mira_journal_entry")
          ? json([
              {
                day: "2026-11-21",
                mood: 4,
                body: null,
                closeness: 3,
                energy: null,
                note: "A walk",
              },
            ])
          : undefined;
    const res = await GET(call("GET"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({
      entries: [
        { day: "2026-11-21", mood: 4, body: null, closeness: 3, energy: null, note: "A walk" },
      ],
      settings: { share: "scores", reminderTime: "20:00", timeZone: "Europe/Berlin" },
    });
    for (const c of calls()) expect(c.path).toMatch(new RegExp(`(user_id|[?&]id)=eq.${LEA.id}&`));
  });
});

describe("PUT /api/mira/journal", () => {
  it("takes one day's ratings, 1 to 5 with at least one, and a one-line note", async () => {
    for (const body of [
      {},
      { day: today() },
      { day: today(), mood: null, body: null },
      { day: today(), mood: 6 },
      { day: today(), mood: 2.5 },
      { day: "2026-02-30", mood: 3 },
      { day: today(), mood: 3, note: "x".repeat(281) },
      { day: today(), mood: 3, user_id: "someone-else" },
    ]) {
      expect((await PUT(call("PUT", "", body))).status, JSON.stringify(body)).toBe(400);
    }
    expect(supabaseFetch).not.toHaveBeenCalled();
  });

  it("saves today's check-in on the person's own account, its note on one line", async () => {
    const res = await PUT(call("PUT", "", { day: today(), mood: 4, note: "  a good\n\n day  " }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    const [save] = writes();
    expect(save).toMatchObject({
      method: "POST",
      path: "/rest/v1/mira_journal_entry?on_conflict=user_id,day",
      body: {
        user_id: LEA.id,
        day: today(),
        mood: 4,
        body: null,
        closeness: null,
        energy: null,
        note: "a good day",
      },
    });
    expect(events()).toEqual([{ name: "journal_saved", props: { areas: 1, note: true } }]);
  });

  it("changes an older day only where the person has an entry", async () => {
    answer = (path, init) =>
      init.method === "PATCH" && path.includes("day=eq.2026-11-01") ? json([]) : undefined;
    expect((await PUT(call("PUT", "", { day: "2026-11-01", body: 2 }))).status).toBe(404);
    const [edit] = writes();
    expect(edit).toMatchObject({
      method: "PATCH",
      path: `/rest/v1/mira_journal_entry?user_id=eq.${LEA.id}&day=eq.2026-11-01&select=day`,
    });
    expect(events()).toEqual([]);

    answer = (_path, init) => (init.method === "PATCH" ? json([{ day: "2026-11-01" }]) : undefined);
    expect((await PUT(call("PUT", "", { day: "2026-11-01", body: 2 }))).status).toBe(200);
  });

  it("shows a note with crisis words the chat's support lines, and still keeps it", async () => {
    vi.mocked(getProfile).mockResolvedValue({ country: "DE" } as never);
    const res = await PUT(
      call("PUT", "", { day: today(), mood: 1, note: "I want to end my life" })
    );
    const out = (await res.json()) as { crisis?: boolean; crisisLines?: { code: string } };
    expect(res.status).toBe(200);
    expect(out.crisis).toBe(true);
    expect(out.crisisLines?.code).toBe("DE");
    expect(writes()).toHaveLength(1);
    expect(events()).toContainEqual({
      name: "crisis_shown",
      props: { country: "DE", from: "journal" },
    });
    // The person's words never reach the KPI log.
    expect(JSON.stringify(events())).not.toContain("life");
  });

  it("answers a plain note without support lines", async () => {
    const out = await (await PUT(call("PUT", "", { day: today(), mood: 4, note: "Fine" }))).json();
    expect(out).toEqual({ success: true });
  });
});

describe("PATCH /api/mira/journal", () => {
  it("lets Mira read the ratings, or the notes too, and records when that was chosen", async () => {
    expect((await PATCH(call("PATCH", "", { share: "notes" }))).status).toBe(200);
    const [save] = writes();
    expect(save!.path).toBe(`/rest/v1/mira_user?id=eq.${LEA.id}`);
    expect(save!.body).toMatchObject({ journal_share: "notes" });
    expect(Date.parse(String(save!.body!.journal_share_at))).toBeGreaterThan(Date.now() - 60_000);
    expect(events()).toEqual([{ name: "journal_share_set", props: { share: "notes" } }]);
  });

  it("turns the daily reminder on at a whole or half hour, or off", async () => {
    for (const bad of [
      { reminderTime: "20:15" },
      { reminderTime: "24:00" },
      { share: "everyone" },
      {},
      { reminderTime: null, time_zone: "UTC" },
    ]) {
      expect((await PATCH(call("PATCH", "", bad))).status, JSON.stringify(bad)).toBe(400);
    }
    expect(supabaseFetch).not.toHaveBeenCalled();
    await PATCH(call("PATCH", "", { reminderTime: "07:30" }));
    await PATCH(call("PATCH", "", { reminderTime: null }));
    expect(writes().map((w) => w.body)).toEqual([
      expect.objectContaining({ journal_reminder_time: "07:30" }),
      expect.objectContaining({ journal_reminder_time: null }),
    ]);
    expect(events()).toEqual([
      { name: "journal_reminder_set", props: { on: true } },
      { name: "journal_reminder_set", props: { on: false } },
    ]);
  });
});

describe("DELETE /api/mira/journal", () => {
  it("deletes one day or the whole journal, only ever the person's own", async () => {
    expect((await DELETE(call("DELETE", "?day=2026-11-20"))).status).toBe(200);
    expect((await DELETE(call("DELETE", "?all=1"))).status).toBe(200);
    expect(writes().map((w) => [w.method, w.path])).toEqual([
      ["DELETE", `/rest/v1/mira_journal_entry?user_id=eq.${LEA.id}&day=eq.2026-11-20`],
      ["DELETE", `/rest/v1/mira_journal_entry?user_id=eq.${LEA.id}`],
    ]);
    expect(events()).toEqual([
      { name: "journal_deleted", props: { all: false } },
      { name: "journal_deleted", props: { all: true } },
    ]);
  });

  it("asks for a day or all, nothing else", async () => {
    for (const q of ["", "?day=yesterday", "?all=yes", "?day=2026-11-20&all=1"]) {
      expect((await DELETE(call("DELETE", q))).status, q).toBe(400);
    }
    expect(supabaseFetch).not.toHaveBeenCalled();
  });
});

describe("the reminder email's stop link", () => {
  const link = (t: string) =>
    new Request(`http://localhost/api/mira/journal/reminder?t=${encodeURIComponent(t)}`, {
      method: "POST",
      body: "List-Unsubscribe=One-Click",
    });

  it("stops the person's reminder from the signed link alone, no sign-in or CSRF", async () => {
    vi.mocked(getMiraAccount).mockResolvedValue(null);
    vi.mocked(verifyCsrfToken).mockResolvedValue(false);
    const res = await stop(link(makeToken("prefs", LEA.id)!));
    expect(res.status).toBe(200);
    expect(writes()).toEqual([
      {
        method: "PATCH",
        path: `/rest/v1/mira_user?id=eq.${LEA.id}`,
        body: expect.objectContaining({ journal_reminder_time: null }),
      },
    ]);
    expect(events()).toEqual([{ name: "journal_reminder_stopped", props: {} }]);
  });

  it("refuses a link we did not sign", async () => {
    const forged = `${LEA.id}.not-our-signature`;
    expect((await stop(link(forged))).status).toBe(403);
    expect(supabaseFetch).not.toHaveBeenCalled();
  });

  it("sends someone opening the link to the page that asks first", async () => {
    const t = makeToken("prefs", LEA.id)!;
    const res = await visitStop(
      new Request(`http://localhost/api/mira/journal/reminder?t=${encodeURIComponent(t)}`)
    );
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      `http://localhost/mira/journal/reminder?t=${encodeURIComponent(t)}`
    );
    expect(supabaseFetch).not.toHaveBeenCalled();
  });
});
