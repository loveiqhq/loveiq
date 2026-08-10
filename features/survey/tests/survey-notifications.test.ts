import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockAfter,
  mockLogger,
  mockVerifyCsrf,
  mockCheckRateLimit,
  mockCheckCooldown,
  mockGetClientIp,
  mockFetchWithTimeout,
  mockComputeSurveyScoring,
  mockEnsureSubmissionScored,
  mockEnsurePersonalReportForSubmission,
  mockSubmitSurveyOnce,
} = vi.hoisted(() => ({
  mockAfter: vi.fn(),
  mockLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  mockVerifyCsrf: vi.fn<() => Promise<boolean>>(),
  mockCheckRateLimit: vi.fn(),
  mockCheckCooldown: vi.fn(),
  mockGetClientIp: vi.fn(),
  mockFetchWithTimeout: vi.fn(),
  mockComputeSurveyScoring: vi.fn(),
  mockEnsureSubmissionScored: vi.fn(),
  mockEnsurePersonalReportForSubmission: vi.fn(),
  mockSubmitSurveyOnce: vi.fn(),
}));

vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return {
    ...actual,
    after: (...args: unknown[]) => mockAfter(...args),
  };
});

vi.mock("@shared/observability/logger", () => ({
  default: mockLogger,
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

function validBody() {
  return {
    email: "alice@example.com",
    firstName: "Alice",
    answers: { q1: "yes", q2: 3 },
    startedAt: new Date().toISOString(),
    durationMs: 120000,
    sessionId: "550e8400-e29b-41d4-a716-446655440000",
  };
}

function makeRequest(body: unknown = validBody()) {
  return new Request("http://localhost:3000/api/survey", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/survey notifications", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.SLACK_SURVEY_WEBHOOK_URL = "https://hooks.slack.test/services/survey";
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
    mockAfter.mockImplementation(async (fn: () => Promise<void>) => {
      await fn();
    });
  });

  it("sends Slack for a fresh completed submission", async () => {
    mockSubmitSurveyOnce.mockResolvedValue({ submissionId: 123, isExisting: false });
    mockFetchWithTimeout.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => "ok",
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    expect(mockAfter).toHaveBeenCalledTimes(3);
    expect(mockEnsurePersonalReportForSubmission).toHaveBeenCalledWith({
      reportToken: null,
      submissionId: 123,
    });
    expect(mockFetchWithTimeout).toHaveBeenCalledWith(
      "https://hooks.slack.test/services/survey",
      expect.objectContaining({
        method: "POST",
      })
    );
    expect(mockLogger.info).toHaveBeenCalledWith(
      {
        submissionId: 123,
        sessionId: "550e8400-e29b-41d4-a716-446655440000",
        maskedEmail: "a***@example.com",
      },
      "Sending Slack survey notification"
    );
  });

  it("skips Slack for an existing submission and logs the skip", async () => {
    mockSubmitSurveyOnce.mockResolvedValue({ submissionId: 456, isExisting: true });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    expect(mockAfter).toHaveBeenCalledTimes(3);
    expect(mockEnsurePersonalReportForSubmission).toHaveBeenCalledWith({
      reportToken: null,
      submissionId: 456,
    });
    expect(mockFetchWithTimeout).not.toHaveBeenCalled();
    expect(mockLogger.info).toHaveBeenCalledWith(
      {
        submissionId: 456,
        sessionId: "550e8400-e29b-41d4-a716-446655440000",
        isExisting: true,
      },
      "Skipping survey Slack notification for existing submission"
    );
  });
});
