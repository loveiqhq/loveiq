import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

/**
 * CLAUDE SPEAKS ITS OWN SHAPE.
 *
 * Anthropic's OpenAI-compatible endpoint would accept the request below as it stands,
 * but Anthropic documents it as "not considered a long-term or production-ready
 * solution", so a base URL on api.anthropic.com gets the native Messages API: still one
 * POST and no SDK. Switching provider stays an env change and no deploy: point
 * BRAIN_LLM_BASE_URL at Anthropic's v1 base, put a Claude key in BRAIN_LLM_KEY, and
 * optionally name the model in BRAIN_LLM_MODEL (`.env.example` has the exact values).
 *
 * Thinking is on by default on Claude 5 models and its tokens count toward max_tokens,
 * and the docs never say temperature may be combined with it. So the Claude request
 * carries no temperature, no thinking config and no reasoning_effort (the model's own
 * defaults), and a bigger budget than the OpenAI path, so the answer still has room
 * after the thinking.
 */
const CLAUDE_DEFAULT_MODEL = "claude-sonnet-5";
const CLAUDE_MAX_TOKENS = 8000;
const CLAUDE_API_VERSION = "2023-06-01";

/**
 * CLAUDE CODE AS THE MODEL, ON THE TEAM SUBSCRIPTION WE ALREADY PAY FOR.
 *
 * `BRAIN_LLM_CLI=claude` sends every call through the `claude -p` binary instead of an
 * HTTP API. In GitHub Actions (`.github/workflows/brain-daily.yml`) that binary signs in
 * with CLAUDE_CODE_OAUTH_TOKEN from `claude setup-token`, so the brief and the miner cost
 * nothing beyond a Team seat; on a laptop it uses whoever is logged in. The token is for
 * the unmodified binary only: Anthropic's terms forbid sending it to the API from our own
 * code, which is why this is a subprocess and not a different header on the fetch below.
 * Vercel has no `claude` binary, so this lane only works where one is installed.
 *
 * One turn, text in and text out: no tools, no MCP servers, no settings, our own system
 * prompt in place of Claude Code's, run from an empty directory so nothing in a checkout
 * (CLAUDE.md, hooks, .mcp.json) loads. Measured 2026-09-24: 537 input tokens for a
 * one-line prompt, 3s end to end, so none of Claude Code's own context comes along.
 */
const CLI_DEFAULT_MODEL = "sonnet";

function cliBinary(): string | null {
  return process.env.BRAIN_LLM_CLI?.trim() || null;
}

export function isClaudeBase(baseUrl: string): boolean {
  try {
    return new URL(baseUrl).hostname === "api.anthropic.com";
  } catch {
    return false;
  }
}

