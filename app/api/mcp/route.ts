import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { brainDailyRollup } from "@features/brain/server/ingest/analytics";
import { CorpusUnavailableError, retrieve } from "@features/brain/server/retrieve";
import { supabaseFetch } from "@features/admin/server/supabase";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import logger from "@shared/observability/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/mcp — the company brain as an MCP server.
 *
 * WHY THIS EXISTS AND THE SLACK BOT IS NOT ENOUGH. Marcus and Mark asked for a
 * centralised Claude that can see all the company context, not a second chat
 * product to learn. A Slack bot can only answer from an index; Claude can reason
 * across it, combine it with the live tools it already has, and produce work.
 * This endpoint is the RECALL layer of that design — the part no live tool can
 * provide, because git history and dated business facts are not queryable state.
 *
 * HAND-ROLLED RATHER THAN `mcp-handler`. MCP over Streamable HTTP is JSON-RPC
 * 2.0: a POST in, a JSON object out. This server is stateless and read-only — it
 * never initiates a message, so it needs no SSE stream and no session store, and
 * the whole protocol surface it must implement is `initialize`, `tools/list`,
 * `tools/call` and `ping`. That is smaller than the dependency, matches the house
 * decision to hand-roll rather than add `@slack/web-api` for a couple of calls,
 * and keeps a large branch free of lockfile churn in a repo with a known npm
 * cache problem.
 *
 * AUTH IS A BEARER TOKEN, NOT CSRF. There is no browser and no cookie here, so
 * the double-submit pattern the rest of the app uses cannot apply. Unset token ⇒
 * 503, so this is safe to deploy before the token exists.
 *
 * The connector URL must be `https://www.loveiq.org/api/mcp` — the apex-to-www
 * redirect drops the Authorization header, which presents as a confusing 401.
 */

const PROTOCOL_VERSION = "2025-06-18";

/** Keep a tool result well inside a model's context. Chunks are ≤2400 chars, so
 *  12 of them plus framing is roughly 8k tokens. */
const MAX_RESULT_CHARS = 40_000;

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

function result(id: JsonRpcRequest["id"], value: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, result: value });
}

function rpcError(id: JsonRpcRequest["id"], code: number, message: string) {
  return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
}

/** MCP tool results are content blocks; `isError` lets the model see a failure
 *  as a result rather than a transport error it cannot reason about. */
function textResult(text: string, isError = false) {
  return {
    content: [{ type: "text", text: text.slice(0, MAX_RESULT_CHARS) }],
    isError,
  };
}

const TOOLS = [
  {
    name: "search_company_context",
    description:
      "Search LoveIQ's own written record: repository documentation, every git commit " +
      "(including the plain-English 'For Marcus:' summaries), Jira issues, and dated " +
      "business numbers (funnel, revenue, ad spend, GA4, Search Console). Use this for " +
      "anything historical or written down — why a decision was made, when something " +
      "changed, what a past month's numbers were. It cannot see live state; use the " +
      "Supabase, Stripe, PostHog or Vercel tools for that.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "A question in plain language. Relative periods ('this month', 'last week') " +
            "are resolved to the absolute periods the corpus stores.",
        },
        limit: {
          type: "number",
          description: "How many sources to return. Default 12, maximum 30.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_business_numbers",
    description:
      "The funnel, revenue and ad-spend figures for recent days, straight from the " +
      "database rather than from the search index. Use when you want exact numbers to " +
      "compute with; use search_company_context when you want the narrative around them.",
    inputSchema: {
      type: "object",
      properties: {
        days: {
          type: "number",
          description: "How many days back, from today. Default 30, maximum 120.",
        },
      },
    },
  },
  {
    name: "list_sources",
    description:
      "What the corpus currently holds and how fresh each source is. Use this first when " +
      "an answer looks stale or missing — a source frozen at an old date means its " +
      "ingest has stopped, and its absence is not evidence that the thing does not exist.",
    inputSchema: { type: "object", properties: {} },
  },
];

