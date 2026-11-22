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
import { isMinor } from "@features/mira/server/minor";
import { getMiraAccount } from "@features/mira/server/session";
import { getProfile } from "@features/mira/server/store";
import { checkRateLimit } from "@shared/http/ratelimit";

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