function llmBaseUrl(): string {
  return (process.env.BRAIN_LLM_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

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
  | {
      ok: false;
      reason: "unconfigured" | "rate_limited" | "overloaded" | "error";
      detail?: string;
      /** How long the provider asked us to wait, when it said. Only ever set on
       *  `rate_limited`. A caller that can afford to wait (a cron) should; one that
       *  cannot (anything with a person attached) should keep treating 429 as final. */
      retryAfterMs?: number;
      /**
       * On `rate_limited`: is the DAILY allowance gone, rather than the per-minute one?
       *
       * The two are the same status with the same shape, and the difference decides
       * everything a caller does: a per-minute limit clears in ~30 seconds, the daily one
       * not until midnight Pacific. Callers already branch on `retryAfterMs` being
       * absent, but absent has two meanings -- daily, or a provider that simply sent no
       * hint -- so a caller that reports which limit it hit cannot get it from that.
       * `mine-decisions` writes this into `cron_run`, which is the only way to tell from
       * the outside whether the miner needs a later schedule or a bigger budget.
       */
      dailyQuota?: boolean;
    };

/** Longest wait the provider is allowed to talk us into. A provider that answers
 *  "retry in an hour" must not park a cron for an hour; past this we treat the
 *  limit as final and stop, exactly as before. */
const MAX_RETRY_AFTER_MS = 120_000;

/**
 * How long to wait after a 429, from the `retry-after` header or, failing that, the
 * `RetryInfo.retryDelay` Google puts in the body ("32s"). Returns undefined when
 * neither is present or parseable -- an absent hint must not become a zero-length
 * wait, which would spin.
 */
/**
 * Is this 429 the DAILY allowance rather than the per-minute one?
 *
 * The free tier enforces both — 5 requests a minute and 20 a day, per model — and sends
 * the same shape for each, `retryDelay` included. On the daily limit that delay is a lie
 * of omission: it counts down to the next per-minute window, which will refuse again,
 * and again, until midnight Pacific. Waiting on it burns the caller's whole budget to
 * make zero progress. So the daily limit stays terminal, as every 429 used to be.
 */
export function isDailyQuota(body: string): boolean {
  return /PerDayPer|RequestsPerDay/i.test(body);
}

export function parseRetryAfterMs(header: string | null, body: string): number | undefined {
  if (isDailyQuota(body)) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
  // Two shapes, because Google sends both and the cheaper one comes first:
  //   message  "...Please retry in 32.652110245s."      (~380 chars in)
  //   details  {"@type": ...RetryInfo, "retryDelay": "32s"}   (~900 chars in)
  // Seconds only; Google does not emit other units on either.
  const match =
    /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(body) ?? /retry in (\d+(?:\.\d+)?)s/i.exec(body);
  if (!match) return undefined;
  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.min(Math.ceil(parsed * 1000), MAX_RETRY_AFTER_MS);
}

export function isLlmConfigured(): boolean {
  return Boolean(process.env.BRAIN_LLM_KEY || cliBinary());
}

export function llmModel(): string {
  return (
    process.env.BRAIN_LLM_MODEL ||
    (cliBinary()
      ? CLI_DEFAULT_MODEL
      : isClaudeBase(llmBaseUrl())
        ? CLAUDE_DEFAULT_MODEL
        : DEFAULT_MODEL)
  );
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
/** How long to wait out a provider overload. Short: it is a blip, not a quota. */
const OVERLOAD_RETRY_MS = 5_000;

function reasoningEffort(): string | null {
  const value = process.env.BRAIN_LLM_REASONING_EFFORT?.trim();
  return value ? value : null;
}

export async function complete(
  messages: LlmMessage[],
  /**
   * Per-call override. The default suits `answerQuestion`, which a person is waiting
   * on, so it must give up quickly.
   *
   * The daily brief is not. On 2026-08-31 at 06:11 it died at 46,745 ms -- the 45s
   * timeout plus overhead -- having never posted. The same call measured 6.5s from a
   * laptop against the same corpus and produced a good brief, so the model and the
   * key were fine; the call was simply slower than 45s from Vercel that morning.
   * Killing a once-a-day job to save thirty seconds it has no need of is the wrong
   * trade, and a failed day is never retried -- the route only ever asks for
   * yesterday.
   */
  timeoutMs: number = TIMEOUT_MS
): Promise<LlmResult> {
  const cli = cliBinary();
  if (cli) return cliComplete(cli, messages, timeoutMs);

  const key = process.env.BRAIN_LLM_KEY;
  if (!key) return { ok: false, reason: "unconfigured" };

  const baseUrl = llmBaseUrl();
  const claude = isClaudeBase(baseUrl);

  let res: Response;
  try {
    res = await fetchWithTimeout(claude ? `${baseUrl}/messages` : `${baseUrl}/chat/completions`, {
      method: "POST",
      headers: claude
        ? {
            "x-api-key": key,
            "anthropic-version": CLAUDE_API_VERSION,
            "Content-Type": "application/json",
          }
        : {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
      body: JSON.stringify(
        claude
          ? claudeBody(messages)
          : {
              model: llmModel(),
              messages,
              temperature: TEMPERATURE,
              max_tokens: MAX_TOKENS,
              stream: false,
              ...(reasoningEffort() ? { reasoning_effort: reasoningEffort() } : {}),
            }
      ),
      timeoutMs,
    });
  } catch (err) {
    logger.error({ err }, "brain llm request failed");
    return { ok: false, reason: "error", detail: "request failed" };
  }

  // 429 is separated from every other failure because it is the one the team will
  // actually hit, and it needs a different answer in Slack: "we are out of
  // questions for today", not "something broke".
  if (res.status === 429) {
    // The BODY, not the status, says which limit was hit and for how long. Every other
    // failure branch below reads it; this one used to throw it away, so
    // "stopped early: rate_limited" could never distinguish "out for the next 30
    // seconds" from "out for the day" -- and the miner assumed the worst, nightly.
    // Free tier is 5 requests per minute per model, and says so here:
    //   QuotaFailure.quotaId  GenerateRequestsPerMinutePerProjectPerModel-FreeTier
    //   RetryInfo.retryDelay  "32s"
    // Parse the WHOLE body, then truncate for logging. `RetryInfo` is the last of three
    // `details` entries and sits ~900 characters in, so parsing a truncated copy finds
    // nothing and silently answers "no hint" -- which reads exactly like a provider that
    // did not send one.
    const body = await res.text().catch(() => "");
    const dailyQuota = isDailyQuota(body);
    const retryAfterMs = parseRetryAfterMs(res.headers.get("retry-after"), body);
    logger.warn({ dailyQuota, retryAfterMs, detail: body.slice(0, 300) }, "brain llm rate limited");
    return {
      ok: false,
      reason: "rate_limited",
      detail: body.slice(0, 300),
      retryAfterMs,
      dailyQuota,
    };
  }

  /**
   * 503 IS "COME BACK IN A MOMENT", NOT "THIS FAILED".
   *
   * Gemini answers 503 when the model is momentarily overloaded, and 502/504 are the
   * gateway saying the same thing. Every one of these used to land in the terminal
   * branch below, so a caller that could happily have waited two seconds instead
   * stopped its whole run.
   *
   * Measured 2026-09-20: `brain-mine` closed with `stopped early: error:HTTP 503` on
   * two consecutive days, 1.5s runs that read zero meetings, while `brain-brief` used
   * the SAME key and model successfully two hours earlier. The key was never the
   * problem — the miner sends far longer prompts, which is exactly when a provider
   * sheds load.
   *
   * Named separately from `rate_limited` on purpose: a quota says WHEN to come back
   * and may mean "not until tomorrow", while an overload is transient and carries no
   * such promise. Collapsing the two is the mistake this file spends its comments
   * undoing elsewhere.
   */
  // 529 is Anthropic's `overloaded_error`; no other provider here uses it.
  if (res.status === 503 || res.status === 502 || res.status === 504 || res.status === 529) {
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    logger.warn({ status: res.status, detail }, "brain llm is overloaded, worth retrying");
    return {
      ok: false,
      reason: "overloaded",
      detail: `HTTP ${res.status}`,
      // No promise from the provider, so suggest a short wait rather than invent one.
      retryAfterMs: OVERLOAD_RETRY_MS,
    };
  }

  if (!res.ok) {
    // Body, not status, carries the useful part on a 400 (bad model id, prompt
    // too long). Truncated so a long provider error cannot flood the log.
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    logger.error({ status: res.status, detail }, "brain llm returned an error");
    return { ok: false, reason: "error", detail: `HTTP ${res.status}` };
  }

  const { content, finishReason, hasOutput } = claude
    ? claudeOutput(await res.json().catch(() => null))
    : openAiOutput(await res.json().catch(() => null));
  if (typeof content !== "string" || !content.trim()) {
    // A thinking model that spends its whole budget reasoning answers 200 with an
    // EMPTY message and finish_reason "length" — not an error status. Naming that
    // separately matters because the fix is a bigger `max_tokens` or a lower
    // reasoning effort, not a retry.
    logger.error({ hasOutput, finish: finishReason }, "brain llm returned no content");
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

/** Messages API body: system messages hoisted into `system`, the rest as turns. */
function claudeBody(messages: LlmMessage[]) {
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  return {
    model: llmModel(),
    max_tokens: CLAUDE_MAX_TOKENS,
    ...(system ? { system } : {}),
    messages: messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role, content: m.content })),
  };
}

interface ModelOutput {
  content: unknown;
  /** Normalised to the OpenAI vocabulary, so "length" means the budget ran out. */
  finishReason?: string;
  hasOutput: boolean;
}

function openAiOutput(raw: unknown): ModelOutput {
  const json = raw as {
    choices?: Array<{ message?: { content?: unknown }; finish_reason?: string }>;
  } | null;
  return {
    content: json?.choices?.[0]?.message?.content,
    finishReason: json?.choices?.[0]?.finish_reason,
    hasOutput: Boolean(json?.choices?.length),
  };
}

/** Text blocks only: thinking blocks precede the answer and are not part of it. */
function claudeOutput(raw: unknown): ModelOutput {
  const json = raw as {
    content?: Array<{ type?: string; text?: unknown }>;
    stop_reason?: string;
  } | null;
  const blocks = json?.content ?? [];
  const text = blocks
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("");
  return {
    content: text,
    finishReason: json?.stop_reason === "max_tokens" ? "length" : json?.stop_reason,
    hasOutput: blocks.length > 0,
  };
}

/** Made once per process: an empty directory, so no project context loads. */
let cliCwd: string | null = null;

/** One call through `claude -p`. See CLI_DEFAULT_MODEL for why a subprocess. */
function cliComplete(
  binary: string,
  messages: LlmMessage[],
  timeoutMs: number
): Promise<LlmResult> {
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const prompt = messages
    .filter((m) => m.role !== "system")
    .map((m) => m.content)
    .join("\n\n");
  const effort = reasoningEffort();
  const args = [
    "-p",
    "--output-format",
    "json",
    "--model",
    llmModel(),
    "--tools",
    "",
    "--strict-mcp-config",
    "--setting-sources",
    "project",
    "--disable-slash-commands",
    "--no-session-persistence",
    ...(system ? ["--system-prompt", system] : []),
    ...(effort ? ["--effort", effort] : []),
  ];
  cliCwd ??= mkdtempSync(join(tmpdir(), "brain-llm-"));
  const cwd = cliCwd;

  return new Promise((resolve) => {
    // stderr ignored rather than piped: an unread pipe that fills up blocks the child, and
    // every failure is printed as JSON on stdout anyway.
    const child = spawn(binary, args, { cwd, stdio: ["pipe", "pipe", "ignore"] });
    let stdout = "";
    // Resolves on the timer, not on the child's exit: Claude Code handles SIGTERM itself
    // (it exits 143 after running its SessionEnd hooks), so the exit can lag the kill.
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      resolve({ ok: false, reason: "error", detail: `no answer within ${timeoutMs} ms` });
    }, timeoutMs);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => (stdout += chunk));
    child.on("error", (err) => {
      clearTimeout(timer);
      logger.error({ err }, "brain llm: the claude CLI did not start");
      resolve({ ok: false, reason: "error", detail: "the claude CLI did not start" });
    });
    child.on("close", () => {
      clearTimeout(timer);
      resolve(cliOutcome(stdout));
    });
    // A child that never started closes its stdin, and writing to it then raises EPIPE as
    // an unhandled 'error' event. The 'error' handler above already reports the failure.
    child.stdin.on("error", () => {});
    child.stdin.end(prompt);
  });
}

