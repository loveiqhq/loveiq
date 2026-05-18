import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockFetchWithTimeout = vi.fn();
vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: (...args: unknown[]) => mockFetchWithTimeout(...args),
}));

import {
  __resetSlackDedupForTests,
  escapeSlack,
  maskEmail,
  notifySlack,
} from "@shared/observability/slack";

describe("notifySlack", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    __resetSlackDedupForTests();
    delete process.env.SLACK_OPS_WEBHOOK_URL;
    delete process.env.SLACK_SURVEY_WEBHOOK_URL;
    delete process.env.SLACK_CONTACT_WEBHOOK_URL;
    delete process.env.SLACK_PAYMENTS_WEBHOOK_URL;
    mockFetchWithTimeout.mockResolvedValue({ ok: true, status: 200 });
  });

  it("short-circuits when the channel's env var is unset", async () => {
    await notifySlack({ channel: "ops", kind: "api_5xx", text: "hello" });
    expect(mockFetchWithTimeout).not.toHaveBeenCalled();
  });

  it("posts the message to the webhook when the env var is set", async () => {
    process.env.SLACK_OPS_WEBHOOK_URL = "https://hooks.slack.com/ops-test";
    await notifySlack({
      channel: "ops",
      kind: "api_5xx",
      text: "boom",
      username: "ops_alerts",
    });
    expect(mockFetchWithTimeout).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetchWithTimeout.mock.calls[0]!;
    expect(url).toBe("https://hooks.slack.com/ops-test");
    expect((options as { method: string }).method).toBe("POST");
    const body = JSON.parse((options as { body: string }).body);
    expect(body).toEqual({ text: "boom", username: "ops_alerts" });
  });

  it("routes by channel to the matching env var", async () => {
    process.env.SLACK_PAYMENTS_WEBHOOK_URL = "https://hooks.slack.com/payments-test";
    await notifySlack({ channel: "payments", kind: "purchase", text: "kaching" });
    expect(mockFetchWithTimeout).toHaveBeenCalledTimes(1);
    expect(mockFetchWithTimeout.mock.calls[0]![0]).toBe("https://hooks.slack.com/payments-test");
  });

  it("suppresses an identical second ping within the dedup window", async () => {
    process.env.SLACK_OPS_WEBHOOK_URL = "https://hooks.slack.com/ops-test";
    await notifySlack({ channel: "ops", kind: "api_5xx", text: "same error" });
    await notifySlack({ channel: "ops", kind: "api_5xx", text: "same error" });
    expect(mockFetchWithTimeout).toHaveBeenCalledTimes(1);
  });

  it("does NOT suppress when the kind differs", async () => {
    process.env.SLACK_OPS_WEBHOOK_URL = "https://hooks.slack.com/ops-test";
    await notifySlack({ channel: "ops", kind: "api_5xx", text: "shared body" });
    await notifySlack({ channel: "ops", kind: "cron_fail", text: "shared body" });
    expect(mockFetchWithTimeout).toHaveBeenCalledTimes(2);
  });

  it("does NOT suppress when the text differs in the first 100 chars", async () => {
    process.env.SLACK_OPS_WEBHOOK_URL = "https://hooks.slack.com/ops-test";
    await notifySlack({ channel: "ops", kind: "api_5xx", text: "error A" });
    await notifySlack({ channel: "ops", kind: "api_5xx", text: "error B" });
    expect(mockFetchWithTimeout).toHaveBeenCalledTimes(2);
  });

  it("swallows fetch errors instead of throwing", async () => {
    process.env.SLACK_OPS_WEBHOOK_URL = "https://hooks.slack.com/ops-test";
    mockFetchWithTimeout.mockRejectedValueOnce(new Error("network down"));
    await expect(
      notifySlack({ channel: "ops", kind: "api_5xx", text: "boom" })
    ).resolves.toBeUndefined();
  });

  it("logs (but does not throw) when Slack returns non-OK", async () => {
    process.env.SLACK_OPS_WEBHOOK_URL = "https://hooks.slack.com/ops-test";
    mockFetchWithTimeout.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => "internal",
    });
    await expect(
      notifySlack({ channel: "ops", kind: "api_5xx", text: "boom" })
    ).resolves.toBeUndefined();
  });
});

describe("maskEmail", () => {
  it("preserves first char + domain when local part has 2+ chars", () => {
    expect(maskEmail("hamza@loveiq.org")).toBe("h***@loveiq.org");
    expect(maskEmail("ab@x.io")).toBe("a***@x.io");
  });

  it("returns the input unchanged for single-char local parts (existing contract)", () => {
    // Matches the regex used by survey/contact/payment helpers — kept
    // intentional for consistency with prior Slack output.
    expect(maskEmail("a@b.com")).toBe("a@b.com");
  });
});

describe("escapeSlack", () => {
  it("escapes Slack mrkdwn formatting characters", () => {
    expect(escapeSlack("*bold*")).toBe("\\*bold\\*");
    expect(escapeSlack("a&b<c>")).toBe("a\\&b\\<c\\>");
    expect(escapeSlack("`code`")).toBe("\\`code\\`");
    expect(escapeSlack("_italic_~strike~")).toBe("\\_italic\\_\\~strike\\~");
  });

  it("leaves plain text untouched", () => {
    expect(escapeSlack("hello world 123")).toBe("hello world 123");
  });
});
