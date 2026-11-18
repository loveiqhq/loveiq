import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import logger from "@shared/observability/logger";
import { DEFAULT_FALLBACK_MODEL, DEFAULT_MODEL, MODEL_EFFORT, MODEL_MAX_TOKENS } from "./config";

/**
 * One reply from Mira's model: Anthropic's Messages API, one POST, no SDK (the same choice as
 * the brain's `features/brain/server/llm.ts`). Model-agnostic in the way the team asked for:
 * MIRA_LLM_MODEL names any Claude model without a deploy.
 *
 * The stable instructions (rules, voice, evidence cards) go first and are cached, so each
 * message pays a fraction for them; the person's own context (style, name, result) follows,
 * uncached. When the main model is down (overloaded, failing or unreachable) the fallback model
 * answers instead. On models that support it, a safety decline is retried server-side on another
 * model; a decline that stands comes back as `refused`.
 *
 * Never logs the key, the prompt or the conversation: they hold what people say about their
 * sex lives.
 */

export type MiraTurn = { role: "user" | "assistant"; content: string };

export type ModelResult =
  | { ok: true; text: string; refused: boolean }
  | { ok: false; reason: "unconfigured" | "rate_limited" | "overloaded" | "error" };

/** Anthropic's API, or MIRA_LLM_BASE_URL (a gateway, or a stand-in model for a local walk). */
function apiUrl(): string {
  const base =
    process.env.MIRA_LLM_BASE_URL?.trim().replace(/\/+$/, "") || "https://api.anthropic.com";
  return `${base}/v1/messages`;
}
const TIMEOUT_MS = 60_000;

export function isModelConfigured(): boolean {
  return Boolean(process.env.MIRA_LLM_KEY);
}

export function modelName(): string {
  return process.env.MIRA_LLM_MODEL?.trim() || DEFAULT_MODEL;
}

/** The model that answers when the main one is down (overloaded, failing or unreachable). */
export function fallbackModelName(): string {
  return process.env.MIRA_LLM_FALLBACK_MODEL?.trim() || DEFAULT_FALLBACK_MODEL;
}

/**
 * Server-side refusal fallbacks exist for Opus 5 and Fable 5 models; Haiku 5.5 rejects the
 * parameter, so it is sent only where it is known to work.
 */
export function hasServerFallback(model: string): boolean {
  return /^claude-(opus|fable)-5/.test(model);
}

type ContentBlock = { type: string; text?: string };
type Attempt = ModelResult & { retry?: boolean };

async function callModel(
  key: string,
  model: string,
  stable: string,
  personal: string,
  turns: MiraTurn[]
): Promise<Attempt> {
  const serverFallback = hasServerFallback(model);
  let res: Response;
  try {
    res = await fetchWithTimeout(apiUrl(), {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        ...(serverFallback ? { "anthropic-beta": "server-side-fallback-2026-07-01" } : {}),
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: MODEL_MAX_TOKENS,
        system: [
          { type: "text", text: stable, cache_control: { type: "ephemeral" } },
          { type: "text", text: personal },
        ],
        messages: turns,
        output_config: { effort: MODEL_EFFORT },
        ...(serverFallback ? { fallbacks: "default" } : {}),
      }),
      timeoutMs: TIMEOUT_MS,
    });
  } catch (err) {
    logger.error({ err: (err as Error)?.name, model }, "mira: the model request failed");
    return { ok: false, reason: "error", retry: true };
  }

  if (res.status === 429) return { ok: false, reason: "rate_limited" };
  if (res.status === 529 || res.status === 503)
    return { ok: false, reason: "overloaded", retry: true };
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { type?: string } };
    logger.error(
      { status: res.status, type: body.error?.type, model },
      "mira: the model refused the call"
    );
    return { ok: false, reason: "error", retry: res.status >= 500 };
  }

  const data = (await res.json().catch(() => null)) as {
    content?: ContentBlock[];
    stop_reason?: string;
  } | null;
  if (!data) return { ok: false, reason: "error", retry: true };

  const text = (data.content ?? [])
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("")
    .trim();
  return { ok: true, text, refused: data.stop_reason === "refusal" };
}

export async function askModel(
  stable: string,
  personal: string,
  turns: MiraTurn[]
): Promise<ModelResult> {
  const key = process.env.MIRA_LLM_KEY;
  if (!key) return { ok: false, reason: "unconfigured" };
  const main = modelName();
  const first = await callModel(key, main, stable, personal, turns);
  const fallback = fallbackModelName();
  if (first.ok || !first.retry || fallback === main) return strip(first);
  logger.warn(
    { model: main, fallback },
    "mira: the main model is down, answering with the fallback"
  );
  return strip(await callModel(key, fallback, stable, personal, turns));
}

function strip({ retry: _retry, ...result }: Attempt): ModelResult {
  return result as ModelResult;
}
