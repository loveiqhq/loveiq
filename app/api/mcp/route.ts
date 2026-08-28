import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
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
      "(including the plain-English 'For Marcus:' summaries), the Notion workspace — both " +
      "the team board with each task's status, priority and assignee, and the written " +
      "pages — and dated business numbers (funnel, revenue, ad spend, GA4, Search " +
      "Console). Use this for " +
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
    name: "list_product_tables",
    description:
      "Every table and view in LoveIQ's own database with its columns, plus all 63 analysis " +
      "functions with their argument names and types — a trailing '!' marks an argument that " +
      "is required. Call this before query_product_data so you filter on columns that exist " +
      "and pass the arguments a function needs. This is LIVE state — payments, emails sent, " +
      "bookings, survey submissions, reports, funnel events — not the indexed corpus.",
    inputSchema: {
      type: "object",
      properties: {
        match: {
          type: "string",
          description:
            "Optional substring to narrow the list, e.g. 'payment', 'email', 'booking'. " +
            "Omit to see everything.",
        },
      },
    },
  },
  {
    name: "query_product_data",
    description:
      "Read any table, view or analysis function in LoveIQ's database, live and with full " +
      "history. This is how you answer questions the indexed corpus cannot: Resend " +
      "deliverability (resend_webhook_event, email_suppression), Stripe payments and " +
      "refunds (payment, payment_item, payment_webhook_event), Calendly bookings " +
      "(booking_event), survey submissions and answers, reports, shares, invites, the " +
      "waitlist, marketing spend, and the admin tables. Read-only by construction. " +
      "Prefer an rpc/get_* function when one matches the question \u2014 they encode the " +
      "business logic already. Use search_company_context instead for anything written " +
      "down or historical narrative.",
    inputSchema: {
      type: "object",
      properties: {
        table: {
          type: "string",
          description: "Table, view, or 'rpc/<function>' from list_product_tables.",
        },
        select: {
          type: "string",
          description:
            "PostgREST select list, e.g. 'id,created_date_time,amount'. Default '*'. " +
            "Naming columns rather than '*' keeps large tables inside the result cap.",
        },
        filters: {
          type: "array",
          items: { type: "string" },
          description:
            "PostgREST filters, one per entry, e.g. 'created_date_time=gte.2026-08-01', " +
            "'status=eq.paid', 'email=like.*@loveiq.org'.",
        },
        order: {
          type: "string",
          description:
            "e.g. 'created_date_time.desc'. Strongly recommended \u2014 without it the order is arbitrary.",
        },
        limit: { type: "number", description: "Rows to return. Default 100, maximum 1000." },
        offset: { type: "number", description: "Rows to skip, for paging past the cap." },
        params: {
          type: "object",
          description: "Arguments for an rpc/ function, as an object.",
        },
      },
      required: ["table"],
    },
  },
  {
    name: "query_external_service",
    description:
      "Read any GET endpoint of the outside services LoveIQ runs on: Stripe (charges, " +
      "disputes, refunds, payouts, balance, customers), Resend (domains, audiences), Slack " +
      "(channel list and message history), GitHub (issues, pull requests, releases, CI " +
      "runs), PostHog (product analytics, when configured). Read-only, and the API keys " +
      "stay on the server. Use this for what those services know that our own database " +
      "does not — dispute detail, a Slack discussion, an open pull request. For payments " +
      "and email events we already store, query_product_data is faster and has full history.",
    inputSchema: {
      type: "object",
      properties: {
        service: {
          type: "string",
          enum: ["stripe", "resend", "slack", "github", "posthog"],
          description: "Which service to read.",
        },
        path: {
          type: "string",
          description:
            "Path within that service's API, e.g. '/charges' or '/disputes' for stripe, " +
            "'/domains' for resend, '/conversations.list' for slack, " +
            "'/repos/loveiqhq/loveiq/issues' for github.",
        },
        params: {
          type: "object",
          description:
            "Query-string parameters, e.g. {limit: 10, created: {gte: 1756000000}} for " +
            "stripe, {channel: 'C123', limit: 50} for slack. Nested objects are flattened " +
            "into Stripe's bracket syntax.",
        },
      },
      required: ["service", "path"],
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

/**
 * Table → column names, straight from PostgREST's OpenAPI document.
 *
 * One request describes all 146 tables, views and functions, which beats both
 * hardcoding a list (it goes stale the moment a migration lands) and querying
 * information_schema (needs a function we would have to add). Cached per lambda
 * instance: the schema changes on deploy, and a deploy replaces the instance.
 */

/**
 * READ-ONLY GATEWAY TO THE OUTSIDE SERVICES LOVEIQ USES.
 *
 * One tool with a fixed registry rather than a tool per service, because the
 * shape is identical every time — a base URL, a bearer token that must never
 * leave the server, and GET. Adding a service is one entry; the safety
 * properties are proven once.
 *
 * WHY A REGISTRY AND NOT A URL PARAMETER. A tool taking an arbitrary URL is an
 * SSRF hole: the caller could point it at the Supabase service-role endpoint, at
 * a cloud metadata address, or at anything on the deployment's network. Here the
 * host is never caller-controlled — only the path within a known API.
 *
 * GET ONLY, enforced here rather than trusted from the caller. These keys can
 * refund charges and send mail; the tool exists to read.
 *
 * `envKey: null` means the API needs no credential (the repo is public).
 */
export const EXTERNAL_SERVICES: Record<
  string,
  {
    base: string;
    /** Tried in order; the first one set wins. Lets a service prefer a
     *  read-scoped token and fall back to a broader one. */
    envKeys: string[];
    auth: "bearer" | "token" | "query";
    /** true when the API is readable WITHOUT the credential and the token only
     *  raises a rate limit. The repository is public, so GitHub is the case. */
    optional?: boolean;
    note: string;
  }
> = {
  stripe: {
    base: "https://api.stripe.com/v1",
    envKeys: ["STRIPE_SECRET_KEY"],
    auth: "bearer",
    note: "Charges, disputes, refunds, payouts, balance, customers, invoices, promotion codes. Use for what Stripe knows and our database does not — dispute detail, payout timing, coupon redemption counts.",
  },
  resend: {
    base: "https://api.resend.com",
    envKeys: ["RESEND_API_KEY"],
    auth: "bearer",
    note: "Domains and their DNS/verification state, audiences and contacts, and a single email by id. Per-message delivery events are already in resend_webhook_event, so prefer query_product_data for bounce and open rates.",
  },
  slack: {
    base: "https://slack.com/api",
    // The BRAIN bot first, deliberately. Adding read scopes to SLACK_BOT_TOKEN
    // would force a reinstall of the app that drives the live journey messages,
    // and CLAUDE.md is explicit that this is not worth the risk. The brain app
    // exists precisely to hold read scopes.
    envKeys: ["SLACK_BRAIN_BOT_TOKEN", "SLACK_BOT_TOKEN"],
    auth: "bearer",
    note: "conversations.list, conversations.history, conversations.replies, users.list. Reads only channels the bot is in, and only with the scopes it holds — a missing scope returns ok:false with missing_scope rather than an error.",
  },
  github: {
    base: "https://api.github.com",
    envKeys: ["GITHUB_TOKEN"],
    auth: "token",
    optional: true,
    note: "Issues, pull requests, reviews, releases and workflow runs for loveiqhq/loveiq. The repository is public, so this works with no credential; a token only raises the rate limit.",
  },
  posthog: {
    base: "https://eu.posthog.com/api",
    envKeys: ["POSTHOG_API_KEY"],
    auth: "bearer",
    note:
      "Product analytics, feature flags, session recordings, saved insights, and the query " +
      "endpoint. Our project is 244778 on the EU host — the same key is rejected by the US " +
      "host, and the error says authentication_failed rather than anything about the region.",
  },
};

let schemaCache: Map<string, string[]> | null = null;

async function productSchema(): Promise<Map<string, string[]> | null> {
  if (schemaCache) return schemaCache;

  // Never throw: every caller treats null as "could not check", and a schema
  // read that fails must degrade the tool rather than fail the whole call. This
  // exact request timed out in production on first use — 8s default against a
  // 490 KB document PostgREST regenerates per request — and the thrown error
  // surfaced to the user as an opaque "That lookup failed".
  let res: Awaited<ReturnType<typeof supabaseFetch>>;
  try {
    res = await supabaseFetch("/rest/v1/", {
      headers: { Accept: "application/openapi+json" },
      timeoutMs: 30_000,
    });
  } catch (err) {
    logger.warn({ err }, "mcp: could not read the database schema");
    return null;
  }
  if (!res.ok) return null;
  const spec = (await res.json().catch(() => null)) as {
    definitions?: Record<string, { properties?: Record<string, unknown> }>;
    paths?: Record<string, unknown>;
  } | null;
  if (!spec) return null;

  const out = new Map<string, string[]>();
  for (const [name, def] of Object.entries(spec.definitions ?? {})) {
    out.set(name, Object.keys(def.properties ?? {}));
  }

  // Functions have no `definitions` entry; they appear only as /rpc/<name> paths,
  // with their arguments in the POST body schema. Listing them as "(function)"
  // made all 63 unusable — `rpc/get_conversion_funnel` needs `since_ts` and a
  // caller has no way to discover that, so the call fails with PGRST202 and the
  // analysis functions that encode our business logic go unused. A trailing `!`
  // marks a required argument.
  for (const [path, def] of Object.entries(spec.paths ?? {})) {
    const key = path.replace(/^\//, "");
    if (!key.startsWith("rpc/") || out.has(key)) continue;
    const body = (
      def as {
        post?: {
          parameters?: Array<{
            in?: string;
            schema?: { properties?: Record<string, { format?: string }>; required?: string[] };
          }>;
        };
      }
    ).post?.parameters?.find((param) => param.in === "body")?.schema;
    const required = new Set(body?.required ?? []);
    const args = Object.entries(body?.properties ?? {}).map(
      ([argName, argDef]) =>
        `${argName}${required.has(argName) ? "!" : ""}: ${argDef.format ?? "?"}`
    );
    out.set(key, args.length > 0 ? args : ["(no arguments)"]);
  }
  schemaCache = out;
  return out;
}

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

  if (name === "list_product_tables") {
    const spec = await productSchema();
    if (!spec) {
      return textResult(
        "Could not read the database schema just now, so I cannot list the tables. This is a " +
          "transient failure, not an empty database — retry, or call query_product_data " +
          "directly if you already know the table name.",
        true
      );
    }
    const match = typeof args.match === "string" ? args.match.toLowerCase().trim() : "";
    const lines = [...spec.entries()]
      .filter(([table]) => !match || table.toLowerCase().includes(match))
      .map(([table, cols]) => `${table}(${cols.join(", ")})`);
    if (lines.length === 0) {
      return textResult(
        `No table matches "${match}". Call list_product_tables with no argument to see all ${spec.size}.`
      );
    }
    return textResult(
      `${lines.length} of ${spec.size} tables/views/functions:\n\n${lines.join("\n")}`
    );
  }

  if (name === "query_product_data") {
    const table = typeof args.table === "string" ? args.table.trim() : "";
    // Anchored allow-pattern rather than an escape: a table name is an
    // identifier, so anything outside this alphabet is a mistake or an attack,
    // and there is no legitimate value to preserve by sanitising it.
    if (!/^(rpc\/)?[a-zA-Z_][a-zA-Z0-9_]*$/.test(table)) {
      return textResult(
        "table must be a plain identifier, optionally prefixed 'rpc/'. Call list_product_tables.",
        true
      );
    }

    const spec = await productSchema();
    if (spec && !spec.has(table)) {
      const near = [...spec.keys()]
        .filter((t) => t.includes(table.replace("rpc/", "").slice(0, 6)))
        .slice(0, 8);
      return textResult(
        `No such table "${table}".` + (near.length ? ` Did you mean: ${near.join(", ")}?` : ""),
        true
      );
    }

    const limit = Math.min(1000, Math.max(1, Number(args.limit) || 100));
    const offset = Math.max(0, Number(args.offset) || 0);
    const isRpc = table.startsWith("rpc/");

    // GET for tables, POST for functions. Neither can mutate: PostgREST needs
    // PATCH/PUT/DELETE to write, and an rpc/ POST reaches only the VOLATILE
    // functions the anon/service role is granted — all the get_* ones are reads.
    let path: string;
    let init: { method?: string; body?: string; headers?: Record<string, string> };
    if (isRpc) {
      path = `/rest/v1/${table}`;
      init = {
        method: "POST",
        headers: { Prefer: "count=exact" },
        body: JSON.stringify(args.params && typeof args.params === "object" ? args.params : {}),
      };
    } else {
      const parts = [
        `select=${encodeURIComponent(typeof args.select === "string" && args.select.trim() ? args.select.trim() : "*")}`,
        `limit=${limit}`,
        `offset=${offset}`,
      ];
      if (typeof args.order === "string" && args.order.trim()) {
        parts.push(`order=${encodeURIComponent(args.order.trim())}`);
      }
      for (const f of Array.isArray(args.filters) ? args.filters : []) {
        if (typeof f !== "string" || !f.includes("=")) continue;
        const eq = f.indexOf("=");
        const col = f.slice(0, eq).trim();
        const value = f.slice(eq + 1);
        if (!col) continue;
        parts.push(`${encodeURIComponent(col)}=${encodeURIComponent(value)}`);
      }
      path = `/rest/v1/${table}?${parts.join("&")}`;
      init = { headers: { Prefer: "count=exact" } };
    }

    const res = await supabaseFetch(path, init);
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 400);
      return textResult(`Query failed (${res.status}): ${detail}`, true);
    }
    const rows = (await res.json().catch(() => null)) as unknown;
    if (!Array.isArray(rows)) {
      return textResult(
        `That returned a single value rather than rows: ${JSON.stringify(rows).slice(0, 2000)}`
      );
    }

    // The total, so a truncated answer is never mistaken for the whole picture —
    // the same silent-cap bug that made list_sources report 307 commits instead
    // of 1,448.
    const total = res.headers.get("content-range")?.split("/")[1] ?? null;
    const head =
      total && Number(total) > offset + rows.length
        ? `${rows.length} rows shown, ${total} match. Raise limit or page with offset.\n\n`
        : `${rows.length} rows.\n\n`;
    return textResult(head + JSON.stringify(rows, null, 2));
  }

  if (name === "query_external_service") {
    const key = typeof args.service === "string" ? args.service.toLowerCase().trim() : "";
    const svc = EXTERNAL_SERVICES[key];
    if (!svc) {
      return textResult(
        `Unknown service. Available: ${Object.keys(EXTERNAL_SERVICES).join(", ")}.`,
        true
      );
    }

    const token = svc.envKeys.map((k) => process.env[k]).find(Boolean) ?? null;
    if (svc.envKeys.length > 0 && !token && !svc.optional) {
      return textResult(
        `${key} is not configured on this deployment (${svc.envKeys.join(" / ")} unset), so I cannot ` +
          `read it. This is a missing credential, not an empty result — do not conclude the ` +
          `data does not exist.`,
        true
      );
    }

    let path = typeof args.path === "string" ? args.path.trim() : "";
    if (!path.startsWith("/")) path = `/${path}`;
    // The host is fixed by the registry; these checks stop the PATH from
    // escaping it. `//` would be read as protocol-relative, `..` walks up out of
    // the API's namespace, and `@` can smuggle a different host into a URL.
    if (path.startsWith("//") || path.includes("..") || path.includes("@") || /\s/.test(path)) {
      return textResult("path must be a simple path inside that service's API.", true);
    }

    const url = new URL(svc.base + path);
    // Stripe and PostHog both use bracket syntax for nested filters, so flatten
    // one level rather than making the caller build the strings.
    for (const [k, v] of Object.entries(
      (args.params && typeof args.params === "object" ? args.params : {}) as Record<string, unknown>
    )) {
      if (v === null || v === undefined) continue;
      if (typeof v === "object" && !Array.isArray(v)) {
        for (const [k2, v2] of Object.entries(v as Record<string, unknown>)) {
          if (v2 !== null && v2 !== undefined) url.searchParams.set(`${k}[${k2}]`, String(v2));
        }
      } else if (Array.isArray(v)) {
        for (const item of v) url.searchParams.append(`${k}[]`, String(item));
      } else {
        url.searchParams.set(k, String(v));
      }
    }

    const headers: Record<string, string> = { Accept: "application/json" };
    if (token) {
      headers.Authorization = svc.auth === "token" ? `token ${token}` : `Bearer ${token}`;
    }
    if (key === "github") headers["X-GitHub-Api-Version"] = "2022-11-28";

    let res: Response;
    try {
      res = await fetchWithTimeout(url.toString(), {
        method: "GET",
        headers,
        timeoutMs: 20_000,
      });
    } catch (err) {
      logger.warn({ err, service: key }, "mcp: external service unreachable");
      return textResult(
        `${key} did not respond in time. This is an outage, not an empty result.`,
        true
      );
    }

    const text = (await res.text().catch(() => "")).slice(0, MAX_RESULT_CHARS - 500);
    if (!res.ok) {
      return textResult(`${key} returned ${res.status}:\n${text}`, true);
    }
    return textResult(text || "(empty response)");
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
        "Everything LoveIQ knows about itself, in two halves.\n\n" +
        "HISTORY, indexed and searchable: documentation, every git commit including the " +
        "plain-English 'For Marcus:' summaries, the whole Notion workspace (every database " +
        "and page, not just the task board), and dated business numbers. Use " +
        "search_company_context, and list_sources when you need to know how fresh a source " +
        "is.\n\n" +
        "LIVE STATE, queried straight from the production database with full history and no " +
        "lag: payments and refunds, Resend email delivery and bounces, Calendly bookings, " +
        "survey submissions and answers, reports, shares, invites, the waitlist, marketing " +
        "spend, and the admin tables. Use list_product_tables then query_product_data, and " +
        "prefer an rpc/get_* analysis function when one fits — those encode the business " +
        "logic already.\n\n" +
        "Which half to reach for: history for why something was decided or what a past " +
        "period looked like; live for what is true right now. Never infer a current number " +
        "from an indexed chunk when query_product_data can read it directly, and never " +
        "conclude something does not exist from an empty search — check list_sources first.",
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
