import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@shared/http/csrf", () => ({ verifyCsrfToken: vi.fn().mockResolvedValue(true) }));
vi.mock("@shared/http/ratelimit", () => ({
  checkRateLimit: vi.fn(),
  checkCooldown: vi.fn(),
  getClientIp: vi.fn().mockReturnValue("203.0.113.9"),
  releaseCooldown: vi.fn(),
}));
const mockFetchWithTimeout = vi.fn();
vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: (...args: unknown[]) => mockFetchWithTimeout(...args),
}));
vi.mock("@shared/http/circuit-breaker", () => ({
  getBreaker: () => ({ fire: (fn: () => Promise<unknown>) => fn() }),
  CircuitOpenError: class CircuitOpenError extends Error {},
}));
// The landing arm cookie a browser holds from an earlier visit to "/". Without this mock
// `cookies()` throws (no request scope) and no arm is ever read, so a route that stamped
// a buyer into an arm would pass.
const mockArmCookie = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      /liq_lv$/.test(name) && mockArmCookie.value ? { value: mockArmCookie.value } : undefined,
  }),
}));
vi.mock("@shared/flags/system-flags", () => ({
  isFeatureEnabled: vi.fn().mockResolvedValue(true),
}));
vi.mock("@features/report/server/personalReport", () => ({
  ensurePersonalReportForSubmission: vi.fn().mockResolvedValue({ id: 10 }),
}));
vi.mock("@features/pay-to-start/server/claim", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@features/pay-to-start/server/claim")>();
  return {
    ...actual,
    claimPayToStartForSubmission: vi.fn(),
    claimedEntitlementFor: vi.fn(),
    reportClaimProblem: vi.fn(),
  };
});
const { mockEmailsSend } = vi.hoisted(() => ({ mockEmailsSend: vi.fn() }));
vi.mock("resend", () => ({
  Resend: class {
    contacts = { create: vi.fn() };
    emails = { send: mockEmailsSend };
  },
}));

process.env.SUPABASE_URL = "https://db.example";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
process.env.RESEND_API_KEY = "re_test";

import { POST } from "@/app/api/survey/route";
import {
  claimPayToStartForSubmission,
  claimedEntitlementFor,
  reportClaimProblem,
  type ClaimOutcome,
} from "@features/pay-to-start/server/claim";
import { __resetSurveyStatusCacheForTests } from "@features/survey/server/server";
import { flushAfterResponse } from "@shared/http/after-response";
import { checkCooldown, checkRateLimit } from "@shared/http/ratelimit";

const TOKEN = `rpp_${"g".repeat(32)}`;
const SESSION = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";

interface Seen {
  rpcBody: Record<string, unknown> | null;
}

function routeSupabase({
  existingSubmission = null,
  suppressed = false,
}: { existingSubmission?: number | null; suppressed?: boolean } = {}) {
  const seen: Seen = { rpcBody: null };
  mockFetchWithTimeout.mockImplementation(
    async (url: string, options: { body?: string; method?: string } = {}) => {
      const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
      if (url.includes("/rest/v1/email_suppression?")) {
        return ok(suppressed ? [{ email: "alice@example.com" }] : []);
      }
      if (url.includes("/rest/v1/survey_submission?session_id=eq.")) {
        return ok(existingSubmission ? [{ id: existingSubmission, status: "completed" }] : []);
      }
      if (url.includes("/rpc/submit_survey")) {
        seen.rpcBody = JSON.parse(options.body ?? "{}") as Record<string, unknown>;
        return ok({ success: true, submission_id: 123 });
      }
      return ok([]);
    }
  );
  return seen;
}

function submit(body: Record<string, unknown> = {}, cookie?: string) {
  return POST(
    new Request("https://www.loveiq.org/api/survey", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify({
        email: "alice@example.com",
        firstName: "Alice",
        answers: { q1: "yes", q2: 3 },
        startedAt: new Date().toISOString(),
        durationMs: 540_000,
        ...body,
      }),
    })
  );
}

const unlocked: ClaimOutcome = { outcome: "unlocked", entitlementId: 7, paymentId: 41 };

