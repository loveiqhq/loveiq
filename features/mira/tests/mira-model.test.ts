import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/http/fetch-with-timeout", () => ({ fetchWithTimeout: vi.fn() }));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

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

  it("does not switch models on a bad request", async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(new Response("{}", { status: 400 }));
    const result = await ask();
    expect(result.ok).toBe(false);
    expect(fetchWithTimeout).toHaveBeenCalledTimes(1);
  });
});
