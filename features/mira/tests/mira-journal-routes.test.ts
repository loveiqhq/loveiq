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
import { GET as visitStop, POST as stop } from "@/app/api/mira/journal/unsubscribe/route";
import { GET as nudgePrefs } from "@/app/api/mira/nudges/preferences/route";
import { POST as nudgeUnsubscribe } from "@/app/api/mira/nudges/unsubscribe/route";

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
    answer = (_path, init) => (init.method === "POST" ? json([{ day: today() }]) : undefined);
    const res = await PUT(
      call("PUT", "", { day: today(), mood: 4, note: "  a good\n\n day  ", base: null })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true });
    const [save] = writes();
    expect(save).toMatchObject({
      method: "POST",
      path: "/rest/v1/mira_journal_entry?on_conflict=user_id,day&select=day",
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
    // No entry, and too old to start one: nothing is written.
    expect((await PUT(call("PUT", "", { day: "2026-11-01", body: 2, base: null }))).status).toBe(
      404
    );
    expect(writes()).toEqual([]);
    expect(events()).toEqual([]);

    const base = "2026-11-01T20:00:00.000Z";
    answer = (_path, init) => (init.method === "PATCH" ? json([{ day: "2026-11-01" }]) : undefined);
    expect((await PUT(call("PUT", "", { day: "2026-11-01", body: 2, base }))).status).toBe(200);
    const [edit] = writes();
    expect(edit).toMatchObject({
      method: "PATCH",
      path: `/rest/v1/mira_journal_entry?user_id=eq.${LEA.id}&day=eq.2026-11-01&updated_at=eq.${encodeURIComponent(base)}&select=day`,
    });
  });

  it("shows a note with crisis words the chat's support lines, and still keeps it", async () => {
    vi.mocked(getProfile).mockResolvedValue({ country: "DE" } as never);
    answer = (_path, init) => (init.method === "POST" ? json([{ day: today() }]) : undefined);
    const res = await PUT(
      call("PUT", "", { day: today(), mood: 1, note: "I want to end my life", base: null })
    );
    const out = (await res.json()) as {
      success?: boolean;
      crisis?: boolean;
      crisisLines?: { code: string };
    };
    expect(res.status).toBe(200);
    expect(out.success).toBe(true);
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

  it("shows the support lines for crisis words whatever else stops the save", async () => {
    vi.mocked(getProfile).mockResolvedValue({ country: "DE" } as never);
    const note = "I want to end my life";
    // Nothing rated: not a valid check-in, but the words still get the lines.
    const unrated = await (await PUT(call("PUT", "", { day: today(), note }))).json();
    expect(unrated).toMatchObject({ success: false, crisis: true, crisisLines: { code: "DE" } });
    // An account Mira stopped as under 18: no journal, but the lines all the same.
    vi.mocked(isMinor).mockResolvedValue(true);
    const minor = await (
      await PUT(call("PUT", "", { day: today(), mood: 1, note, base: null }))
    ).json();
    expect(minor).toMatchObject({ success: false, crisis: true });
    expect(writes()).toEqual([]);
    expect(events().filter((e) => e.name === "crisis_shown")).toHaveLength(2);
  });

  it("counts a note in characters as the database does: an emoji is one", async () => {
    answer = (_path, init) => (init.method === "POST" ? json([{ day: today() }]) : undefined);
    // 280 characters, 290 UTF-16 units.
    const note = `${"a".repeat(270)}${"😀".repeat(10)}`;
    expect((await PUT(call("PUT", "", { day: today(), mood: 3, note, base: null }))).status).toBe(
      200
    );
    const over = `${note}b`;
    const res = await PUT(call("PUT", "", { day: today(), mood: 3, note: over, base: null }));
    expect(res.status).toBe(400);
  });

  it("answers a plain note without support lines", async () => {
    answer = (_path, init) => (init.method === "POST" ? json([{ day: today() }]) : undefined);
    const out = await (
      await PUT(call("PUT", "", { day: today(), mood: 4, note: "Fine", base: null }))
    ).json();
    expect(out).toMatchObject({ success: true });
    expect(out).not.toHaveProperty("crisis");
  });
});

