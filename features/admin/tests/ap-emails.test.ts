import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockVerifyAdminSession = vi.fn();
vi.mock("@features/admin/server/auth", () => ({
  verifyAdminSession: (...args: unknown[]) => mockVerifyAdminSession(...(args as [])),
}));
const mockCheckRateLimit = vi.fn();
vi.mock("@shared/http/ratelimit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));
const mockSupabaseFetch = vi.fn();
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (...args: unknown[]) => mockSupabaseFetch(...args),
  fetchAllRows: vi.fn(),
  countRows: vi.fn(),
  POSTGREST_MAX_ROWS: 1000,
}));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GET } from "@/app/api/admin/ap/emails/route";
import {
  buildEmailsPage,
  clickTrend,
  countMsg,
  EMAIL_TAGS_FROM,
  EMAILS,
  goalsByStage,
  parseEmails,
  readWindow,
  statOf,
  type EmailsData,
  type Msg,
} from "@features/admin/server/ap/emails";
import { EMAIL_STAGES } from "@features/email-journeys/logic/catalog";
import { parseFilters } from "@features/admin/server/ap/filters";

const TODAY = "2026-11-20";
const NOW = new Date("2026-11-20T09:00:00Z");
const range = (from: string, to: string) => parseFilters({ period: "custom", from, to }, TODAY);

const msg = (stage: string, sentAt: string, over: Partial<Msg> = {}): Msg => ({
  stage,
  variant: null,
  sentAt,
  deliveredAt: null,
  openedAt: null,
  clickedAt: null,
  bouncedAt: null,
  complainedAt: null,
  src: "google",
  med: "cpc",
  goalAt: null,
  goalReason: null,
  ...over,
});
const at = (day: string, hm = "09:00") => `${day}T${hm}:00Z`;
const empty = (): EmailsData => ({ msgs: [], tallies: [], unsubs: [], finished: [] });
const def = (key: string) => EMAILS.find((d) => d.key === key)!;
const read = (data: EmailsData) => ({ data, cut: null });

describe("the email registry", () => {
  it("names each stage once, and gives every goal a stage to read it by", () => {
    const stages = EMAILS.flatMap((d) => d.stages);
    expect(new Set(stages).size).toBe(stages.length);
    for (const d of EMAILS) if (d.goalKind) expect(d.stages.length, d.key).toBeGreaterThan(0);
    expect(goalsByStage()).toMatchObject({
      report_ready: "open_report",
      unlock_feedback: "answer",
      "72h_no_unlock": "buy_full",
      initial_gift: "open_report",
      what_199_opens: "buy_core",
    });
  });

  it("never reads a staging-polluted tally, and never both sources on one day", () => {
    const tests = EMAILS.flatMap((d) => (d.tally ? [d.tally.experiment] : []));
    // Survey done's and the receipts' daily counts also hold staging's test emails.
    for (const t of ["survey-complete", "purchase-full_report", "purchase-all_reports"]) {
      expect(tests).not.toContain(t);
    }
    for (const d of EMAILS) {
      if (d.tally && d.readerFrom && d.stages.length) {
        expect(d.tally.to && d.tally.to < d.readerFrom, d.key).toBe(true);
      }
    }
    // Share and invite are read from their tallies only once test sends can't reach them.
    expect(def("report_share").tally!.from).toBe(EMAIL_TAGS_FROM);
    expect(def("invite").tally!.from).toBe(EMAIL_TAGS_FROM);
  });

  it("names every email the journeys send with a reader, so none shows as an unknown stage", () => {
    const named = new Set(EMAILS.flatMap((d) => d.stages));
    // These go before there is a survey (no `sub`): nothing is kept per reader for them.
    const noReader = new Set([
      EMAIL_STAGES.r2,
      EMAIL_STAGES.s2,
      EMAIL_STAGES.s3,
      EMAIL_STAGES.s4,
      EMAIL_STAGES.s5,
      EMAIL_STAGES.r1Pts,
      EMAIL_STAGES.r2Pts,
    ]);
    for (const s of Object.values(EMAIL_STAGES)) {
      if (!noReader.has(s)) expect(named.has(s), s).toBe(true);
    }
  });
});

