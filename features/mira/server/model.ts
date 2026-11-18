import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import logger from "@shared/observability/logger";
import { DEFAULT_MODEL, MODEL_EFFORT, MODEL_MAX_TOKENS } from "./config";

/**
 * One reply from Mira's model: Anthropic's Messages API, one POST, no SDK (the same choice as
 * the brain's `features/brain/server/llm.ts`). Model-agnostic in the way the team asked for:
 * MIRA_LLM_MODEL names any Claude model without a deploy.
 *
 * The stable instructions (rules, voice, evidence cards) go first and are cached, so each
 * message pays a fraction for them; the person's own context (style, name, result) follows,
 * uncached. Server-side refusal fallbacks are on, so a safety decline on one model is retried
 * on another inside the same call; a decline from the whole chain comes back as `refused`.
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

type ContentBlock = { type: string; text?: string };

export async function askModel(
  stable: string,
  personal: string,
  turns: MiraTurn[]
): Promise<ModelResult> {
  const key = process.env.MIRA_LLM_KEY;
  if (!key) return { ok: false, reason: "unconfigured" };

  let res: Response;
  try {
    res = await fetchWithTimeout(apiUrl(), {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "server-side-fallback-2026-07-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: modelName(),
        max_tokens: MODEL_MAX_TOKENS,
        system: [
          { type: "text", text: stable, cache_control: { type: "ephemeral" } },
          { type: "text", text: personal },
        ],
        messages: turns,
        output_config: { effort: MODEL_EFFORT },
        fallbacks: "default",
      }),
      timeoutMs: TIMEOUT_MS,
    });
  } catch (err) {
    logger.error({ err: (err as Error)?.name }, "mira: the model request failed");
    return { ok: false, reason: "error" };
  }

  if (res.status === 429) return { ok: false, reason: "rate_limited" };
  if (res.status === 529 || res.status === 503) return { ok: false, reason: "overloaded" };
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { type?: string } };
    logger.error(
      { status: res.status, type: body.error?.type },
      "mira: the model refused the call"
    );
    return { ok: false, reason: "error" };
  }

  const data = (await res.json().catch(() => null)) as {
    content?: ContentBlock[];
    stop_reason?: string;
  } | null;
  if (!data) return { ok: false, reason: "error" };

  const text = (data.content ?? [])
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("")
    .trim();
  return { ok: true, text, refused: data.stop_reason === "refusal" };
}
