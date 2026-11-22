import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Weekly sessions say and do what really happened: the under-18 stop is told apart from other
 * refusals, a cancellation that wasn't emailed comes with its calendar update, attendance counts
 * from the reminder on, reminders go to anyone whose mail arrives, and every way an account or its
 * address goes away takes the session out of the calendar. Against a small in-memory stand-in for
 * PostgREST (only what these modules ask of it).
 */

type Row = Record<string, unknown>;
const db = vi.hoisted(() => ({
  tables: {} as Record<string, Array<Record<string, unknown>>>,
}));

async function fakeFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const method = init.method ?? "GET";
  const body = init.body ? JSON.parse(String(init.body)) : undefined;
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
      if (v.startsWith("gte.")) return String(val) >= v.slice(4);
      throw new Error(`fake PostgREST: no filter ${k}=${v}`);
    });
  const json = (v: unknown) => new Response(JSON.stringify(v), { status: 200 });
  if (method === "GET") {
    let hit = rows.filter(match);
    const order = url.searchParams.get("order");
    if (order?.endsWith(".desc")) {
      const col = order.slice(0, -5);
      hit = [...hit].sort((a, b) => String(b[col]).localeCompare(String(a[col])));
    }
    const limit = Number(url.searchParams.get("limit") ?? Infinity);
    return json(hit.slice(0, limit));
  }
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
const candidates = vi.hoisted(() => ({ rows: [] as unknown[] }));
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (path: string, init?: RequestInit) => fakeFetch(path, init),
  fetchAllRows: async () => candidates.rows,
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
}));

import { DELETE, GET, PUT } from "@/app/api/mira/weekly-session/route";
import { joinedOccurrence, reminderDue } from "@features/mira/server/calendar";
import { runSessionReminders } from "@features/mira/server/session-emails";
import { getSlot, markJoined } from "@features/mira/server/weekly-sessions";
import { upcoming } from "@features/mira/ui/weekly-session/useWeeklySession";
import { isMinor } from "@features/mira/server/minor";
import { getMiraAccount } from "@features/mira/server/session";
import { getProfile } from "@features/mira/server/store";
import { isEmailSuppressed, isUndeliverable } from "@shared/emails/suppression";
import { checkRateLimit } from "@shared/http/ratelimit";

process.env.UNSUBSCRIBE_SECRET = "test-secret-for-mira-sessions-0123456789";
process.env.RESEND_API_KEY = "re_test";
process.env.NEXT_PUBLIC_SITE_URL = "https://www.loveiq.org";

const LEA = { id: "11111111-2222-4333-8444-555555555555", email: "lea@example.com" };
/** Tuesdays at 19:00 Berlin, as the pages get it. */
const SESSION_VIEW = {
  weekday: 2,
  time: "19:00",
  timeZone: "Europe/Berlin",
  paused: false,
  next: "2026-11-24T18:00:00.000Z",
  googleUrl: "",
};
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
/** The day's ten session emails are used up: nothing more goes out to the person today. */
const capReached = () =>
  vi
    .mocked(checkRateLimit)
    .mockImplementation(
      async (_k: string, o: { bucket: string }) =>
        ({ allowed: o.bucket !== "mira-session-mail", remaining: 0, resetAt: new Date() }) as never
    );
/** The last email sent: its fields, and its invite's lines with folding undone. */
const lastEmail = () => {
  const [mail] = send.mock.calls.at(-1)! as [Record<string, unknown>];
  const attachment = (mail.attachments as Array<{ content: string }> | undefined)?.[0];
  const text = attachment ? Buffer.from(attachment.content, "base64").toString("utf8") : "";
  return { mail, ics: text.replace(/\r\n /g, "").split("\r\n") };
};

beforeEach(() => {
  vi.clearAllMocks();
  db.tables = {};
  candidates.rows = [];
  vi.mocked(getMiraAccount).mockResolvedValue(LEA);
  vi.mocked(getProfile).mockResolvedValue({
    id: LEA.id,
    email: LEA.email,
    time_zone: "Europe/Berlin",
  } as never);
  vi.mocked(isMinor).mockResolvedValue(false);
  vi.mocked(isEmailSuppressed).mockResolvedValue(false);
  vi.mocked(isUndeliverable).mockResolvedValue(false);
  vi.mocked(checkRateLimit).mockResolvedValue({
    allowed: true,
    remaining: 9,
    resetAt: new Date(),
  } as never);
  send.mockResolvedValue({ data: { id: "re_1" }, error: null });
});

describe("the under-18 stop is told apart from any other refusal", () => {
  it("answers 403 with `minor: true`, so the pages hide sessions only then", async () => {
    vi.mocked(isMinor).mockResolvedValue(true);
    const res = await GET(call("GET"));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ minor: true });
    expect(await book()).toMatchObject({ status: 403 });
  });
});