/**
 * What `claude -p --output-format json` printed, as an LlmResult.
 *
 * Measured 2026-09-24 on v2.1.281: EVERY outcome prints one JSON object on stdout, errors
 * included. A failure carries `is_error: true`, the message in `result` and the HTTP status
 * in `api_error_status` (404 for an unknown model, null for "Not logged in"), while
 * `subtype` still reads "success", so `is_error` is the only field that separates them.
 */
export function cliOutcome(stdout: string): LlmResult {
  let json: {
    is_error?: unknown;
    result?: unknown;
    stop_reason?: unknown;
    api_error_status?: unknown;
  } | null = null;
  try {
    json = JSON.parse(stdout);
  } catch {
    json = null;
  }
  if (!json || typeof json !== "object") {
    logger.error({ chars: stdout.length }, "brain llm: the claude CLI printed no result");
    return { ok: false, reason: "error", detail: "the claude CLI printed no result" };
  }
  const text = typeof json.result === "string" ? json.result : "";
  if (json.is_error) {
    const detail = text.slice(0, 300) || "the claude CLI reported an error";
    logger.warn({ status: json.api_error_status, detail }, "brain llm: the claude CLI failed");
    /**
     * A SUBSCRIPTION LIMIT RESETS IN HOURS, so it is reported as the daily kind: no caller
     * should wait for it. Claude Code has already retried a passing 429 itself before it
     * gives up and prints this. The words are matched as well as the status because the
     * one seen in production, "You've hit your session limit · resets 9:40pm (UTC)"
     * (generate-fix, 2026-09-19), was only ever read as text.
     */
    if (json.api_error_status === 429 || /hit your .*limit|usage limit/i.test(text)) {
      return { ok: false, reason: "rate_limited", detail, dailyQuota: true };
    }
    if (json.api_error_status === 529 || /overloaded/i.test(text)) {
      return { ok: false, reason: "overloaded", detail, retryAfterMs: OVERLOAD_RETRY_MS };
    }
    return { ok: false, reason: "error", detail };
  }
  if (!text.trim()) {
    logger.error({}, "brain llm: the claude CLI returned no content");
    return { ok: false, reason: "error", detail: "empty completion" };
  }
  return { ok: true, text: text.trim(), truncated: json.stop_reason === "max_tokens" };
}
