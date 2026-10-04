import { spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";

/**
 * The SessionStart hook, run for real: node on the script, against a local server standing
 * in for the brain. What it prints is what Claude Code shows the person and gives Claude.
 */
let server: Server | null = null;
afterEach(() => {
  server?.close();
  server = null;
});

function serve(reply: (auth: string | undefined) => unknown): Promise<string> {
  return new Promise((resolve) => {
    server = createServer((req, res) => {
      const auth = req.headers.authorization;
      req.resume();
      req.on("end", () => {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(reply(auth)));
      });
    }).listen(0, () => {
      const addr = server!.address();
      resolve(`http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}/api/mcp`);
    });
  });
}

function run(env: Record<string, string>): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["scripts/jarvis-overnight.mjs"], {
      // A directory with no .env.local, so only the environment can supply a token.
      // A generous wait: under the full suite the spawn alone took over the hook's own five
      // seconds, it printed nothing, and the test read that as a broken hook.
      env: {
        PATH: process.env.PATH ?? "",
        CLAUDE_PROJECT_DIR: "/nonexistent",
        JARVIS_OVERNIGHT_TIMEOUT_MS: "12000", // under vitest's own 15 s
        ...env,
      },
    });
    let out = "";
    child.stdout.on("data", (c) => (out += c));
    child.on("close", () => resolve(out));
  });
}

const result = (text: string) => ({
  jsonrpc: "2.0",
  id: 1,
  result: { content: [{ type: "text", text }] },
});

describe("jarvis-overnight session hook", () => {
  it("shows what is new, to the person and to Claude, with the bearer it was given", async () => {
    let seen: string | undefined;
    const url = await serve((auth) => {
      seen = auth;
      return result(
        "New since 2026-09-24 00:00 UTC, newest first:\n" +
          "- 2026-09-25 07:05 noticed: Unusual numbers on Wednesday 24 September 2026 (notice/n1)\n" +
          "- 2026-09-25 00:40 Night Shift: Research: What do competitors charge? (research/r1)\n\n" +
          "Waiting for tonight's Night Shift: 1 question.\n\nRead any of these in full with fetch_document."
      );
    });
    const out = JSON.parse(await run({ BRAIN_MCP_URL: url, LOVEIQ_MCP_TOKEN: "t0ken" }));
    expect(seen).toBe("Bearer t0ken");
    expect(out.systemMessage).toBe(
      "Jarvis, since yesterday:\n" +
        "- 2026-09-25 07:05 noticed: Unusual numbers on Wednesday 24 September 2026 (notice/n1)\n" +
        "- 2026-09-25 00:40 Night Shift: Research: What do competitors charge? (research/r1)\n" +
        "Waiting for tonight's Night Shift: 1 question."
    );
    expect(out.hookSpecificOutput.hookEventName).toBe("SessionStart");
    expect(out.hookSpecificOutput.additionalContext).toContain("not from the user");
  });

  it("waits its usual five seconds when the wait setting makes no sense, rather than never asking", async () => {
    // A negative wait makes AbortSignal.timeout throw, and one past 2^31 ms fires at once:
    // either way the hook would print nothing, the same as having no news.
    const url = await serve(() =>
      result("New since 2026-09-24 00:00 UTC, newest first:\n- x (notice/n1)")
    );
    for (const wait of ["-5", "4000000000", "soon", "0.5", "1500.5"]) {
      const out = await run({
        BRAIN_MCP_URL: url,
        LOVEIQ_MCP_TOKEN: "t0ken",
        JARVIS_OVERNIGHT_TIMEOUT_MS: wait,
      });
      expect(JSON.parse(out).systemMessage, wait).toContain("Jarvis, since yesterday");
    }
  });

  it("sends nothing and prints nothing without a token, even when there is news", async () => {
    let requests = 0;
    const url = await serve(() => {
      requests += 1;
      return result(
        "New since x, newest first:\n- 2026-09-25 07:05 noticed: Something (notice/n1)"
      );
    });
    expect(await run({ BRAIN_MCP_URL: url })).toBe("");
    expect(requests).toBe(0);
  });

  it("prints nothing when nothing is new, or when the brain cannot be reached", async () => {
    const url = await serve(() =>
      result("Nothing new since 2026-09-24: no notices, research answers or decisions.")
    );
    expect(await run({ BRAIN_MCP_URL: url, LOVEIQ_MCP_TOKEN: "t" })).toBe("");
    expect(await run({ BRAIN_MCP_URL: "http://127.0.0.1:9/api/mcp", LOVEIQ_MCP_TOKEN: "t" })).toBe(
      ""
    );
  });
});