describe("counting one email", () => {
  it("lets a click imply an open and an open a delivery", () => {
    const c = countMsg(
      msg("h", at("2026-11-12"), { clickedAt: at("2026-11-12", "10:00") }),
      undefined
    );
    expect(c).toMatchObject({ delivered: true, opened: true, clicked: true });
  });

  it("counts an answer to the unlock question as a click, not a scanner's or one without a reason", () => {
    const base = { deliveredAt: at("2026-11-12", "09:00") };
    const real = countMsg(
      msg("unlock_feedback", at("2026-11-12"), {
        ...base,
        goalAt: at("2026-11-12", "09:30"),
        goalReason: "too_expensive",
      }),
      "answer"
    );
    expect(real).toMatchObject({ goal: true, clicked: true, opened: true });
    expect(real.clickAt).toBe(at("2026-11-12", "09:30"));
    const fast = countMsg(
      msg("unlock_feedback", at("2026-11-12"), {
        ...base,
        goalAt: "2026-11-12T09:00:01Z",
        goalReason: "too_expensive",
      }),
      "answer"
    );
    expect(fast).toMatchObject({ goal: false, clicked: false });
    const noReason = countMsg(
      msg("unlock_feedback", at("2026-11-12"), {
        ...base,
        goalAt: at("2026-11-12", "09:30"),
        goalReason: "hacked",
      }),
      "answer"
    );
    expect(noReason.goal).toBe(false);
  });

  it("reads an email as it stood at the cut (the period before at the same age)", () => {
    const m = msg("h", at("2026-11-12"), {
      deliveredAt: at("2026-11-12", "09:01"),
      openedAt: at("2026-11-14"),
      goalAt: at("2026-11-15"),
    });
    const c = countMsg(m, "open_report", Date.parse(at("2026-11-13")));
    expect(c).toMatchObject({ delivered: true, opened: false, goal: false });
  });
});

