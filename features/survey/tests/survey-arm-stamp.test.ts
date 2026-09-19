import { beforeEach, describe, expect, it, vi } from "vitest";

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

/** The utm_tracker as it reached submitSurveyOnce, parsed. */
function trackerOnPayload(): Record<string, unknown> | null {
  const payload = mockSubmitSurveyOnce.mock.calls[0]?.[0] as
    | { utmTracker?: string | null }
    | undefined;
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
    });
  });

  it("stamps the arm even when the visitor carried no UTMs", async () => {
    mockCookieGet.mockReturnValue({ value: "white" });
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(200);
    expect(trackerOnPayload()).toEqual({ landing_variant: "white" });
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
    expect(trackerOnPayload()).toEqual({ utm_source: "google" });
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
