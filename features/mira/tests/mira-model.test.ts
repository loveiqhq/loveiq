import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/http/fetch-with-timeout", () => ({ fetchWithTimeout: vi.fn() }));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@features/mira/server/alerts", () => ({
  alertBudgetUsedUp: vi.fn(),
  recordUsage: vi.fn(),
}));

import { alertBudgetUsedUp, recordUsage } from "@features/mira/server/alerts";
import { askModel } from "@features/mira/server/model";
import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";

const reply = (text: string) =>
  new Response(JSON.stringify({ content: [{ type: "text", text }], stop_reason: "end_turn" }), {
    status: 200,
  });
const sent = (i: number) => {
  const [, init] = vi.mocked(fetchWithTimeout).mock.calls[i]!;
  return {
    body: JSON.parse(String(init!.body)) as Record<string, unknown>,
    headers: init!.headers as Record<string, string>,
    timeoutMs: init!.timeoutMs,
  };
};
const ask = () => askModel("rules", "person", [{ role: "user", content: "hi" }]);

describe("askModel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchWithTimeout).mockReset(); // no queued reply leaks from a failed test
    process.env.MIRA_LLM_KEY = "test-key";
    delete process.env.MIRA_LLM_MODEL;
    delete process.env.MIRA_LLM_FALLBACK_MODEL;
  });
  afterEach(() => {
    delete process.env.MIRA_LLM_KEY;
    delete process.env.MIRA_LLM_MODEL;
  });

  it("asks Sonnet, without the server-side fallback Sonnet and Haiku don't take", async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(reply("Hello."));
    expect(await ask()).toEqual({ ok: true, text: "Hello.", refused: false });
    const { body, headers } = sent(0);
    expect(body.model).toBe("claude-sonnet-5-5");
    expect(body.fallbacks).toBeUndefined();
    expect(headers["anthropic-beta"]).toBeUndefined();
  });

  it("caches the stable instructions for an hour, the personal part not at all", async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(reply("Hello."));
    await ask();
    expect(sent(0).body.system).toEqual([
      { type: "text", text: "rules", cache_control: { type: "ephemeral", ttl: "1h" } },
      { type: "text", text: "person" },
    ]);
  });

  it("gives Sonnet 30 s and Haiku what is left of 50 s, so both fit the chat route", async () => {
    let now = 1_000_000;
    const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
    vi.mocked(fetchWithTimeout)
      .mockImplementationOnce(async () => {
        now += 30_000;
        throw new Error("Request timeout after 30000ms");
      })
      .mockResolvedValueOnce(reply("Hi."));
    const result = await ask();
    clock.mockRestore();
    expect(result).toEqual({ ok: true, text: "Hi.", refused: false });
    expect(sent(0).timeoutMs).toBe(30_000);
    expect(sent(1).body.model).toBe("claude-haiku-5-5");
    expect(sent(1).timeoutMs).toBe(20_000);
  });

  it("keeps the server-side refusal fallback on an Opus model", async () => {
    process.env.MIRA_LLM_MODEL = "claude-opus-5-5";
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(reply("Hello."));
    await ask();
    const { body, headers } = sent(0);
    expect(body.fallbacks).toBe("default");
    expect(headers["anthropic-beta"]).toBe("server-side-fallback-2026-07-01");
  });

  it("answers with Haiku when Sonnet is overloaded, failing or unreachable", async () => {
    for (const first of [
      () => Promise.resolve(new Response("{}", { status: 529 })),
      () => Promise.resolve(new Response("{}", { status: 500 })),
      () => Promise.reject(new Error("timeout")),
    ]) {
      vi.mocked(fetchWithTimeout).mockReset();
      vi.mocked(fetchWithTimeout).mockImplementationOnce(first).mockResolvedValueOnce(reply("Hi."));
      expect(await ask()).toEqual({ ok: true, text: "Hi.", refused: false });
      expect(sent(1).body.model).toBe("claude-haiku-5-5");
      expect(sent(1).body.fallbacks).toBeUndefined();
    }
  });

  it("tries Haiku once when Sonnet is rate limited (each model has its own limit)", async () => {
    vi.mocked(fetchWithTimeout)
      .mockResolvedValueOnce(new Response("{}", { status: 429 }))
      .mockResolvedValueOnce(reply("Hi."));
    expect(await ask()).toEqual({ ok: true, text: "Hi.", refused: false });
    expect(sent(1).body.model).toBe("claude-haiku-5-5");

    vi.mocked(fetchWithTimeout).mockReset();
    vi.mocked(fetchWithTimeout)
      .mockResolvedValueOnce(new Response("{}", { status: 429 }))
      .mockResolvedValueOnce(new Response("{}", { status: 429 }));
    expect(await ask()).toEqual({ ok: false, reason: "rate_limited" });
    expect(fetchWithTimeout).toHaveBeenCalledTimes(2);
  });

  it("passes on a refusal's category for the event log, never its explanation", async () => {
    const refusal = (category: unknown) =>
      new Response(
        JSON.stringify({
          content: [],
          stop_reason: "refusal",
          stop_details: { type: "refusal", category, explanation: "The person wrote about…" },
        }),
        { status: 200 }
      );
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(refusal("general_harms"));
    expect(await ask()).toStrictEqual({
      ok: true,
      text: "",
      refused: true,
      category: "general_harms",
    });
    for (const odd of ["Not <an> id", null, 7]) {
      vi.mocked(fetchWithTimeout).mockResolvedValueOnce(refusal(odd));
      expect(await ask()).toStrictEqual({ ok: true, text: "", refused: true });
    }
  });

  it("does not switch models on a bad request", async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(new Response("{}", { status: 400 }));
    const result = await ask();
    expect(result.ok).toBe(false);
    expect(fetchWithTimeout).toHaveBeenCalledTimes(1);
    expect(alertBudgetUsedUp).not.toHaveBeenCalled();
  });

  // Anthropic's answers, from platform.claude.com/docs/en/api/errors and /api/rate-limits.
  const error = (status: number, type: string, message: string, details?: object) =>
    new Response(JSON.stringify({ type: "error", error: { type, message, details } }), { status });
  it.each([
    [
      "the workspace's spend limit",
      () =>
        error(
          400,
          "invalid_request_error",
          "You have reached your specified workspace API usage limits. You will regain access on 2026-12-01 at 00:00 UTC."
        ),
    ],
    [
      "the organisation's spend limit",
      () =>
        error(
          400,
          "invalid_request_error",
          "You have reached your specified API usage limits. You will regain access on 2026-12-01 at 00:00 UTC."
        ),
    ],
    [
      "the usage tier's monthly cap",
      () =>
        error(
          429,
          "rate_limit_error",
          "You have reached your API usage limits: your organization has crossed its monthly API usage threshold.",
          { error_code: "enforced_spend_limit_reached" }
        ),
    ],
    [
      "no credit left",
      () =>
        error(
          400,
          "invalid_request_error",
          "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."
        ),
    ],
    [
      "the monthly cap, whatever its wording",
      () =>
        error(429, "rate_limit_error", "Usage paused.", {
          error_code: "enforced_spend_limit_reached",
        }),
    ],
    ["a billing problem", () => error(402, "billing_error", "There's an issue with your billing.")],
  ])("treats %s as the budget used up: no fallback (same workspace), one alert", async (_, res) => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(res());
    expect(await ask()).toEqual({ ok: false, reason: "budget_exhausted" });
    expect(fetchWithTimeout).toHaveBeenCalledTimes(1);
    // The alert quotes Anthropic, whose message says when access resumes.
    const said = ((await res().json()) as { error: { message: string } }).error.message;
    expect(alertBudgetUsedUp).toHaveBeenCalledTimes(1);
    expect(alertBudgetUsedUp).toHaveBeenCalledWith(said);
  });

  it("still tries Haiku on a plain rate limit, without alerting", async () => {
    vi.mocked(fetchWithTimeout)
      .mockResolvedValueOnce(
        error(
          429,
          "rate_limit_error",
          "Number of request tokens has exceeded your per-minute rate limit",
          {
            error_code: "ramp_limit_exceeded",
          }
        )
      )
      .mockResolvedValueOnce(reply("Hi."));
    expect(await ask()).toEqual({ ok: true, text: "Hi.", refused: false });
    expect(alertBudgetUsedUp).not.toHaveBeenCalled();
  });

  it("counts every reply's token use for the month's budget, under the model that answered", async () => {
    const usage = { input_tokens: 120, output_tokens: 300, cache_read_input_tokens: 9_000 };
    vi.mocked(fetchWithTimeout)
      .mockResolvedValueOnce(new Response("{}", { status: 529 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ content: [{ type: "text", text: "Hi." }], usage }), {
          status: 200,
        })
      );
    await ask();
    expect(recordUsage).toHaveBeenCalledTimes(1);
    expect(recordUsage).toHaveBeenCalledWith("claude-haiku-5-5", usage);
  });
});