describe("one email over a range", () => {
  it("counts per reader by the send day, from the day it is counted, our probes left out", () => {
    const data = empty();
    data.msgs = [
      msg("report_ready", at("2026-11-10"), { deliveredAt: at("2026-11-10") }), // before it is counted
      msg("report_ready", at(EMAIL_TAGS_FROM), {
        deliveredAt: at(EMAIL_TAGS_FROM),
        goalAt: at(EMAIL_TAGS_FROM, "12:00"),
      }),
      msg("report_ready", at("2026-11-12"), { bouncedAt: at("2026-11-12") }),
      msg("report_ready", at("2026-11-12"), {
        src: "prod-verification",
        med: null,
        deliveredAt: at("2026-11-12"),
      }),
      msg("report_ready", at("2026-11-12"), {
        src: null,
        med: "probe",
        deliveredAt: at("2026-11-12"),
      }),
      msg("report_ready", at("2026-11-19"), { deliveredAt: at("2026-11-19") }), // after the range
    ];
    const s = statOf(def("report_ready"), read(data), "2026-11-01", "2026-11-15");
    expect(s).toMatchObject({ sent: 2, delivered: 1, bounced: 1, conv: 1, convSent: 2 });
  });

  it("knows no open of an email sent before open tracking, read per reader too", () => {
    const data = empty();
    data.msgs = [
      msg("newsletter_x", at("2026-10-14"), { deliveredAt: at("2026-10-14") }),
      msg("newsletter_x", at("2026-10-17"), {
        deliveredAt: at("2026-10-17"),
        openedAt: at("2026-10-18"),
      }),
    ];
    const page = buildEmailsPage({
      data,
      previous: null,
      filters: range("2026-10-10", "2026-10-20"),
      scope: "overall",
      today: TODAY,
      now: NOW,
    });
    expect(page.rows.find((r) => r.key === "stage:newsletter_x")!.stat).toMatchObject({
      sent: 2,
      delivered: 2,
      opened: 1,
      openBase: 1,
    });
  });

  it("lists versions only when an email went out as two or more", () => {
    const data = empty();
    data.msgs = [
      msg("72h_no_unlock", at("2026-11-12"), { variant: "a", deliveredAt: at("2026-11-12") }),
      msg("72h_no_unlock", at("2026-11-13"), { variant: "a", deliveredAt: at("2026-11-13") }),
    ];
    const page = buildEmailsPage({
      data,
      previous: null,
      filters: range("2026-11-11", "2026-11-17"),
      scope: "overall",
      today: TODAY,
      now: NOW,
    });
    expect(page.rows.filter((r) => r.key === "h72")).toHaveLength(1);
  });

  it("reads Resend's daily tallies by the event's day, opens only from 16 Oct", () => {
    const data = empty();
    const t = (day: string, event: string, n: number, arm = "a") => ({
      experiment: "survey-paused",
      arm,
      day,
      event,
      n,
    });
    data.tallies = [
      t("2026-10-14", "sent", 4),
      t("2026-10-14", "delivered", 4),
      t("2026-10-17", "sent", 2),
      t("2026-10-17", "delivered", 1),
      t("2026-10-17", "bounced", 1),
      t("2026-10-17", "opened", 1),
      t("2026-10-17", "clicked", 2),
      t("2026-10-17", "sent", 1, "b"),
      { experiment: "survey-complete", arm: "a", day: "2026-10-17", event: "sent", n: 99 },
    ];
    const s = statOf(def("survey_paused"), read(data), "2026-10-10", "2026-10-20");
    expect(s).toMatchObject({
      sent: 7,
      delivered: 5,
      openBase: 1,
      opened: 1,
      clicked: 2,
      bounced: 1,
      conv: null,
    });
    expect(statOf(def("survey_paused"), read(data), "2026-10-10", "2026-10-20", "b").sent).toBe(1);
  });

  it("counts an unsubscribe by its campaign, only on days its email is counted", () => {
    const data = empty();
    data.unsubs = [
      { campaign: "survey_complete", day: "2026-11-05", n: 3 }, // before Survey done is counted
      { campaign: "survey_complete", day: "2026-11-12", n: 2 },
      { campaign: "unlock_feedback", day: "2026-11-12", n: 7 },
      { campaign: null, day: "2026-11-12", n: 9 },
    ];
    expect(statOf(def("report_ready"), read(data), "2026-11-01", "2026-11-15").unsub).toBe(2);
  });
});