async function callTool(name: string, args: Record<string, unknown>) {
  if (name === "search_company_context") {
    const query = typeof args.query === "string" ? args.query : "";
    if (query.trim().length < 2) {
      return textResult("Provide a question of at least two characters.", true);
    }
    const limit = Math.min(30, Math.max(1, Number(args.limit) || 12));

    let chunks;
    try {
      chunks = await retrieve(query, limit);
    } catch (err) {
      if (!(err instanceof CorpusUnavailableError)) throw err;
      // Deliberately NOT "no results". Telling a model the corpus is empty when
      // the database is unreachable makes it assert absence with confidence.
      return textResult(
        "The knowledge base is unreachable right now, so I cannot tell you whether it " +
          "contains an answer. This is an outage, not an empty result — do not conclude " +
          "that LoveIQ has no record of this.",
        true
      );
    }
    if (chunks.length === 0) {
      return textResult(
        `Nothing in the indexed corpus matches "${query}". Note that only markdown docs, ` +
          `git commits, Jira and dated business numbers are indexed — source code is not.`
      );
    }

    const rendered = chunks
      .map((c, i) => {
        const forMarcus =
          typeof c.meta?.for_marcus === "string" && c.meta.for_marcus.trim()
            ? `plain-English summary: ${c.meta.for_marcus.trim()}\n`
            : "";
        const url = c.url ? `url: ${c.url}\n` : "";
        return `[${i + 1}] (${c.source}) ${c.title ?? "untitled"}\n${url}${forMarcus}\n${c.body}`;
      })
      .join("\n\n---\n\n");
    return textResult(rendered);
  }

  if (name === "get_business_numbers") {
    const days = Math.min(120, Math.max(1, Number(args.days) || 30));
    const rows = await brainDailyRollup(days);
    if (rows.length === 0) return textResult("No rows for that window.");
    return textResult(JSON.stringify(rows, null, 2));
  }

  if (name === "list_sources") {
    // A FIXED SOURCE LIST, AND EXACT COUNTS.
    //
    // The first version selected 5,000 rows and counted them in JS. PostgREST caps
    // a response at 1,000 rows by default, so it silently reported `commit: 307`
    // against ~1,450 and omitted `gsc` altogether — the counts summed to exactly
    // 1000, which is the tell. `count=exact` returns the true total in
    // Content-Range regardless of how many rows come back.
    //
    // The list is fixed rather than discovered because the point of this tool is
    // to distinguish "this source is stale" from "this source was never
    // ingested". A discovered list cannot show the second case at all: an absent
    // source would simply not appear, which is the exact inference the tool exists
    // to prevent.
    //
    // But a fixed list only covers ONE direction, and the other direction bit us:
    // Notion was ingested (233 chunks, answering searches) while this list still
    // said doc/commit/analytics/ga4/gsc/jira, so the tool reported a corpus that
    // did not include the company board — a confident, wrong answer to "what do
    // you have access to". Hence the probe below: anything present in the table
    // but missing from this list is named explicitly rather than silently
    // dropped. Add a source here when you add an ingester; if you forget, the
    // probe says so instead of the tool lying.
    const SOURCES = ["doc", "commit", "analytics", "ga4", "gsc", "jira", "notion"];

    const describe = async (source: string): Promise<string> => {
      const base = `/rest/v1/brain_chunk?source=eq.${encodeURIComponent(source)}`;
      const newest = await supabaseFetch(
        `${base}&select=period_end&order=period_end.desc.nullslast&limit=1`,
        { headers: { Prefer: "count=exact" } }
      );
      if (!newest.ok) return `${source}: could not be read`;
      const total = newest.headers.get("content-range")?.split("/")[1] ?? "?";
      if (total === "0") return `${source}: 0 chunks — NEVER INGESTED`;

      const rows = (await newest.json().catch(() => [])) as Array<{ period_end?: string | null }>;
      const period = rows?.[0]?.period_end ?? null;

      const last = await supabaseFetch(`${base}&select=updated_at&order=updated_at.desc&limit=1`);
      const lastRows = last.ok
        ? ((await last.json().catch(() => [])) as Array<{ updated_at?: string }>)
        : [];
      const ingested = lastRows?.[0]?.updated_at?.slice(0, 10) ?? "?";

      return `${source}: ${total} chunks · newest period ${period ?? "n/a (docs carry no period)"} · last ingested ${ingested}`;
    };

    const lines = await Promise.all(SOURCES.map(describe));

    // Name anything in the table that SOURCES forgot. Postgres aggregates are
    // disabled on this instance (PGRST123), so this is a plain `not.in` scan
    // rather than a DISTINCT; unlisted sources are a bug, so the row count is
    // tiny in practice and the limit only bounds the pathological case.
    const unlisted = await supabaseFetch(
      `/rest/v1/brain_chunk?select=source&source=not.in.(${SOURCES.join(",")})&limit=200`
    );
    if (unlisted.ok) {
      const rows = (await unlisted.json().catch(() => [])) as Array<{ source?: string }>;
      const names = [...new Set(rows.map((r) => r.source).filter(Boolean))].sort();
      if (names.length > 0) {
        lines.push(
          `${names.join(", ")}: present in the corpus but MISSING from this tool's source list — ` +
            `the counts above are incomplete, and this is a bug worth reporting.`
        );
      }
    }

    return textResult(
      `${lines.join("\n")}\n\nA source showing NEVER INGESTED has no data at all — its silence is ` +
        `not evidence that the thing does not exist. A source whose newest period is old has ` +
        `stopped updating.`
    );
  }

  return textResult(`Unknown tool: ${name}`, true);
}

