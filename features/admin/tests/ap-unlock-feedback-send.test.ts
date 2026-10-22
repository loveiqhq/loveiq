import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockFetch = vi.fn();
const mockSend = vi.fn();
const mockSession = vi.fn();
const mockCsrf = vi.fn();
const mockRateLimit = vi.fn();
const mockCooldown = vi.fn();
const mockRelease = vi.fn();

vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: (...args: unknown[]) => mockFetch(...args),
}));
vi.mock("@shared/http/circuit-breaker", () => ({
  getBreaker: () => ({ fire: (fn: () => Promise<unknown>) => fn() }),
}));
vi.mock("@features/admin/server/auth", () => ({ verifyAdminSession: () => mockSession() }));
vi.mock("@shared/http/csrf", () => ({ verifyCsrfToken: () => mockCsrf() }));
vi.mock("@shared/http/ratelimit", () => ({
  checkRateLimit: (...args: unknown[]) => mockRateLimit(...args),
  getClientIp: () => "203.0.113.9",
  // The send lock (server/send.ts).
  checkCooldown: (...args: unknown[]) => mockCooldown(...args),
  releaseCooldown: (...args: unknown[]) => mockRelease(...args),
}));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: mockSend };
  },
}));

import { POST } from "@/app/api/admin/ap/unlock-feedback/send/route";
import { subjectFor } from "@features/unlock-feedback/logic/subjects";

const NOW = "2026-10-22T20:00:00Z";
const HOUR = 3_600_000;

interface Report {
  id: number;
  sub: number;
  user: number;
  email: string;
  createdAt: string;
  opened?: boolean;
  plan?: string;
}

interface Db {
  reports: Report[];
  /** The admin's own submissions, newest first. */
  own?: number[];
  /** Readers this email already went to, by user id. */
  emailed?: number[];
  /** Rows a tranche already sent, as the table counts them. */
  batchSent?: number;
  /** Rows it claimed whose send had no clear answer (sent_at null). */
  batchUnclear?: number;
  auditDown?: boolean;
}

/** Every database call and Resend send, in order. */
let log: string[] = [];
let bodies: Array<{ call: string; body: unknown }> = [];

const json = (body: unknown, status = 200) =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    })
  );

function row(r: Report) {
  return {
    id: r.id,
    survey_submission_id: r.sub,
    created_date_time: r.createdAt,
    survey_submission: {
      user_id: r.user,
      duration_ms: 600_000,
      app_user: { email: r.email, first_name: "Ana", processing_restricted_at: null },
      scoring_result: [{ primary_archetype: "Spiritual Lover", v5_primary_archetype: null }],
    },
  };
}

