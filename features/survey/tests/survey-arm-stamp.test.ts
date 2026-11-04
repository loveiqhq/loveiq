import { beforeEach, describe, expect, it, vi } from "vitest";
import { assignQuestionOrderArm } from "@shared/experiments/questionOrderArm";

/**
 * The landing arm reaching the SUBMISSION, exercised through the route.
 *
 * The only guard on this before was a source grep in
 * `features/landing/tests/landingVariantAb.test.ts` asserting the literal line
 * `base.landing_variant = landingVariantRaw`. A grep proves a string is present;
 * it cannot prove the arm reaches the payload, and it broke the moment the stamp
 * moved into a shared helper — having never once exercised the route.
 *
 * ITS OWN FILE, deliberately. Adding these to `survey-notifications.test.ts`
 * turned one of its passing tests red: a submission fires a Slack notification,
 * `notifySlack` dedups by kind for 60 seconds, and a second test's notification
 * inside that window is correctly swallowed. Separate module registry, no shared
 * dedup cache, no ordering coupling.
 */
const {
  mockAfter,
  mockVerifyCsrf,
  mockCheckRateLimit,
  mockCheckCooldown,
  mockGetClientIp,
  mockFetchWithTimeout,
  mockComputeSurveyScoring,
  mockEnsureSubmissionScored,
  mockEnsurePersonalReportForSubmission,
  mockSubmitSurveyOnce,
  mockSupabaseFetch,
  mockCookieGet,
} = vi.hoisted(() => ({
  mockAfter: vi.fn(),
  mockVerifyCsrf: vi.fn<() => Promise<boolean>>(),
  mockCheckRateLimit: vi.fn(),
  mockCheckCooldown: vi.fn(),
  mockGetClientIp: vi.fn(),
  mockFetchWithTimeout: vi.fn(),
  mockComputeSurveyScoring: vi.fn(),
  mockEnsureSubmissionScored: vi.fn(),
  mockEnsurePersonalReportForSubmission: vi.fn(),
  mockSubmitSurveyOnce: vi.fn(),
  mockSupabaseFetch: vi.fn(),
  mockCookieGet: vi.fn(),
}));

vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return { ...actual, after: (...args: unknown[]) => mockAfter(...args) };
});

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

/**
 * Without this, `cookies()` throws (no request scope) and the stamp treats that
 * as "no arm" — so both tests below would pass against a route that never
 * stamped anything at all.
 */
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: mockCookieGet }),
}));

vi.mock("@shared/http/csrf", () => ({
  verifyCsrfToken: (...args: unknown[]) => mockVerifyCsrf(...(args as [])),
}));

vi.mock("@shared/http/ratelimit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  checkCooldown: (...args: unknown[]) => mockCheckCooldown(...args),
  getClientIp: (...args: unknown[]) => mockGetClientIp(...args),
}));

vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: (...args: unknown[]) => mockFetchWithTimeout(...args),
}));

vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (...args: unknown[]) => mockSupabaseFetch(...args),
}));

vi.mock("@features/survey/server/server", () => ({
  computeSurveyScoring: (...args: unknown[]) => mockComputeSurveyScoring(...args),
  ensureSubmissionScored: (...args: unknown[]) => mockEnsureSubmissionScored(...args),
  submitSurveyOnce: (...args: unknown[]) => mockSubmitSurveyOnce(...args),
  isSurveyClosed: () => Promise.resolve(false),
  // No earlier submission under this session: the replay path stays out of the way.
  fetchSubmissionBySessionId: () => Promise.resolve(null),
}));

vi.mock("@features/report/server/personalReport", () => ({
  ensurePersonalReportForSubmission: (...args: unknown[]) =>
    mockEnsurePersonalReportForSubmission(...args),
}));

import { POST } from "@/app/api/survey/route";

