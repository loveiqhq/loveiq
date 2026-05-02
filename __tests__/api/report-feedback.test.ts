import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockVerifyCsrf = vi.fn<() => Promise<boolean>>();
vi.mock("../../lib/csrf", () => ({
  verifyCsrfToken: (...args: unknown[]) => mockVerifyCsrf(...(args as [])),
}));

const mockCheckRateLimit = vi.fn();
const mockGetClientIp = vi.fn();
vi.mock("../../lib/ratelimit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  getClientIp: (...args: unknown[]) => mockGetClientIp(...args),
}));

const mockResolveContext = vi.fn();
vi.mock("../../lib/report/personalReport", () => ({
  resolveSubmissionAccessContext: (...args: unknown[]) => mockResolveContext(...args),
}));

const mockBreakerFire = vi.fn();
vi.mock("../../lib/circuit-breaker", async () => {
  const actual = await vi.importActual<typeof import("../../lib/circuit-breaker")>(
    "../../lib/circuit-breaker"
  );
  return {
    ...actual,
    getBreaker: () => ({ fire: (fn: () => Promise<unknown>) => mockBreakerFire(fn) }),
  };
});

const mockFetchWithTimeout = vi.fn();
vi.mock("../../lib/fetch-with-timeout", () => ({
  fetchWithTimeout: (...args: unknown[]) => mockFetchWithTimeout(...args),
}));

import { POST } from "../../app/api/report-feedback/route";
import { reportSections } from "../../data/report-general";

const VALID_SECTION = reportSections[0]!.id;
const VALID_TOKEN = "rpt_abcdefghijklmnopqrst";
const VALID_SESSION = "11111111-1111-4111-8111-111111111111";

function postRequest(body: Record<string, unknown>) {
  return new Request("http://localhost:3000/api/report-feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-csrf-token": "t" },
    body: JSON.stringify(body),
  });
}

function allowCsrf() {
  mockVerifyCsrf.mockResolvedValue(true);
}
function allowRateLimit() {
  mockCheckRateLimit.mockResolvedValue({
    allowed: true,
    remaining: 59,
    resetAt: new Date(Date.now() + 60_000),
  });
}

describe("POST /api/report-feedback", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGetClientIp.mockReturnValue("1.2.3.4");
    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
    mockBreakerFire.mockImplementation((fn) => fn());
    mockFetchWithTimeout.mockResolvedValue({ ok: true, status: 201 });
  });

  it("403 on CSRF failure", async () => {
    mockVerifyCsrf.mockResolvedValue(false);
    const res = await POST(
      postRequest({ sessionId: VALID_SESSION, sectionId: VALID_SECTION, feedback: "up" })
    );
    expect(res.status).toBe(403);
  });

  it("429 when rate-limit blocks", async () => {
    allowCsrf();
    mockCheckRateLimit.mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: new Date(Date.now() + 30_000),
    });
    const res = await POST(
      postRequest({ sessionId: VALID_SESSION, sectionId: VALID_SECTION, feedback: "up" })
    );
    expect(res.status).toBe(429);
  });

  it("400 when neither sessionId nor token is provided", async () => {
    allowCsrf();
    allowRateLimit();
    const res = await POST(postRequest({ sectionId: VALID_SECTION, feedback: "up" }));
    expect(res.status).toBe(400);
  });

  it("400 on unknown section id", async () => {
    allowCsrf();
    allowRateLimit();
    const res = await POST(
      postRequest({
        sessionId: VALID_SESSION,
        sectionId: "definitely_not_a_section",
        feedback: "up",
      })
    );
    expect(res.status).toBe(400);
  });

  it("400 when neither sessionId nor token resolves to a submission", async () => {
    allowCsrf();
    allowRateLimit();
    mockResolveContext.mockResolvedValue(null);
    const res = await POST(
      postRequest({ sessionId: VALID_SESSION, sectionId: VALID_SECTION, feedback: "up" })
    );
    expect(res.status).toBe(400);
    expect(mockFetchWithTimeout).not.toHaveBeenCalled();
  });

  it("persists feedback with submission_id + user_id when token resolves", async () => {
    allowCsrf();
    allowRateLimit();
    mockResolveContext.mockResolvedValue({ submissionId: 42, userId: 84, userEmail: null });

    const res = await POST(
      postRequest({ token: VALID_TOKEN, sectionId: VALID_SECTION, feedback: "up" })
    );

    expect(res.status).toBe(200);
    expect(mockResolveContext).toHaveBeenCalledWith({
      reportSessionId: null,
      reportToken: VALID_TOKEN,
    });
    const [calledUrl, calledOptions] = mockFetchWithTimeout.mock.calls[0]!;
    expect(calledUrl).toContain("on_conflict=survey_submission_id,section_id");
    const body = JSON.parse((calledOptions as { body: string }).body);
    expect(body).toMatchObject({
      survey_submission_id: 42,
      user_id: 84,
      section_id: VALID_SECTION,
      feedback: "up",
      session_id: null,
    });
  });

  it("falls back to sessionId when token is absent", async () => {
    allowCsrf();
    allowRateLimit();
    mockResolveContext.mockResolvedValue({ submissionId: 7, userId: 3, userEmail: null });

    const res = await POST(
      postRequest({ sessionId: VALID_SESSION, sectionId: VALID_SECTION, feedback: "down" })
    );

    expect(res.status).toBe(200);
    expect(mockResolveContext).toHaveBeenCalledWith({
      reportSessionId: VALID_SESSION,
      reportToken: null,
    });
    const body = JSON.parse(
      (mockFetchWithTimeout.mock.calls[0]![1] as { body: string }).body
    ) as Record<string, unknown>;
    expect(body.survey_submission_id).toBe(7);
    expect(body.user_id).toBe(3);
    expect(body.session_id).toBe(VALID_SESSION);
    expect(body.feedback).toBe("down");
  });

  it("500 when supabase upsert fails", async () => {
    allowCsrf();
    allowRateLimit();
    mockResolveContext.mockResolvedValue({ submissionId: 1, userId: 1, userEmail: null });
    mockFetchWithTimeout.mockResolvedValue({ ok: false, status: 500 });

    const res = await POST(
      postRequest({ sessionId: VALID_SESSION, sectionId: VALID_SECTION, feedback: "up" })
    );
    expect(res.status).toBe(500);
  });
});
