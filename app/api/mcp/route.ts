import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import { googleCredentialShape, readVercelOidcToken } from "@shared/http/google-oauth";
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

/** Hard per-call row ceiling for `query_product_data`. Advising a caller to
 *  "raise the limit" past this is advice that silently does nothing, so the
 *  message has to know the number. */
const MAX_PRODUCT_ROWS = 1000;

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
/**
 * Serialise as many WHOLE rows as fit, and say how many that was.
 *
 * Both list-returning tools used to count the rows they FETCHED, render them, and
 * let the ceiling cut the text — so the header announced "1000 rows shown" while
 * the body carried 76 and the JSON ended mid-object. Worse, a caller following the
 * header's own advice and paging with `offset=1000` skipped the 924 rows that were
 * fetched and never delivered: 92% of a wide-table walk lost, silently.
 *
 * Rows are also emitted COMPACT. Pretty-printing is what made 131 days of business
 * numbers cost 40,000 characters, putting the company's first month out of reach of
 * a tool whose whole job is the full history.
 */
export function renderRowsForTest(
  rows: unknown[],
  budget: number
): { text: string; shown: number } {
  const parts: string[] = [];
  let used = 2; // the enclosing brackets
  let shown = 0;
  for (const row of rows) {
    const piece = JSON.stringify(row);
    // +1 for the separating comma once there is something to separate from.
    if (used + piece.length + (shown > 0 ? 1 : 0) > budget) break;
    used += piece.length + (shown > 0 ? 1 : 0);
    parts.push(piece);
    shown += 1;
  }
  return { text: `[${parts.join(",")}]`, shown };
}

function textResult(text: string, isError = false) {
  return {
    content: [{ type: "text", text: capWithNotice(text) }],
    isError,
  };
}

/**
 * Cap a result, and SAY SO when it was cut.
 *
 * A bare `slice()` here silently dropped the tail of every oversized result: the
 * caller saw a response that simply stopped, with no way to tell a complete answer
 * from a truncated one. `query_product_data` on `survey_submission_answer` returned
 * exactly 40,000 characters, so this was firing on ordinary queries, not in theory.
 *
 * Same failure as the 2,400-char Notion truncation that cost 60 pages their tails
 * and the rate-limited Slack threads that vanished while the run reported success:
 * data loss that looks exactly like complete data. The notice is what makes it
 * loud, and it must fit INSIDE the ceiling rather than pushing past it — the
 * pattern `features/brain/server/ingest/jira.ts` already uses.
 */
export function capWithNotice(text: string): string {
  if (text.length <= MAX_RESULT_CHARS) return text;
  const notice =
    "\n\n[TRUNCATED: this result hit the gateway's " +
    `${MAX_RESULT_CHARS}-character ceiling and the rest was NOT returned. ` +
    "Do not treat this as the complete answer — narrow the query, select fewer " +
    "columns, or page with offset.]";
  return text.slice(0, MAX_RESULT_CHARS - notice.length) + notice;
}

/** Exported only so the "no indexed source is invisible" test reads the SAME
 * array the route uses — a copy in the test would drift with the bug. */
export const SOURCES_FOR_TEST = [
  "doc",
  "commit",
  "analytics",
  "ga4",
  "gsc",
  "notion",
  "drive",
  "slack",
  "gmail",
  "calendar",
  "whatsapp",
];
// `jira` is deliberately absent. The 1,037 issues in loveiq.atlassian.net are real
// and actively updated, but `JIRA_API_TOKEN` has never been set, so the corpus holds
// 0 Jira chunks. Listing it anyway told the model to search a source that cannot
// answer — the same "prose asserts a fact that lives in the environment" bug the
// tests below guard. Add it back in the commit that proves chunks exist.

