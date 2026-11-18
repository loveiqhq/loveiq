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
  };
};
const ask = () => askModel("rules", "person", [{ role: "user", content: "hi" }]);

describe("askModel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("does not switch models on our own rate limit or a bad request", async () => {
    for (const status of [429, 400]) {
      vi.mocked(fetchWithTimeout).mockReset();
      vi.mocked(fetchWithTimeout).mockResolvedValueOnce(new Response("{}", { status }));
      const result = await ask();
      expect(result.ok).toBe(false);
      expect(fetchWithTimeout).toHaveBeenCalledTimes(1);
    }
  });
});
