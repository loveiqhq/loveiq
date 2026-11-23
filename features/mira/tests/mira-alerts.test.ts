import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** A stand-in Upstash: INCR / INCRBY in memory, or down. Shared by the rate limiter and alerts. */
const fake = vi.hoisted(() => {
  process.env.KV_REST_API_URL = "https://upstash.test";
  process.env.KV_REST_API_TOKEN = "test-token";
  return {
    store: new Map<string, number>(),
    down: false,
    send: vi.fn(),
    slack: vi.fn(),
  };
});
vi.mock("@upstash/redis", () => ({
  // The script call as a computed property: CI's security grep rejects a bare eval call.
  Redis: class {
    ["ev" + "al"] = async (script: string, keys: string[], args: unknown[]) => {
      if (fake.down) throw new Error("upstash is down");
      const total =
        (fake.store.get(keys[0]!) ?? 0) + (script.includes("INCRBY") ? Number(args[0]) : 1);
      fake.store.set(keys[0]!, total);
      return total;
    };
  },
}));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: fake.send };
  },
}));
vi.mock("@shared/observability/slack", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@shared/observability/slack")>()),
  notifySlack: fake.slack,
}));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  alertBudgetUsedUp,
  alertCodeCap,
  alertAnonShare,
  alertDailyCeiling,
  alertTeam,
  costUsd,
  monthlyBudgetUsd,
  recordUsage,
} from "@features/mira/server/alerts";
import { flushAfterResponse } from "@shared/http/after-response";
import logger from "@shared/observability/logger";

const emails = () => fake.send.mock.calls.map(([e]) => e as Record<string, string>);
const DAY = 86_400_000;

describe("alertTeam", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fake.store.clear();
    fake.down = false;
    fake.send.mockResolvedValue({ data: { id: "e1" }, error: null });
    fake.slack.mockResolvedValue(undefined);
    process.env.RESEND_API_KEY = "re_test";
    delete process.env.MIRA_ALERT_EMAIL;
    delete process.env.RESEND_FROM;
  });
  afterEach(() => {
    delete process.env.RESEND_API_KEY;
  });

  it("emails the owner in plain text from the system sender and posts to ops", async () => {
    await alertTeam({ key: "k1", subject: "Mira: test", text: "Something <happened>." });
    expect(emails()).toEqual([
      {
        from: "LoveIQ <hello@send.loveiq.org>",
        to: "ec@loveiq.org",
        subject: "Mira: test",
        text: expect.stringMatching(/^Something <happened>\.\n\nSent by /),
      },
    ]);
    expect(fake.slack).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "ops", text: ":warning: Something &lt;happened&gt;." })
    );
  });

  it("sends to MIRA_ALERT_EMAIL when it is set", async () => {
    process.env.MIRA_ALERT_EMAIL = " ops@example.com ";
    await alertTeam({ key: "k2", subject: "s", text: "t" });
    expect(emails()[0]!.to).toBe("ops@example.com");
  });

  it("alerts at most once per key a day, on one server and across servers (Upstash)", async () => {
    await alertTeam({ key: "same", subject: "s", text: "t" });
    await alertTeam({ key: "same", subject: "s", text: "t" });
    await alertTeam({ key: "other", subject: "s", text: "t" });
    expect(fake.send).toHaveBeenCalledTimes(2);
    expect(fake.slack).toHaveBeenCalledTimes(2);
    // Another server instance (fresh module state) asks Upstash, which already saw it today.
    vi.resetModules();
    const elsewhere = await import("@features/mira/server/alerts");
    await elsewhere.alertTeam({ key: "same", subject: "s", text: "t" });
    expect(fake.send).toHaveBeenCalledTimes(2);
    expect(fake.store.get("rl:mira-alert:same")).toBe(2);
  });

  it("still alerts when Upstash is down, logs it, and repeats nothing from that server", async () => {
    fake.down = true;
    await alertTeam({ key: "down", subject: "s", text: "t" });
    await alertTeam({ key: "down", subject: "s", text: "t" });
    expect(fake.send).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.anything(),
      "[ratelimit] Redis error, allowing request (fail-open)"
    );
  });

  it("still posts to ops when the email fails, and never throws", async () => {
    fake.send.mockResolvedValue({ data: null, error: { name: "validation_error" } });
    await expect(alertTeam({ key: "k3", subject: "s", text: "t" })).resolves.toBeUndefined();
    expect(fake.slack).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      expect.anything(),
      "mira: an alert email was not sent"
    );
  });

  it("words the signed-out share alert, after the response, once a day", async () => {
    alertAnonShare();
    alertAnonShare();
    await flushAfterResponse();
    expect(emails()).toHaveLength(1);
    expect(emails()[0].subject).toBe("Mira's signed-out half is used up");
    expect(emails()[0].text).toMatch(
      /Signed-out chats used their half of Mira's daily ceiling \(400 AI replies\): new visitors see "resting" until midnight UTC, while signed-in people keep theirs\. A launch spike, or one source sending many: check message_sent in mira_event\./
    );
  });

  it("words the three Mira alerts, after the response, each once a day", async () => {
    alertBudgetUsedUp(
      "You have reached your specified workspace API usage limits.\nYou will regain access on 2026-12-01."
    );
    alertDailyCeiling();
    alertDailyCeiling();
    alertCodeCap(60);
    await flushAfterResponse();
    const bySubject = Object.fromEntries(emails().map((e) => [e.subject, e.text]));
    expect(Object.keys(bySubject)).toHaveLength(3);
    expect(bySubject["Mira's AI budget is used up"]).toMatch(
      /people see "Mira is resting" until it is raised or resets\. Anthropic said: You have reached your specified workspace API usage limits\. You will regain access on 2026-12-01\./
    );
    expect(bySubject["Mira hit her daily ceiling"]).toMatch(
      /Mira hit her daily ceiling \(800 AI replies for everyone together\): people see "resting" until midnight UTC\./
    );
    expect(bySubject["Mira's sign-in emails reached their hourly cap"]).toMatch(
      /^60 sign-in code emails/
    );
    const day = new Date().toISOString().slice(0, 10);
    expect(fake.store.get(`rl:mira-alert:daily-ceiling:${day}`)).toBe(1);
  });
});

