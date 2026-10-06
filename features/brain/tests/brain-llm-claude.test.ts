import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const fetchWithTimeout = vi.fn();
vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: (...args: unknown[]) => fetchWithTimeout(...args),
}));

import { complete, llmModel } from "@features/brain/server/llm";

/**
 * The server-side model moves from Gemini to Claude by environment alone. Claude's
 * OpenAI-compatible endpoint would accept the old request, but Anthropic documents it as
 * "not considered a long-term or production-ready solution", so a base URL on
 * api.anthropic.com gets the native Messages API instead.
 */
const MESSAGES = [
  { role: "system" as const, content: "You are the company brain." },
  { role: "system" as const, content: "Answer from the sources only." },
  { role: "user" as const, content: "What did we decide?" },
];

function reply(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function sent() {
  const [url, init] = fetchWithTimeout.mock.calls.at(-1)!;
  return { url: url as string, init: init as { headers: Record<string, string>; body: string } };
}

describe("complete() against Claude", () => {
  beforeEach(() => {
    fetchWithTimeout.mockReset();
    process.env.BRAIN_LLM_KEY = "sk-ant-test-value";
    process.env.BRAIN_LLM_BASE_URL = "https://api.anthropic.com/v1";
    delete process.env.BRAIN_LLM_MODEL;
    delete process.env.BRAIN_LLM_REASONING_EFFORT;
  });
  afterEach(() => {
    delete process.env.BRAIN_LLM_KEY;
    delete process.env.BRAIN_LLM_BASE_URL;
    delete process.env.BRAIN_LLM_MODEL;
    delete process.env.BRAIN_LLM_REASONING_EFFORT;
  });

  it("speaks the native Messages API, not the OpenAI shape", async () => {
    fetchWithTimeout.mockResolvedValue(
      reply({ content: [{ type: "text", text: "Ship it." }], stop_reason: "end_turn" })
    );
    await complete(MESSAGES);
    const { url, init } = sent();
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init.headers["x-api-key"]).toBe("sk-ant-test-value");
    expect(init.headers["anthropic-version"]).toBe("2023-06-01");
    expect(init.headers.Authorization).toBeUndefined();
  });

  it("hoists the system messages and sends only the conversation as turns", async () => {
    fetchWithTimeout.mockResolvedValue(
      reply({ content: [{ type: "text", text: "ok" }], stop_reason: "end_turn" })
    );
    await complete(MESSAGES);
    const body = JSON.parse(sent().init.body);
    expect(body.system).toBe("You are the company brain.\n\nAnswer from the sources only.");
    expect(body.messages).toEqual([{ role: "user", content: "What did we decide?" }]);
  });

  /**
   * Thinking is on by default on Claude 5 models and counts toward max_tokens, and the
   * thinking docs never say temperature may be combined with it. So no temperature, no
   * thinking config and no reasoning_effort: the model's own defaults, and a budget big
   * enough to leave room for the answer after the thinking.
   */
  it("sends no temperature, thinking or reasoning_effort, and a budget with room to think", async () => {
    process.env.BRAIN_LLM_REASONING_EFFORT = "low";
    fetchWithTimeout.mockResolvedValue(
      reply({ content: [{ type: "text", text: "ok" }], stop_reason: "end_turn" })
    );
    await complete(MESSAGES);
    const body = JSON.parse(sent().init.body);
    expect(body).not.toHaveProperty("temperature");
    expect(body).not.toHaveProperty("thinking");
    expect(body).not.toHaveProperty("reasoning_effort");
    expect(body.max_tokens).toBeGreaterThanOrEqual(8000);
  });

  it("defaults to a Claude model when none is configured, and honours one that is", async () => {
    expect(llmModel()).toBe("claude-sonnet-5");
    process.env.BRAIN_LLM_MODEL = "claude-haiku-4-5";
    expect(llmModel()).toBe("claude-haiku-4-5");
  });

  it("joins the text blocks and skips thinking blocks", async () => {
    fetchWithTimeout.mockResolvedValue(
      reply({
        content: [
          { type: "thinking", thinking: "", signature: "x" },
          { type: "text", text: "We agreed " },
          { type: "text", text: "to ship." },
        ],
        stop_reason: "end_turn",
      })
    );
    expect(await complete(MESSAGES)).toEqual({
      ok: true,
      text: "We agreed to ship.",
      truncated: false,
    });
  });

  it("reports an answer cut off by the token budget as truncated", async () => {
    fetchWithTimeout.mockResolvedValue(
      reply({ content: [{ type: "text", text: "We agreed to" }], stop_reason: "max_tokens" })
    );
    const r = await complete(MESSAGES);
    expect(r).toEqual({ ok: true, text: "We agreed to", truncated: true });
  });

  it("names the token budget when thinking used all of it and no text came back", async () => {
    fetchWithTimeout.mockResolvedValue(
      reply({ content: [{ type: "thinking", thinking: "" }], stop_reason: "max_tokens" })
    );
    const r = await complete(MESSAGES);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.detail).toMatch(/token budget/);
  });

  /** Anthropic's overload status is 529, which no other provider here uses. */
  it("treats 529 overloaded_error as a blip worth waiting out, not a failure", async () => {
    fetchWithTimeout.mockResolvedValue(
      reply({ type: "error", error: { type: "overloaded_error" } }, 529)
    );
    const r = await complete(MESSAGES);
    expect(r).toMatchObject({ ok: false, reason: "overloaded" });
  });

  it("reads Claude's retry-after header on a 429", async () => {
    fetchWithTimeout.mockResolvedValue(
      reply({ type: "error", error: { type: "rate_limit_error" } }, 429, { "retry-after": "20" })
    );
    const r = await complete(MESSAGES);
    expect(r).toMatchObject({
      ok: false,
      reason: "rate_limited",
      retryAfterMs: 20_000,
      dailyQuota: false,
    });
  });
});

describe("complete() against an OpenAI-shaped provider is unchanged", () => {
  beforeEach(() => {
    fetchWithTimeout.mockReset();
    process.env.BRAIN_LLM_KEY = "gemini-test-value";
    delete process.env.BRAIN_LLM_BASE_URL;
    delete process.env.BRAIN_LLM_MODEL;
  });
  afterEach(() => {
    delete process.env.BRAIN_LLM_KEY;
  });

  it("still posts chat/completions with a bearer token, temperature and the Gemini default", async () => {
    fetchWithTimeout.mockResolvedValue(
      reply({ choices: [{ message: { content: "ok" }, finish_reason: "stop" }] })
    );
    await complete(MESSAGES);
    const { url, init } = sent();
    expect(url).toMatch(/generativelanguage\.googleapis\.com\/v1beta\/openai\/chat\/completions$/);
    expect(init.headers.Authorization).toBe("Bearer gemini-test-value");
    const body = JSON.parse(init.body);
    expect(body.temperature).toBe(0.2);
    expect(body.messages).toEqual(MESSAGES);
    expect(llmModel()).toBe("gemini-3.6-flash");
  });
});