function makeRequest(body: Record<string, unknown>) {
  return new Request("https://www.loveiq.org/api/survey", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBody = () => ({
  email: "alice@example.com",
  firstName: "Alice",
  answers: { q1: "yes", q2: 3 },
  startedAt: new Date().toISOString(),
  durationMs: 120_000,
  sessionId: "550e8400-e29b-41d4-a716-446655440000",
});

/** The C13 arm the route also stamps on any tracker it sends (derived from the session id). */
const C13 = { question_order_arm: assignQuestionOrderArm(validBody().sessionId) };

/** The email test's arm for the same session (written out, so a re-split fails). */
const EMAIL = { contact_question_arm: "anonymous" };

/** The utm_tracker as it reached submitSurveyOnce, parsed. */
function trackerOnPayload(): Record<string, unknown> | null {
  const payload = mockSubmitSurveyOnce.mock.calls[0]?.[0] as
    { utmTracker?: string | null } | undefined;
  const raw = payload?.utmTracker;
  return typeof raw === "string" ? (JSON.parse(raw) as Record<string, unknown>) : null;
}

describe("POST /api/survey — the landing arm on the submission", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockVerifyCsrf.mockResolvedValue(true);
    mockCheckRateLimit.mockResolvedValue({
      allowed: true,
      remaining: 2,
      resetAt: new Date(Date.now() + 60_000),
    });
    mockCheckCooldown.mockResolvedValue({ allowed: true, retryAfterMs: 0 });
    mockGetClientIp.mockReturnValue("1.2.3.4");
    mockComputeSurveyScoring.mockReturnValue(null);
    mockEnsureSubmissionScored.mockResolvedValue({
      primaryArchetype: "Spark Seeker",
      v5PrimaryArchetype: null,
    });
    mockEnsurePersonalReportForSubmission.mockResolvedValue({ id: 10 });
    mockSubmitSurveyOnce.mockResolvedValue({ submissionId: 123, isExisting: false });
    // Swallow post-response work: this file is about the payload, and running the
    // journey assembler would need a second layer of fixtures to say nothing new.
    mockAfter.mockImplementation(() => undefined);
    mockCookieGet.mockReturnValue(undefined);
  });

  it("stamps the arm from the cookie onto the submitted tracker", async () => {
    mockCookieGet.mockReturnValue({ value: "white_prev" });
    const res = await POST(
      makeRequest({ ...validBody(), utmTracker: JSON.stringify({ utm_source: "google" }) })
    );
    expect(res.status).toBe(200);
    expect(trackerOnPayload()).toEqual({
      utm_source: "google",
      landing_variant: "white_prev",
      ...C13,
      ...EMAIL,
    });
  });

  it("stamps the arm even when the visitor carried no UTMs", async () => {
    mockCookieGet.mockReturnValue({ value: "white" });
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(200);
    expect(trackerOnPayload()).toEqual({ landing_variant: "white", ...C13, ...EMAIL });
  });

  it("does not record an arm the body claims without a cookie", async () => {
    // utm_tracker is assembled in the browser and posted verbatim, so a crafted
    // body could otherwise name whichever arm it liked and have it stored as fact.
    mockCookieGet.mockReturnValue(undefined);
    const res = await POST(
      makeRequest({
        ...validBody(),
        utmTracker: JSON.stringify({ utm_source: "google", landing_variant: "white" }),
      })
    );
    expect(res.status).toBe(200);
    expect(trackerOnPayload()).toEqual({ utm_source: "google", ...C13, ...EMAIL });
  });

  it("names no archetype in its reply: the EUR 1.99 gate sells it, and nothing reads it", async () => {
    const res = await POST(makeRequest(validBody()));
    const json = await res.json();
    expect(json).toMatchObject({ success: true, submissionId: 123 });
    expect(json).not.toHaveProperty("primaryArchetype");
    expect(json).not.toHaveProperty("v5PrimaryArchetype");
  });

  it("leaves no arm at all when there is no cookie and nothing claimed", async () => {
    // "No arm" is a real, expected state — crawlers, direct hits, consent
    // refusals — and inventing one would be worse than recording none.
    mockCookieGet.mockReturnValue(undefined);
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(200);
    expect(trackerOnPayload()).toBeNull();
  });
});

/**
 * The first page the browser opened, for the Slack journey's "First page" (a glossary term,
 * say). Attribution the session id cannot give back, so unlike the arms it may start a tracker.
 */
describe("POST /api/survey — the first page on the submission", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockVerifyCsrf.mockResolvedValue(true);
    mockCheckRateLimit.mockResolvedValue({
      allowed: true,
      remaining: 2,
      resetAt: new Date(Date.now() + 60_000),
    });
    mockCheckCooldown.mockResolvedValue({ allowed: true, retryAfterMs: 0 });
    mockGetClientIp.mockReturnValue("1.2.3.4");
    mockComputeSurveyScoring.mockReturnValue(null);
    mockEnsureSubmissionScored.mockResolvedValue({ primaryArchetype: "Spark Seeker" });
    mockEnsurePersonalReportForSubmission.mockResolvedValue({ id: 10 });
    mockSubmitSurveyOnce.mockResolvedValue({ submissionId: 123, isExisting: false });
    mockAfter.mockImplementation(() => undefined);
    mockCookieGet.mockReturnValue(undefined);
  });

  it("starts a tracker for a visitor who carried nothing else", async () => {
    const res = await POST(makeRequest({ ...validBody(), landingPath: "/glossary/sapiosexual" }));
    expect(res.status).toBe(200);
    expect(trackerOnPayload()).toEqual({ landing_path: "/glossary/sapiosexual" });
  });

  it("joins the campaign tags, and replaces a first page the tracker claims", async () => {
    const res = await POST(
      makeRequest({
        ...validBody(),
        utmTracker: JSON.stringify({ utm_source: "chatgpt.com", landing_path: "/claimed" }),
        landingPath: "/glossary/sapiosexual",
      })
    );
    expect(res.status).toBe(200);
    expect(trackerOnPayload()).toEqual({
      utm_source: "chatgpt.com",
      ...C13,
      ...EMAIL,
      landing_path: "/glossary/sapiosexual",
    });
  });

  it("keeps a report's token out of the database", async () => {
    await POST(makeRequest({ ...validBody(), landingPath: "/report/rpt_ABCDEFGHIJKLMNOPQRST" }));
    expect(trackerOnPayload()).toEqual({ landing_path: "/report/<redacted>" });
  });

  it.each(["https://evil.example/x", "/glossary?q=1", "glossary", "/a b"])(
    "drops %s rather than refusing the survey",
    async (landingPath) => {
      const res = await POST(makeRequest({ ...validBody(), landingPath }));
      expect(res.status).toBe(200);
      expect(trackerOnPayload()).toBeNull();
    }
  );
});
