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
  mockSupabaseFetch,
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
  mockSupabaseFetch: vi.fn(),
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

// The journey assembler reads through supabaseFetch. Mock it directly rather than
// configuring SUPABASE_* env vars: doing that globally also switches on other
// post-response work in this route, which broke the sibling tests with a 503.
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
    mockSupabaseFetch.mockReset();
  });

  /**
   * Route the journey assembler's Supabase reads so the notification exercises the
   * REAL enriched path, rather than degrading to the no-journey fallback.
   */
  function routeJourneyAndSlack(submissionRow: Record<string, unknown> | null) {
    mockFetchWithTimeout.mockResolvedValue({ ok: true, status: 200, text: async () => "ok" });
    mockSupabaseFetch.mockImplementation(async (path: string) => {
      if (String(path).includes("/survey_submission?")) {
        return { ok: true, status: 200, json: async () => (submissionRow ? [submissionRow] : []) };
      }
      if (String(path).includes("/report_price_quote?")) {
        return {
          ok: true,
          status: 200,
          json: async () => [
            {
              plan: "full_report",
              experiment_group: "B",
              base_price_bucket: "B",
              forced_paywall_arm: "treatment",
              device_type: "iOS",
              country_tier: "tier_2",
              current_price: 29,
              currency: "eur",
              purchased_at: null,
              checkout_started_at: null,
            },
          ],
        };
      }
      // analytics_event, and anything else the assembler asks for
      return { ok: true, status: 200, json: async () => [] };
    });
  }

  const SUBMISSION_ROW = {
    id: 123,
    session_id: "550e8400-e29b-41d4-a716-446655440000",
    start_date_time: "2026-08-24T10:00:00.000Z",
    created_date_time: "2026-08-24T10:12:00.000Z",
    status: "completed",
    duration_ms: 720_000,
    utm_tracker: JSON.stringify({
      utm_source: "google",
      landing_variant: "white_prev",
      survey_variant: "dark",
    }),
    app_user: { email: "ada@example.com", first_name: "Ada" },
  };

  it("sends an enriched Slack message with the journey and every A/B arm", async () => {
    mockSubmitSurveyOnce.mockResolvedValue({ submissionId: 123, isExisting: false });
    routeJourneyAndSlack(SUBMISSION_ROW);

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    expect(mockAfter).toHaveBeenCalledTimes(3);
    expect(mockEnsurePersonalReportForSubmission).toHaveBeenCalledWith({
      reportToken: null,
      submissionId: 123,
    });

    // scheduleAfterResponse calls after(run) without awaiting it, and the journey
    // reads now resolve before the send, so the POST returns first.
    const slackCall = await vi.waitFor(() => {
      const call = mockFetchWithTimeout.mock.calls.find((c) =>
        String(c[0]).startsWith("https://hooks.slack.test/")
      );
      expect(call).toBeDefined();
      return call!;
    });
    const payload = JSON.parse((slackCall[1] as { body: string }).body) as {
      text: string;
      username: string;
      blocks: Array<{ text?: { text?: string }; fields?: Array<{ text?: string }> }>;
    };
    expect(payload.username).toBe("survey_response");

    const flat = [
      payload.text,
      ...payload.blocks.flatMap((b) => [
        b.text?.text ?? "",
        ...(b.fields ?? []).map((f) => f.text ?? ""),
      ]),
    ].join("\n");

    // masked, in a code span so the mask's asterisks are not read as bold markers
    expect(flat).toContain("`a***@example.com`");
    expect(flat).not.toContain("ada@example.com");
    // all four arms, in plain English — never the raw codes
    expect(flat).toContain("Landing page B (previous design)");
    expect(flat).toContain("Dark survey");
    expect(flat).toContain("Pricing B");
    // The concluded paywall experiment is no longer listed as one they were in.
    expect(flat).not.toContain("Forced paywall");
    expect(flat).not.toContain("Paywall style");
    expect(flat).not.toContain("white_prev");

    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        submissionId: 123,
        sessionId: "550e8400-e29b-41d4-a716-446655440000",
        arms: { landing: "white_prev", survey: "dark", pricing: "B", paywall: "treatment" },
      }),
      "Sending Slack survey notification"
    );
  });

  it("still notifies with a plain fallback when the journey cannot be read", async () => {
    // A slow replica must not cost us the notification entirely.
    mockSubmitSurveyOnce.mockResolvedValue({ submissionId: 123, isExisting: false });
    routeJourneyAndSlack(null);

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    const slackCall = await vi.waitFor(() => {
      const call = mockFetchWithTimeout.mock.calls.find((c) =>
        String(c[0]).startsWith("https://hooks.slack.test/")
      );
      expect(call).toBeDefined();
      return call!;
    });
    const payload = JSON.parse((slackCall[1] as { body: string }).body) as { text: string };
    expect(payload.text).toContain("Survey completed #123");
    expect(payload.text).toContain("`a***@example.com`");
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
