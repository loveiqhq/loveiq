import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The email journeys' hourly job, run hour by hour over eight days against an in-memory
 * database that answers the PostgREST filters the job writes. A one-run test controls both
 * sides of a hand-off by hand; this one feeds each run's claims to the next, the way
 * production does, so a window that resends, skips or never closes shows up here.
 */

type Row = Record<string, unknown>;
const db: Record<string, Row[]> = {};
let nextId = 1;
const sends: Array<{
  at: number;
  to: string;
  subject: string;
  tags: Array<{ name: string; value: string }>;
}> = [];
let clock = 0;
const refuseOnce = new Set<string>();

function field(row: Row, key: string): unknown {
  const json = /^(\w+)->>(\w+)$/.exec(key);
  if (json) return (row[json[1]!] as Row | null | undefined)?.[json[2]!] ?? null;
  return row[key];
}

function compare(a: unknown, b: string): number {
  if (typeof a === "number") return a - Number(b);
  const da = Date.parse(String(a));
  const db2 = Date.parse(b);
  if (!Number.isNaN(da) && !Number.isNaN(db2) && /\d{4}-\d{2}-\d{2}/.test(b)) return da - db2;
  return String(a).localeCompare(b);
}

/** The PostgREST filters the job uses: eq, neq, lt(e), gt(e), is.null, not.is.null, in.(…). */
function matches(row: Row, key: string, raw: string): boolean {
  const v = field(row, key);
  if (raw === "is.null") return v === null || v === undefined;
  if (raw === "not.is.null") return v !== null && v !== undefined;
  const m = /^(eq|neq|lte|lt|gte|gt|in)\.(.*)$/.exec(raw);
  if (!m) throw new Error(`fake db: unknown filter ${key}=${raw}`);
  const [, op, val] = m;
  if (op === "in")
    return val!
      .replace(/^\(|\)$/g, "")
      .split(",")
      .includes(String(v));
  if (v === null || v === undefined) return false;
  if (op === "eq") return String(v) === val;
  if (op === "neq") return String(v) !== val;
  const c = compare(v, val!);
  return op === "lte" ? c <= 0 : op === "lt" ? c < 0 : op === "gte" ? c >= 0 : c > 0;
}

function select(table: string, params: URLSearchParams): Row[] {
  const rows = db[table] ?? [];
  const reserved = new Set(["select", "order", "limit", "on_conflict", "or"]);
  const filters = [...params.entries()].filter(([k]) => !reserved.has(k));
  const out = rows.filter((r) => filters.every(([k, v]) => matches(r, k, v)));
  const limit = Number(params.get("limit") ?? "1000");
  return out.slice(0, limit);
}

async function fakeFetch(
  path: string,
  opts: { method?: string; body?: string } = {}
): Promise<Response> {
  const url = new URL(`https://db.test${path}`);
  const table = url.pathname.replace("/rest/v1/", "");
  const method = opts.method ?? "GET";
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  if (method === "GET") return json(select(table, url.searchParams));
  if (table !== "email_journey_send") throw new Error(`fake db: ${method} ${table}`);
  if (method === "POST") {
    const row = JSON.parse(opts.body!) as Row;
    const taken = (db[table] ?? []).some(
      (r) => r.email_key === row.email_key && r.target === row.target
    );
    if (taken) return json([], 201);
    const inserted = {
      id: nextId++,
      status: "claimed",
      resend_id: null,
      sent_at: null,
      claimed_at: new Date(clock).toISOString(),
      ...row,
    };
    (db[table] ??= []).push(inserted);
    return json([{ id: inserted.id }], 201);
  }
  const id = Number(url.searchParams.get("id")!.replace("eq.", ""));
  if (method === "PATCH") {
    Object.assign(
      db[table]!.find((r) => r.id === id)!,
      JSON.parse(opts.body!)
    );
    return new Response(null, { status: 204 });
  }
  if (method === "DELETE") {
    db[table] = db[table]!.filter((r) => r.id !== id);
    return new Response(null, { status: 204 });
  }
  throw new Error(`fake db: ${method}`);
}

const switches = new Set<string>();
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (path: string, opts?: { method?: string; body?: string }) => fakeFetch(path, opts),
}));
vi.mock("@features/email-journeys/logic/catalog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@features/email-journeys/logic/catalog")>()),
  isEmailSwitchOn: async (key: string) => switches.has(key),
}));
const suppressed = new Set<string>();
vi.mock("@shared/emails/suppression", () => ({
  suppressionState: async (email: string) => (suppressed.has(email) ? "suppressed" : "clear"),
}));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { runJourneys } from "../server/journeys";