describe("PUT /api/mira/journal from a tab that is out of date (HAB-13)", () => {
  const SAVED = {
    day: today(),
    mood: 5,
    body: null,
    closeness: null,
    energy: null,
    note: "Tab one: a really good day",
    updated_at: "2026-11-22T09:00:00.123+00:00",
  };
  const current = (row: unknown) => (path: string, init: { method?: string }) =>
    (init.method ?? "GET") === "GET" && path.startsWith("/rest/v1/mira_journal_entry")
      ? json(row ? [row] : [])
      : undefined;

  it("never replaces a check-in another tab saved for that day: 409 with the saved one", async () => {
    // The insert finds the day taken and skips (ignore-duplicates answers no row).
    answer = current(SAVED);
    const res = await PUT(call("PUT", "", { day: today(), mood: 1, base: null }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ conflict: true, current: SAVED });
    const [insert] = writes();
    expect(insert).toMatchObject({
      method: "POST",
      path: expect.stringContaining("/rest/v1/mira_journal_entry?on_conflict=user_id,day"),
      body: { user_id: LEA.id, day: today(), mood: 1 },
    });
    // Skipped, never merged, when the day is taken.
    const init = vi.mocked(supabaseFetch).mock.calls[0]![1] as { headers: Record<string, string> };
    expect(init.headers.Prefer).toContain("resolution=ignore-duplicates");
    expect(writes()).toHaveLength(1);
    expect(events()).toEqual([]);
  });

  it("changes a check-in only if it is still the one the tab loaded", async () => {
    const base = "2026-11-22T08:00:00.000Z";
    answer = current(SAVED); // the PATCH matches no row: it changed since
    const res = await PUT(call("PUT", "", { day: today(), mood: 2, base }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ conflict: true, current: SAVED });
    const [edit] = writes();
    expect(edit!.method).toBe("PATCH");
    expect(edit!.path).toContain(`&updated_at=eq.${encodeURIComponent(base)}`);

    // Deleted meanwhile: refused too, and the tab learns the day is empty.
    answer = current(null);
    const gone = await PUT(call("PUT", "", { day: today(), mood: 2, base }));
    expect(gone.status).toBe(409);
    expect(await gone.json()).toMatchObject({ conflict: true, current: null });
  });

  it("saves an unchanged check-in's edit, and a new one for an empty day, with their version", async () => {
    answer = (_path, init) => (init.method === "PATCH" ? json([{ day: today() }]) : undefined);
    const edit = await PUT(call("PUT", "", { day: today(), mood: 2, base: SAVED.updated_at }));
    expect(edit.status).toBe(200);
    const edited = (await edit.json()) as { success: boolean; updatedAt: string };
    expect(edited.success).toBe(true);
    expect(Date.parse(edited.updatedAt)).toBeGreaterThan(Date.now() - 60_000);

    answer = (_path, init) => (init.method === "POST" ? json([{ day: today() }]) : undefined);
    const fresh = await PUT(call("PUT", "", { day: today(), mood: 3, base: null }));
    expect(fresh.status).toBe(200);
    expect(events().filter((e) => e.name === "journal_saved")).toHaveLength(2);
  });

  it("takes only a timestamp or null as the version", async () => {
    for (const base of ["yesterday", 5, ""]) {
      expect((await PUT(call("PUT", "", { day: today(), mood: 2, base }))).status).toBe(400);
    }
    expect(supabaseFetch).not.toHaveBeenCalled();
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
    new Request(`http://localhost/api/mira/journal/unsubscribe?t=${encodeURIComponent(t)}`, {
      method: "POST",
      body: "List-Unsubscribe=One-Click",
    });

  it("stops the person's reminder from the signed link alone, no sign-in or CSRF", async () => {
    vi.mocked(getMiraAccount).mockResolvedValue(null);
    vi.mocked(verifyCsrfToken).mockResolvedValue(false);
    const res = await stop(link(makeToken("journal-stop", LEA.id)!));
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

  it("is a link for this one thing: a nudge's token can't stop it, and it can't touch the nudges", async () => {
    // A nudge email's own token, for the person's nudge preferences.
    expect((await stop(link(makeToken("prefs", LEA.id)!))).status).toBe(403);
    const journal = encodeURIComponent(makeToken("journal-stop", LEA.id)!);
    const prefs = await nudgePrefs(
      new Request(`http://localhost/api/mira/nudges/preferences?t=${journal}`)
    );
    expect(prefs.status).toBe(403);
    const unsub = await nudgeUnsubscribe(
      new Request(`http://localhost/api/mira/nudges/unsubscribe?t=${journal}`, { method: "POST" })
    );
    expect(unsub.status).toBe(403);
    expect(supabaseFetch).not.toHaveBeenCalled();
  });

  it("refuses a link we did not sign", async () => {
    const forged = `${LEA.id}.not-our-signature`;
    expect((await stop(link(forged))).status).toBe(403);
    expect(supabaseFetch).not.toHaveBeenCalled();
  });

  it("sends someone opening the link to the page that asks first", async () => {
    const t = makeToken("journal-stop", LEA.id)!;
    const res = await visitStop(
      new Request(`http://localhost/api/mira/journal/unsubscribe?t=${encodeURIComponent(t)}`)
    );
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      `http://localhost/mira/journal/reminder?t=${encodeURIComponent(t)}`
    );
    expect(supabaseFetch).not.toHaveBeenCalled();
  });
});

describe("a new check-in is only for yesterday or today in the person's own zone", () => {
  it("is refused for an older day nobody has an entry for, though it is today somewhere", async () => {
    // 11:30 UTC on Tuesday the 24th: 00:30 on Wednesday the 25th in Auckland.
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-24T11:30:00Z") });
    try {
      answer = (_path, init) =>
        init.method === "POST" ? json([{ day: "2026-11-24" }]) : undefined;
      vi.mocked(getProfile).mockResolvedValueOnce({ time_zone: "Pacific/Auckland" } as never);
      // Monday the 23rd is two days ago there (still today on Baker Island): an edit only.
      const old = { day: "2026-11-23", mood: 3, base: null };
      expect((await PUT(call("PUT", "", old))).status).toBe(404);
      expect(writes()).toEqual([]);
      // Tuesday, their yesterday: a check-in begun before their midnight is still kept.
      vi.mocked(getProfile).mockResolvedValueOnce({ time_zone: "Pacific/Auckland" } as never);
      const yesterday = { day: "2026-11-24", mood: 3, base: null };
      expect((await PUT(call("PUT", "", yesterday))).status).toBe(200);
      expect(writes().at(-1)).toMatchObject({
        method: "POST",
        path: "/rest/v1/mira_journal_entry?on_conflict=user_id,day&select=day",
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