export async function POST(request: Request) {
  const expected = process.env.LOVEIQ_MCP_TOKEN;
  if (!expected) {
    logger.warn("LOVEIQ_MCP_TOKEN not set — refusing MCP request");
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }

  const auth = request.headers.get("authorization") ?? "";
  const presented = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  // The comment here used to claim timingSafeEqual while the code did a plain
  // `!==`, which short-circuits on the first differing byte and so leaks the
  // shared token's prefix to anyone who can time responses. Now it does what it
  // says. The length check stays FIRST because timingSafeEqual throws outright on
  // unequal buffer lengths — and length is not a secret worth protecting here.
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  // The corpus is undifferentiated — revenue, ad spend, every internal doc — and
  // one token is shared by the team, so a leaked token is the whole thing. A rate
  // limit bounds how fast that could be drained.
  const rate = await checkRateLimit(getClientIp(request), {
    bucket: "mcp",
    limit: 120,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const body = (await request.json().catch(() => null)) as JsonRpcRequest | null;
  if (!body || typeof body.method !== "string") {
    return rpcError(body?.id ?? null, -32600, "Invalid Request");
  }
  const { id, method, params = {} } = body;

  // Notifications carry no id and expect no response body.
  if (method.startsWith("notifications/")) return new NextResponse(null, { status: 202 });

  if (method === "initialize") {
    return result(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: "loveiq-brain", version: "1.0.0" },
      instructions:
        "LoveIQ's own written record: documentation, git history, Jira and dated business " +
        "numbers. Prefer this for anything historical or already decided. It holds history, " +
        "not live state — for current values use the Supabase, Stripe, PostHog or Vercel tools.",
    });
  }

  if (method === "ping") return result(id, {});
  if (method === "tools/list") return result(id, { tools: TOOLS });

  if (method === "tools/call") {
    const name = typeof params.name === "string" ? params.name : "";
    const args = (params.arguments ?? {}) as Record<string, unknown>;
    try {
      return result(id, await callTool(name, args));
    } catch (err) {
      logger.error({ err, tool: name }, "MCP tool call failed");
      // Returned as a tool RESULT, not a protocol error: the model can then say
      // what went wrong instead of the client showing a bare transport failure.
      return result(id, textResult("That lookup failed. It has been logged.", true));
    }
  }

  return rpcError(id, -32601, `Method not found: ${method}`);
}