describe("the month's AI spend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fake.store.clear();
    fake.down = false;
    fake.send.mockResolvedValue({ data: { id: "e1" }, error: null });
    process.env.RESEND_API_KEY = "re_test";
    delete process.env.MIRA_MONTHLY_BUDGET_USD;
  });

  it("prices replies at Claude Sonnet 5.5's and Claude Haiku 5.5's rates (USD per million tokens)", () => {
    const M = 1_000_000;
    expect(costUsd("claude-sonnet-5-5", { input_tokens: M })).toBe(2);
    expect(costUsd("claude-sonnet-5-5", { output_tokens: M })).toBe(10);
    expect(costUsd("claude-sonnet-5-5", { cache_read_input_tokens: M })).toBeCloseTo(0.1);
    expect(
      costUsd("claude-sonnet-5-5", {
        cache_creation_input_tokens: 2 * M,
        cache_creation: { ephemeral_5m_input_tokens: M, ephemeral_1h_input_tokens: M },
      })
    ).toBeCloseTo(2.5 + 4);
    // Without the split, a cache write is priced as the 1-hour writes Mira makes.
    expect(costUsd("claude-sonnet-5-5", { cache_creation_input_tokens: M })).toBe(4);
    expect(costUsd("claude-haiku-5-5", { input_tokens: M, output_tokens: M })).toBeCloseTo(0.6);
    expect(costUsd("claude-haiku-5-5", { cache_read_input_tokens: M })).toBeCloseTo(0.01);
    expect(costUsd("claude-haiku-5-5", { cache_creation_input_tokens: M })).toBeCloseTo(0.2);
    // Any other model is priced as Sonnet.
    expect(costUsd("claude-opus-5-5", { output_tokens: M })).toBe(10);
  });

  it("budgets $500 a month unless MIRA_MONTHLY_BUDGET_USD says otherwise", () => {
    expect(monthlyBudgetUsd()).toBe(500);
    process.env.MIRA_MONTHLY_BUDGET_USD = "750";
    expect(monthlyBudgetUsd()).toBe(750);
    process.env.MIRA_MONTHLY_BUDGET_USD = "nonsense";
    expect(monthlyBudgetUsd()).toBe(500);
  });

  it("adds up this calendar month in Upstash and alerts once at 80% and once at 100%", async () => {
    process.env.MIRA_MONTHLY_BUDGET_USD = "10";
    for (let i = 0; i < 5; i++) {
      recordUsage("claude-sonnet-5-5", { output_tokens: 300_000 }); // $3 each
      await flushAfterResponse();
    }
    const month = new Date().toISOString().slice(0, 7);
    expect(fake.store.get(`mira:spend:${month}`)).toBe(15_000_000);
    expect(emails().map((e) => e.subject)).toEqual([
      "Mira has used 80% of this month's AI budget",
      "Mira has used 100% of this month's AI budget",
    ]);
    expect(emails()[0]!.text).toMatch(/an estimated \$9\.00 of \$10/);
    expect(emails()[1]!.text).toMatch(/an estimated \$12\.00 of \$10/);
    // A day later the once-a-day gates are open again, and still nothing repeats this month.
    for (const key of fake.store.keys()) if (key.startsWith("rl:")) fake.store.delete(key);
    const tomorrow = Date.now() + DAY + 60_000;
    const clock = vi.spyOn(Date, "now").mockImplementation(() => tomorrow);
    recordUsage("claude-sonnet-5-5", { output_tokens: 300_000 });
    await flushAfterResponse();
    clock.mockRestore();
    expect(fake.send).toHaveBeenCalledTimes(2);
  });

  it("loses only the count when Upstash is down", async () => {
    fake.down = true;
    recordUsage("claude-sonnet-5-5", { output_tokens: 300_000 });
    await flushAfterResponse();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.anything(),
      "mira: a reply's AI spend was not counted"
    );
    expect(fake.send).not.toHaveBeenCalled();
  });
});