const TOOLS = [
  {
    name: "search_company_context",
    description:
      "Search LoveIQ's own written record: repository documentation, every git commit " +
      "(including the plain-English 'For Marcus:' summaries), the Notion workspace — both " +
      "the team board with each task's status, priority and assignee, and the written " +
      "pages — the team's Slack conversations, the company email, the WhatsApp team group " +
      "day by day, the calendar of who met whom, and the notes from " +
      "every recorded call, " +
      "plus dated business numbers (funnel, revenue, ad spend, GA4, Search " +
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
          description:
            "How many days back, from today. Default 30. There is no practical ceiling — " +
            "ask for the whole history if you want it, and the answer says so if the range " +
            "had to be reduced.",
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
          enum: [
            "stripe",
            "resend",
            "slack",
            "github",
            "vercel",
            "figma",
            "trustpilot",
            "clarity",
            "posthog",
          ],
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
      "Everything this server can and cannot see: how many chunks each indexed source holds " +
      "and how fresh it is, plus which outside services are reachable right now and which are " +
      "missing a credential. Use it first whenever an answer looks stale, missing, or when you " +
      "are about to tell someone LoveIQ has no record of something — the difference between " +
      "'no data' and 'no credential' is here.",
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
    /**
     * A discriminated union rather than a bare string, because the previous
     * version declared a "query" kind and never implemented it — a service added
     * with it would have sent NO credential and failed with a confusing 401. The
     * exhaustive switch below now makes that a compile error instead.
     */
    auth:
      | { kind: "bearer" }
      | { kind: "token" }
      | { kind: "header"; name: string }
      | { kind: "query"; param: string };
    /** true when the API is readable WITHOUT the credential and the token only
     *  raises a rate limit. The repository is public, so GitHub is the case. */
    optional?: boolean;
    note: string;
  }
> = {
  stripe: {
    base: "https://api.stripe.com/v1",
    envKeys: ["STRIPE_SECRET_KEY"],
    auth: { kind: "bearer" },
    note: "Charges, disputes, refunds, payouts, balance, customers, invoices, promotion codes. Use for what Stripe knows and our database does not — dispute detail, payout timing, coupon redemption counts.",
  },
  resend: {
    base: "https://api.resend.com",
    envKeys: ["RESEND_API_KEY"],
    auth: { kind: "bearer" },
    note: "Domains and their DNS/verification state, audiences and contacts, and a single email by id. Per-message delivery events are already in resend_webhook_event, so prefer query_product_data for bounce and open rates.",
  },
  slack: {
    base: "https://slack.com/api",
    // The BRAIN bot first, deliberately. Adding read scopes to SLACK_BOT_TOKEN
    // would force a reinstall of the app that drives the live journey messages,
    // and CLAUDE.md is explicit that this is not worth the risk. The brain app
    // exists precisely to hold read scopes.
    envKeys: ["SLACK_BRAIN_BOT_TOKEN", "SLACK_BOT_TOKEN"],
    auth: { kind: "bearer" },
    note: "conversations.list, conversations.history, conversations.replies, users.list. Reads only channels the bot is in, and only with the scopes it holds — a missing scope returns ok:false with missing_scope rather than an error.",
  },
  github: {
    base: "https://api.github.com",
    envKeys: ["GITHUB_TOKEN"],
    auth: { kind: "token" },
    optional: true,
    note: "Issues, pull requests, reviews, releases and workflow runs for loveiqhq/loveiq. The repository is public, so this works with no credential; a token only raises the rate limit.",
  },
  vercel: {
    base: "https://api.vercel.com",
    envKeys: ["VERCEL_TOKEN"],
    auth: { kind: "bearer" },
    note:
      "Deployments, build logs, runtime errors and runtime logs, domains and project " +
      "config. Answers 'is the site healthy', 'what shipped and when', 'what is erroring in " +
      "production'. Most endpoints need a teamId and projectId — read them from /v9/projects " +
      "rather than hardcoding. " +
      "The token is PROJECT-SCOPED to the production project: staging deployment reads " +
      "return 403, and /v2/user and /v2/teams are refused, which is correct and not a fault. " +
      "It can list environment-variable NAMES but not their values.",
  },
  figma: {
    base: "https://api.figma.com/v1",
    envKeys: ["FIGMA_TOKEN", "FIGMA_ACCESS_TOKEN"],
    auth: { kind: "header", name: "X-Figma-Token" },
    note:
      "Files, nodes, comments and component metadata for the design system. Figma uses its own " +
      "header rather than a bearer token.",
  },
  trustpilot: {
    base: "https://api.trustpilot.com/v1",
    envKeys: ["TRUSTPILOT_API_KEY"],
    auth: { kind: "query", param: "apikey" },
    note:
      "Business-unit profile and customer reviews. Trustpilot takes its key as a query " +
      "parameter, not a header. The on-site review widget is a separate, deliberately disabled " +
      "feature — see the Trustpilot note in CLAUDE.md.",
  },
  clarity: {
    base: "https://www.clarity.ms/export-data/api/v1",
    envKeys: ["CLARITY_API_TOKEN"],
    auth: { kind: "bearer" },
    note:
      "Microsoft Clarity, live on every page via public/clarity-init.js. The only tool we run " +
      "that measures user FRUSTRATION rather than volume: dead clicks, rage clicks, quick " +
      "backs, excessive scrolling and JavaScript errors — exactly what the funnel numbers " +
      "cannot explain. " +
      "There is ONE endpoint: '/project-live-insights'. Required param numOfDays, which " +
      "accepts only 1, 2 or 3 — the API has no longer history, so this is a current-state " +
      "signal and an empty result for last month is the API's limit, not an absence of " +
      "sessions. Optional dimension1/dimension2/dimension3, each one of: Browser, Device, " +
      "Country, OS, Source, Medium, Campaign, URL. Example: " +
      "{numOfDays: 3, dimension1: 'Device'}.",
  },
  posthog: {
    base: "https://eu.posthog.com/api",
    envKeys: ["POSTHOG_API_KEY"],
    auth: { kind: "bearer" },
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
  /**
   * ONLY CACHE A USEFUL ANSWER.
   *
   * This cached unconditionally, so one PostgREST reply that parsed to an empty map
   * — a 200 with an unexpected body, a schema still reloading — was pinned for the
   * lambda's whole lifetime. `list_product_tables` then reported success with zero
   * tables (isError false, "…see all 0"), and `query_product_data` rejected every
   * real table with "No such table", which reads as *the data does not exist*
   * rather than *I cannot see it*. Re-deriving on the next call costs one request.
   */
  if (out.size > 0) schemaCache = out;
  return out;
}

async function callTool(
  name: string,
  args: Record<string, unknown>,
  /** Vercel's per-request identity token, so the credential report tells the truth
   *  about what a REQUEST can see rather than about the (local-dev-only) env var. */
  oidcForReport: string | null = null
) {
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
    // No 120-day ceiling. The old one silently returned 120 days to a caller who
    // asked for a year, which reads as "that is all there is". The database
    // function clamps at 4000 days as a DoS guard; if a request is reduced, say so.
    const asked = Math.max(1, Number(args.days) || 30);
    const rows = await brainDailyRollup(asked);
    if (rows.length === 0) {
      return textResult(
        "No rows for that window. Note this counts only days with activity — an empty " +
          "result means no recorded activity in that range, not a missing data source."
      );
    }
    const covered = rows.length;
    /**
     * Compact, and cut on a row boundary. Pretty-printing made 131 days cost the
     * whole 40,000-character ceiling, so asking for the full history returned
     * malformed JSON cut mid-object and the company's first month — 2026-03-24 to
     * 2026-04-19 — was simply unreachable through the tool that exists to serve it.
     */
    const { text: bodyText, shown } = renderRowsForTest(rows, MAX_RESULT_CHARS - 600);
    const head =
      shown < covered
        ? `${shown} of ${covered} days returned — the rest did not fit the character ` +
          `ceiling. Ask for a narrower period to see them.\n\n`
        : covered < asked
          ? `Asked for ${asked} days; ${covered} returned, which is every day the database ` +
            `holds in that range. Not a truncation — there is no data before the earliest ` +
            `day below.\n\n`
          : "";
    return textResult(head + bodyText);
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

    const limit = Math.min(MAX_PRODUCT_ROWS, Math.max(1, Number(args.limit) || 100));
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
        // NOT a 2,000-char slice. Object-returning analysis functions land here —
        // `rpc/get_funnel_sparklines_v3` is a 140,557-character payload, of which
        // this returned 2,047 (1.4%), cut mid-key, with isError:false and nothing
        // said. This is the rpc path the tool description tells the model to PREFER.
        // capWithNotice cuts at the real ceiling and says that it did.
        `That returned a single value rather than rows: ${JSON.stringify(rows)}`
      );
    }

    // The total, so a truncated answer is never mistaken for the whole picture —
    // the same silent-cap bug that made list_sources report 307 commits instead
    // of 1,448.
    const total = res.headers.get("content-range")?.split("/")[1] ?? null;
    // Reserve room for the header itself so the notice never gets cut off.
    const { text: bodyText, shown } = renderRowsForTest(rows, MAX_RESULT_CHARS - 600);
    const dropped = rows.length - shown;
    const more = total !== null && Number(total) > offset + shown;
    const head =
      `${shown} rows returned` +
      (total ? `, ${total} match` : "") +
      (dropped > 0
        ? `. ${dropped} more were fetched but did not fit the character ceiling, so ` +
          `page with offset=${offset + shown} — offset=${offset + rows.length} would SKIP them.`
        : more
          ? `. ${
              limit >= MAX_PRODUCT_ROWS
                ? `${MAX_PRODUCT_ROWS} is the per-call maximum, so page with offset`
                : "Raise limit or page with offset"
            } to see the rest.`
          : ".") +
      "\n\n";
    return textResult(head + bodyText);
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
      switch (svc.auth.kind) {
        case "bearer":
          headers.Authorization = `Bearer ${token}`;
          break;
        case "token":
          headers.Authorization = `token ${token}`;
          break;
        case "header":
          headers[svc.auth.name] = token;
          break;
        case "query":
          // The credential travels in the URL for this one. Acceptable because it
          // is server-to-server over TLS and the URL is never logged or returned
          // to the caller — but it is why a header is the default.
          url.searchParams.set(svc.auth.param, token);
          break;
      }
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

    // NOT pre-sliced. Cutting to `MAX_RESULT_CHARS - 500` here put the string
    // under the ceiling, so `capWithNotice` could never fire and every oversized
    // external response was returned silently truncated, mid-JSON, with
    // isError=false. Hand the full body to textResult and let the one capping
    // path decide — a second, quieter truncation is how the first one hid.
    const text = await res.text().catch(() => "");
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
    const SOURCES = SOURCES_FOR_TEST;

    /**
     * A source's `updated_at` moves whenever its ingester RUNS, even on a run that
     * fetched nothing -- so `last ingested` reported today's date for Gmail while
     * it had been fetching zero threads for two days. Anyone asking the brain what
     * it had access to was told a dead source was healthy.
     *
     * The honest signal is the JOB's outcome, so it is read here and reported
     * alongside. `doc` and `commit` are ingested by a GitHub Action on push and
     * have no cron row, which is stated rather than left blank.
     */
    const CRON_FOR_SOURCE: Record<string, string> = {
      ga4: "brain-fast",
      drive: "brain-fast",
      analytics: "brain-fast",
      slack: "brain-fast",
      notion: "brain-notion",
      gmail: "brain-gmail",
      calendar: "brain-calendar",
      gsc: "brain-ingest",
    };

    /**
     * One query PER CRON, not one query over the newest N rows.
     *
     * The first version read the latest 200 `cron_run` rows and picked the newest
     * per name, which is wrong for anything infrequent: `brain-fast` alone writes
     * 96 rows a day, so the nightly `brain-ingest` fell outside the window and was
     * reported as "never running" while it had run that morning. That is the same
     * false-confidence bug this whole tool is meant to remove, pointed the other way.
     */
    const lastRun = new Map<string, { status: string; error: string | null; at: string }>();
    const crons = [...new Set(Object.values(CRON_FOR_SOURCE))];
    await Promise.all(
      crons.map(async (cron) => {
        const res = await supabaseFetch(
          `/rest/v1/cron_run?select=started_at,status,error_message` +
            `&cron_name=eq.${encodeURIComponent(cron)}&order=started_at.desc&limit=1`
        );
        if (!res.ok) return;
        const rows = (await res.json().catch(() => [])) as Array<{
          started_at?: string;
          status?: string;
          error_message?: string | null;
        }>;
        const r = rows?.[0];
        if (!r) return;
        lastRun.set(cron, {
          status: r.status ?? "?",
          error: r.error_message ?? null,
          at: r.started_at ?? "",
        });
      })
    );

    const health = (source: string): string => {
      if (source === "doc" || source === "commit") return " · ingested on push to main";
      /**
       * WhatsApp has no cron ON PURPOSE. There is no API that can read an existing
       * group, so it is pushed from a Mac running WhatsApp Desktop — see
       * `scripts/whatsapp-sync.ts`. Saying so beats an empty slot that reads like a
       * job nobody wired up.
       */
      if (source === "whatsapp") return " · pushed from WhatsApp Desktop, not a scheduled job";
      const cron = CRON_FOR_SOURCE[source];
      if (!cron) return "";
      const run = lastRun.get(cron);
      if (!run) return ` · no record of ${cron} ever running`;
      const when = run.at.slice(0, 16).replace("T", " ");
      if (run.status === "success") return ` · ${cron} ok at ${when}`;
      return ` · ${cron} FAILING since at least ${when}${run.error ? ` (${run.error})` : ""}`;
    };

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

      return (
        `${source}: ${total} chunks · newest period ${period ?? "n/a (docs carry no period)"}` +
        ` · last wrote ${ingested}${health(source)}`
      );
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

    // The live half, computed from process.env at request time. Deliberately not
    // written into any prose: whether a credential exists is a moving fact, and
    // copying it into a description is how the same bug shipped four times.
    const live = Object.entries(EXTERNAL_SERVICES).map(([name, svc]) => {
      const has = svc.envKeys.some((k) => process.env[k]);
      if (has) return `${name}: reachable`;
      if (svc.optional) return `${name}: reachable without a credential`;
      return `${name}: NOT REACHABLE — ${svc.envKeys.join(" or ")} is unset on this deployment`;
    });

    // Google's credential state belongs in a tool whose job is reporting what can
    // and cannot be reached. It is also the only way to compare a REQUEST context
    // against a CRON one: a production cron reported google-token-unavailable while
    // logging nothing, and if the two contexts differ, that is the answer.
    const google = `google credentials visible here: ${googleCredentialShape(oidcForReport)}`;

    return textResult(
      `INDEXED HISTORY (searchable with search_company_context)\n${lines.join("\n")}\n\n` +
        `A source marked FAILING is not updating, however recent its last write looks: the write timestamp moves on every run, including runs that fetched nothing. Trust the job outcome over the date.\nA source showing NEVER INGESTED has no data at all — its silence is not evidence ` +
        `that the thing does not exist. A source whose newest period is old has stopped ` +
        `updating.\n\n` +
        `LIVE STATE\nOur own database: every table, view and analysis function, read at ask ` +
        `time with full history — use list_product_tables and query_product_data.\n` +
        `Outside services, via query_external_service:\n${live.map((l) => `  ${l}`).join("\n")}\n\n` +
        `A service marked NOT REACHABLE is missing a credential, which is NOT the same as ` +
        `having no data. Say so rather than answering as though the data does not exist.\n\n` +
        `${google}\n` +
        `(oidc = Vercel's per-deployment identity token, wif = the workload-identity ` +
        `audience, imp = the service account to impersonate, refresh = a full OAuth ` +
        `refresh triple. Flags only — never values. GA4, Search Console and Drive need ` +
        `at least one usable route among these.)`
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
        "and page, not just the task board), the team's Slack conversations day by day, the " +
        "company email thread by thread, the WhatsApp team group day by day, the calendar " +
        "of meetings and who attended them, the " +
        "notes from every recorded call, and dated business numbers. Use " +
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
      return result(id, await callTool(name, args, readVercelOidcToken(request)));
    } catch (err) {
      logger.error({ err, tool: name }, "MCP tool call failed");
      // Returned as a tool RESULT, not a protocol error: the model can then say
      // what went wrong instead of the client showing a bare transport failure.
      return result(id, textResult("That lookup failed. It has been logged.", true));
    }
  }

  return rpcError(id, -32601, `Method not found: ${method}`);
}