describe("the page", () => {
  function data(): EmailsData {
    const d = empty();
    const uf = (i: number, over: Partial<Msg> = {}) =>
      msg("unlock_feedback", at("2026-11-12", `0${i % 10}:00`), {
        variant: i % 2 ? "A" : "B",
        deliveredAt: at("2026-11-12", "09:00"),
        ...over,
      });
    d.msgs = [
      ...Array.from({ length: 50 }, (_, i) => uf(i)),
      uf(1, {
        clickedAt: at("2026-11-13"),
        goalAt: at("2026-11-13", "10:00"),
        goalReason: "too_expensive",
      }),
      ...Array.from({ length: 25 }, () =>
        msg("72h_no_unlock", at("2026-11-13"), {
          deliveredAt: at("2026-11-13"),
          clickedAt: at("2026-11-14"),
        })
      ),
      msg("newsletter_dec", at("2026-11-13"), { deliveredAt: at("2026-11-13") }),
    ];
    d.finished = [
      { day: "2026-11-12", src: "google", med: "cpc", n: 10 },
      { day: "2026-11-12", src: "verify", med: null, n: 5 },
    ];
    return d;
  }

  it("lists every live email, an off one only once it sends, and a stage it doesn't know on the overall page only", () => {
    const f = range("2026-11-11", "2026-11-17");
    const overall = buildEmailsPage({
      data: data(),
      previous: null,
      filters: f,
      scope: "overall",
      today: TODAY,
      now: NOW,
    });
    const keys = overall.rows.filter((r) => r.version === null).map((r) => r.key);
    expect(keys).toContain("report_ready");
    expect(keys).toContain("pts_confirm");
    expect(keys).not.toContain("what_199_opens");
    expect(keys).toContain("stage:newsletter_dec");
    expect(overall.off).toBe(EMAILS.filter((x) => x.switchedOff).length);
    expect(overall.rows.find((r) => r.key === "pts_confirm")).toMatchObject({
      stat: null,
      note: "not counted",
    });
    expect(overall.byAssessment.find((a) => a.name === "Not tied to an assessment")).toMatchObject({
      status: "live",
      emails: 1,
    });
    const assessment = buildEmailsPage({
      data: data(),
      previous: null,
      filters: f,
      scope: "assessment",
      today: TODAY,
      now: NOW,
    });
    expect(assessment.rows.some((r) => r.key === "stage:newsletter_dec")).toBe(false);
    expect(assessment.byAssessment).toEqual([]);
  });

  it("splits a test's versions under its email, and marks the best of them", () => {
    const page = buildEmailsPage({
      data: data(),
      previous: null,
      filters: range("2026-11-11", "2026-11-17"),
      scope: "overall",
      today: TODAY,
      now: NOW,
    });
    const versions = page.rows.filter((r) => r.key === "unlock_feedback" && r.version !== null);
    expect(versions.map((v) => v.name)).toEqual(["Version A", "Version B"]);
    expect(versions[0]!.stat).toMatchObject({ sent: 26, conv: 1, unsub: null });
    expect(versions[0]!.standing.conv).toBe("best");
    expect(versions[1]!.standing.conv).toBe("plain");
  });

  it("ranks emails with 20 or more delivered, greys the rest", () => {
    const page = buildEmailsPage({
      data: data(),
      previous: null,
      filters: range("2026-11-11", "2026-11-17"),
      scope: "overall",
      today: TODAY,
      now: NOW,
    });
    const row = (k: string) => page.rows.find((r) => r.key === k && r.version === null)!;
    expect(row("h72").standing.click).toBe("best");
    expect(row("unlock_feedback").standing.click).toBe("worst");
    expect(row("stage:newsletter_dec").standing.click).toBe("thin");
  });

  it("counts finished surveys without our probes, and adds up the tiles", () => {
    const page = buildEmailsPage({
      data: data(),
      previous: null,
      filters: range("2026-11-11", "2026-11-17"),
      scope: "overall",
      today: TODAY,
      now: NOW,
    });
    expect(page.finished).toBe(10);
    const tile = (k: string) => page.tiles.find((t) => t.key === k)!;
    expect(tile("sent").value).toBe(77);
    expect(tile("clicked").value).toBeCloseTo(26 / 77);
    expect(page.total.stat).toMatchObject({ sent: 77, conv: 1, convSent: 76 });
  });

  it("compares with the period before only when every email was counted through it", () => {
    const f = range("2026-11-11", "2026-11-17");
    const prev = data();
    const page = buildEmailsPage({
      data: data(),
      previous: prev,
      filters: f,
      scope: "overall",
      today: TODAY,
      now: NOW,
    });
    expect(page.tiles.every((t) => t.prev === null)).toBe(true);
    expect(page.notes.join(" ")).toMatch(/Not compared with the period before/);
    // Over a range where only the long-counted emails sent, the change is read.
    const older = empty();
    older.msgs = [msg("72h_no_unlock", at("2026-11-02"), { deliveredAt: at("2026-11-02") })];
    const cur = empty();
    cur.msgs = [
      msg("72h_no_unlock", at("2026-11-12"), { deliveredAt: at("2026-11-12") }),
      msg("72h_no_unlock", at("2026-11-13"), { deliveredAt: at("2026-11-13") }),
    ];
    const ok = buildEmailsPage({
      data: cur,
      previous: older,
      filters: range("2026-11-09", "2026-11-15"),
      scope: "assessment",
      today: TODAY,
      now: NOW,
    });
    // Survey done and others are counted from EMAIL_TAGS_FROM, inside the period before: no change.
    expect(ok.tiles.find((t) => t.key === "sent")!.prev).toBeNull();
  });

  it("says when an email is counted only from a day in the range, and when opens begin", () => {
    const page = buildEmailsPage({
      data: empty(),
      previous: null,
      filters: range("2026-10-01", "2026-11-15"),
      scope: "overall",
      today: TODAY,
      now: NOW,
    });
    expect(page.rows.find((r) => r.key === "report_ready")!.note).toBe("from 11 Nov 2026");
    const before = buildEmailsPage({
      data: empty(),
      previous: null,
      filters: range("2026-10-01", "2026-11-09"),
      scope: "overall",
      today: TODAY,
      now: NOW,
    });
    expect(before.rows.find((r) => r.key === "report_ready")).toMatchObject({
      stat: null,
      note: "counted from 11 Nov 2026",
    });
    expect(before.rows.find((r) => r.key === "pts_confirm")!.note).toBe("not counted");
    expect(page.notes.join(" ")).toMatch(/counted from 11 Nov 2026/);
    expect(page.notes.join(" ")).toMatch(/Opens are known from 16 Oct 2026/);
  });

  it("draws the clicks of the 30 days ending with the range, by the click's day", () => {
    const d = empty();
    d.msgs = [
      msg("72h_no_unlock", at("2026-10-20"), {
        deliveredAt: at("2026-10-20"),
        clickedAt: at("2026-11-14"),
      }),
      msg("72h_no_unlock", at("2026-10-20"), {
        deliveredAt: at("2026-10-20"),
        clickedAt: at("2026-10-01"),
      }),
    ];
    const page = buildEmailsPage({
      data: d,
      previous: null,
      filters: range("2026-11-11", "2026-11-17"),
      scope: "overall",
      today: TODAY,
      now: NOW,
    });
    const row = page.rows.find((r) => r.key === "h72" && r.version === null)!;
    expect(row.clicks).toHaveLength(30);
    expect(row.clicks.reduce((a, b) => a + b, 0)).toBe(1);
    expect(row.clicks[30 - 1 - 3]).toBe(1); // 14 Nov, three days before the 17th
    expect(page.clicksFrom).toBe("2026-10-19");
  });
});

