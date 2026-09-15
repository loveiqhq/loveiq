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
    delete process.env.SLACK_BRAIN_WEBHOOK_URL;
    mockFetchWithTimeout.mockResolvedValue({ ok: true, status: 200 });
  });

  /**
   * The company brain got its own channel on 2026-09-14 because it posted more to the
   * shared ops channel than everything else combined. The whole change turns on the
   * fallback: with `SLACK_BRAIN_WEBHOOK_URL` unset — which is its state in production
   * until somebody creates the channel — every brain alert would otherwise go SILENT,
   * and nobody notices a message that was never sent.
   */
  describe("a channel with a fallback", () => {
    it("uses its own webhook when one is configured", async () => {
      process.env.SLACK_BRAIN_WEBHOOK_URL = "https://hooks.slack.com/brain-test";
      process.env.SLACK_OPS_WEBHOOK_URL = "https://hooks.slack.com/ops-test";
      await notifySlack({ channel: "brain", kind: "brain_ingest_failed", text: "drive" });
      expect(mockFetchWithTimeout.mock.calls[0]![0]).toBe("https://hooks.slack.com/brain-test");
    });

    it("falls back to ops when its own webhook is unset, rather than going quiet", async () => {
      process.env.SLACK_OPS_WEBHOOK_URL = "https://hooks.slack.com/ops-test";
      await notifySlack({ channel: "brain", kind: "brain_ingest_failed", text: "drive" });
      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(1);
      expect(mockFetchWithTimeout.mock.calls[0]![0]).toBe("https://hooks.slack.com/ops-test");
    });

    it("stays silent only when BOTH are unset", async () => {
      await notifySlack({ channel: "brain", kind: "brain_ingest_failed", text: "drive" });
      expect(mockFetchWithTimeout).not.toHaveBeenCalled();
    });

    /** The fallback is one-way. Ops must never be rerouted into the brain's channel. */
    it("does not route ops into the brain channel", async () => {
      process.env.SLACK_BRAIN_WEBHOOK_URL = "https://hooks.slack.com/brain-test";
      await notifySlack({ channel: "ops", kind: "api_5xx", text: "boom" });
      expect(mockFetchWithTimeout).not.toHaveBeenCalled();
    });
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

  /**
   * A single-character local part must still be masked.
   *
   * `^(.).+(@.+)$` needs TWO characters before the `@`, so `a@b.com` never
   * matched and `.replace` returned the address verbatim — the helper silently
   * handed back exactly what it exists to withhold. This was previously asserted
   * as an "existing contract … kept intentional for consistency with prior Slack
   * output", which documented the hole rather than closing it: consistency is not
   * a reason to publish someone's address.
   *
   * Live when it was found: 3 of 1,961 `app_user` rows have a one-character local
   * part, and the compact survey ping puts the masked address in a channel.
   */
  it("masks a single-character local part instead of returning it verbatim", () => {
    expect(maskEmail("a@b.com")).toBe("a***@b.com");
    expect(maskEmail("e@loveiq.org")).toBe("e***@loveiq.org");
    // and the shapes that have no local part at all are still not echoed whole
    expect(maskEmail("@b.com")).toBe("***");
  });
});

/**
 * Every masker in the repo, held to the same rule.
 *
 * The rule was copy-pasted into five places and four of them shared the same
 * hole. A behavioural check on the exported ones plus a source scan for the
 * broken pattern is what stops a sixth copy — the scan is the half that reaches
 * the module-private ones in the route handlers, which no test can import.
 */
describe("masking parity across every implementation", () => {
  it("every exported masker hides a single-character local part", async () => {
    const { maskEmail: adminMask } = await import("@features/admin/server/format");
    const { maskEmail: shareMask } = await import("@features/report/server/shareVerify");
    for (const fn of [maskEmail, adminMask, shareMask]) {
      expect(fn("a@b.com")).toBe("a***@b.com");
      expect(fn("ab@b.com")).toBe("a***@b.com");
      expect(fn("hamza@loveiq.org")).toBe("h***@loveiq.org");
      // never echo something that is not an address
      expect(fn("notanemail")).toBe("***");
      expect(fn("@b.com")).toBe("***");
    }
  });

  it("no source file reintroduces the two-character-minimum pattern", async () => {
    const { execFileSync } = await import("node:child_process");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    // tests -> observability -> shared -> repo root. Three levels, verified by
    // watching a sixth copy in features/ turn this red.
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
    // The CALL shape, not the bare pattern — the comments explaining this defect
    // quote the pattern deliberately, and a guard that trips on its own
    // documentation is one somebody deletes.
    // --untracked, because git grep otherwise sees only committed files and a
    // copy written a minute ago is exactly what this is meant to stop. Verified
    // by writing a sixth copy and watching this go red.
    // Assembled, so this guard cannot match its own needle — the failure mode
    // that makes a source scan look broken the moment it is written.
    const NEEDLE = "replace(/^(.)" + ".+(@.+)$/";
    let hits = "";
    try {
      hits = execFileSync(
        "git",
        ["grep", "--untracked", "-n", "-F", NEEDLE, "--", "*.ts", "*.tsx", ":!*test*"],
        { cwd: root, encoding: "utf8" }
      );
    } catch {
      hits = ""; // git grep exits 1 when there are no matches
    }
    expect(hits.trim()).toBe("");
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
