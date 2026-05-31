import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockFetchWithTimeout = vi.fn();
const mockIsEmailSuppressed = vi.fn();
const mockResendSend = vi.fn();
const mockGetReportPlan = vi.fn();
const mockIsFeatureEnabled = vi.fn();
const mockGetQuoteForContext = vi.fn();
const mockNotifySlack = vi.fn();
const mockTryClaimSlackAlert = vi.fn();

vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: (...args: unknown[]) => mockFetchWithTimeout(...args),
}));

vi.mock("@shared/http/circuit-breaker", () => ({
  getBreaker: () => ({ fire: (fn: () => Promise<unknown>) => fn() }),
}));

vi.mock("@shared/emails/suppression", () => ({
  isEmailSuppressed: (...args: unknown[]) => mockIsEmailSuppressed(...args),
}));

vi.mock("@shared/emails/unsubscribe-token", () => ({
  buildUnsubscribeUrl: () => "https://test.loveiq.org/api/unsubscribe?token=x",
}));

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@shared/observability/slack-alert-dedup", () => ({
  startCronTimer: () => async () => {},
  recordCronRun: async () => {},
  tryClaimSlackAlert: (...args: unknown[]) => mockTryClaimSlackAlert(...args),
  markSlackAlertDelivered: async () => {},
}));

vi.mock("@shared/observability/slack", () => ({
  notifySlack: (...args: unknown[]) => mockNotifySlack(...args),
}));

vi.mock("@features/report/server/planAccess", () => ({
  getReportPlanByPersonalReportId: (...args: unknown[]) => mockGetReportPlan(...args),
}));

vi.mock("@features/pricing/logic/reportPricing", () => ({
  getReportPriceQuoteForContext: (...args: unknown[]) => mockGetQuoteForContext(...args),
}));

vi.mock("@shared/flags/system-flags", () => ({
  isFeatureEnabled: (...args: unknown[]) => mockIsFeatureEnabled(...args),
}));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: mockResendSend };
  },
}));

vi.mock("@shared/http/is-prod-cron-host", () => ({
  isProdCronHost: () => true,
}));

import { GET } from "@/app/api/cron/chapter-nudge/route";
import {
  CHAPTER_NUDGE_POOL,
  computeLockedChapters,
  pickNextChapter,
} from "@features/report/server/chapterTease";

const ORIGINAL_ENV = { ...process.env };
const PRIMARY = "Sensual Connector";
const DAY_MS = 24 * 60 * 60 * 1000;

