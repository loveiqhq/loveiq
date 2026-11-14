import { beforeEach, describe, expect, it, vi } from "vitest";
import { assignGateRevealArm } from "@shared/experiments/gateRevealArm";

/**
 * Mark's 50/50 of his new EUR 1.99 page (shared/experiments/gateRevealArm.ts), at the survey's
 * end, through the route: the reader's half is stamped on the submission while the test runs,
 * and a reader the gate will stop in the new page's half is told so, for the wizard's map.
 * Its own file, as survey-arm-stamp.test.ts explains (the Slack dedup across tests).
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
  mockIsFeatureEnabled,
  mockJoinGate,
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
  mockIsFeatureEnabled: vi.fn<(key: string, fallback?: boolean) => Promise<boolean>>(),
  mockJoinGate: vi.fn<() => Promise<boolean>>(),
}));

vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return { ...actual, after: (...args: unknown[]) => mockAfter(...args) };
});
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: mockCookieGet }) }));
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
  fetchSubmissionBySessionId: () => Promise.resolve(null),
}));
vi.mock("@features/report/server/personalReport", () => ({
  ensurePersonalReportForSubmission: (...args: unknown[]) =>
    mockEnsurePersonalReportForSubmission(...args),
}));
vi.mock("@shared/flags/system-flags", () => ({
  isFeatureEnabled: (key: string, fallback?: boolean) => mockIsFeatureEnabled(key, fallback),
}));
vi.mock("@features/report/server/initialGateState", () => ({
  joinInitialGateCohort: () => mockJoinGate(),
  isInInitialGateCohort: () => mockJoinGate(),
}));

import { POST } from "@/app/api/survey/route";

/** A survey session id in the given half of Mark's 50/50. */
const sessionIn = (arm: "control" | "reveal") => {
  for (let i = 0; ; i += 1) {
    const id = `550e8400-e29b-41d4-a716-${String(i).padStart(12, "0")}`;
    if (assignGateRevealArm(id) === arm) return id;
  }
};

const submit = (sessionId: string, extra: Record<string, unknown> = {}) =>
  POST(
    new Request("https://www.loveiq.org/api/survey", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "alice@example.com",
        firstName: "Alice",
        answers: { q1: "yes", q2: 3 },
        startedAt: new Date().toISOString(),
        durationMs: 120_000,
        sessionId,
        utmTracker: JSON.stringify({ utm_source: "google" }),
        ...extra,
      }),
    })
  );

/** The utm_tracker as it reached submitSurveyOnce, parsed. */
function trackerOnPayload(): Record<string, unknown> | null {
  const payload = mockSubmitSurveyOnce.mock.calls[0]?.[0] as
    { utmTracker?: string | null } | undefined;
  const raw = payload?.utmTracker;
  return typeof raw === "string" ? (JSON.parse(raw) as Record<string, unknown>) : null;
}

let revealOn = true;

beforeEach(() => {
  vi.resetAllMocks();
  revealOn = true;
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
  mockAfter.mockImplementation(() => undefined);
  mockCookieGet.mockReturnValue(undefined);
  mockJoinGate.mockResolvedValue(true);
  // Every other switch as production has it (`survey_submissions` is asked with no fallback).
  mockIsFeatureEnabled.mockImplementation(async (key: string, fallback?: boolean) =>
    key === "report_gate_archetype_reveal" ? revealOn : (fallback ?? true)
  );
});

describe("POST /api/survey — Mark's 50/50 of the new EUR 1.99 page", () => {
  it("stamps the new page's half on the submission, and tells the wizard", async () => {
    const res = await submit(sessionIn("reveal"));
    expect(res.status).toBe(200);
    expect(trackerOnPayload()).toMatchObject({ utm_source: "google", gate_reveal_arm: "reveal" });
    expect(await res.json()).toMatchObject({ initialGatePriceCents: 199, initialGateReveal: true });
  });

  it("stamps today's half too, and tells the wizard nothing new", async () => {
    const res = await submit(sessionIn("control"));
    expect(trackerOnPayload()).toMatchObject({ gate_reveal_arm: "control" });
    expect(await res.json()).not.toHaveProperty("initialGateReveal");
  });

  it("stamps nothing while the switch is off", async () => {
    revealOn = false;
    const res = await submit(sessionIn("reveal"));
    expect(trackerOnPayload()).not.toHaveProperty("gate_reveal_arm");
    expect(await res.json()).not.toHaveProperty("initialGateReveal");
  });

  it("tells no one the gate will not stop", async () => {
    mockJoinGate.mockResolvedValue(false);
    const res = await submit(sessionIn("reveal"));
    expect(await res.json()).not.toHaveProperty("initialGateReveal");
  });

  it("never takes an arm the browser claims", async () => {
    await submit(sessionIn("control"), {
      utmTracker: JSON.stringify({ utm_source: "google", gate_reveal_arm: "reveal" }),
    });
    expect(trackerOnPayload()).toMatchObject({ gate_reveal_arm: "control" });
  });
});
