import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockFetchWithTimeout = vi.fn();
const mockIsEmailSuppressed = vi.fn();
const mockResendSend = vi.fn();
const mockIsProdCronHost = vi.fn();

vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: (...args: unknown[]) => mockFetchWithTimeout(...args),
}));
vi.mock("@shared/http/circuit-breaker", () => ({
  getBreaker: () => ({ fire: (fn: () => Promise<unknown>) => fn() }),
}));
vi.mock("@shared/emails/suppression", () => ({
  isEmailSuppressed: (...args: unknown[]) => mockIsEmailSuppressed(...args),
}));
vi.mock("@shared/emails/unsubscribe-token", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@shared/emails/unsubscribe-token")>()),
  buildUnsubscribeUrl: () => "https://test.loveiq.org/api/unsubscribe?token=x",
}));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: mockResendSend };
  },
}));
vi.mock("@shared/http/is-prod-cron-host", () => ({
  isProdCronHost: (...args: unknown[]) => mockIsProdCronHost(...args),
}));

import { GET } from "@/app/api/cron/initial-unlock-gift/route";
import { __resetSystemFlagsCacheForTests } from "@shared/flags/system-flags";
import { assignInitialGiftArm } from "@shared/experiments/initialGiftArm";

const ORIGINAL_ENV = { ...process.env };
const TOKEN = "rpt_AbCdEfGhIjKlMnOpQrSt";

const GIFT_ID = firstReportOn("gift");
const HOLDOUT_ID = firstReportOn("holdout");

function firstReportOn(arm: "gift" | "holdout"): number {
  for (let id = 100; id < 1_000; id++) if (assignInitialGiftArm(id) === arm) return id;
  throw new Error(`no report on ${arm}`);
}

