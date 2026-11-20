import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import logger from "@shared/observability/logger";
import { alertBudgetUsedUp, recordUsage, type Usage } from "./alerts";
import {
  DEFAULT_FALLBACK_MODEL,
  DEFAULT_MODEL,
  MODEL_BUDGET_MS,
  MODEL_EFFORT,
  MODEL_FIRST_TRY_MS,
  MODEL_MAX_TOKENS,
} from "./config";

/**
 * One reply from Mira's model: Anthropic's Messages API, one POST, no SDK (the same choice as
 * the brain's `features/brain/server/llm.ts`). Model-agnostic in the way the team asked for:
 * MIRA_LLM_MODEL names any Claude model without a deploy.
 *
 * The stable instructions (rules, voice, evidence cards) go first and are cached for an hour
 * (beta traffic is often more than 5 minutes apart), so each message pays a fraction for them;
 * the person's own context (style, name, result) follows, uncached. When the main model is down
 * (overloaded, rate limited, failing, unreachable or slower than MODEL_FIRST_TRY_MS) the fallback
 * model answers instead, within MODEL_BUDGET_MS for both. On models that support it, a safety
 * decline is retried server-side on another model; a decline that stands comes back as `refused`.
 * When the AI budget is used up (`budget_exhausted`) the team is alerted and no fallback is tried;
 * every reply's token use is counted for the month's budget alerts (alerts.ts).
 *
 * Never logs the key, the prompt or the conversation: they hold what people say about their
 * sex lives.
 */

export type MiraTurn = { role: "user" | "assistant"; content: string };

export type ModelResult =
  /** `category`: the safety classifier's reason for a refusal ("general_harms"…), when given. */
  | { ok: true; text: string; refused: boolean; category?: string }
  | {
      ok: false;
      reason: "unconfigured" | "rate_limited" | "overloaded" | "budget_exhausted" | "error";
    };

/** Anthropic's API, or MIRA_LLM_BASE_URL (a gateway, or a stand-in model for a local walk). */
function apiUrl(): string {
  const base =
    process.env.MIRA_LLM_BASE_URL?.trim().replace(/\/+$/, "") || "https://api.anthropic.com";
  return `${base}/v1/messages`;
}

export function isModelConfigured(): boolean {
  return Boolean(process.env.MIRA_LLM_KEY);
}

export function modelName(): string {
  return process.env.MIRA_LLM_MODEL?.trim() || DEFAULT_MODEL;
}

/** The model that answers when the main one is down (overloaded, rate limited, failing, slow). */
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
type ApiError = { error?: { type?: string; message?: string; details?: { error_code?: string } } };

/**
 * Anthropic's answers when the money is used up (platform.claude.com/docs/en/api/errors and
 * /api/rate-limits, read 20 Nov 2026): a spend limit set on the organisation or the workspace is
 * a 400 invalid_request_error "You have reached your specified (workspace) API usage limits",
 * the usage tier's monthly cap a 429 with error.details.error_code "enforced_spend_limit_reached"
 * (no retry-after), no credit left "Your credit balance is too low", a billing problem a 402
 * billing_error. Each message says when access resumes.
 */
export function isBudgetExhausted(status: number, body: ApiError): boolean {
  const e = body.error;
  return (
    status === 402 ||
    e?.type === "billing_error" ||
    e?.details?.error_code === "enforced_spend_limit_reached" ||
    /reached your (specified )?(workspace )?API usage limits|credit balance is too low/i.test(
      e?.message ?? ""
    )
  );
}

async function callModel(
  key: string,
  model: string,
  stable: string,
  personal: string,
  turns: MiraTurn[],
  timeoutMs: number
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
          { type: "text", text: stable, cache_control: { type: "ephemeral", ttl: "1h" } },
          { type: "text", text: personal },
        ],
        messages: turns,
        output_config: { effort: MODEL_EFFORT },
        ...(serverFallback ? { fallbacks: "default" } : {}),
      }),
      timeoutMs,
    });
  } catch (err) {
    logger.error({ err: (err as Error)?.name, model }, "mira: the model request failed");
    return { ok: false, reason: "error", retry: true };
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as ApiError;
    // The fallback model bills the same workspace, so it is not tried.
    if (isBudgetExhausted(res.status, body)) {
      logger.warn({ status: res.status, model }, "mira: the AI budget is used up");
      alertBudgetUsedUp(body.error?.message || `HTTP ${res.status}`);
      return { ok: false, reason: "budget_exhausted", retry: false };
    }
    // Each model has its own rate limit, so a 429 is worth one try on the other model.
    if (res.status === 429) return { ok: false, reason: "rate_limited", retry: true };
    if (res.status === 529 || res.status === 503)
      return { ok: false, reason: "overloaded", retry: true };
    logger.error(
      { status: res.status, type: body.error?.type, model },
      "mira: the model refused the call"
    );
    return { ok: false, reason: "error", retry: res.status >= 500 };
  }

  const data = (await res.json().catch(() => null)) as {
    content?: ContentBlock[];
    stop_reason?: string;
    stop_details?: { category?: unknown } | null;
    usage?: Usage;
  } | null;
  if (!data) return { ok: false, reason: "error", retry: true };
  // Every reply is billed, a refused one too: counted for the month's budget alerts.
  if (data.usage) recordUsage(model, data.usage);

  const text = (data.content ?? [])
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("")
    .trim();
  const refused = data.stop_reason === "refusal";
  // Only the category's id, for the event log; never the explanation, which may quote the chat.
  const category = data.stop_details?.category;
  return {
    ok: true,
    text,
    refused,
    ...(refused && typeof category === "string" && /^[a-z_]{1,40}$/.test(category)
      ? { category }
      : {}),
  };
}

export async function askModel(
  stable: string,
  personal: string,
  turns: MiraTurn[],
  /** The latest moment the answer may come (ms); the caller's own time limit, when it has one. */
  until?: number
): Promise<ModelResult> {
  const key = process.env.MIRA_LLM_KEY;
  if (!key) return { ok: false, reason: "unconfigured" };
  const deadline = Math.min(Date.now() + MODEL_BUDGET_MS, until ?? Infinity);
  if (deadline - Date.now() < 5_000) return { ok: false, reason: "error" };
  const main = modelName();
  const first = await callModel(
    key,
    main,
    stable,
    personal,
    turns,
    Math.min(MODEL_FIRST_TRY_MS, deadline - Date.now())
  );
  const fallback = fallbackModelName();
  if (first.ok || !first.retry || fallback === main) return strip(first);
  logger.warn(
    { model: main, fallback, reason: first.reason },
    "mira: the main model is down, answering with the fallback"
  );
  const left = deadline - Date.now();
  if (left < 3_000) return strip(first);
  return strip(await callModel(key, fallback, stable, personal, turns, left));
}

function strip({ retry: _retry, ...result }: Attempt): ModelResult {
  return result as ModelResult;
}
