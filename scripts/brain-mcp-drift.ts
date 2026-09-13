/**
 * Does the DEPLOYED brain match this repo?
 *
 * Every other check in this repo — the unit tests, both battery arms — imports the
 * route module and calls it in-process. claude.ai does not: it talks to whatever is
 * deployed, which is a different thing whenever a deploy has not happened, has
 * failed, or has landed from a different branch. The gap is invisible by
 * construction, and it has already bitten once: the pricing clause was missing from
 * the deployed `instructions` string while being present in the repo, so the model
 * in production was working from an older brief than the one under test.
 *
 * Compares what the model actually reads — the instructions, every tool's
 * description, and every tool's parameter names — and exits non-zero on any
 * difference, so it can gate a deploy rather than merely inform one.
 *
 *   npm run brain:drift                 # against production
 *   MCP_URL=https://... npm run brain:drift
 */
const URL_UNDER_TEST = process.env.MCP_URL ?? "https://www.loveiq.org/api/mcp";

type Tool = {
  name: string;
  description?: string;
  inputSchema?: { properties?: Record<string, unknown> };
};

async function rpc(method: string, params: unknown = {}): Promise<Record<string, unknown>> {
  const res = await fetch(URL_UNDER_TEST, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${process.env.LOVEIQ_MCP_TOKEN}`,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} -> HTTP ${res.status}: ${text.slice(0, 200)}`);
  // A Streamable-HTTP server may answer as SSE even to a plain POST.
  const json = text.startsWith("data:")
    ? text
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trim())
        .join("")
    : text;
  const body = JSON.parse(json) as { result?: Record<string, unknown>; error?: unknown };
  if (body.error) throw new Error(`${method} -> ${JSON.stringify(body.error).slice(0, 200)}`);
  return body.result ?? {};
}

/** First place the two strings differ, with a little either side. Whole descriptions
 *  are paragraphs; printing both in full buries the one word that changed. */
function firstDifference(a: string, b: string): string {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  const at = Math.max(0, i - 30);
  return `at char ${i}\n        repo:     …${a.slice(at, i + 50)}…\n        deployed: …${b.slice(at, i + 50)}…`;
}

async function main() {
  if (!process.env.LOVEIQ_MCP_TOKEN) {
    console.error("LOVEIQ_MCP_TOKEN is not set, so the deployed brain cannot be opened.");
    process.exit(1);
  }
  const { TOOLS, MCP_INSTRUCTIONS } = (await import("@/app/api/mcp/route")) as unknown as {
    TOOLS: Tool[];
    MCP_INSTRUCTIONS?: string;
  };

  console.log(`repo  : ${TOOLS.length} tools`);
  const init = await rpc("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "drift-check", version: "1" },
  });
  const live = ((await rpc("tools/list")).tools ?? []) as Tool[];
  console.log(`live  : ${live.length} tools at ${URL_UNDER_TEST}\n`);

  const drift: string[] = [];
  const byName = new Map(live.map((t) => [t.name, t]));

  for (const repoTool of TOOLS) {
    const liveTool = byName.get(repoTool.name);
    if (!liveTool) {
      drift.push(`${repoTool.name}: in the repo, NOT deployed — no caller can reach it yet`);
      continue;
    }
    const repoParams = Object.keys(repoTool.inputSchema?.properties ?? {}).sort();
    const liveParams = Object.keys(liveTool.inputSchema?.properties ?? {}).sort();
    const missing = repoParams.filter((p) => !liveParams.includes(p));
    const extra = liveParams.filter((p) => !repoParams.includes(p));
    if (missing.length) {
      drift.push(
        `${repoTool.name}: deployed is MISSING ${missing.map((p) => `\`${p}\``).join(", ")} — ` +
          `a caller reading the live schema cannot know the parameter exists`
      );
    }
    if (extra.length) {
      drift.push(
        `${repoTool.name}: deployed still OFFERS ${extra.map((p) => `\`${p}\``).join(", ")}, ` +
          `which this repo has removed — callers are being told about a dead parameter`
      );
    }
    if ((repoTool.description ?? "") !== (liveTool.description ?? "")) {
      drift.push(
        `${repoTool.name}: description differs — this is the text the model reads to ` +
          `decide whether to call the tool\n        ` +
          firstDifference(repoTool.description ?? "", liveTool.description ?? "")
      );
    }
  }
  for (const liveTool of live) {
    if (!TOOLS.some((t) => t.name === liveTool.name)) {
      drift.push(`${liveTool.name}: deployed but NOT in the repo — nothing here tests it`);
    }
  }

  const liveInstructions = String(init.instructions ?? "");
  if (MCP_INSTRUCTIONS !== undefined && MCP_INSTRUCTIONS !== liveInstructions) {
    drift.push(
      "instructions: the server's own brief differs — the deployed model is working " +
        "from a different set of rules than the one under test\n        " +
        firstDifference(MCP_INSTRUCTIONS, liveInstructions)
    );
  } else if (MCP_INSTRUCTIONS === undefined) {
    console.log("note  : the route does not export MCP_INSTRUCTIONS, so the brief is unchecked\n");
  }

  if (!drift.length) {
    console.log("No drift: the deployed brain matches this repo.");
    return;
  }
  console.log(`DRIFT — ${drift.length} difference(s) between this repo and what is deployed:\n`);
  for (const d of drift) console.log(`  - ${d}`);
  console.log(
    "\nA deploy has not landed, or landed from another branch. Everything the tests " +
      "and batteries prove is about the repo, not about what claude.ai is talking to."
  );
  process.exitCode = 1;
}

void main()
  .catch((err) => {
    console.error(`Could not compare: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  })
  .finally(() => {
    // Importing the route keeps enough of Next alive that the process never ends
    // by itself. Every other script here exits explicitly for the same reason.
    process.exit(process.exitCode ?? 0);
  });