function makeRequest(token?: string): Request {
  return new Request("https://example.test/api/cron/initial-unlock-gift", {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

function json(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body };
}

function candidate(id: number, appUser: Record<string, unknown> = {}) {
  return {
    id,
    survey_submission_id: id + 1000,
    initial_gate_seen_at: new Date(Date.now() - 4.2 * 24 * 3_600_000).toISOString(),
    survey_submission: {
      user_id: 7,
      app_user: { email: `reader${id}@example.com`, first_name: "Alex", ...appUser },
    },
  };
}

interface Calls {
  armWrites: Array<{ url: string; body: Record<string, unknown> }>;
  claims: string[];
  grants: Array<Record<string, unknown>>;
  candidateUrl: string | null;
}

/**
 * The route's reads and writes, by URL. `armTaken` / `sendTaken` answer the conditional
 * PATCH with no row, as when another run got there first.
 */
function routeFetches({
  candidates,
  payments = [],
  armTaken = false,
  sendTaken = false,
  grantFails = false,
}: {
  candidates: unknown[];
  payments?: unknown[];
  armTaken?: boolean;
  sendTaken?: boolean;
  grantFails?: boolean;
}): Calls {
  const calls: Calls = { armWrites: [], claims: [], grants: [], candidateUrl: null };
  mockFetchWithTimeout.mockImplementation(
    async (url: string, init?: { method?: string; body?: string }) => {
      const method = init?.method ?? "GET";
      if (method === "GET" && url.includes("/rest/v1/personal_report?initial_gate_seen_at=")) {
        calls.candidateUrl = url;
        return json(candidates);
      }
      if (method === "GET" && url.includes("metadata->>gifted=eq.e07")) return json([]);
      if (method === "GET" && url.includes("/rest/v1/payment?personal_report_id=eq.")) {
        return json(payments);
      }
      if (method === "GET" && url.includes("/rest/v1/report_access_token")) {
        return json([{ token: TOKEN }]);
      }
      if (method === "PATCH" && url.includes("/rest/v1/personal_report?id=eq.")) {
        const body = JSON.parse(init?.body ?? "{}") as Record<string, unknown>;
        if ("initial_gift_arm" in body) {
          calls.armWrites.push({ url, body });
          return json(armTaken && body.initial_gift_arm !== null ? [] : [{ id: 1 }]);
        }
        if ("initial_gift_sent_at" in body) {
          calls.claims.push(url);
          return json(sendTaken ? [] : [{ id: 1 }]);
        }
      }
      if (method === "POST" && url.endsWith("/rest/v1/payment")) {
        if (grantFails) return json({ message: "boom" }, 500);
        calls.grants.push(JSON.parse(init?.body ?? "{}") as Record<string, unknown>);
        return json([{ id: 555 }], 201);
      }
      // system flags, cron_run and the rest: nothing to say.
      return json([]);
    }
  );
  return calls;
}

describe("GET /api/cron/initial-unlock-gift (E07, the day-4 gift)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetSystemFlagsCacheForTests({ initial_unlock_gift_email: true });
    process.env = {
      ...ORIGINAL_ENV,
      CRON_SECRET: "test-cron-secret",
      RESEND_API_KEY: "re_test_key",
      SUPABASE_URL: "https://test.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-key",
      NEXT_PUBLIC_SITE_URL: "https://test.loveiq.org",
      UNSUBSCRIBE_SECRET: "unsub-secret",
    };
    mockIsProdCronHost.mockReturnValue(true);
    mockIsEmailSuppressed.mockResolvedValue(false);
    mockResendSend.mockResolvedValue({ data: { id: "msg_1" }, error: null });
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("refuses a wrong secret, and runs nowhere without one", async () => {
    expect((await GET(makeRequest("wrong"))).status).toBe(401);
    delete process.env.CRON_SECRET;
    expect((await GET(makeRequest("anything"))).status).toBe(503);
  });

  it("does nothing off the production cron host", async () => {
    mockIsProdCronHost.mockReturnValue(false);
    const res = await GET(makeRequest("test-cron-secret"));
    expect(await res.json()).toEqual({ skipped: true, reason: "non-prod-cron-host" });
    expect(mockFetchWithTimeout).not.toHaveBeenCalled();
  });

  it("does nothing while its flag is off", async () => {
    __resetSystemFlagsCacheForTests({ initial_unlock_gift_email: false });
    const calls = routeFetches({ candidates: [candidate(GIFT_ID)] });
    const res = await GET(makeRequest("test-cron-secret"));
    expect(await res.json()).toEqual({ skipped: true, reason: "flag_off" });
    expect(calls.candidateUrl).toBeNull();
    expect(mockResendSend).not.toHaveBeenCalled();
  });

  it("looks only at reports first gated four to five days ago, with no arm yet", async () => {
    const calls = routeFetches({ candidates: [] });
    await GET(makeRequest("test-cron-secret"));
    const url = calls.candidateUrl ?? "";
    expect(url).toContain("initial_gate_seen_at=lte.");
    expect(url).toContain("initial_gate_seen_at=gt.");
    expect(url).toContain("initial_gift_arm=is.null");
  });

  it("gifts a report on the gift arm: the arm, the EUR 0 unlock, one E07, the stamp", async () => {
    const calls = routeFetches({ candidates: [candidate(GIFT_ID)] });

    const res = await GET(makeRequest("test-cron-secret"));
    const body = await res.json();
    expect(body.summary).toEqual(expect.objectContaining({ gifted: 1, heldOut: 0, failed: 0 }));

    expect(calls.armWrites).toHaveLength(1);
    expect(calls.armWrites[0]!.url).toContain(`id=eq.${GIFT_ID}&initial_gift_arm=is.null`);
    expect(calls.armWrites[0]!.body).toEqual({ initial_gift_arm: "gift" });
    expect(calls.grants).toHaveLength(1);
    expect(calls.grants[0]).toEqual(
      expect.objectContaining({ amount: 0, metadata: expect.objectContaining({ gifted: "e07" }) })
    );
    expect(calls.claims).toHaveLength(1);
    expect(calls.claims[0]).toContain("initial_gift_sent_at=is.null");

    expect(mockResendSend).toHaveBeenCalledTimes(1);
    const sent = mockResendSend.mock.calls[0]![0];
    expect(sent.to).toBe(`reader${GIFT_ID}@example.com`);
    expect(sent.subject).toBe("We unlocked your Core Archetype for you");
    expect(sent.html).toContain(`/report/${TOKEN}?from=email`);
    expect(sent.tags).toEqual([
      { name: "stage", value: "initial_gift" },
      { name: "sub", value: String(GIFT_ID + 1000) },
    ]);
  });

  it("holds a report on the holdout arm out: its arm, and nothing else", async () => {
    const calls = routeFetches({ candidates: [candidate(HOLDOUT_ID)] });

    const res = await GET(makeRequest("test-cron-secret"));
    const body = await res.json();
    expect(body.summary).toEqual(expect.objectContaining({ gifted: 0, heldOut: 1 }));
    expect(calls.armWrites.map((w) => w.body)).toEqual([{ initial_gift_arm: "holdout" }]);
    expect(calls.grants).toHaveLength(0);
    expect(mockResendSend).not.toHaveBeenCalled();
  });

  it.each([
    ["a reader who paid", () => ({ payments: [{ metadata: { plan: "initial" } }] }), "skippedPaid"],
    [
      "a reader who unsubscribed or bounced",
      () => {
        mockIsEmailSuppressed.mockResolvedValue(true);
        return {};
      },
      "skippedSuppressed",
    ],
  ])("leaves %s alone: no arm, no gift, no email", async (_who, arrange, counter) => {
    const extra = arrange();
    const calls = routeFetches({ candidates: [candidate(GIFT_ID)], ...extra });

    const body = await (await GET(makeRequest("test-cron-secret"))).json();
    expect(body.summary[counter]).toBe(1);
    expect(calls.armWrites).toHaveLength(0);
    expect(calls.grants).toHaveLength(0);
    expect(mockResendSend).not.toHaveBeenCalled();
  });

  it("leaves a reader whose data is frozen (GDPR Art. 18) alone", async () => {
    const calls = routeFetches({
      candidates: [candidate(GIFT_ID, { processing_restricted_at: "2026-10-19T10:00:00Z" })],
    });
    const body = await (await GET(makeRequest("test-cron-secret"))).json();
    expect(body.summary.skippedRestricted).toBe(1);
    expect(calls.armWrites).toHaveLength(0);
    expect(mockResendSend).not.toHaveBeenCalled();
  });

  it("does not count the gift itself as a payment that stops the gift", async () => {
    const calls = routeFetches({
      candidates: [candidate(GIFT_ID)],
      payments: [{ metadata: { plan: "initial", gifted: "e07" } }],
    });
    await GET(makeRequest("test-cron-secret"));
    expect(calls.armWrites).toHaveLength(1);
  });

  it("sends nothing new when another run already took the report", async () => {
    const calls = routeFetches({ candidates: [candidate(GIFT_ID)], armTaken: true });
    const body = await (await GET(makeRequest("test-cron-secret"))).json();
    expect(body.summary.skippedTaken).toBe(1);
    expect(calls.grants).toHaveLength(0);
    expect(mockResendSend).not.toHaveBeenCalled();
  });

  it("sends nothing twice: a gift already sent is not sent again", async () => {
    routeFetches({ candidates: [candidate(GIFT_ID)], sendTaken: true });
    await GET(makeRequest("test-cron-secret"));
    expect(mockResendSend).not.toHaveBeenCalled();
  });

  it("gives the arm back when the gift can't be written, so the next run tries again", async () => {
    const calls = routeFetches({ candidates: [candidate(GIFT_ID)], grantFails: true });
    const body = await (await GET(makeRequest("test-cron-secret"))).json();
    expect(body.summary.failed).toBe(1);
    expect(calls.armWrites.map((w) => w.body)).toEqual([
      { initial_gift_arm: "gift" },
      { initial_gift_arm: null },
    ]);
    expect(calls.armWrites[1]!.url).toContain("initial_gift_arm=eq.gift");
    expect(mockResendSend).not.toHaveBeenCalled();
  });
});
