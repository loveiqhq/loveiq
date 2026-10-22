import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockFetch = vi.fn();
const mockSend = vi.fn();
const mockNotifySlack = vi.fn();
const mockCooldown = vi.fn();
const mockRelease = vi.fn();
let prodHost = true;

vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: (...args: unknown[]) => mockFetch(...args),
}));
vi.mock("@shared/http/circuit-breaker", () => ({
  getBreaker: () => ({ fire: (fn: () => Promise<unknown>) => fn() }),
}));
vi.mock("@shared/http/is-prod-cron-host", () => ({ isProdCronHost: () => prodHost }));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@shared/observability/slack", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@shared/observability/slack")>()),
  notifySlack: (...args: unknown[]) => mockNotifySlack(...args),
}));
// The send lock (server/send.ts) is a Redis SET NX; free unless a test holds it.
vi.mock("@shared/http/ratelimit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@shared/http/ratelimit")>()),
  checkCooldown: (...args: unknown[]) => mockCooldown(...args),
  releaseCooldown: (...args: unknown[]) => mockRelease(...args),
}));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: mockSend };
  },
}));

import { GET } from "@/app/api/cron/unlock-feedback/route";
import { subjectFor, type SubjectArm } from "@features/unlock-feedback/logic/subjects";
import { hashLinkToken } from "@features/unlock-feedback/server/link";
import { __resetSystemFlagsCacheForTests } from "@shared/flags/system-flags";

const ORIGINAL_ENV = { ...process.env };
// A day after the launch, so the window holds reports.
const NOW = "2026-10-21T12:41:00Z";

interface Db {
  candidates: unknown[];
  /** The reader's other reports, by id, and what was paid on each. */
  otherReports?: Array<{ id: number; plan?: string }>;
  flagsDown?: boolean;
  payments?: Array<{ metadata: { plan: string } }>;
  paymentsDown?: boolean;
  notOpened?: boolean;
  sessionsDown?: boolean;
  /** The full_report quote; the default is a EUR 29.99 one. */
  quote?: Array<{ current_price: string | null; currency: string | null }>;
  suppressed?: boolean;
  suppressionDown?: boolean;
  emailedBefore?: boolean;
  claimTaken?: boolean;
  patchStatus?: number;
}

/** Every database call and Resend send, in the order they happened. */
let log: string[] = [];
let bodies: Record<string, unknown> = {};

const json = (body: unknown, status = 200) =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    })
  );

function withDb(db: Db) {
  mockFetch.mockImplementation((url: string, init: { method?: string; body?: string } = {}) => {
    const method = init.method ?? "GET";
    const path = url.replace("https://test.supabase.co", "");
    const call = `${method} ${path.split("&")[0]}`;
    log.push(call);
    if (init.body) bodies[call] = JSON.parse(init.body);
    if (path.startsWith("/rest/v1/system_flags?")) return json({}, db.flagsDown ? 503 : 200);
    if (path.startsWith("/rest/v1/survey_submission?user_id=eq.")) {
      return json([{ id: 201 }, ...(db.otherReports ?? []).map((r) => ({ id: r.id + 1000 }))]);
    }
    if (path.startsWith("/rest/v1/personal_report?survey_submission_id=in.")) {
      return json((db.otherReports ?? []).map((r) => ({ id: r.id })));
    }
    if (path.startsWith("/rest/v1/personal_report?")) return json(db.candidates);
    if (path.startsWith("/rest/v1/unlock_feedback?select=")) {
      return json(db.emailedBefore ? [{ id: 9 }] : []);
    }
    if (path.startsWith("/rest/v1/payment?")) {
      if (db.paymentsDown) return json({}, 500);
      const other = (db.otherReports ?? []).find((r) =>
        path.includes(`personal_report_id=eq.${r.id}&`)
      );
      if (other) {
        const wants = /metadata->>plan=eq\.([a-z_]+)/.exec(path)?.[1];
        const paid = other.plan && (!wants || wants === other.plan);
        return json(paid ? [{ metadata: { plan: other.plan } }] : []);
      }
      // The EUR 1.99 check asks for its own plan; the plan check reads every payment.
      const plan = /metadata->>plan=eq\.([a-z_]+)/.exec(path)?.[1];
      return json((db.payments ?? []).filter((p) => !plan || p.metadata.plan === plan));
    }
    if (path.startsWith("/rest/v1/report_session?")) {
      return db.sessionsDown ? json({}, 500) : json(db.notOpened ? [] : [{ id: "s-1" }]);
    }
    if (path.startsWith("/rest/v1/report_price_quote?")) {
      return json(db.quote ?? [{ current_price: "29.99", currency: "EUR" }]);
    }
    if (path.startsWith("/rest/v1/email_suppression?")) {
      return db.suppressionDown ? json({}, 503) : json(db.suppressed ? [{ email: "x" }] : []);
    }
    if (path.startsWith("/rest/v1/unlock_feedback?on_conflict=")) {
      return json(db.claimTaken ? [] : [{ id: 501 }], 201);
    }
    if (path.startsWith("/rest/v1/unlock_feedback?id=eq.")) {
      const status = method === "PATCH" ? (db.patchStatus ?? 204) : 204;
      return Promise.resolve(new Response(status === 204 ? null : "{}", { status }));
    }
    if (path.startsWith("/rest/v1/rpc/claim_slack_alert")) return json(true);
    return json([]);
  });
}

