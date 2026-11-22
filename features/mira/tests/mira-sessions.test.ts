import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Weekly sessions: the API route, the email-link stop, the reminder run and the under-18 purge,
 * against a small in-memory stand-in for PostgREST (only what these modules ask of it).
 */

type Row = Record<string, unknown>;
const db = vi.hoisted(() => ({
  tables: {} as Record<string, Array<Record<string, unknown>>>,
  calls: [] as Array<{ method: string; path: string; body: unknown }>,
}));

/** PostgREST, as far as these modules use it: eq / is.null / not.is.null filters, a few headers. */
async function fakeFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const method = init.method ?? "GET";
  const body = init.body ? JSON.parse(String(init.body)) : undefined;
  db.calls.push({ method, path, body });
  const url = new URL(path, "http://db");
  const table = url.pathname.replace("/rest/v1/", "");
  const rows = (db.tables[table] ??= []);
  const filters = [...url.searchParams].filter(
    ([k]) => !["select", "limit", "order", "on_conflict"].includes(k) && !k.includes(".")
  );
  const match = (r: Row) =>
    filters.every(([k, v]) => {
      const val = r[k];
      if (v === "is.null") return val === null || val === undefined;
      if (v === "not.is.null") return val !== null && val !== undefined;
      if (v.startsWith("eq.")) return String(val) === v.slice(3);
      if (v.startsWith("gte.")) return String(val) >= v.slice(4); // ISO times compare as text
      throw new Error(`fake PostgREST: no filter ${k}=${v}`);
    });
  const json = (v: unknown) => new Response(JSON.stringify(v), { status: 200 });
  if (method === "GET") return json(rows.filter(match));
  if (method === "POST") {
    const prefer = String((init.headers as Record<string, string> | undefined)?.Prefer ?? "");
    const conflictOn = url.searchParams.get("on_conflict")?.split(",") ?? [];
    const unique: Record<string, string[][]> = {
      mira_session_slot: [["user_id"]],
      mira_session_reminder: [["slot_id", "starts_at"]],
    };
    const inserted: Row[] = [];
    for (const item of [body].flat() as Row[]) {
      const clash = (unique[table] ?? []).some((cols) =>
        rows.some((r) => cols.every((c) => String(r[c]) === String(item[c])))
      );
      if (clash) {
        if (prefer.includes("ignore-duplicates") && conflictOn.length) continue;
        return new Response(JSON.stringify({ code: "23505" }), { status: 409 });
      }
      const row = {
        id: `00000000-0000-4000-8000-${String(rows.length + 1).padStart(12, "0")}`,
        sequence: 0,
        paused_at: null,
        joined_at: null,
        ...item,
      };
      rows.push(row);
      inserted.push(row);
    }
    return json(inserted);
  }
  if (method === "PATCH") {
    const hit = rows.filter(match);
    for (const r of hit) Object.assign(r, body);
    return json(hit);
  }
  if (method === "DELETE") {
    const hit = rows.filter(match);
    db.tables[table] = rows.filter((r) => !hit.includes(r));
    // A slot's reminders go with it (ON DELETE CASCADE).
    if (table === "mira_session_slot") {
      const gone = new Set(hit.map((r) => r.id));
      db.tables.mira_session_reminder = (db.tables.mira_session_reminder ?? []).filter(
        (r) => !gone.has(r.slot_id)
      );
    }
    return json(hit);
  }
  throw new Error(`fake PostgREST: no ${method}`);
}

const send = vi.hoisted(() => vi.fn());
vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(function () {
    return { emails: { send } };
  }),
}));
const candidates = vi.hoisted(() => ({ rows: [] as unknown[], read: vi.fn() }));
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (path: string, init?: RequestInit) => fakeFetch(path, init),
  fetchAllRows: async (path: string) => (candidates.read(path), candidates.rows),
}));
vi.mock("@shared/http/csrf", () => ({ verifyCsrfToken: vi.fn().mockResolvedValue(true) }));
vi.mock("@shared/http/ratelimit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: new Date() }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@shared/emails/suppression", () => ({
  isEmailSuppressed: vi.fn().mockResolvedValue(false),
  isUndeliverable: vi.fn().mockResolvedValue(false),
}));
vi.mock("@features/mira/server/session", () => ({ getMiraAccount: vi.fn() }));
vi.mock("@features/mira/server/minor", () => ({ isMinor: vi.fn().mockResolvedValue(false) }));
vi.mock("@features/mira/server/store", () => ({
  getProfile: vi.fn(),
  logMiraEvent: vi.fn(),
  updateProfile: vi.fn().mockResolvedValue(undefined),
  deleteChats: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({ set: vi.fn(), get: vi.fn() })) }));