describe("cancelling says whether the calendar update went out", () => {
  it("past the day's session emails: the slot goes, nothing is sent, the update comes back", async () => {
    await book();
    const slotId = db.tables.mira_session_slot![0]!.id;
    send.mockClear();
    capReached();
    const res = await DELETE(call("DELETE"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { slot: null; emailed: boolean; ics?: string };
    expect(body).toMatchObject({ slot: null, emailed: false });
    const ics = body.ics!.replace(/\r\n /g, "").split("\r\n");
    expect(ics).toContain("METHOD:CANCEL");
    expect(ics).toContain(`UID:${slotId}@loveiq.org`);
    expect(ics).toContain("SEQUENCE:1"); // one more change to the series than the invite (0)
    expect(ics).toContain("STATUS:CANCELLED");
    expect(send).not.toHaveBeenCalled();
    expect(db.tables.mira_session_slot).toEqual([]);
  });

  it("the cancellation email says a copy added with Google Calendar's link goes by hand", async () => {
    await book();
    const res = await DELETE(call("DELETE"));
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ slot: null, emailed: true });
    expect(body.ics).toBeUndefined();
    const { mail, ics } = lastEmail();
    expect(ics).toContain("METHOD:CANCEL");
    for (const words of [String(mail.text), String(mail.html)]) {
      expect(words).toContain("Add to Google Calendar");
      expect(words).toMatch(/can.t reach that copy: delete it in Google Calendar yourself/);
    }
  });
});

describe("attendance counts from the reminder to 30 minutes after the start", () => {
  it("for every start time, opening the reminder as it arrives is attending", () => {
    // The cron runs at :02, :17, :32 and :47; the first run in a start's window sends.
    for (let m = 0; m < 60; m++) {
      const slot = {
        weekday: 2,
        time: `19:${String(m).padStart(2, "0")}`,
        timeZone: "Europe/Berlin",
      };
      const start = Date.parse("2026-11-24T18:00:00Z") + m * 60_000;
      let sentAt: number | null = null;
      for (let t = start - 2 * 3_600_000; t < start && sentAt === null; t += 60_000) {
        const d = new Date(t);
        if ([2, 17, 32, 47].includes(d.getUTCMinutes()) && reminderDue(slot, d)) sentAt = t;
      }
      expect(sentAt, slot.time).not.toBeNull();
      const opened = new Date(sentAt! + 60_000); // tapped a minute after it arrived
      expect(joinedOccurrence(slot, opened)?.getTime(), slot.time).toBe(start);
    }
  });

  it("end to end: reminded at 17:02Z, opened at 17:04Z for an 18:00Z start, is attending", async () => {
    await book(); // Tuesdays 19:00 Berlin = 18:00Z
    const slot = (await getSlot(LEA.id))!;
    candidates.rows = [
      {
        ...db.tables.mira_session_slot![0],
        user_id: LEA.id,
        mira_user: { email: LEA.email, minor_at: null },
      },
    ];
    expect(await runSessionReminders(new Date("2026-11-24T17:02:00Z"))).toMatchObject({ sent: 1 });
    expect(await markJoined(slot, LEA.id, new Date("2026-11-24T17:04:00Z"))).toBe(true);
    expect(db.tables.mira_session_reminder![0]!.joined_at).toBe("2026-11-24T17:04:00.000Z");
  });

  it('Home\'s "Join now" shows for the same window', () => {
    const view = { ...SESSION_VIEW };
    const at = (iso: string) => upcoming(view, Date.parse(iso)).now;
    expect(at("2026-11-24T16:59:00Z")).toBe(false);
    expect(at("2026-11-24T17:00:00Z")).toBe(true);
    expect(at("2026-11-24T17:04:00Z")).toBe(true);
    expect(at("2026-11-24T18:30:00Z")).toBe(true);
    expect(at("2026-11-24T18:31:00Z")).toBe(false);
  });
});

describe("reminders the person asked for reach anyone whose mail arrives", () => {
  const remindAt = async (now: string) => {
    await book();
    candidates.rows = [
      {
        ...db.tables.mira_session_slot![0],
        user_id: LEA.id,
        mira_user: { email: LEA.email, minor_at: null },
      },
    ];
    send.mockClear();
    return runSessionReminders(new Date(now));
  };

  it("an unsubscribe from LoveIQ's other emails doesn't stop them", async () => {
    vi.mocked(isEmailSuppressed).mockResolvedValue(true); // "unsubscribed" on the shared list
    vi.mocked(isUndeliverable).mockResolvedValue(false);
    expect(await remindAt("2026-11-24T17:02:00Z")).toMatchObject({ sent: 1 });
    expect(lastEmail().mail.subject).toBe("See you at 19:00");
  });

  it("an address that bounced or complained gets none", async () => {
    vi.mocked(isUndeliverable).mockResolvedValue(true);
    expect(await remindAt("2026-11-24T17:02:00Z")).toMatchObject({
      sent: 0,
      skipped: { undeliverable: 1 },
    });
    expect(send).not.toHaveBeenCalled();
  });
});