beforeEach(() => {
  vi.clearAllMocks();
  __resetSurveyStatusCacheForTests(false);
  vi.mocked(checkRateLimit).mockResolvedValue({
    allowed: true,
    remaining: 2,
    resetAt: new Date(Date.now() + 60_000),
  } as never);
  vi.mocked(checkCooldown).mockResolvedValue({ allowed: true, retryAfterMs: 0 } as never);
  mockEmailsSend.mockResolvedValue({ data: { id: "e1" }, error: null });
  vi.mocked(claimPayToStartForSubmission).mockResolvedValue(unlocked);
  vi.mocked(claimedEntitlementFor).mockResolvedValue(null);
});

describe("a survey submitted without the cookie", () => {
  it("claims nothing and answers as before", async () => {
    routeSupabase();
    const response = await submit();
    const json = await response.json();
    expect(claimPayToStartForSubmission).not.toHaveBeenCalled();
    expect(json).not.toHaveProperty("journey");
    expect(json).not.toHaveProperty("unlocked");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("strips a journey label the browser claimed for itself", async () => {
    const seen = routeSupabase();
    await submit({ utmTracker: '{"utm_source":"google","journey":"pay_to_start"}' });
    expect(seen.rpcBody?.p_utm_tracker).toBe('{"utm_source":"google"}');
  });

  it("keeps the survey email's A/B test", async () => {
    routeSupabase();
    await submit();
    await flushAfterResponse();
    const payload = mockEmailsSend.mock.calls[0]?.[0] as { tags: Array<{ name: string }> };
    expect(payload.tags.map((t) => t.name)).toEqual(["exp", "arm"]);
  });
});

describe("a survey submitted by a buyer who paid before it", () => {
  const cookie = `__Host-liq_pp=${TOKEN}`;

  it("claims the entitlement for this submission and its new report link", async () => {
    routeSupabase();
    await submit({}, cookie);
    expect(claimPayToStartForSubmission).toHaveBeenCalledWith({
      reportToken: expect.stringMatching(/^rpt_/),
      submissionId: 123,
      token: TOKEN,
    });
  });

  it("answers unlocked and clears the cookie", async () => {
    routeSupabase();
    const response = await submit({}, cookie);
    expect(await response.json()).toMatchObject({
      success: true,
      submissionId: 123,
      journey: "pay_to_start",
      unlocked: true,
    });
    expect(response.headers.get("set-cookie")).toMatch(/__liq_pp=;.*Max-Age=0/i);
  });

  it("puts a buyer holding a landing arm cookie in no arm, and a free reader in theirs", async () => {
    mockArmCookie.value = "white_video";
    try {
      let seen = routeSupabase();
      await submit({ utmTracker: '{"utm_source":"google"}' });
      expect(JSON.parse(String(seen.rpcBody?.p_utm_tracker))).toMatchObject({
        landing_variant: "white_video",
      });

      seen = routeSupabase();
      await submit({ utmTracker: '{"utm_source":"google"}' }, cookie);
      const tracker = JSON.parse(String(seen.rpcBody?.p_utm_tracker)) as Record<string, unknown>;
      expect(tracker).not.toHaveProperty("landing_variant");
      expect(tracker).toMatchObject({ journey: "pay_to_start" });
    } finally {
      mockArmCookie.value = undefined;
    }
  });

  it("labels the submission as the journey and in no landing arm", async () => {
    const seen = routeSupabase();
    await submit({ utmTracker: '{"utm_source":"google","landing_variant":"white_card"}' }, cookie);
    const tracker = JSON.parse(String(seen.rpcBody?.p_utm_tracker)) as Record<string, unknown>;
    expect(tracker).toMatchObject({ utm_source: "google", journey: "pay_to_start" });
    expect(tracker).not.toHaveProperty("landing_variant");
  });

  it("says pending while the payment settles, without unlocking", async () => {
    routeSupabase();
    vi.mocked(claimPayToStartForSubmission).mockResolvedValue({
      outcome: "pending",
      entitlementId: 7,
    });
    const json = await (await submit({}, cookie)).json();
    expect(json).toMatchObject({ journey: "pay_to_start", unlocked: false, unlockPending: true });
  });

  it("clears the cookie after a claim on a checkout left unpaid", async () => {
    // Kept, the next purchase in this browser would pay for this survey: someone else's
    // on a shared device, or a second payment for a report already bought.
    routeSupabase();
    vi.mocked(claimPayToStartForSubmission).mockResolvedValue({
      outcome: "unpaid",
      entitlementId: 7,
    });
    const response = await submit({}, cookie);
    expect(await response.json()).toMatchObject({ journey: "pay_to_start", unlocked: false });
    expect(response.headers.get("set-cookie")).toMatch(/__liq_pp=;.*Max-Age=0/i);
  });

  it("keeps the cookie after an error, so a retry can claim, and reports it", async () => {
    routeSupabase();
    const claim: ClaimOutcome = { outcome: "error", entitlementId: 7, error: new Error("db") };
    vi.mocked(claimPayToStartForSubmission).mockResolvedValue(claim);
    const response = await submit({}, cookie);
    expect(await response.json()).toMatchObject({ unlocked: false });
    expect(response.headers.get("set-cookie")).toBeNull();
    await flushAfterResponse();
    expect(reportClaimProblem).toHaveBeenCalledWith(claim, 123);
  });

  it("sends the full-report email instead of the survey email, outside both tests", async () => {
    routeSupabase();
    await submit({}, cookie);
    await flushAfterResponse();
    const payload = mockEmailsSend.mock.calls[0]?.[0] as {
      subject: string;
      tags: Array<{ name: string; value: string }>;
    };
    expect(payload.subject).toBe("Your full report is ready, Alice");
    expect(payload.tags).toEqual([
      { name: "journey", value: "pay_to_start" },
      { name: "email", value: "pts_report_unlocked" },
    ]);
  });

  it("sends a buyer's report email even to an address on the suppression list", async () => {
    // It confirms a purchase, like a report purchase's email, which always goes.
    routeSupabase({ suppressed: true });
    await submit({}, cookie);
    await flushAfterResponse();
    expect(mockEmailsSend).toHaveBeenCalledTimes(1);
    expect((mockEmailsSend.mock.calls[0]?.[0] as { subject: string }).subject).toBe(
      "Your full report is ready, Alice"
    );
  });

  it("still sends nothing to a suppressed address whose report did not unlock", async () => {
    routeSupabase({ suppressed: true });
    vi.mocked(claimPayToStartForSubmission).mockResolvedValue({
      outcome: "unpaid",
      entitlementId: 7,
    });
    await submit({}, cookie);
    await flushAfterResponse();
    expect(mockEmailsSend).not.toHaveBeenCalled();
  });

  it("sends the survey email's A copy, untagged for the test, when not unlocked", async () => {
    routeSupabase();
    vi.mocked(claimPayToStartForSubmission).mockResolvedValue({
      outcome: "unpaid",
      entitlementId: 7,
    });
    await submit({}, cookie);
    await flushAfterResponse();
    const payload = mockEmailsSend.mock.calls[0]?.[0] as {
      subject: string;
      tags: Array<{ name: string; value: string }>;
    };
    expect(payload.subject).toBe("Your LoveIQ report is ready");
    expect(payload.tags).toEqual([
      { name: "journey", value: "pay_to_start" },
      { name: "email", value: "pts_report_ready" },
    ]);
  });
});

describe("a replayed submit", () => {
  it("claims with the cookie for the submission that already landed", async () => {
    routeSupabase({ existingSubmission: 99 });
    const response = await submit({ sessionId: SESSION }, `__liq_pp=${TOKEN}`);
    expect(claimPayToStartForSubmission).toHaveBeenCalledWith(
      expect.objectContaining({ submissionId: 99, token: TOKEN })
    );
    expect(await response.json()).toMatchObject({
      submissionId: 99,
      journey: "pay_to_start",
      unlocked: true,
    });
    expect(response.headers.get("set-cookie")).toMatch(/Max-Age=0/i);
  });

  it("without the cookie, still reports the claim that submission made", async () => {
    routeSupabase({ existingSubmission: 99 });
    vi.mocked(claimedEntitlementFor).mockResolvedValue(unlocked);
    const response = await submit({ sessionId: SESSION });
    expect(claimPayToStartForSubmission).not.toHaveBeenCalled();
    expect(claimedEntitlementFor).toHaveBeenCalledWith(99);
    expect(await response.json()).toMatchObject({ journey: "pay_to_start", unlocked: true });
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("adds nothing for a submission that never claimed one", async () => {
    routeSupabase({ existingSubmission: 99 });
    const json = await (await submit({ sessionId: SESSION })).json();
    expect(json).not.toHaveProperty("journey");
  });
});