function withDb(db: Db) {
  let nextId = 900;
  mockFetch.mockImplementation((url: string, init: { method?: string; body?: string } = {}) => {
    const method = init.method ?? "GET";
    const path = decodeURIComponent(url.replace("https://test.supabase.co", ""));
    const call = `${method} ${path.split("&")[0]}`;
    log.push(call);
    if (init.body) bodies.push({ call, body: JSON.parse(init.body) });
    const param = (re: RegExp) => re.exec(path)?.[1];

    if (path.startsWith("/rest/v1/admin_audit_log")) {
      return Promise.resolve(new Response(null, { status: db.auditDown ? 500 : 201 }));
    }
    if (path.startsWith("/rest/v1/survey_submission?user_id=eq.")) {
      const user = Number(param(/user_id=eq\.(\d+)/));
      return json(db.reports.filter((r) => r.user === user).map((r) => ({ id: r.sub })));
    }
    if (path.startsWith("/rest/v1/survey_submission?")) {
      return json((db.own ?? []).map((id) => ({ id })));
    }
    if (path.startsWith("/rest/v1/personal_report?survey_submission_id=in.")) {
      const subs = param(/survey_submission_id=in\.\(([^)]*)\)/)!
        .split(",")
        .map(Number);
      return json(db.reports.filter((r) => subs.includes(r.sub)).map((r) => ({ id: r.id })));
    }
    if (path.startsWith("/rest/v1/personal_report?survey_submission_id=eq.")) {
      const sub = Number(param(/survey_submission_id=eq\.(\d+)/));
      return json(db.reports.filter((r) => r.sub === sub).map(row));
    }
    if (path.startsWith("/rest/v1/personal_report?created_date_time=lt.")) {
      const before = Date.parse(param(/created_date_time=lt\.([^&]+)/)!);
      const limit = Number(param(/limit=(\d+)/));
      return json(
        db.reports
          .filter((r) => Date.parse(r.createdAt) < before)
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
          .slice(0, limit)
          .map(row)
      );
    }
    if (path.startsWith("/rest/v1/unlock_feedback?select=id,survey_submission")) {
      const user = Number(param(/user_id=eq\.(\d+)/));
      return json((db.emailed ?? []).includes(user) ? [{ id: 1 }] : []);
    }
    if (path.startsWith("/rest/v1/unlock_feedback?send_batch=eq.")) {
      const n =
        (db.batchSent ?? 0) + (path.includes("sent_at=not.is.null") ? 0 : (db.batchUnclear ?? 0));
      return json(Array.from({ length: n }, (_, i) => ({ id: i })));
    }
    if (path.startsWith("/rest/v1/payment?")) {
      const report = db.reports.find((r) => r.id === Number(param(/personal_report_id=eq\.(\d+)/)));
      const plan = param(/metadata->>plan=eq\.([a-z_]+)/);
      const paid = report?.plan && (!plan || plan === report.plan);
      return json(paid ? [{ id: 1, metadata: { plan: report.plan } }] : []);
    }
    if (path.startsWith("/rest/v1/email_suppression?")) return json([]);
    if (path.startsWith("/rest/v1/report_session?")) {
      const report = db.reports.find((r) => r.id === Number(param(/personal_report_id=eq\.(\d+)/)));
      return json(report?.opened === false ? [] : [{ id: "s-1" }]);
    }
    if (path.startsWith("/rest/v1/report_price_quote?")) {
      return json([{ current_price: "29.99", currency: "EUR" }]);
    }
    if (path.startsWith("/rest/v1/unlock_feedback?on_conflict=")) {
      return json([{ id: nextId++ }], 201);
    }
    if (path.startsWith("/rest/v1/unlock_feedback?")) {
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    return json([]);
  });
}

/** Readers 1..n, newest first, the newest four hours old. */
function readers(n: number, extra: (i: number) => Partial<Report> = () => ({})): Report[] {
  return Array.from({ length: n }, (_, k) => {
    const i = k + 1;
    return {
      id: 100 + i,
      sub: 200 + i,
      user: 300 + i,
      email: `reader${i}@example.com`,
      createdAt: new Date(Date.parse(NOW) - (3 + i) * HOUR).toISOString(),
      ...extra(i),
    };
  });
}

const call = (body: unknown) =>
  POST(
    new Request("https://www.loveiq.org/api/admin/ap/unlock-feedback/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  );

async function send(body: unknown) {
  const res = await call(body);
  return { status: res.status, body: await res.json() };
}

const claims = () =>
  bodies
    .filter((b) => b.call.startsWith("POST /rest/v1/unlock_feedback?on_conflict="))
    .map((b) => b.body as Record<string, unknown>);
const audits = () =>
  bodies
    .filter((b) => b.call.startsWith("POST /rest/v1/admin_audit_log"))
    .map((b) => b.body as Record<string, unknown>);

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NOW));
  log = [];
  bodies = [];
  mockCsrf.mockResolvedValue(true);
  mockRateLimit.mockResolvedValue({ allowed: true });
  mockSession.mockResolvedValue({ email: "ec@loveiq.org", role: "admin" });
  mockCooldown.mockResolvedValue({ allowed: true, retryAfterMs: 0 });
  mockRelease.mockResolvedValue(undefined);
  process.env = {
    ...ORIGINAL_ENV,
    RESEND_API_KEY: "re_test_key",
    RESEND_FROM: "LoveIQ <hello@send.loveiq.org>",
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-key",
    UNSUBSCRIBE_SECRET: "unsubscribe-secret",
    NEXT_PUBLIC_SITE_URL: "https://www.loveiq.org",
  };
  delete process.env.ADMIN_TEST_EMAIL_REGEX;
  mockSend.mockImplementation(async () => {
    log.push("send");
    return { data: { id: "4ef9a417-02e9-4d39-ad75-9611e0fcc33c" }, error: null };
  });
});

