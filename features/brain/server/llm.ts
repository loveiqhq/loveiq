import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import logger from "@shared/observability/logger";

/**
 * The one call that turns retrieved chunks into an answer.
 *
 * WRITTEN AGAINST THE OPENAI CHAT-COMPLETIONS SHAPE, ON PURPOSE. Groq, Gemini,
 * OpenAI and a local Ollama all speak it, so switching provider is three env
 * vars and no code change. That matters more than usual here: the brain runs on a
 * free tier, and free tiers change their terms. Being able to leave without a
 * rewrite is the whole reason this file is a plain `fetch` and not a vendor SDK.
 *
 * NO NEW DEPENDENCY. One POST does not justify an SDK -- the same call this repo
 * already makes by hand for Slack rather than pulling in `@slack/web-api`.
 *
 * DEFAULT MODEL. `groq/compound` on Groq's free tier: 30 req/min, 250 req/day,
 * and -- the number that actually decides this -- 70K tokens/min. The obvious
 * alternative, `openai/gpt-oss-120b`, is a plainer non-agentic model but its free
 * tier allows only 8K tokens/min, which is roughly ONE question a minute once a
 * retrieval set is in the prompt. Both are 131K context. The prompt here is sized
 * to fit the 8K ceiling so either model works with only an env change; pick
 * gpt-oss if `compound`'s built-in tool use is unwanted.
 *
 * NEVER LOGS THE KEY OR THE PROMPT. Retrieved chunks are company documents, and
 * the logger mirrors to Slack -- same reasoning as `slack-bot.ts` not logging
 * blocks.
 */

const DEFAULT_BASE_URL = "https://api.groq.com/openai/v1";
const DEFAULT_MODEL = "groq/compound";

// Generation is the slowest step and runs after the Slack ack, not inside it, so
// this can be generous. Still bounded: a hung request would hold the function
// open until the platform kills it, losing the reply entirely.
const TIMEOUT_MS = 25_000;

// Grounded answers, not prose. Low but not zero -- at 0 the model tends to parrot
// a source verbatim instead of answering the question asked.
const TEMPERATURE = 0.2;

// Slack messages are short. Also keeps the response inside the free tier's
// tokens-per-minute budget alongside the prompt.
const MAX_TOKENS = 900;

export interface LlmMessage {
  role: "system" | "user";
  content: string;
}

export type LlmResult =
  | { ok: true; text: string }
  | { ok: false; reason: "unconfigured" | "rate_limited" | "error"; detail?: string };

export function isLlmConfigured(): boolean {
  return Boolean(process.env.BRAIN_LLM_KEY);
}

export function llmModel(): string {
  return process.env.BRAIN_LLM_MODEL || DEFAULT_MODEL;
}

export async function complete(messages: LlmMessage[]): Promise<LlmResult> {
  const key = process.env.BRAIN_LLM_KEY;
  if (!key) return { ok: false, reason: "unconfigured" };

  const baseUrl = (process.env.BRAIN_LLM_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");

  let res: Response;
  try {
    res = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: llmModel(),
        messages,
        temperature: TEMPERATURE,
        max_tokens: MAX_TOKENS,
        stream: false,
      }),
      timeoutMs: TIMEOUT_MS,
    });
  } catch (err) {
    logger.error({ err }, "brain llm request failed");
    return { ok: false, reason: "error", detail: "request failed" };
  }

  // 429 is separated from every other failure because it is the one the team will
  // actually hit, and it needs a different answer in Slack: "we are out of
  // questions for today", not "something broke".
  if (res.status === 429) {
    logger.warn({ retryAfter: res.headers.get("retry-after") }, "brain llm rate limited");
    return { ok: false, reason: "rate_limited" };
  }

  if (!res.ok) {
    // Body, not status, carries the useful part on a 400 (bad model id, prompt
    // too long). Truncated so a long provider error cannot flood the log.
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    logger.error({ status: res.status, detail }, "brain llm returned an error");
    return { ok: false, reason: "error", detail: `HTTP ${res.status}` };
  }

  const json = (await res.json().catch(() => null)) as {
    choices?: Array<{ message?: { content?: unknown } }>;
  } | null;

  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    logger.error({ hasChoices: Boolean(json?.choices?.length) }, "brain llm returned no content");
    return { ok: false, reason: "error", detail: "empty completion" };
  }

  return { ok: true, text: content.trim() };
}
