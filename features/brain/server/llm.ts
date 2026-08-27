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
 * DEFAULT MODEL. `gemini-3.6-flash` on Google's free tier, reached through
 * Gemini's OpenAI-compatible endpoint. Note `gemini-2.5-flash` is NOT usable —
 * Google now answers 404 "no longer available to new users" for keys created
 * after its retirement, so anything copied from an older guide will fail.
 *
 * Groq (`https://api.groq.com/openai/v1`, `groq/compound`) is the drop-in
 * alternative and is preferable on data grounds: it does not train on the prompts
 * it receives, whereas Google's free tier does, and these prompts carry our docs,
 * our Jira and our revenue. It is a base-URL, key and model change, nothing more.
 *
 * NEVER LOGS THE KEY OR THE PROMPT. Retrieved chunks are company documents, and
 * the logger mirrors to Slack -- same reasoning as `slack-bot.ts` not logging
 * blocks.
 */

const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/";
const DEFAULT_MODEL = "gemini-3.6-flash";

// Generation runs after the Slack ack, not inside it, so this can be generous.
// Still bounded: a hung request holds the function open until the platform kills
// it, losing the reply entirely. Set well above the observed worst case — a
// thinking model with no effort cap measured 13.7s on a trivial prompt, and 25s
// gave a first real answer 25.4s of latency against a 25s ceiling, which is a
// coin flip rather than a margin.
const TIMEOUT_MS = 45_000;

// Grounded answers, not prose. Low but not zero -- at 0 the model tends to parrot
// a source verbatim instead of answering the question asked.
const TEMPERATURE = 0.2;

// Slack messages are short, but this budget is NOT just the visible answer: on a
// thinking model the reasoning tokens are drawn from it first. Measured, 900 cut
// a real answer off mid-sentence ("...and removed from the schedule") because
// ~360 tokens went to reasoning before a word was written. Sized so the answer
// survives even when the model thinks hard.
const MAX_TOKENS = 2500;

export interface LlmMessage {
  role: "system" | "user";
  content: string;
}

export type LlmResult =
  | { ok: true; text: string; truncated: boolean }
  | { ok: false; reason: "unconfigured" | "rate_limited" | "error"; detail?: string };

export function isLlmConfigured(): boolean {
  return Boolean(process.env.BRAIN_LLM_KEY);
}

export function llmModel(): string {
  return process.env.BRAIN_LLM_MODEL || DEFAULT_MODEL;
}

/**
 * Reasoning budget, sent ONLY when configured.
 *
 * Worth an env var rather than a constant because it is the single biggest lever
 * on latency and it is not portable. Measured on gemini-3.6-flash answering a
 * real question: 13.7s unconstrained versus 1.7s at "low", for the same answer.
 * Left unset the field is omitted entirely, so a provider that rejects unknown
 * parameters (Groq, older OpenAI-compatible servers) is unaffected.
 */
function reasoningEffort(): string | null {
  const value = process.env.BRAIN_LLM_REASONING_EFFORT?.trim();
  return value ? value : null;
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
        ...(reasoningEffort() ? { reasoning_effort: reasoningEffort() } : {}),
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
    choices?: Array<{ message?: { content?: unknown }; finish_reason?: string }>;
  } | null;

  const content = json?.choices?.[0]?.message?.content;
  const finishReason = json?.choices?.[0]?.finish_reason;
  if (typeof content !== "string" || !content.trim()) {
    // A thinking model that spends its whole budget reasoning answers 200 with an
    // EMPTY message and finish_reason "length" — not an error status. Naming that
    // separately matters because the fix is a bigger `max_tokens` or a lower
    // reasoning effort, not a retry.
    logger.error(
      { hasChoices: Boolean(json?.choices?.length), finish: finishReason },
      "brain llm returned no content"
    );
    return {
      ok: false,
      reason: "error",
      detail:
        finishReason === "length"
          ? "the model used its whole token budget on reasoning — raise BRAIN_LLM_REASONING_EFFORT or max_tokens"
          : "empty completion",
    };
  }

  // The empty case above is the RARE one. The common shape is a non-empty answer
  // that got cut off mid-sentence because reasoning ate the budget — and until
  // now that fell straight through to `ok: true` and was posted with citations
  // and no indication it was incomplete. On a tool people quote into decisions,
  // a silently half-finished answer about revenue is worse than an error.
  if (finishReason === "length") {
    logger.warn({ chars: content.length }, "brain llm answer was truncated by the token budget");
  }
  return { ok: true, text: content.trim(), truncated: finishReason === "length" };
}