describe("helpers", () => {
  it("reads the clicks line's 30 days with the range", () => {
    expect(readWindow({ from: "2026-11-11", to: "2026-11-17" })).toEqual({
      from: "2026-10-19",
      to: "2026-11-17",
    });
    expect(readWindow({ from: "2026-09-01", to: "2026-11-17" })).toEqual({
      from: "2026-09-01",
      to: "2026-11-17",
    });
  });

  it("writes the clicks trend per week", () => {
    expect(clickTrend(new Array(30).fill(0))).toEqual({ text: "no clicks", tone: "none" });
    expect(clickTrend(Array.from({ length: 30 }, (_, i) => i)).tone).toBe("good");
    expect(clickTrend(Array.from({ length: 30 }, (_, i) => 30 - i)).tone).toBe("bad");
    expect(clickTrend(new Array(30).fill(1))).toEqual({ text: "30 clicks · flat", tone: "flat" });
  });

  it("refuses a payload missing a part, never reading it as zero", () => {
    expect(() => parseEmails({ msgs: [], tallies: [], unsubs: [] })).toThrow(/unexpected shape/);
    expect(() => parseEmails(null)).toThrow(/unexpected shape/);
  });
});

describe("GET /api/admin/ap/emails", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  const url =
    "http://localhost/api/admin/ap/emails?period=custom&from=2026-11-11&to=2026-11-17&scope=assessment";
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyAdminSession.mockResolvedValue({ email: "mb@loveiq.org", role: "viewer" });
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
    mockSupabaseFetch.mockImplementation(async () => ({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ msgs: [], tallies: [], unsubs: [], finished: [] }),
    }));
  });

  it("answers 401 without a session and 429 over the limit, reading nothing", async () => {
    mockVerifyAdminSession.mockResolvedValueOnce(null);
    expect((await GET(new Request(url))).status).toBe(401);
    mockCheckRateLimit.mockResolvedValueOnce({ allowed: false });
    expect((await GET(new Request(url))).status).toBe(429);
    expect(mockSupabaseFetch).not.toHaveBeenCalled();
    expect(mockCheckRateLimit.mock.calls[0]![1]).toMatchObject({ bucket: "admin-ap-emails" });
  });

  it("reads the range with the clicks line's days, and the period before, with each stage's goal", async () => {
    const res = await GET(new Request(url));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toMatch(/no-store/);
    const bodies = mockSupabaseFetch.mock.calls.map((c) =>
      JSON.parse((c[1] as { body: string }).body)
    );
    expect(mockSupabaseFetch.mock.calls.every((c) => c[0] === "/rest/v1/rpc/ap_emails")).toBe(true);
    expect(bodies).toContainEqual(
      expect.objectContaining({ p_from: "2026-10-19", p_to: "2026-11-17" })
    );
    expect(bodies).toContainEqual(
      expect.objectContaining({ p_from: "2026-11-04", p_to: "2026-11-10" })
    );
    expect(bodies[0].p_goals).toEqual(goalsByStage());
    expect((await res.json()).scope).toBe("assessment");
  });

  it("shows the page uncompared when the period before can't be read, and fails plainly otherwise", async () => {
    mockSupabaseFetch.mockImplementation(async (_p: string, init: { body: string }) => {
      const { p_from } = JSON.parse(init.body) as { p_from: string };
      return p_from === "2026-11-04"
        ? { ok: false, status: 500, headers: new Headers(), json: async () => ({}) }
        : {
            ok: true,
            status: 200,
            headers: new Headers(),
            json: async () => ({ msgs: [], tallies: [], unsubs: [], finished: [] }),
          };
    });
    expect((await GET(new Request(url))).status).toBe(200);
    mockSupabaseFetch.mockResolvedValue({
      ok: false,
      status: 500,
      headers: new Headers(),
      json: async () => ({}),
    });
    const res = await GET(new Request(url));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Unable to load the emails page." });
  });
});

