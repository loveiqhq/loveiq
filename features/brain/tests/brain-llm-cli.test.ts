import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const spawn = vi.fn();
vi.mock("node:child_process", () => ({ spawn: (...args: unknown[]) => spawn(...args) }));

const fetchWithTimeout = vi.fn();
vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: (...args: unknown[]) => fetchWithTimeout(...args),
}));

import { cliOutcome, complete, isLlmConfigured, llmModel } from "@features/brain/server/llm";

/**
 * The brief and the miner run on the Team subscription through `claude -p` rather than a
 * billed API key. The shapes below are what v2.1.281 actually printed on 2026-09-24,
 * trimmed to the fields that matter.
 */
const MESSAGES = [
  { role: "system" as const, content: "You are the company brain." },
  { role: "system" as const, content: "Answer from the sources only." },
  { role: "user" as const, content: "Sources:\n\n[1] a decision" },
  { role: "user" as const, content: "Question: What did we decide?" },
];

const printed = (fields: Record<string, unknown>) =>
  JSON.stringify({ type: "result", subtype: "success", is_error: false, ...fields });

/** A child that prints `stdout` once its stdin closes and then exits; null never answers. */
function fakeChild(stdout: string | null) {
  const child = Object.assign(new EventEmitter(), {
    stdout: Object.assign(new EventEmitter(), { setEncoding: vi.fn() }),
    stdin: Object.assign(new EventEmitter(), { end: vi.fn() }),
    kill: vi.fn(),
  });
  child.stdin.end.mockImplementation(() => {
    if (stdout === null) return;
    queueMicrotask(() => {
      child.stdout.emit("data", stdout);
      child.emit("close", 0, null);
    });
  });
  return child;
}

function call() {
  const [binary, args, options] = spawn.mock.calls.at(-1)!;
  return {
    binary: binary as string,
    args: args as string[],
    cwd: (options as { cwd: string }).cwd,
  };
}

/** The value that follows `flag`, so a test pins pairs rather than loose words. */
const after = (args: string[], flag: string) => args[args.indexOf(flag) + 1];

describe("complete() through the claude CLI", () => {
  beforeEach(() => {
    spawn.mockReset();
    fetchWithTimeout.mockReset();
    process.env.BRAIN_LLM_CLI = "claude";
    delete process.env.BRAIN_LLM_KEY;
    delete process.env.BRAIN_LLM_BASE_URL;
    delete process.env.BRAIN_LLM_MODEL;
    delete process.env.BRAIN_LLM_REASONING_EFFORT;
  });
  afterEach(() => {
    delete process.env.BRAIN_LLM_CLI;
    delete process.env.BRAIN_LLM_KEY;
    delete process.env.BRAIN_LLM_MODEL;
    delete process.env.BRAIN_LLM_REASONING_EFFORT;
  });

  it("asks one turn of claude -p with no tools, no MCP servers and our own system prompt", async () => {
    const child = fakeChild(printed({ result: "Ship it.", stop_reason: "end_turn" }));
    spawn.mockReturnValue(child);

    expect(await complete(MESSAGES)).toEqual({ ok: true, text: "Ship it.", truncated: false });

    const { binary, args, cwd } = call();
    expect(binary).toBe("claude");
    expect(args[0]).toBe("-p");
    expect(after(args, "--output-format")).toBe("json");
    expect(after(args, "--tools")).toBe("");
    expect(args).toContain("--strict-mcp-config");
    expect(after(args, "--setting-sources")).toBe("project");
    expect(after(args, "--system-prompt")).toBe(
      "You are the company brain.\n\nAnswer from the sources only."
    );
    // The sources and the question go on stdin, never into argv or the system prompt.
    expect(child.stdin.end).toHaveBeenCalledWith(
      "Sources:\n\n[1] a decision\n\nQuestion: What did we decide?"
    );
    // Run from an empty directory, so a checkout's CLAUDE.md, hooks and .mcp.json stay out.
    expect(cwd).toMatch(/brain-llm-/);
  });

  it("needs no API key, and a leftover key does not pull calls back to the HTTP API", async () => {
    delete process.env.BRAIN_LLM_CLI;
    expect(isLlmConfigured()).toBe(false);
    process.env.BRAIN_LLM_CLI = "claude";
    expect(isLlmConfigured()).toBe(true);

    process.env.BRAIN_LLM_KEY = "AIza-leftover-gemini-key";
    spawn.mockReturnValue(fakeChild(printed({ result: "ok", stop_reason: "end_turn" })));
    await complete(MESSAGES);
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(fetchWithTimeout).not.toHaveBeenCalled();
  });

  it("defaults to the sonnet alias and honours BRAIN_LLM_MODEL", async () => {
    expect(llmModel()).toBe("sonnet");
    spawn.mockReturnValue(fakeChild(printed({ result: "ok", stop_reason: "end_turn" })));
    await complete(MESSAGES);
    expect(after(call().args, "--model")).toBe("sonnet");

    process.env.BRAIN_LLM_MODEL = "haiku";
    spawn.mockReturnValue(fakeChild(printed({ result: "ok", stop_reason: "end_turn" })));
    await complete(MESSAGES);
    expect(after(call().args, "--model")).toBe("haiku");
  });

  it("passes an effort level only when one is configured", async () => {
    spawn.mockReturnValue(fakeChild(printed({ result: "ok", stop_reason: "end_turn" })));
    await complete(MESSAGES);
    expect(call().args).not.toContain("--effort");

    process.env.BRAIN_LLM_REASONING_EFFORT = "low";
    spawn.mockReturnValue(fakeChild(printed({ result: "ok", stop_reason: "end_turn" })));
    await complete(MESSAGES);
    expect(after(call().args, "--effort")).toBe("low");
  });

  it("gives up at the timeout and kills a CLI that never answers", async () => {
    const child = fakeChild(null);
    spawn.mockReturnValue(child);
    expect(await complete(MESSAGES, 20)).toEqual({
      ok: false,
      reason: "error",
      detail: "no answer within 20 ms",
    });
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
  });

  it("reports a CLI that cannot start as an error rather than crashing", async () => {
    const child = fakeChild(null);
    spawn.mockReturnValue(child);
    child.stdin.end.mockImplementation(() =>
      queueMicrotask(() => child.emit("error", new Error("spawn claude ENOENT")))
    );
    expect(await complete(MESSAGES)).toEqual({
      ok: false,
      reason: "error",
      detail: "the claude CLI did not start",
    });
  });
});

