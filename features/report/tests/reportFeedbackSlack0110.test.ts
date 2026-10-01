import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@shared/http/csrf", () => ({ verifyCsrfToken: async () => true }));
vi.mock("@shared/http/ratelimit", () => ({
  checkRateLimit: async () => ({
    allowed: true,
    remaining: 59,
    resetAt: new Date(Date.now() + 60_000),
  }),
  getClientIp: () => "1.2.3.4",
}));
vi.mock("@features/report/server/personalReport", () => ({
  resolveSubmissionAccessContext: async () => ({ submissionId: 42, userId: 84, userEmail: null }),
}));
vi.mock("@shared/http/circuit-breaker", async () => {
  const actual = await vi.importActual<typeof import("@shared/http/circuit-breaker")>(
    "@shared/http/circuit-breaker"
  );
  return { ...actual, getBreaker: () => ({ fire: (fn: () => Promise<unknown>) => fn() }) };
});

const mockFetchWithTimeout = vi.fn();
vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: (...args: unknown[]) => mockFetchWithTimeout(...args),
}));
const mockNotifySlack = vi.fn();
vi.mock("@shared/observability/slack", () => ({
  notifySlack: (...args: unknown[]) => mockNotifySlack(...args),
}));

import { POST } from "@/app/api/report-feedback/route";
import { reportSections } from "@/data/report-general";
import { flushAfterResponse } from "@shared/http/after-response";

/**
 * Final review, 01.10: since the thumb stores the rating on its own (R2), every rating
 * posted, and Send posted again, so each one wrote to Slack: a thumbs-down then Send with
 * an issue gave two survey lines and two "needs attention" pings, and an empty Send
 * repeated the rating's line word for word. One reader action is one line now: the
 * rating's goes to the survey channel; ops hears about a section once the reader says
 * what is wrong (an issue or a comment); an empty Send adds nothing to report.
 */
const WEBHOOK = "https://hooks.slack.test/report-feedback";
const SECTION = reportSections[0]!.id;
const TOKEN = "rpt_abcdefghijklmnopqrst";

const post = (body: Record<string, unknown>) =>
  POST(
    new Request("http://localhost:3000/api/report-feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": "t" },
      body: JSON.stringify({ token: TOKEN, sectionId: SECTION, ...body }),
    })
  );
const surveyLines = () =>
  mockFetchWithTimeout.mock.calls.filter(([url]) => url === WEBHOOK).map(([, init]) => init);

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SUPABASE_URL = "https://test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
  process.env.SLACK_SURVEY_WEBHOOK_URL = WEBHOOK;
  mockFetchWithTimeout.mockResolvedValue({
    ok: true,
    status: 201,
    json: async () => [],
    text: async () => "",
  });
  mockNotifySlack.mockResolvedValue(undefined);
});

describe("POST /api/report-feedback — Slack, once per reader action (final review 01.10)", () => {
  it("logs a thumb's rating in the survey channel, and leaves ops alone", async () => {
    expect((await post({ feedback: "down", step: "rating" })).status).toBe(200);
    await flushAfterResponse();
    expect(surveyLines()).toHaveLength(1);
    expect(mockNotifySlack).not.toHaveBeenCalled();
  });

  it("reports nothing for a Send that adds no issue and no comment", async () => {
    expect((await post({ feedback: "down", step: "message" })).status).toBe(200);
    await flushAfterResponse();
    expect(surveyLines()).toHaveLength(0);
    expect(mockNotifySlack).not.toHaveBeenCalled();
  });

  it("pings ops once when the reader says what is wrong", async () => {
    await post({ feedback: "down", step: "message", issue: "unclear", comment: "Lost me" });
    await flushAfterResponse();
    expect(surveyLines()).toHaveLength(1);
    expect(mockNotifySlack).toHaveBeenCalledTimes(1);
    expect(mockNotifySlack.mock.calls[0]![0]).toMatchObject({ channel: "ops" });
  });

  it("keeps an older client's single post as it was: one line, and ops for a thumbs-down", async () => {
    await post({ feedback: "down" });
    await flushAfterResponse();
    expect(surveyLines()).toHaveLength(1);
    expect(mockNotifySlack).toHaveBeenCalledTimes(1);
  });
});