import { DELETE, GET, PATCH, PUT } from "@/app/api/mira/weekly-session/route";
import { GET as STOP_GET, POST as STOP } from "@/app/api/mira/weekly-session/stop/route";
import { GET as NUDGE_OPEN } from "@/app/api/mira/nudge/route";
import { GET as NUDGE_PREFS } from "@/app/api/mira/nudges/preferences/route";
import { POST as NUDGE_UNSUBSCRIBE } from "@/app/api/mira/nudges/unsubscribe/route";
import { isMinor } from "@features/mira/server/minor";
import { makeToken, readToken } from "@features/mira/server/nudges";
import { runSessionReminders } from "@features/mira/server/session-emails";
import { getMiraAccount } from "@features/mira/server/session";
import { logMiraEvent, getProfile } from "@features/mira/server/store";
import { markJoined, getSlot } from "@features/mira/server/weekly-sessions";
import { isUndeliverable } from "@shared/emails/suppression";
import { checkRateLimit } from "@shared/http/ratelimit";
import { verifyCsrfToken } from "@shared/http/csrf";

process.env.UNSUBSCRIBE_SECRET = "test-secret-for-mira-sessions-0123456789";
process.env.RESEND_API_KEY = "re_test";
process.env.NEXT_PUBLIC_SITE_URL = "https://www.loveiq.org";