describe("cliOutcome", () => {
  it("marks an answer cut off by the output budget as truncated", () => {
    expect(cliOutcome(printed({ result: "Half an ans", stop_reason: "max_tokens" }))).toEqual({
      ok: true,
      text: "Half an ans",
      truncated: true,
    });
  });

  /**
   * `subtype` reads "success" on these failures too, so a check on it would pass every
   * one of them straight through as an answer.
   */
  it("treats is_error as a failure whatever subtype says, keeping the message", () => {
    expect(
      cliOutcome(
        printed({
          is_error: true,
          api_error_status: null,
          result: "Not logged in · Please run /login",
        })
      )
    ).toEqual({ ok: false, reason: "error", detail: "Not logged in · Please run /login" });
    expect(
      cliOutcome(
        printed({
          is_error: true,
          api_error_status: 404,
          result: "There's an issue with the selected model (claude-nonexistent-9).",
        })
      )
    ).toMatchObject({ ok: false, reason: "error" });
  });

  it("reports a subscription limit as the daily kind, which no caller waits out", () => {
    const worded = cliOutcome(
      printed({
        is_error: true,
        api_error_status: null,
        result: "You've hit your session limit · resets 9:40pm (UTC)",
      })
    );
    expect(worded).toMatchObject({ ok: false, reason: "rate_limited", dailyQuota: true });
    expect(worded).not.toHaveProperty("retryAfterMs");

    expect(
      cliOutcome(printed({ is_error: true, api_error_status: 429, result: "Rate limited" }))
    ).toMatchObject({ ok: false, reason: "rate_limited", dailyQuota: true });
  });

  it("reports an overloaded model as worth a short wait, by status or by wording", () => {
    const res = cliOutcome(
      printed({ is_error: true, api_error_status: 529, result: "API Error: repeated failures" })
    );
    expect(res).toMatchObject({ ok: false, reason: "overloaded" });
    expect(res.ok === false && res.retryAfterMs).toBeGreaterThan(0);
    expect(
      cliOutcome(printed({ is_error: true, api_error_status: null, result: "Overloaded" }))
    ).toMatchObject({ ok: false, reason: "overloaded" });
  });

  it("refuses output that is not the result object, and an empty answer", () => {
    expect(cliOutcome("")).toMatchObject({ ok: false, reason: "error" });
    expect(cliOutcome("Error: something went wrong")).toMatchObject({ ok: false, reason: "error" });
    expect(cliOutcome(printed({ result: "   ", stop_reason: "end_turn" }))).toEqual({
      ok: false,
      reason: "error",
      detail: "empty completion",
    });
  });
});