afterEach(() => {
  vi.useRealTimers();
  process.env = { ...ORIGINAL_ENV };
});

describe("POST /api/admin/ap/unlock-feedback/send: who may", () => {
  it("403 without a valid CSRF token, before anything is read", async () => {
    mockCsrf.mockResolvedValue(false);
    expect((await send({ mode: "test", arm: "A" })).status).toBe(403);
    expect(mockSession).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("429 when rate limited", async () => {
    mockRateLimit.mockResolvedValue({ allowed: false });
    expect((await send({ mode: "test", arm: "A" })).status).toBe(429);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("admins only: 401 without a session, 403 for an editor or a viewer", async () => {
    mockSession.mockResolvedValue(null);
    expect((await send({ mode: "test", arm: "A" })).status).toBe(401);
    for (const role of ["editor", "viewer"]) {
      mockSession.mockResolvedValue({ email: "mark@loveiq.org", role });
      expect((await send({ mode: "test", arm: "A" })).status).toBe(403);
    }
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it.each([
    [{ mode: "tranche", batch: "first-250", size: 501, dryRun: true }],
    [{ mode: "tranche", batch: "First 250", size: 250, dryRun: true }],
    [{ mode: "tranche", batch: "first-250", size: 0, dryRun: true }],
    [{ mode: "test", arm: "E" }],
    [{ mode: "everyone" }],
  ])("400 on %j", async (body) => {
    expect((await send(body)).status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("503 when this deployment cannot send: no Resend key or no unsubscribe secret", async () => {
    delete process.env.UNSUBSCRIBE_SECRET;
    expect((await send({ mode: "test", arm: "A" })).status).toBe(503);
    expect(mockSend).not.toHaveBeenCalled();
  });
});

describe("the admin's test", () => {
  const own = (overrides: Partial<Report> = {}): Report => ({
    id: 51,
    sub: 2318,
    user: 9,
    email: "ec@loveiq.org",
    createdAt: "2026-10-20T10:00:00Z",
    ...overrides,
  });

  it("goes to the admin's newest unpaid, opened report, with the chosen subject", async () => {
    withDb({
      own: [2400, 2318, 1957],
      emailed: [9],
      reports: [
        own({ id: 60, sub: 2400, plan: "initial" }),
        own({ id: 51, sub: 2318 }),
        own({ id: 40, sub: 1957 }),
      ],
    });
    const { status, body } = await send({ mode: "test", arm: "D" });

    expect(status).toBe(200);
    expect(body).toMatchObject({ sent: true, to: "ec@loveiq.org", arm: "D", submissionId: 2318 });
    const sent = mockSend.mock.calls[0]![0];
    expect(sent.to).toBe("ec@loveiq.org");
    expect(sent.subject).toBe(subjectFor("D", "The Spiritual Lover"));
    expect(sent.text).toContain("Hi Ana,");
    // Delivery is kept per reader; the subject test's daily counts leave tests out.
    expect(sent.tags).toEqual([
      { name: "stage", value: "unlock_feedback" },
      { name: "sub", value: "2318" },
    ]);
    expect(claims()).toEqual([
      expect.objectContaining({ survey_submission_id: 2318, subject_arm: "D", send_batch: "test" }),
    ]);
    // The earlier test's row goes first, so the new email's links are the ones that work.
    const release = log.indexOf("DELETE /rest/v1/unlock_feedback?survey_submission_id=eq.2318");
    expect(release).toBeGreaterThan(-1);
    expect(release).toBeLessThan(
      log.indexOf("POST /rest/v1/unlock_feedback?on_conflict=survey_submission_id")
    );
    // Only the admin's own test row, never a reader's.
    const deletes = mockFetch.mock.calls
      .filter(([, init]) => (init as { method?: string } | undefined)?.method === "DELETE")
      .map(([u]) => decodeURIComponent(String(u)));
    expect(deletes).toEqual([
      "https://test.supabase.co/rest/v1/unlock_feedback?survey_submission_id=eq.2318&send_batch=eq.test",
    ]);
  });

  it("is not stopped by the admin's other, bought reports", async () => {
    withDb({
      own: [2416, 2318],
      reports: [own({ id: 70, sub: 2416, plan: "full_report" }), own()],
    });
    const { status, body } = await send({ mode: "test", arm: "A" });
    expect(status).toBe(200);
    expect(body).toMatchObject({ sent: true, submissionId: 2318 });
  });

  it("waits while another send runs, and sends nothing", async () => {
    withDb({ own: [2318], reports: [own()] });
    mockCooldown.mockResolvedValue({ allowed: false, retryAfterMs: 30_000 });
    const { status, body } = await send({ mode: "test", arm: "A" });
    expect(status).toBe(409);
    expect(body.error).toBe("Another unlock-feedback send is running. Try again in a minute.");
    expect(mockSend).not.toHaveBeenCalled();
    expect(claims()).toEqual([]);
  });

  it("is in the audit log before the email goes", async () => {
    withDb({ own: [2318], reports: [own()] });
    await send({ mode: "test", arm: "A" });
    expect(audits()).toEqual([
      expect.objectContaining({
        admin_email: "ec@loveiq.org",
        action: "unlock_feedback_test",
        resource_id: "test:2318",
      }),
    ]);
    expect(log.indexOf("POST /rest/v1/admin_audit_log")).toBeLessThan(log.indexOf("send"));
  });

  it("sends nothing when the audit log cannot be written", async () => {
    withDb({ own: [2318], reports: [own()], auditDown: true });
    expect((await send({ mode: "test", arm: "A" })).status).toBe(500);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("400 when every report of the admin's is paid or unopened", async () => {
    withDb({
      own: [2318, 1957],
      reports: [own({ plan: "full_report" }), own({ id: 40, sub: 1957, opened: false })],
    });
    const { status, body } = await send({ mode: "test", arm: "A" });
    expect(status).toBe(400);
    expect(body.error).toBe("No unpaid, opened report under your address to send the test for.");
    expect(mockSend).not.toHaveBeenCalled();
    expect(claims()).toEqual([]);
  });

  it("goes to team addresses only", async () => {
    mockSession.mockResolvedValue({ email: "someone@example.com", role: "admin" });
    withDb({ own: [2318], reports: [own({ email: "someone@example.com" })] });
    expect((await send({ mode: "test", arm: "A" })).status).toBe(400);
    expect(mockSend).not.toHaveBeenCalled();
  });
});

describe("a tranche", () => {
  it("counts in a dry run and sends nothing, leaving out buyers, unopened reports and staff", async () => {
    withDb({
      reports: readers(8, (i) =>
        i === 2
          ? { plan: "initial" }
          : i === 3
            ? { opened: false }
            : i === 4
              ? { email: "mark@loveiq.org" }
              : i === 5
                ? { plan: "full_report" }
                : {}
      ),
      emailed: [306],
    });
    const { status, body } = await send({
      mode: "tranche",
      batch: "first-250",
      size: 250,
      dryRun: true,
    });

    expect(status).toBe(200);
    expect(body).toMatchObject({
      dryRun: true,
      batch: "tranche:first-250",
      eligible: 3,
      sent: 0,
      skipped: { paid: 2, not_opened: 1, test: 1, emailed_before: 1 },
      newestEligible: readers(1)[0]!.createdAt,
      oldestEligible: readers(8)[7]!.createdAt,
      done: true,
      exhausted: true,
    });
    expect(mockSend).not.toHaveBeenCalled();
    expect(claims()).toEqual([]);
    expect(audits()).toEqual([
      expect.objectContaining({
        action: "unlock_feedback_tranche",
        resource_id: "tranche:first-250",
      }),
    ]);
  });

  it("a dry run's later call counts only what is still missing", async () => {
    withDb({ reports: readers(6), batchSent: 1 });
    const { body } = await send({
      mode: "tranche",
      batch: "first-250",
      size: 5,
      dryRun: true,
      counted: 2,
    });
    // 5 wanted, 1 already sent, 2 counted by the earlier calls: 2 more.
    expect(body).toMatchObject({ eligible: 2, batchSent: 1, done: true });
  });

  it("starts from reports three hours old, never newer", async () => {
    withDb({ reports: readers(1) });
    await send({ mode: "tranche", batch: "first-250", size: 5, dryRun: true });
    const first = mockFetch.mock.calls
      .map(([u]) => decodeURIComponent(String(u)))
      .find((u) => u.includes("created_date_time=lt."))!;
    expect(first).toContain(
      `created_date_time=lt.${new Date(Date.parse(NOW) - 3 * HOUR).toISOString()}`
    );
    expect(first).toContain("order=created_date_time.desc");
  });

  it("refuses the real send without the typed words, and sends nothing", async () => {
    withDb({ reports: readers(3) });
    for (const confirm of [undefined, "send 25", "Send 3", "send 3 "]) {
      const { status } = await send({
        mode: "tranche",
        batch: "b",
        size: 3,
        dryRun: false,
        confirm,
      });
      expect(status).toBe(400);
    }
    expect(mockSend).not.toHaveBeenCalled();
    expect(audits()).toEqual([]);
  });

  it("sends to the newest readers up to its size, each claimed under the tranche's name", async () => {
    withDb({ reports: readers(5) });
    const { body } = await send({
      mode: "tranche",
      batch: "first-250",
      size: 3,
      dryRun: false,
      confirm: "send 3",
    });

    expect(body).toMatchObject({ sent: 3, batchSent: 3, failed: 0, done: true, exhausted: false });
    expect(mockSend.mock.calls.map(([e]) => e.to)).toEqual([
      "reader1@example.com",
      "reader2@example.com",
      "reader3@example.com",
    ]);
    expect(claims().map((c) => c.send_batch)).toEqual(Array(3).fill("tranche:first-250"));
    // A tranche's readers count in the subject test.
    for (const [email] of mockSend.mock.calls) {
      expect(email.tags).toContainEqual({ name: "exp", value: "unlock_feedback_subject" });
    }
    // Each send is recorded with its time.
    expect(log.filter((c) => c.startsWith("PATCH /rest/v1/unlock_feedback?id=eq."))).toHaveLength(
      3
    );
  });

  it("reads what the tranche already sent from the table, so a repeat call never overshoots", async () => {
    withDb({ reports: readers(5), batchSent: 2 });
    const { body } = await send({
      mode: "tranche",
      batch: "first-250",
      size: 3,
      dryRun: false,
      confirm: "send 3",
    });
    expect(body).toMatchObject({ sent: 1, batchSent: 3, done: true });
    expect(mockSend).toHaveBeenCalledTimes(1);

    log = [];
    mockSend.mockClear();
    withDb({ reports: readers(5), batchSent: 3 });
    const again = await send({
      mode: "tranche",
      batch: "first-250",
      size: 3,
      dryRun: false,
      confirm: "send 3",
    });
    expect(again.body).toMatchObject({ sent: 0, batchSent: 3, done: true });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("stops starting readers after 40 seconds and says where to carry on", async () => {
    withDb({ reports: readers(4) });
    mockSend.mockImplementation(async () => {
      vi.setSystemTime(Date.now() + 41_000);
      return { data: { id: "x1" }, error: null };
    });
    const first = await send({
      mode: "tranche",
      batch: "first-250",
      size: 4,
      dryRun: false,
      confirm: "send 4",
    });
    expect(first.body).toMatchObject({ sent: 1, done: false });
    expect(first.body.nextBefore).toBe(readers(1)[0]!.createdAt);

    // The page's next call starts after the reader already sent.
    mockSend.mockClear();
    vi.setSystemTime(new Date(NOW));
    withDb({ reports: readers(4), batchSent: 1, emailed: [301] });
    const from = mockFetch.mock.calls.length;
    mockSend.mockImplementation(async () => ({ data: { id: "x2" }, error: null }));
    const next = await send({
      mode: "tranche",
      batch: "first-250",
      size: 4,
      dryRun: false,
      confirm: "send 4",
      before: first.body.nextBefore,
    });
    expect(next.body).toMatchObject({ sent: 3, batchSent: 4, done: true });
    // It read on from the cursor, not from the top again.
    const page = mockFetch.mock.calls
      .slice(from)
      .map(([u]) => decodeURIComponent(String(u)))
      .find((u) => u.includes("created_date_time=lt."))!;
    expect(page).toContain(`created_date_time=lt.${first.body.nextBefore}&`);
    expect(mockSend.mock.calls.map(([e]) => e.to)).toEqual([
      "reader2@example.com",
      "reader3@example.com",
      "reader4@example.com",
    ]);
  });

  it("leaves out someone who bought another of their reports", async () => {
    const earlier: Report = {
      id: 500,
      sub: 999,
      user: 301,
      email: "reader1@example.com",
      createdAt: "2026-09-01T10:00:00Z",
      plan: "full_report",
    };
    withDb({ reports: [...readers(3), earlier] });
    const { body } = await send({ mode: "tranche", batch: "b", size: 10, dryRun: true });
    // Reader 1's new report for the earlier purchase, and the earlier report itself.
    expect(body).toMatchObject({ eligible: 2, skipped: { paid: 2 } });
  });

  it("stops after three failed sends and says so, so an outage cannot use up every reader", async () => {
    withDb({ reports: readers(6) });
    mockSend.mockResolvedValue({
      data: null,
      error: { name: "application_error", message: "Internal server error", statusCode: 500 },
    });
    const { body } = await send({
      mode: "tranche",
      batch: "b",
      size: 6,
      dryRun: false,
      confirm: "send 6",
    });
    expect(body).toMatchObject({ sent: 0, failed: 3, halted: true, done: false });
    expect(mockSend).toHaveBeenCalledTimes(3);
  });

  it("counts a send that had no clear answer toward its size: it may have arrived", async () => {
    withDb({ reports: readers(5), batchSent: 1, batchUnclear: 1 });
    const { body } = await send({
      mode: "tranche",
      batch: "b",
      size: 3,
      dryRun: false,
      confirm: "send 3",
    });
    expect(body).toMatchObject({ sent: 1, batchSent: 3, done: true });
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it("never reads reports newer than three hours, whatever the page sends", async () => {
    withDb({ reports: readers(1) });
    await send({ mode: "tranche", batch: "b", size: 5, dryRun: true, before: NOW });
    const page = mockFetch.mock.calls
      .map(([u]) => decodeURIComponent(String(u)))
      .find((u) => u.includes("created_date_time=lt."))!;
    expect(page).toContain(
      `created_date_time=lt.${new Date(Date.parse(NOW) - 3 * HOUR).toISOString()}&`
    );
  });

  it("a real send waits while another runs, a dry run does not, and a send frees the lock", async () => {
    withDb({ reports: readers(2) });
    mockCooldown.mockResolvedValue({ allowed: false, retryAfterMs: 30_000 });
    const busy = await send({
      mode: "tranche",
      batch: "b",
      size: 1,
      dryRun: false,
      confirm: "send 1",
    });
    expect(busy.status).toBe(409);
    expect(mockSend).not.toHaveBeenCalled();
    expect((await send({ mode: "tranche", batch: "b", size: 1, dryRun: true })).status).toBe(200);

    mockCooldown.mockResolvedValue({ allowed: true, retryAfterMs: 0 });
    const ok = await send({
      mode: "tranche",
      batch: "b",
      size: 1,
      dryRun: false,
      confirm: "send 1",
    });
    expect(ok.body).toMatchObject({ sent: 1 });
    expect(mockCooldown).toHaveBeenLastCalledWith("run", "unlock-feedback-send", 75_000);
    expect(mockRelease).toHaveBeenCalledWith("run", "unlock-feedback-send");
  });
});