function candidate(n = 1, email = `reader${n}@example.com`) {
  return {
    id: 100 + n,
    survey_submission_id: 200 + n,
    survey_submission: {
      user_id: 300 + n,
      duration_ms: 600_000,
      app_user: { email, first_name: "Ana", processing_restricted_at: null },
      scoring_result: [{ primary_archetype: "Spiritual Lover", v5_primary_archetype: null }],
    },
  };
}

const request = (token = "test-cron-secret") =>
  new Request("https://example.test/api/cron/unlock-feedback", {
    headers: { authorization: `Bearer ${token}` },
  });

async function run() {
  const res = await GET(request());
  return { status: res.status, body: await res.json() };
}

const sentOk = { data: { id: "4ef9a417-02e9-4d39-ad75-9611e0fcc33c" }, error: null };

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NOW));
  prodHost = true;
  log = [];
  bodies = {};
  __resetSystemFlagsCacheForTests({ unlock_feedback: true });
  mockCooldown.mockResolvedValue({ allowed: true, retryAfterMs: 0 });
  mockRelease.mockResolvedValue(undefined);
  process.env = {
    ...ORIGINAL_ENV,
    CRON_SECRET: "test-cron-secret",
    RESEND_API_KEY: "re_test_key",
    RESEND_FROM: "LoveIQ <hello@send.loveiq.org>",
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-key",
    UNSUBSCRIBE_SECRET: "unsubscribe-secret",
    NEXT_PUBLIC_SITE_URL: "https://www.loveiq.org",
  };
  delete process.env.RESEND_REPLY_TO;
  mockSend.mockImplementation(async () => {
    log.push("send");
    return sentOk;
  });
});

afterEach(() => {
  vi.useRealTimers();
  process.env = { ...ORIGINAL_ENV };
});

