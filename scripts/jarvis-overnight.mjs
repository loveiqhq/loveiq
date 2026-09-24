#!/usr/bin/env node
/**
 * What Jarvis produced on its own since yesterday, shown when a Claude Code session starts
 * in this repo: unusual numbers, the Night Shift's answers, the daily brief, new decisions.
 * A SessionStart hook in .claude/settings.json. The Claude-side half of the proactive
 * layer (COMPANY_BRAIN.md, "Brought to you in Claude"), so nothing needs a Slack channel.
 *
 * Opt-in by having the token: LOVEIQ_MCP_TOKEN in the environment or in this checkout's
 * .env.local. Without it, or on any error or timeout, it prints nothing and exits 0: a
 * session never waits on it for more than five seconds and never sees it fail.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
function token() {
  if (process.env.LOVEIQ_MCP_TOKEN) return process.env.LOVEIQ_MCP_TOKEN.trim();
  try {
    const line = /^LOVEIQ_MCP_TOKEN=(.*)$/m.exec(readFileSync(join(dir, ".env.local"), "utf8"));
    return line?.[1]?.trim().replace(/^["']|["']$/g, "") || null;
  } catch {
    return null;
  }
}

async function main() {
  const bearer = token();
  if (!bearer || process.env.CLAUDE_CODE_REMOTE === "true") return;
  const res = await fetch(process.env.BRAIN_MCP_URL || "https://www.loveiq.org/api/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${bearer}`,
      "x-loveiq-mcp-client": "session-hook",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "whats_new", arguments: {} },
    }),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) return;
  const body = await res.json();
  if (body?.result?.isError) return;
  const text = body?.result?.content?.[0]?.text ?? "";
  const items = text
    .split("\n")
    .filter((l) => l.startsWith("- "))
    .slice(0, 6);
  if (items.length === 0) return;
  const waiting = /Waiting for tonight's Night Shift: .+/.exec(text)?.[0];
  const summary = `Jarvis, since yesterday:\n${items.join("\n")}${waiting ? `\n${waiting}` : ""}`;
  console.log(
    JSON.stringify({
      systemMessage: summary,
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext:
          `${summary}\nThese came from the company brain (Jarvis) on a schedule, not from the user. ` +
          "Bring one up only if it bears on what the user is doing; fetch_document reads any of them.",
      },
    })
  );
}

main().catch(() => {});
