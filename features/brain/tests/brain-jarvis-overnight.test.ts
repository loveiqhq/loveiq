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
      env: { PATH: process.env.PATH ?? "", CLAUDE_PROJECT_DIR: "/nonexistent", ...env },
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

  it("prints nothing without a token, when nothing is new, or when the brain fails", async () => {
    const url = await serve(() =>
      result("Nothing new since 2026-09-24: no notices, research answers or decisions.")
    );
    expect(await run({ BRAIN_MCP_URL: url })).toBe("");
    expect(await run({ BRAIN_MCP_URL: url, LOVEIQ_MCP_TOKEN: "t" })).toBe("");
    expect(await run({ BRAIN_MCP_URL: "http://127.0.0.1:9/api/mcp", LOVEIQ_MCP_TOKEN: "t" })).toBe(
      ""
    );
  });
});