describe("GET /api/cron/unlock-feedback: the gates", () => {
  it("refuses a caller without the cron secret", async () => {
    const res = await GET(request("wrong"));
    expect(res.status).toBe(401);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("does nothing off production, or while the kill switch is off", async () => {
    withDb({ candidates: [candidate()] });
    prodHost = false;
    expect((await run()).body).toEqual({ skipped: true, reason: "non-prod-cron-host" });
    prodHost = true;
    __resetSystemFlagsCacheForTests({ unlock_feedback: false });
    expect((await run()).body).toEqual({ skipped: true, reason: "kill_switch" });
    // Only the run's record: the stall watch must see a cron that is alive and switched off.
    expect(log).toEqual(["POST /rest/v1/cron_run"]);
    expect(bodies["POST /rest/v1/cron_run"]).toMatchObject({
      cron_name: "unlock-feedback",
      status: "success",
      error_message: "skipped: the flag is off",
    });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("stays off when the flag cannot be read: a free report is never given on a guess", async () => {
    __resetSystemFlagsCacheForTests();
    withDb({ candidates: [candidate()], flagsDown: true });
    expect((await run()).body).toEqual({ skipped: true, reason: "kill_switch" });
    expect(log).toContain("GET /rest/v1/system_flags?key=eq.unlock_feedback");
    expect(log.some((c) => c.includes("personal_report"))).toBe(false);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("waits while another send holds the lock, and frees the lock after its own run", async () => {
    withDb({ candidates: [candidate()] });
    mockCooldown.mockResolvedValueOnce({ allowed: false, retryAfterMs: 30_000 });
    expect((await run()).body).toEqual({ skipped: true, reason: "another_send_running" });
    expect(mockSend).not.toHaveBeenCalled();
    expect(mockRelease).not.toHaveBeenCalled();

    expect((await run()).body.summary.sent).toBe(1);
    expect(mockCooldown).toHaveBeenLastCalledWith("run", "unlock-feedback-send", 75_000);
    expect(mockRelease).toHaveBeenCalledWith("run", "unlock-feedback-send");
  });

  it("sends nothing without the unsubscribe secret: the footer's link must work", async () => {
    withDb({ candidates: [candidate()] });
    delete process.env.UNSUBSCRIBE_SECRET;
    expect((await run()).status).toBe(503);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("reads no report before the launch has had three hours", async () => {
    withDb({ candidates: [candidate()] });
    vi.setSystemTime(new Date("2026-10-20T02:00:00Z"));
    const { body } = await run();
    expect(body.summary.candidates).toBe(0);
    expect(log.some((c) => c.includes("personal_report"))).toBe(false);
  });

  it("asks for the reports created 3 to 5 hours ago, oldest first", async () => {
    withDb({ candidates: [] });
    await run();
    const [url] = mockFetch.mock.calls.find(([u]) => String(u).includes("personal_report"))!;
    const params = new URL(String(url)).searchParams;
    expect(params.getAll("created_date_time")).toEqual([
      "gte.2026-10-21T07:41:00.000Z",
      "lte.2026-10-21T09:41:00.000Z",
    ]);
    expect(params.get("order")).toBe("created_date_time.asc");
  });
});

describe("GET /api/cron/unlock-feedback: claim, send, record", () => {
  it("claims the reader, emails them, then records the send", async () => {
    withDb({ candidates: [candidate()] });
    const { body } = await run();
    expect(body.summary).toMatchObject({ candidates: 1, sent: 1, failed: 0 });

    const claimCall = "POST /rest/v1/unlock_feedback?on_conflict=survey_submission_id";
    const patchCall = "PATCH /rest/v1/unlock_feedback?id=eq.501";
    expect(log.indexOf(claimCall)).toBeGreaterThan(-1);
    expect(log.indexOf("send")).toBeGreaterThan(log.indexOf(claimCall));
    expect(log.indexOf(patchCall)).toBeGreaterThan(log.indexOf("send"));

    const claim = bodies[claimCall] as Record<string, unknown>;
    expect(claim).toMatchObject({ survey_submission_id: 201, personal_report_id: 101 });
    expect(claim.link_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(claim.send_batch).toBe("hourly");
    const order = claim.reason_order as string[];
    expect(order).toHaveLength(8);
    expect(order[7]).toBe("other");
    const arm = claim.subject_arm as SubjectArm;
    expect(["A", "B", "C", "D"]).toContain(arm);

    const sent = mockSend.mock.calls[0]![0];
    expect(sent.from).toBe("Marcus from LoveIQ <hello@send.loveiq.org>");
    expect(sent.to).toBe("reader1@example.com");
    expect(sent.replyTo).toBe("hello@loveiq.org");
    expect(sent.subject).toBe(subjectFor(arm, "The Spiritual Lover"));
    expect(sent.text).toContain("Hi Ana,\n");
    expect(sent.text).toContain("we unlock the full report, worth €29.99, with all its chapters");
    expect(sent.headers["List-Unsubscribe"]).toMatch(
      /^<https:\/\/www\.loveiq\.org\/api\/unsubscribe\?token=[^>]+&src=unlock_feedback>$/
    );
    expect(sent.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(sent.tags).toEqual([
      { name: "stage", value: "unlock_feedback" },
      { name: "sub", value: "201" },
      { name: "exp", value: "unlock_feedback_subject" },
      { name: "arm", value: arm },
    ]);
    // The buttons follow the claimed order, and their token is the one whose hash was kept.
    const links = [...(sent.html as string).matchAll(/href="([^"]*unlock-feedback\/open[^"]*)"/g)]
      .map((m) => new URL(m[1]!.replace(/&amp;/g, "&")))
      .filter((_, i) => i % 2 === 0);
    expect(links.map((u) => u.searchParams.get("r"))).toEqual(order);
    expect(hashLinkToken(links[0]!.searchParams.get("t")!)).toBe(claim.link_hash);

    expect(bodies[patchCall]).toEqual({
      sent_at: "2026-10-21T12:41:00.000Z",
      resend_id: "4ef9a417-02e9-4d39-ad75-9611e0fcc33c",
      updated_at: "2026-10-21T12:41:00.000Z",
    });
  });

  it("sends nothing when another run holds the claim", async () => {
    withDb({ candidates: [candidate()], claimTaken: true });
    const { body } = await run();
    expect(body.summary.skipped).toEqual({ already_claimed: 1 });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("releases the claim when Resend refuses the email, so the next run can try", async () => {
    withDb({ candidates: [candidate()] });
    mockSend.mockResolvedValue({
      data: null,
      error: { name: "validation_error", message: "Invalid `to` field", statusCode: 422 },
    });
    const { body } = await run();
    expect(body.summary).toMatchObject({ sent: 0, failed: 1 });
    expect(log).toContain("DELETE /rest/v1/unlock_feedback?id=eq.501");
    expect(log.some((c) => c.startsWith("PATCH"))).toBe(false);
  });

  it("keeps the claim when the answer is unclear, so the reader is never emailed twice", async () => {
    for (const error of [
      { name: "application_error", message: "Internal server error", statusCode: 500 },
      { name: "application_error", message: "Unable to fetch data.", statusCode: null },
    ]) {
      log = [];
      withDb({ candidates: [candidate()] });
      mockSend.mockResolvedValue({ data: null, error });
      const { body } = await run();
      expect(body.summary).toMatchObject({ sent: 0, failed: 1 });
      expect(log.some((c) => c.startsWith("DELETE") || c.startsWith("PATCH"))).toBe(false);
    }
  });

  it("keeps the claim when Resend does not answer in time", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    vi.setSystemTime(new Date(NOW));
    withDb({ candidates: [candidate()] });
    mockSend.mockReturnValue(new Promise(() => {}));
    const pending = GET(request());
    while (mockSend.mock.calls.length === 0) await new Promise((r) => setImmediate(r));
    await vi.advanceTimersByTimeAsync(8_000);
    const body = await (await pending).json();
    expect(body.summary).toMatchObject({ sent: 0, failed: 1 });
    expect(log).toContain("POST /rest/v1/unlock_feedback?on_conflict=survey_submission_id");
    expect(log.some((c) => c.startsWith("DELETE") || c.startsWith("PATCH"))).toBe(false);
  });

  it("tells ops once when the email went but its record did not", async () => {
    withDb({ candidates: [candidate()], patchStatus: 500 });
    const { body } = await run();
    expect(body.summary.sent).toBe(1);
    expect(mockNotifySlack).toHaveBeenCalledTimes(1);
    expect(mockNotifySlack.mock.calls[0]![0].text).toContain("sent_at not written");
  });
});

describe("GET /api/cron/unlock-feedback: who is left out", () => {
  it.each([
    ["a buyer of any plan", { payments: [{ metadata: { plan: "essentials" } }] }, "paid"],
    ["a suppressed or unsubscribed address", { suppressed: true }, "suppressed"],
    ["anyone, while the suppression list cannot be read", { suppressionDown: true }, "unknown"],
    ["a person this email already went to", { emailedBefore: true }, "emailed_before"],
    [
      "a buyer of the EUR 1.99 initial report",
      { payments: [{ metadata: { plan: "initial" } }] },
      "paid",
    ],
    ["a reader who never opened their report", { notOpened: true }, "not_opened"],
    [
      "someone who bought another of their reports",
      { otherReports: [{ id: 77, plan: "full_report" }] },
      "paid",
    ],
    [
      "someone who bought the EUR 1.99 report for another test",
      { otherReports: [{ id: 77, plan: "initial" }] },
      "paid",
    ],
  ] as const)("%s", async (_label, db, reason) => {
    withDb({ candidates: [candidate()], ...db });
    const { body } = await run();
    expect(body.summary.skipped).toEqual({ [reason]: 1 });
    expect(log.some((c) => c.startsWith("POST /rest/v1/unlock_feedback"))).toBe(false);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("staff, before any lookup", async () => {
    withDb({ candidates: [candidate(1, "mark@loveiq.org")] });
    const { body } = await run();
    expect(body.summary.skipped).toEqual({ test: 1 });
    expect(log.filter((c) => !c.includes("personal_report") && !c.includes("cron_run"))).toEqual(
      []
    );
  });

  it.each([
    ["payments", { paymentsDown: true }],
    ["report opens", { sessionsDown: true }],
  ] as const)("a reader whose %s cannot be read waits for the next run", async (_label, db) => {
    withDb({ candidates: [candidate()], ...db });
    const { body } = await run();
    expect(body.summary).toMatchObject({ sent: 0, failed: 1 });
    expect(log.some((c) => c.startsWith("POST /rest/v1/unlock_feedback"))).toBe(false);
    expect(mockSend).not.toHaveBeenCalled();
  });
});

describe("GET /api/cron/unlock-feedback: what the full report is worth", () => {
  it.each([
    [
      "the price-test arm's own price",
      [{ current_price: "4.99", currency: "EUR" }],
      ", worth €4.99,",
    ],
    ["no quote", [], ""],
    ["a quote in another currency", [{ current_price: "29.99", currency: "USD" }], ""],
    ["a quote without a price", [{ current_price: null, currency: "EUR" }], ""],
  ] as const)("%s", async (_label, quote, worth) => {
    withDb({ candidates: [candidate()], quote: [...quote] });
    expect((await run()).body.summary.sent).toBe(1);
    expect(mockSend.mock.calls[0]![0].text).toContain(
      `we unlock the full report${worth} with all its chapters`
    );
  });
});

describe("GET /api/cron/unlock-feedback: when Resend fails", () => {
  it("stops after three failed sends, so an outage never uses up every reader", async () => {
    withDb({ candidates: [1, 2, 3, 4, 5].map((n) => candidate(n)) });
    mockSend.mockResolvedValue({
      data: null,
      error: { name: "application_error", message: "Internal server error", statusCode: 500 },
    });
    const { body } = await run();
    expect(body.summary).toMatchObject({ candidates: 5, sent: 0, failed: 3, deferred: 2 });
    expect(mockSend).toHaveBeenCalledTimes(3);
  });

  it("someone with more submissions than one look can read is not emailed: it fails closed", async () => {
    withDb({
      candidates: [candidate()],
      otherReports: Array.from({ length: 50 }, (_, i) => ({ id: 400 + i })),
    });
    const { body } = await run();
    expect(body.summary.skipped).toEqual({ paid: 1 });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("a reader with another, unpaid report is still emailed", async () => {
    withDb({ candidates: [candidate()], otherReports: [{ id: 77 }] });
    expect((await run()).body.summary.sent).toBe(1);
  });
});

describe("GET /api/cron/unlock-feedback: the time budget", () => {
  it("starts no new reader after 20 seconds, leaving them to the next run", async () => {
    withDb({ candidates: [candidate(1), candidate(2), candidate(3)] });
    mockSend.mockImplementation(async () => {
      vi.setSystemTime(Date.now() + 21_000);
      return sentOk;
    });
    const { body } = await run();
    expect(body.summary).toMatchObject({ candidates: 3, sent: 1, deferred: 2 });
    expect(mockSend).toHaveBeenCalledTimes(1);
  });
});