describe("the reader's SQL (ap_emails)", () => {
  const SQL = readFileSync("supabase/migrations/20261110090000_ap_emails.sql", "utf8");
  const DOWN = readFileSync("supabase/rollbacks/20261110090000_ap_emails_down.sql", "utf8");

  it("runs as its owner on a fixed path, for the service role only", () => {
    expect(SQL).toMatch(/STABLE SECURITY DEFINER\s+SET search_path TO 'public', 'pg_temp'/);
    expect(SQL).toMatch(
      /REVOKE ALL ON FUNCTION public\.ap_emails\(date, date, jsonb\) FROM PUBLIC, anon, authenticated;/
    );
    expect(SQL).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.ap_emails\(date, date, jsonb\) TO service_role;/
    );
  });

  it("leaves the team out by ap_team_user, and returns no address", () => {
    expect(SQL).toMatch(/staff AS \(SELECT id FROM ap_team_user\)/);
    expect(SQL).toMatch(/WHERE NOT EXISTS \(SELECT 1 FROM staff WHERE staff\.id = s\.user_id\)/);
    const out = SQL.slice(SQL.indexOf("SELECT json_build_object("));
    expect(out).not.toMatch(/email['"]?\s*,\s*[a-z]+\.email|'email'|'addr'/);
  });

  it("keeps the version column bounded, and the rollback takes both away", () => {
    expect(SQL).toMatch(
      /ADD COLUMN IF NOT EXISTS variant text\s+CONSTRAINT email_message_event_variant_check CHECK \(variant ~ '\^\[A-Za-z0-9_-\]\{1,16\}\$'\)/
    );
    expect(DOWN).toMatch(/DROP FUNCTION IF EXISTS public\.ap_emails\(date, date, jsonb\);/);
    expect(DOWN).toMatch(/DROP COLUMN IF EXISTS variant;/);
  });

  it("reads a goal only in the 7 days after the send", () => {
    const windows = SQL.match(/< r\.sent_at \+ interval '7 days'/g) ?? [];
    expect(windows.length).toBeGreaterThanOrEqual(6);
  });
});