const resend = {
  emails: {
    send: vi.fn(
      async (p: { to: string; subject: string; tags: Array<{ name: string; value: string }> }) => {
        const key = `${p.to}|${p.tags.find((t) => t.name === "stage")?.value}`;
        if (refuseOnce.has(key)) {
          refuseOnce.delete(key);
          return {
            data: null,
            error: { name: "validation_error", message: "refused", statusCode: 422 },
          };
        }
        sends.push({ at: clock, to: p.to, subject: p.subject, tags: p.tags });
        return { data: { id: `re_${sends.length}` }, error: null };
      }
    ),
  },
} as never;

const H = 3_600_000;
const T0 = Date.parse("2026-11-09T08:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();

function reader(id: number, email: string, extra: Row = {}): Row {
  return {
    id,
    survey_submission_id: 1000 + id,
    initial_gate_cohort_at: null,
    initial_gift_arm: null,
    initial_gift_sent_at: null,
    survey_submission: { app_user: { email, first_name: "Alex", processing_restricted_at: null } },
    ...extra,
  };
}

function seed(): void {
  for (const k of Object.keys(db)) delete db[k];
  sends.length = 0;
  nextId = 1;
  refuseOnce.clear();
  suppressed.clear();
  db.personal_report = [
    // I2: gated at T0, never pays.
    reader(1, "gated@example.com", { initial_gate_cohort_at: iso(T0) }),
    // I2: gated at T0, pays at T0 + 1 h: no I2.
    reader(2, "payer@example.com", { initial_gate_cohort_at: iso(T0) }),
    // I4: gifted at T0, never opens.
    reader(3, "gifted@example.com", { initial_gift_arm: "gift", initial_gift_sent_at: iso(T0) }),
    // I4: gifted at T0, opens at T0 + 5 h: no I4.
    reader(4, "opener@example.com", { initial_gift_arm: "gift", initial_gift_sent_at: iso(T0) }),
    // I4: the holdout never gets it, whatever else its row says.
    reader(5, "holdout@example.com", {
      initial_gift_arm: "holdout",
      initial_gift_sent_at: iso(T0),
    }),
    // C2's buyer's report.
    reader(6, "buyer@example.com"),
    // I2: suppressed, never emailed.
    reader(7, "optout@example.com", { initial_gate_cohort_at: iso(T0) }),
  ];
  db.report_access_token = [1, 2, 3, 4, 5, 6, 7].map((n) => ({
    survey_submission_id: 1000 + n,
    token: `rpt_${n}`,
    revoked_at: null,
    expires_at: null,
  }));
  db.payment = [
    {
      id: 90,
      personal_report_id: 6,
      status: "succeeded",
      metadata: { plan: "full_report" },
      payment_date_time: iso(T0),
      app_user: { email: "buyer@example.com", first_name: "Bea", processing_restricted_at: null },
    },
  ];
  db.report_session = [];
  db.survey_submission = [];
  db.survey_partial_save = [
    // R2: draft saved at T0 with R1 sent; never finished.
    {
      session_id: "11111111-1111-4111-8111-111111111111",
      saved_at: iso(T0),
      answers: { "00000": "paused@example.com", "00001": "Pat" },
    },
    // R2: draft saved at T0 with no R1: nothing.
    {
      session_id: "22222222-2222-4222-8222-222222222222",
      saved_at: iso(T0),
      answers: { "00000": "nor1@example.com" },
    },
    // Pay to start R1/R2: the buyer's draft.
    { session_id: "33333333-3333-4333-8333-333333333333", saved_at: iso(T0), answers: {} },
  ];
  db.email_journey_send = [
    {
      id: nextId++,
      email_key: "survey_paused",
      target: "session:11111111-1111-4111-8111-111111111111",
      status: "sent",
    },
  ];
  db.prepaid_report_access = [
    // S3 to S5: paid at T0, never starts.
    {
      id: 501,
      prepaid_token: "rpp_a",
      offer: "pre",
      status: "succeeded",
      is_test: false,
      customer_email: "never@example.com",
      paid_at: iso(T0),
      survey_started_at: null,
      consumed_submission_id: null,
      survey_session_id: null,
    },
    // S3 only: paid at T0, starts the survey at T0 + 30 h.
    {
      id: 502,
      prepaid_token: "rpp_b",
      offer: "full",
      status: "succeeded",
      is_test: false,
      customer_email: "starter@example.com",
      paid_at: iso(T0),
      survey_started_at: null,
      consumed_submission_id: null,
      survey_session_id: null,
    },
    // Pay to start R1/R2: started at T0, paused, the draft above.
    {
      id: 503,
      prepaid_token: "rpp_c",
      offer: "pre",
      status: "succeeded",
      is_test: false,
      customer_email: "paused-buyer@example.com",
      paid_at: iso(T0 - 2 * H),
      survey_started_at: iso(T0 - H),
      consumed_submission_id: null,
      survey_session_id: "33333333-3333-4333-8333-333333333333",
    },
    // A staff test purchase: never emailed.
    {
      id: 504,
      prepaid_token: "rpp_d",
      offer: "pre",
      status: "succeeded",
      is_test: true,
      customer_email: "staff@loveiq.org",
      paid_at: iso(T0),
      survey_started_at: null,
      consumed_submission_id: null,
      survey_session_id: null,
    },
  ];
  suppressed.add("optout@example.com");
}

/** What changes in the world during the eight days. */
function world(at: number): void {
  if (at === T0 + H) {
    db.payment!.push({
      id: 91,
      personal_report_id: 2,
      status: "succeeded",
      metadata: { plan: "initial" },
      payment_date_time: iso(at),
    });
  }
  if (at === T0 + 5 * H)
    db.report_session!.push({ id: "s1", personal_report_id: 4, started_at: iso(at) });
  if (at === T0 + 30 * H)
    db.prepaid_report_access!.find((p) => p.id === 502)!.survey_started_at = iso(at);
}

async function runDays(days: number, atHour?: (hour: number) => void): Promise<void> {
  for (let at = T0; at <= T0 + days * 24 * H; at += H) {
    clock = at;
    world(at);
    atHour?.((at - T0) / H);
    await runJourneys({ resend, nowMs: at, outOfTime: () => false });
  }
}

const stageOf = (s: (typeof sends)[number]) => s.tags.find((t) => t.name === "stage")?.value;
const sentTo = (to: string) => sends.filter((s) => s.to === to);

describe("the email journeys over eight days", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://www.loveiq.org";
    process.env.UNSUBSCRIBE_SECRET = "a".repeat(64);
    switches.clear();
    seed();
  });

  it("sends nothing at all while every switch is off", async () => {
    await runDays(8);
    expect(sends).toEqual([]);
    expect(db.email_journey_send).toHaveLength(1); // only the seeded R1
  });

  it("sends each email once, at its hour, and stops the moment a reader converts", async () => {
    for (const k of ["i2", "i4", "r2", "c2", "s3s5", "ptsReminders"]) switches.add(k);
    await runDays(8);

    const once = (to: string, stage: string, hour: number) => {
      const got = sentTo(to).filter((s) => stageOf(s) === stage);
      expect(got, `${to} ${stage}`).toHaveLength(1);
      expect((got[0]!.at - T0) / H, `${to} ${stage} hour`).toBe(hour);
    };
    // I2 three hours after the report; never to the payer, the opted-out or anyone else.
    once("gated@example.com", "what_199_opens", 3);
    expect(sentTo("payer@example.com")).toEqual([]);
    expect(sentTo("optout@example.com")).toEqual([]);
    // I4 a day after the gift, to the gifted reader who never opened it, never the holdout.
    once("gifted@example.com", "gift_unopened", 24);
    expect(sentTo("opener@example.com")).toEqual([]);
    expect(sentTo("holdout@example.com")).toEqual([]);
    // R2 two days after the last saved answer, only after an R1.
    once("paused@example.com", "survey_paused_2", 48);
    expect(sentTo("nor1@example.com")).toEqual([]);
    // C2 a day after the purchase.
    once("buyer@example.com", "back_into_report", 24);
    // S3, S4, S5 at 24 h, 48 h and 96 h; a buyer who starts at 30 h gets S3 only.
    once("never@example.com", "pts_survey_waiting", 24);
    once("never@example.com", "pts_fifteen_minutes", 48);
    once("never@example.com", "pts_last_reminder", 96);
    expect(sentTo("starter@example.com").map(stageOf)).toEqual(["pts_survey_waiting"]);
    expect(sentTo("staff@loveiq.org")).toEqual([]);
    // The paused buyer: R1 an hour after the last answer, R2 two days after it.
    once("paused-buyer@example.com", "pts_survey_paused", 1);
    once("paused-buyer@example.com", "pts_survey_paused_2", 48);

    // I2, I4, R2, C2, S3 to S5, the starter's S3, and the paused buyer's R1 and R2.
    expect(sends).toHaveLength(10);
    // Every send has its claim, settled as sent with Resend's id.
    const claims = db.email_journey_send!.filter((r) => r.status === "sent");
    expect(claims).toHaveLength(11); // 10 sent + the seeded R1
    expect(claims.filter((r) => r.resend_id).length).toBe(10);
    expect(db.email_journey_send!.every((r) => r.status === "sent")).toBe(true);
  });

  it("tags each email with its stage, the reader's submission when there is one, and its links", async () => {
    for (const k of ["i2", "s3s5"]) switches.add(k);
    await runDays(2);
    const i2 = sentTo("gated@example.com")[0]!;
    expect(i2.tags).toEqual([
      { name: "stage", value: "what_199_opens" },
      { name: "sub", value: "1001" },
    ]);
    const s3 = sentTo("never@example.com")[0]!;
    expect(s3.tags).toEqual([
      { name: "stage", value: "pts_survey_waiting" },
      { name: "offer", value: "pre" },
    ]);
    const html = (resend as { emails: { send: ReturnType<typeof vi.fn> } }).emails.send.mock.calls
      .map((c) => c[0] as { to: string; html: string })
      .find((p) => p.to === "never@example.com")!.html;
    expect(html).toContain(
      "/sexual-archetype/continue?t=rpp_a&amp;utm_source=email&amp;utm_medium=nurture&amp;utm_campaign=pts_survey_waiting"
    );
  });

  it("frees a claim Resend refused (a 4xx) and sends it on the next run, once", async () => {
    switches.add("i2");
    refuseOnce.add("gated@example.com|what_199_opens");
    await runDays(1);
    const got = sentTo("gated@example.com");
    expect(got).toHaveLength(1);
    expect((got[0]!.at - T0) / H).toBe(4); // refused at 3 h, sent at 4 h
  });

  it("never sends a claim already taken: a second instance of the same run sends nothing", async () => {
    switches.add("c2");
    clock = T0 + 25 * H;
    await Promise.all([
      runJourneys({ resend, nowMs: clock, outOfTime: () => false }),
      runJourneys({ resend, nowMs: clock, outOfTime: () => false }),
    ]);
    expect(sentTo("buyer@example.com")).toHaveLength(1);
  });

  it("starts nobody mid-ladder: S4, S5 and the buyer's R2 go only after the email before them", async () => {
    // The switches come on at hour 50: past S3's and R1's windows, inside S4's and R2's.
    await runDays(8, (hour) => {
      if (hour === 50) for (const k of ["s3s5", "ptsReminders"]) switches.add(k);
    });
    expect(sentTo("never@example.com")).toEqual([]);
    expect(sentTo("paused-buyer@example.com")).toEqual([]);
  });

  it("stops at the time budget between two readers, and the next run carries on", async () => {
    switches.add("i2");
    db.personal_report!.push(reader(8, "gated2@example.com", { initial_gate_cohort_at: iso(T0) }));
    db.report_access_token!.push({
      survey_submission_id: 1008,
      token: "rpt_8",
      revoked_at: null,
      expires_at: null,
    });
    clock = T0 + 4 * H;
    let checks = 0;
    // The run's own check, then the first reader's: the budget is gone before the second.
    const run = await runJourneys({ resend, nowMs: clock, outOfTime: () => ++checks > 2 });
    expect(run.stoppedEarly).toBe(true);
    expect(sends).toHaveLength(1);
    await runJourneys({ resend, nowMs: clock + H, outOfTime: () => false });
    // The second reader gets theirs on the next run; the first is never sent twice.
    expect(sentTo("gated@example.com")).toHaveLength(1);
    expect(sentTo("gated2@example.com")).toHaveLength(1);
  });

  it("stops at the time budget without sending past it", async () => {
    switches.add("i2");
    clock = T0 + 4 * H;
    const run = await runJourneys({ resend, nowMs: clock, outOfTime: () => true });
    expect(run.stoppedEarly).toBe(true);
    expect(sends).toEqual([]);
  });
});