const LEA = { id: "11111111-2222-4333-8444-555555555555", email: "lea@example.com" };
const call = (method: string, body?: unknown, query = "") =>
  new Request(`http://localhost/api/mira/weekly-session${query}`, {
    method,
    headers: { "Content-Type": "application/json", "x-csrf-token": "t" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const book = (over: Record<string, unknown> = {}) =>
  PUT(
    call("PUT", { weekday: 2, time: "19:00", timeZone: "Europe/Berlin", source: "home", ...over })
  );
const events = (name: string) =>
  vi
    .mocked(logMiraEvent)
    .mock.calls.filter(([n]) => n === name)
    .map(([, who, props]) => ({ who, props }));
/** The last email sent: its fields, and its invite's lines with folding undone. */
const lastEmail = () => {
  const [mail, opts] = send.mock.calls.at(-1)! as [
    Record<string, unknown>,
    { idempotencyKey: string },
  ];
  const attachment = (
    mail.attachments as
      Array<{ content: string; contentType: string; filename: string }> | undefined
  )?.[0];
  // Resend reads a string attachment as base64.
  const text = attachment ? Buffer.from(attachment.content, "base64").toString("utf8") : "";
  return { mail, opts, attachment, ics: text.replace(/\r\n /g, "").split("\r\n") };
};

beforeEach(() => {
  vi.clearAllMocks();
  db.tables = {};
  db.calls = [];
  candidates.rows = [];
  vi.useRealTimers();
  vi.mocked(getMiraAccount).mockResolvedValue(LEA);
  vi.mocked(getProfile).mockResolvedValue({
    id: LEA.id,
    email: LEA.email,
    time_zone: "Europe/Berlin",
  } as never);
  vi.mocked(isMinor).mockResolvedValue(false);
  vi.mocked(verifyCsrfToken).mockResolvedValue(true);
  send.mockResolvedValue({ data: { id: "re_1" }, error: null });
});

describe("GET /api/mira/weekly-session", () => {
  it("asks a signed-out visitor to sign in, and refuses someone Mira stopped as under 18", async () => {
    vi.mocked(getMiraAccount).mockResolvedValueOnce(null);
    expect((await GET(call("GET"))).status).toBe(401);
    vi.mocked(isMinor).mockResolvedValueOnce(true);
    expect((await GET(call("GET"))).status).toBe(403);
  });

  it("has no slot before one is booked, with the profile's zone to book in", async () => {
    const res = await GET(call("GET"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ slot: null, timeZone: "Europe/Berlin" });
  });
});

describe("booking a weekly session (PUT)", () => {
  it("refuses a day, time or zone that isn't one, and a request without the CSRF token", async () => {
    for (const bad of [
      { weekday: 0 },
      { weekday: 8 },
      { time: "24:00" },
      { time: "7:5" },
      { timeZone: "Mars/Olympus" },
      // Offsets pass Intl but are no IANA zone: a ":" in the invite's TZID would break it.
      { timeZone: "+01:00" },
      { timeZone: "-0530" },
      { source: "elsewhere" },
    ]) {
      expect((await book(bad)).status, JSON.stringify(bad)).toBe(400);
    }
    vi.mocked(verifyCsrfToken).mockResolvedValueOnce(false);
    expect((await book()).status).toBe(403);
    expect(db.tables.mira_session_slot ?? []).toEqual([]);
    expect(send).not.toHaveBeenCalled();
  });

  it("stores the slot, emails the invite and answers with the next start", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-21T12:00:00Z"), toFake: ["Date"] });
    const res = await book();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      change: "booked",
      emailed: true,
      slot: {
        weekday: 2,
        time: "19:00",
        timeZone: "Europe/Berlin",
        paused: false,
        next: "2026-11-24T18:00:00.000Z",
      },
    });
    expect(body.slot.googleUrl).toMatch(/^https:\/\/calendar\.google\.com\/calendar\/render\?/);
    expect(db.tables.mira_session_slot).toHaveLength(1);
    expect(db.tables.mira_session_slot![0]).toMatchObject({
      user_id: LEA.id,
      weekday: 2,
      local_time: "19:00",
      time_zone: "Europe/Berlin",
      sequence: 0,
    });
    const { mail, opts, attachment, ics } = lastEmail();
    expect(mail.to).toBe("lea@example.com");
    expect(mail.from).toBe("Mira <hello@send.loveiq.org>");
    // Neutral: nothing about bodies, sex or what was said, in the subject or anywhere else.
    expect(mail.subject).toBe("Your weekly session is booked");
    const visible = String(mail.html).replace(/<[^>]+>/g, " ") + String(mail.text);
    expect(visible).not.toMatch(/body|sex|confiden|intima/i);
    expect(attachment).toMatchObject({
      filename: "invite.ics",
      contentType: "text/calendar; charset=utf-8; method=REQUEST",
    });
    expect(ics).toContain("METHOD:REQUEST");
    expect(ics).toContain("SEQUENCE:0");
    expect(ics).toContain(`UID:${String(db.tables.mira_session_slot![0]!.id)}@loveiq.org`);
    expect(ics).toContain(
      "ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;RSVP=FALSE:mailto:lea@example.com"
    );
    // Every session email can be stopped in one click, and says so.
    const headers = mail.headers as Record<string, string>;
    expect(headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(headers["List-Unsubscribe"]).toMatch(
      /^<https:\/\/www\.loveiq\.org\/api\/mira\/weekly-session\/stop\?t=/
    );
    expect(String(mail.text)).toContain("https://www.loveiq.org/mira/session/stop?t=");
    expect(opts.idempotencyKey).toBe(
      `mira-session-booked-${String(db.tables.mira_session_slot![0]!.id)}-0`
    );
    expect(events("session_scheduled")).toEqual([
      { who: { userId: LEA.id }, props: { source: "home" } },
    ]);
  });

  it("stores a zone the way the zone database spells it", async () => {
    await book({ timeZone: "europe/berlin" });
    expect(db.tables.mira_session_slot![0]!.time_zone).toBe("Europe/Berlin");
  });

  it("changes nothing and sends nothing when the same time is booked again", async () => {
    await book();
    send.mockClear();
    const body = await (await book()).json();
    expect(body).toMatchObject({ change: "same", emailed: false });
    expect(send).not.toHaveBeenCalled();
    expect(db.tables.mira_session_slot![0]!.sequence).toBe(0);
  });

  it("moves the series: same UID, a higher sequence, an updated invite", async () => {
    await book();
    const uid = String(db.tables.mira_session_slot![0]!.id);
    const body = await (await book({ weekday: 4, time: "18:30" })).json();
    expect(body).toMatchObject({
      change: "moved",
      emailed: true,
      slot: { weekday: 4, time: "18:30" },
    });
    expect(db.tables.mira_session_slot).toHaveLength(1);
    expect(db.tables.mira_session_slot![0]).toMatchObject({ id: uid, sequence: 1 });
    const { mail, ics, opts } = lastEmail();
    expect(mail.subject).toBe("Your weekly session has a new time");
    expect(ics).toContain(`UID:${uid}@loveiq.org`);
    expect(ics).toContain("SEQUENCE:1");
    expect(ics).toContain("RRULE:FREQ=WEEKLY;BYDAY=TH");
    expect(opts.idempotencyKey).toBe(`mira-session-moved-${uid}-1`);
    expect(events("session_changed")).toHaveLength(1);
  });

  it("still books, without an email, for an address that bounced or past the day's email cap", async () => {
    vi.mocked(isUndeliverable).mockResolvedValueOnce(true);
    expect(await (await book()).json()).toMatchObject({ change: "booked", emailed: false });
    vi.mocked(checkRateLimit).mockImplementation(async (_key, cfg) => ({
      allowed: cfg.bucket !== "mira-session-mail",
      remaining: 0,
      resetAt: new Date(),
    }));
    expect(await (await book({ weekday: 5 })).json()).toMatchObject({
      change: "moved",
      emailed: false,
    });
    expect(send).not.toHaveBeenCalled();
    vi.mocked(checkRateLimit).mockResolvedValue({
      allowed: true,
      remaining: 9,
      resetAt: new Date(),
    });
  });

  it("refuses someone Mira stopped as under 18, before anything is stored or sent", async () => {
    vi.mocked(isMinor).mockResolvedValue(true);
    expect((await book()).status).toBe(403);
    expect((await PATCH(call("PATCH", { paused: true }))).status).toBe(403);
    expect((await DELETE(call("DELETE"))).status).toBe(403);
    expect(db.tables.mira_session_slot ?? []).toEqual([]);
    expect(send).not.toHaveBeenCalled();
  });
});

describe("pausing and cancelling", () => {
  it("pauses and resumes the reminders without an email", async () => {
    await book();
    send.mockClear();
    expect(await (await PATCH(call("PATCH", { paused: true }))).json()).toMatchObject({
      slot: { paused: true },
    });
    expect(db.tables.mira_session_slot![0]!.paused_at).toEqual(expect.any(String));
    expect(await (await PATCH(call("PATCH", { paused: false }))).json()).toMatchObject({
      slot: { paused: false },
    });
    expect(db.tables.mira_session_slot![0]!.paused_at).toBeNull();
    expect(send).not.toHaveBeenCalled();
    expect(events("session_paused")).toEqual([
      { who: { userId: LEA.id }, props: { source: "app" } },
    ]);
    expect(events("session_resumed")).toHaveLength(1);
    expect((await PATCH(call("PATCH", { paused: "yes" }))).status).toBe(400);
  });

  it("cancels: the slot goes, and the cancellation takes it out of the calendar", async () => {
    await book({ weekday: 3 });
    await book({ weekday: 4 });
    const uid = String(db.tables.mira_session_slot![0]!.id);
    const res = await DELETE(call("DELETE"));
    expect(await res.json()).toMatchObject({ slot: null, emailed: true });
    expect(db.tables.mira_session_slot).toEqual([]);
    const { mail, ics, attachment } = lastEmail();
    expect(mail.subject).toBe("Your weekly session is cancelled");
    expect(attachment?.contentType).toBe("text/calendar; charset=utf-8; method=CANCEL");
    expect(ics).toContain("METHOD:CANCEL");
    expect(ics).toContain(`UID:${uid}@loveiq.org`);
    expect(ics).toContain("SEQUENCE:2");
    expect(ics).toContain("STATUS:CANCELLED");
    expect(events("session_cancelled")).toEqual([
      { who: { userId: LEA.id }, props: { source: "app" } },
    ]);
    // Nothing left to cancel.
    expect((await DELETE(call("DELETE"))).status).toBe(404);
  });

  it("serves the invite as a download for Apple or Outlook, and nothing without a slot", async () => {
    expect((await GET(call("GET", undefined, "?format=ics"))).status).toBe(404);
    await book();
    const res = await GET(call("GET", undefined, "?format=ics"));
    expect(res.headers.get("content-type")).toBe("text/calendar; charset=utf-8");
    expect(res.headers.get("content-disposition")).toBe(
      'attachment; filename="mira-weekly-session.ics"'
    );
    const text = await res.text();
    expect(text).toContain("METHOD:PUBLISH");
    expect(text).not.toContain("ATTENDEE");
  });
});

describe("the email's stop link (no sign-in)", () => {
  const stop = (t: string | null, init: RequestInit = {}) =>
    STOP(
      new Request(
        `http://localhost/api/mira/weekly-session/stop${t ? `?t=${encodeURIComponent(t)}` : ""}`,
        {
          method: "POST",
          ...init,
        }
      )
    );

  it("pauses the reminders on a mail app's one-click POST, with no CSRF token", async () => {
    await book();
    vi.mocked(getMiraAccount).mockResolvedValue(null);
    vi.mocked(verifyCsrfToken).mockResolvedValue(false);
    const res = await stop(makeToken("session-stop", LEA.id), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "List-Unsubscribe=One-Click",
    });
    expect(res.status).toBe(200);
    expect(db.tables.mira_session_slot![0]!.paused_at).toEqual(expect.any(String));
    expect(events("session_paused").at(-1)).toEqual({
      who: { userId: LEA.id },
      props: { source: "one-click" },
    });
  });

  it("refuses a link we didn't sign, or one signed for another purpose", async () => {
    await book();
    for (const t of [
      null,
      "nope",
      `${LEA.id}.forged`,
      makeToken("prefs", LEA.id),
      makeToken("open", LEA.id),
    ]) {
      expect((await stop(t)).status, String(t)).toBe(403);
    }
    expect(db.tables.mira_session_slot![0]!.paused_at).toBeNull();
  });

  it("is the only signed link: joining and changing the session need the sign-in", async () => {
    await book();
    candidates.rows = [
      {
        id: String(db.tables.mira_session_slot![0]!.id),
        user_id: LEA.id,
        weekday: 2,
        local_time: "19:00",
        time_zone: "Europe/Berlin",
        sequence: 0,
        paused_at: null,
        mira_user: { email: LEA.email, minor_at: null },
      },
    ];
    await runSessionReminders(new Date("2026-11-24T17:02:00Z"));
    expect(send).toHaveBeenCalledTimes(2); // the invite and a reminder
    for (const [mail] of send.mock.calls as Array<[Record<string, unknown>]>) {
      const links = [...String(mail.text).matchAll(/https:\/\/www\.loveiq\.org\/\S+/g)].map(
        (m) => new URL(m[0])
      );
      const signed = links.filter((u) => u.searchParams.has("t"));
      expect(signed.length).toBeGreaterThan(0);
      for (const u of signed) {
        expect(u.pathname).toBe("/mira/session/stop");
        const t = u.searchParams.get("t");
        expect(readToken("session-stop", t)).toBe(LEA.id);
        expect(readToken("prefs", t)).toBeNull();
        expect(readToken("open", t)).toBeNull();
      }
      for (const u of links.filter((x) => !x.searchParams.has("t"))) {
        expect(["/mira/session", "/mira/settings", "/mira/home"]).toContain(u.pathname);
      }
    }
    // The calendar entry's link carries nothing either.
    expect(lastEmail().ics).not.toContain("t=");
  });

  it("opens nothing else: the nudge links refuse its token", async () => {
    await book();
    const t = encodeURIComponent(makeToken("session-stop", LEA.id)!);
    const unsubscribe = await NUDGE_UNSUBSCRIBE(
      new Request(`http://localhost/api/mira/nudges/unsubscribe?t=${t}`, { method: "POST" })
    );
    expect(unsubscribe.status).toBe(403);
    const prefs = await NUDGE_PREFS(
      new Request(`http://localhost/api/mira/nudges/preferences?t=${t}`)
    );
    expect(prefs.status).toBe(403);
    const open = await NUDGE_OPEN(new Request(`http://localhost/api/mira/nudge?t=${t}`));
    expect(open.headers.get("location")).toBe("http://localhost/mira");
    // Nothing was read or changed for the account through them.
    expect(db.calls.filter((c) => /mira_user|mira_nudge/.test(c.path))).toEqual([]);
  });

  it("only pauses, from the page only with its CSRF token, and refuses an under-18 stop", async () => {
    await book();
    const t = makeToken("session-stop", LEA.id)!;
    const asPage = (action: string) => ({
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    vi.mocked(verifyCsrfToken).mockResolvedValueOnce(false);
    expect((await stop(t, asPage("pause"))).status).toBe(403);
    vi.mocked(isMinor).mockResolvedValueOnce(true);
    expect((await stop(t, asPage("pause"))).status).toBe(403);
    expect(db.tables.mira_session_slot![0]!.paused_at).toBeNull();
    // A stop link can't cancel: that needs the sign-in.
    expect((await stop(t, asPage("cancel"))).status).toBe(400);
    expect((await stop(t, asPage("pause"))).status).toBe(200);
    expect(db.tables.mira_session_slot).toHaveLength(1);
    expect(db.tables.mira_session_slot![0]!.paused_at).toEqual(expect.any(String));
    expect(events("session_paused").at(-1)?.props).toEqual({ source: "email" });
    expect(events("session_cancelled")).toEqual([]);
  });

  it("sends a GET (someone opening the address) to the page, changing nothing", async () => {
    const res = await STOP_GET(new Request("http://localhost/api/mira/weekly-session/stop?t=abc"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost/mira/session/stop?t=abc");
  });
});

describe("the reminder run (every 15 minutes)", () => {
  /** A booked slot as the run's read returns it, with its person. */
  const candidate = (over: Record<string, unknown> = {}, person: Record<string, unknown> = {}) => ({
    id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    user_id: LEA.id,
    weekday: 2,
    local_time: "19:00",
    time_zone: "Europe/Berlin",
    sequence: 0,
    paused_at: null,
    mira_user: { email: "lea@example.com", minor_at: null, ...person },
    ...over,
  });
  // Tue 24 Nov 2026, 19:00 Berlin = 18:00Z: due from 17:00Z to 17:30Z.
  const run = (iso: string) => runSessionReminders(new Date(iso));

  it("emails one reminder per start, however many runs see it due", async () => {
    candidates.rows = [candidate()];
    expect(await run("2026-11-24T17:02:00Z")).toMatchObject({ candidates: 1, due: 1, sent: 1 });
    expect(await run("2026-11-24T17:17:00Z")).toMatchObject({
      due: 1,
      sent: 0,
      skipped: { "already-sent": 1 },
    });
    expect(send).toHaveBeenCalledTimes(1);
    const { mail, opts } = lastEmail();
    expect(mail.subject).toBe("See you at 19:00");
    expect(String(mail.text)).toContain("https://www.loveiq.org/mira/session");
    expect((mail.headers as Record<string, string>)["List-Unsubscribe-Post"]).toBe(
      "List-Unsubscribe=One-Click"
    );
    expect(opts.idempotencyKey).toMatch(/^mira-session-reminder-/);
    expect(db.tables.mira_session_reminder).toEqual([
      expect.objectContaining({ slot_id: candidate().id, starts_at: "2026-11-24T18:00:00.000Z" }),
    ]);
    expect(events("session_reminder_sent")).toHaveLength(1);
  });

  it("sends nothing outside the window, to an undeliverable address or to an under-18 stop", async () => {
    candidates.rows = [candidate()];
    expect(await run("2026-11-24T16:55:00Z")).toMatchObject({ due: 0, sent: 0 });
    expect(await run("2026-11-24T17:35:00Z")).toMatchObject({ due: 0, sent: 0 });
    vi.mocked(isUndeliverable).mockResolvedValueOnce(true);
    expect(await run("2026-11-24T17:02:00Z")).toMatchObject({
      sent: 0,
      skipped: { undeliverable: 1 },
    });
    candidates.rows = [candidate({}, { minor_at: "2026-11-20T10:00:00Z" })];
    expect(await run("2026-11-24T17:17:00Z")).toMatchObject({ sent: 0, skipped: { minor: 1 } });
    expect(send).not.toHaveBeenCalled();
  });

  // As the nudges and the journal's reminder: quiet for 14 days after the support lines showed.
  it("sends none for 14 days after a crisis, then the next start's reminder goes", async () => {
    candidates.rows = [candidate()];
    db.tables.mira_event = [
      { id: 1, user_id: LEA.id, name: "crisis_shown", created_at: "2026-11-11T09:00:00.000Z" },
    ];
    expect(await run("2026-11-24T17:02:00Z")).toMatchObject({
      sent: 0,
      skipped: { "recent-crisis": 1 },
    });
    expect(db.tables.mira_session_reminder ?? []).toEqual([]); // nothing claimed either
    // Someone else's crisis, or one more than 14 days before, changes nothing.
    db.tables.mira_event = [
      {
        id: 1,
        user_id: "someone-else",
        name: "crisis_shown",
        created_at: "2026-11-20T09:00:00.000Z",
      },
      { id: 2, user_id: LEA.id, name: "crisis_shown", created_at: "2026-11-10T17:00:00.000Z" },
    ];
    expect(await run("2026-11-24T17:17:00Z")).toMatchObject({ sent: 1 });
    const asked = db.calls.find((c) => c.path.startsWith("/rest/v1/mira_event?"))!.path;
    expect(asked).toContain(`user_id=eq.${LEA.id}`);
    expect(asked).toContain("name=eq.crisis_shown");
  });

  it("gives a failed send back, so the window's second run tries again", async () => {
    candidates.rows = [candidate()];
    send.mockResolvedValueOnce({ data: null, error: { name: "rate_limit_exceeded" } });
    expect(await run("2026-11-24T17:02:00Z")).toMatchObject({ sent: 0, errors: 1 });
    expect(db.tables.mira_session_reminder ?? []).toEqual([]);
    expect(await run("2026-11-24T17:17:00Z")).toMatchObject({ sent: 1, errors: 0 });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("asks the database only for slots with reminders on, of people not stopped as minors", async () => {
    // The read itself is the database's; the run trusts its filter and checks the person again.
    await run("2026-11-24T17:02:00Z");
    const path = String(candidates.read.mock.calls[0]?.[0]);
    expect(path).toContain("paused_at=is.null");
    expect(path).toContain("mira_user!inner(");
    expect(path).toContain("mira_user.minor_at=is.null");
  });
});

describe("attendance: opening the session within 30 minutes of a reminded start", () => {
  it("marks the start once, and only near it", async () => {
    await book();
    const slot = (await getSlot(LEA.id))!;
    db.tables.mira_session_reminder = [
      { id: "r1", slot_id: slot.id, starts_at: "2026-11-24T18:00:00.000Z", joined_at: null },
    ];
    expect(await markJoined(slot, LEA.id, new Date("2026-11-24T18:40:00Z"))).toBe(false);
    expect(await markJoined(slot, LEA.id, new Date("2026-11-24T18:05:00Z"))).toBe(true);
    expect(await markJoined(slot, LEA.id, new Date("2026-11-24T18:06:00Z"))).toBe(false);
    expect(db.tables.mira_session_reminder[0]!.joined_at).toBe("2026-11-24T18:05:00.000Z");
    expect(events("session_attended")).toEqual([
      { who: { userId: LEA.id }, props: { minutes: 5 } },
    ]);
  });
});

describe("the under-18 stop (server/minor.ts)", () => {
  it("deletes the weekly session with the chats, and sends nothing", async () => {
    await book();
    expect(db.tables.mira_session_slot).toHaveLength(1);
    send.mockClear();
    const { stopForMinor } = await vi.importActual<typeof import("@features/mira/server/minor")>(
      "@features/mira/server/minor"
    );
    await stopForMinor(LEA.id);
    expect(db.tables.mira_session_slot).toEqual([]);
    expect(send).not.toHaveBeenCalled();
    // And the reminder run has nothing left to send for it.
    candidates.rows = [];
    expect(await runSessionReminders(new Date("2026-11-24T17:02:00Z"))).toMatchObject({ sent: 0 });
  });
});