function makeRequest(token?: string): Request {
  return new Request("https://example.test/api/cron/chapter-nudge", {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body };
}

const FREE_LOCKED = computeLockedChapters({
  accessPlan: null,
  archetypeTiers: null,
  unlockedArchetypes: null,
  primaryArchetype: PRIMARY,
});

function makeCandidate(email: string, overrides: Record<string, unknown> = {}) {
  return {
    id: 42,
    survey_submission_id: 7,
    created_date_time: new Date(Date.now() - 5 * DAY_MS).toISOString(),
    survey_submission: {
      app_user: { email, first_name: "Sam" },
      scoring_result: [{ v5_primary_archetype: PRIMARY, primary_archetype: PRIMARY }],
    },
    ...overrides,
  };
}

interface PatchCapture {
  bodies: string[];
}

function mockSingleCandidate({
  candidate,
  quoteMetadata = {},
  accessToken = "rpt_AbCdEfGhIjKlMnOpQrSt",
  archetypeTiers = null,
  unlockedArchetypes = null,
  patch,
  order,
}: {
  candidate: unknown | null;
  quoteMetadata?: Record<string, unknown>;
  accessToken?: string | null;
  archetypeTiers?: Record<string, string> | null;
  unlockedArchetypes?: string[] | null;
  patch?: PatchCapture;
  order?: string[];
}) {
  mockFetchWithTimeout.mockImplementation(
    (url: string, init?: { method?: string; body?: string }) => {
      if (url.includes("/rest/v1/personal_report")) {
        if (url.includes("archetype_tiers")) {
          return Promise.resolve(
            jsonResponse([
              { archetype_tiers: archetypeTiers, unlocked_archetypes: unlockedArchetypes },
            ])
          );
        }
        return Promise.resolve(jsonResponse(candidate ? [candidate] : []));
      }
      if (url.includes("/rest/v1/report_price_quote") && init?.method !== "PATCH") {
        return Promise.resolve(jsonResponse([{ id: 101, metadata: quoteMetadata }]));
      }
      if (url.includes("/rest/v1/report_access_token")) {
        return Promise.resolve(jsonResponse(accessToken ? [{ token: accessToken }] : []));
      }
      if (init?.method === "PATCH") {
        if (patch && typeof init.body === "string") patch.bodies.push(init.body);
        if (order) order.push("patch");
        return Promise.resolve(jsonResponse({}, 204));
      }
      return Promise.resolve(jsonResponse([]));
    }
  );
}

describe("GET /api/cron/chapter-nudge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...ORIGINAL_ENV,
      CRON_SECRET: "test-cron-secret",
      RESEND_API_KEY: "re_test_key",
      SUPABASE_URL: "https://test.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-key",
      NEXT_PUBLIC_SITE_URL: "https://test.loveiq.org",
      UNSUBSCRIBE_SECRET: "unsub-secret",
    };
    mockGetReportPlan.mockResolvedValue(null);
    mockIsEmailSuppressed.mockResolvedValue(false);
    mockIsFeatureEnabled.mockResolvedValue(true);
    mockGetQuoteForContext.mockResolvedValue({ id: 101 });
    mockResendSend.mockResolvedValue({ data: { id: "msg_1" }, error: null });
    mockTryClaimSlackAlert.mockResolvedValue(true);
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("returns 401 when authorization is wrong", async () => {
    const res = await GET(makeRequest("wrong"));
    expect(res.status).toBe(401);
  });

  it("returns 503 without CRON_SECRET", async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(makeRequest("anything"));
    expect(res.status).toBe(503);
  });

  it("skips when the kill switch is off", async () => {
    mockIsFeatureEnabled.mockResolvedValue(false);
    const res = await GET(makeRequest("test-cron-secret"));
    const body = await res.json();
    expect(body.skipped).toBe(true);
    expect(body.reason).toBe("kill_switch");
    expect(mockResendSend).not.toHaveBeenCalled();
  });

  it("returns success with zero candidates", async () => {
    mockSingleCandidate({ candidate: null });
    const res = await GET(makeRequest("test-cron-secret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.summary.sent).toBe(0);
  });

  it("sends the first chapter to a free user and writes idempotency metadata before send", async () => {
    const email = "free@example.com";
    const expected = pickNextChapter({ lockedChapters: FREE_LOCKED, alreadySent: [], email });
    const patch: PatchCapture = { bodies: [] };
    const order: string[] = [];
    mockResendSend.mockImplementation(() => {
      order.push("send");
      return Promise.resolve({ data: { id: "msg_1" }, error: null });
    });

    mockSingleCandidate({
      candidate: makeCandidate(email),
      quoteMetadata: {},
      patch,
      order,
    });

    const res = await GET(makeRequest("test-cron-secret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary.sent).toBe(1);

    expect(mockResendSend).toHaveBeenCalledTimes(1);
    const sent = mockResendSend.mock.calls[0][0];
    expect(sent.to).toBe(email);
    expect(sent.subject).toMatch(/Chapter \d+ of \d+:/);
    expect(sent.html).toContain(`/report/${"rpt_AbCdEfGhIjKlMnOpQrSt"}`);
    expect(sent.html).toContain(`utm_content=${expected!.entry.sectionId}`);
    expect(sent.headers["List-ID"]).toContain("LoveIQ Nurture");

    // Write-before-send ordering + metadata contents.
    expect(order).toEqual(["patch", "send"]);
    expect(patch.bodies).toHaveLength(1);
    const meta = JSON.parse(patch.bodies[0]!).metadata;
    expect(meta.chapterNudgesSent).toEqual([expected!.entry.sectionId]);
    expect(typeof meta.chapterNudgeLastSentAt).toBe("string");
  });

  it("skips when not yet due (last send < 44h ago)", async () => {
    mockSingleCandidate({
      candidate: makeCandidate("notdue@example.com"),
      quoteMetadata: {
        chapterNudgeLastSentAt: new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString(),
      },
    });
    const res = await GET(makeRequest("test-cron-secret"));
    const body = await res.json();
    expect(body.summary.skippedNotDue).toBe(1);
    expect(body.summary.sent).toBe(0);
    expect(mockResendSend).not.toHaveBeenCalled();
  });

  it("sends again once 44h have elapsed", async () => {
    mockSingleCandidate({
      candidate: makeCandidate("due@example.com"),
      quoteMetadata: {
        chapterNudgeLastSentAt: new Date(Date.now() - 50 * 60 * 60 * 1000).toISOString(),
      },
    });
    const res = await GET(makeRequest("test-cron-secret"));
    const body = await res.json();
    expect(body.summary.sent).toBe(1);
  });

  it("does not repeat an already-sent chapter (picks the next in the shuffle)", async () => {
    const email = "free@example.com";
    const first = pickNextChapter({ lockedChapters: FREE_LOCKED, alreadySent: [], email })!;
    const second = pickNextChapter({
      lockedChapters: FREE_LOCKED,
      alreadySent: [first.entry.sectionId],
      email,
    })!;

    mockSingleCandidate({
      candidate: makeCandidate(email),
      quoteMetadata: { chapterNudgesSent: [first.entry.sectionId] },
    });

    const res = await GET(makeRequest("test-cron-secret"));
    const body = await res.json();
    expect(body.summary.sent).toBe(1);
    const sent = mockResendSend.mock.calls[0][0];
    expect(sent.html).toContain(`utm_content=${second.entry.sectionId}`);
    expect(sent.html).not.toContain(`utm_content=${first.entry.sectionId}`);
  });

  it("skips a full_report owner of the primary (nothing locked)", async () => {
    mockSingleCandidate({
      candidate: makeCandidate("paid@example.com"),
      archetypeTiers: { [PRIMARY]: "full_report" },
      unlockedArchetypes: [PRIMARY],
    });
    const res = await GET(makeRequest("test-cron-secret"));
    const body = await res.json();
    expect(body.summary.skippedComplete).toBe(1);
    expect(body.summary.sent).toBe(0);
  });

  it("still sends to an essentials buyer (full-report chapters remain locked)", async () => {
    mockSingleCandidate({
      candidate: makeCandidate("essentials@example.com"),
      archetypeTiers: { [PRIMARY]: "essentials" },
    });
    const res = await GET(makeRequest("test-cron-secret"));
    const body = await res.json();
    expect(body.summary.sent).toBe(1);
  });

  it("skips when the campaign is complete (all locked chapters sent)", async () => {
    mockSingleCandidate({
      candidate: makeCandidate("done@example.com"),
      quoteMetadata: { chapterNudgesSent: FREE_LOCKED.map((c) => c.sectionId) },
    });
    const res = await GET(makeRequest("test-cron-secret"));
    const body = await res.json();
    expect(body.summary.skippedComplete).toBe(1);
    expect(body.summary.sent).toBe(0);
  });

  it("skips a suppressed email", async () => {
    mockIsEmailSuppressed.mockResolvedValue(true);
    mockSingleCandidate({ candidate: makeCandidate("supp@example.com") });
    const res = await GET(makeRequest("test-cron-secret"));
    const body = await res.json();
    expect(body.summary.skippedSuppressed).toBe(1);
    expect(mockResendSend).not.toHaveBeenCalled();
  });

  it("skips a candidate with no scoring result", async () => {
    mockSingleCandidate({
      candidate: makeCandidate("noscore@example.com", {
        survey_submission: {
          app_user: { email: "noscore@example.com", first_name: "N" },
          scoring_result: [],
        },
      }),
    });
    const res = await GET(makeRequest("test-cron-secret"));
    const body = await res.json();
    expect(body.summary.skippedNoArchetype).toBe(1);
  });

  it("skips when the report token is revoked/expired (none returned)", async () => {
    mockSingleCandidate({ candidate: makeCandidate("notoken@example.com"), accessToken: null });
    const res = await GET(makeRequest("test-cron-secret"));
    const body = await res.json();
    expect(body.summary.skippedNoToken).toBe(1);
  });

  it("skips a GDPR-restricted user before any work", async () => {
    mockSingleCandidate({
      candidate: makeCandidate("restricted@example.com", {
        survey_submission: {
          app_user: {
            email: "restricted@example.com",
            first_name: "R",
            processing_restricted_at: new Date().toISOString(),
          },
          scoring_result: [{ v5_primary_archetype: PRIMARY }],
        },
      }),
    });
    const res = await GET(makeRequest("test-cron-secret"));
    const body = await res.json();
    expect(body.summary.skippedRestricted).toBe(1);
    expect(mockResendSend).not.toHaveBeenCalled();
  });

  it("persists the marker even when the send fails (no double-send on retry)", async () => {
    const patch: PatchCapture = { bodies: [] };
    mockResendSend.mockResolvedValueOnce({
      data: null,
      error: { name: "ResendError", message: "boom" },
    });
    mockSingleCandidate({ candidate: makeCandidate("boom@example.com"), patch });

    const res = await GET(makeRequest("test-cron-secret"));
    const body = await res.json();
    expect(patch.bodies).toHaveLength(1);
    expect(body.summary.sent).toBe(0);
    expect(body.summary.failed).toBe(1);
    // Email-issue ops alert fires on a failed send.
    const kinds = mockNotifySlack.mock.calls.map((c) => (c[0] as { kind: string }).kind);
    expect(kinds).toContain("chapter_nudge_failures");
  });

  it("fires a capacity ops alert when the backlog approaches CANDIDATE_LIMIT", async () => {
    // 450 == floor(CANDIDATE_LIMIT(500) * 0.9). Use GDPR-restricted rows so the
    // loop fast-skips them (no sends) and we isolate the pre-loop capacity check.
    const restricted = Array.from({ length: 450 }, (_, i) => ({
      id: i + 1,
      survey_submission_id: i + 1,
      created_date_time: new Date(Date.now() - 5 * DAY_MS).toISOString(),
      survey_submission: {
        app_user: {
          email: `u${i}@example.com`,
          first_name: "R",
          processing_restricted_at: new Date().toISOString(),
        },
        scoring_result: [{ v5_primary_archetype: PRIMARY }],
      },
    }));
    mockFetchWithTimeout.mockImplementation((url: string) => {
      if (url.includes("/rest/v1/personal_report") && !url.includes("archetype_tiers")) {
        return Promise.resolve(jsonResponse(restricted));
      }
      return Promise.resolve(jsonResponse([]));
    });

    const res = await GET(makeRequest("test-cron-secret"));
    const body = await res.json();
    expect(body.summary.candidates).toBe(450);
    expect(body.summary.skippedRestricted).toBe(450);
    expect(mockResendSend).not.toHaveBeenCalled();
    const kinds = mockNotifySlack.mock.calls.map((c) => (c[0] as { kind: string }).kind);
    expect(kinds).toContain("chapter_nudge_capacity");
  });

  it("does NOT fire a capacity alert at normal volume", async () => {
    mockSingleCandidate({ candidate: makeCandidate("normal@example.com") });
    await GET(makeRequest("test-cron-secret"));
    const kinds = mockNotifySlack.mock.calls.map((c) => (c[0] as { kind: string }).kind);
    expect(kinds).not.toContain("chapter_nudge_capacity");
  });
});
