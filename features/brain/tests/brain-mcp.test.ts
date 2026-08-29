import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockRetrieve = vi.fn();
vi.mock("@features/brain/server/retrieve", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@features/brain/server/retrieve")>()),
  retrieve: (...a: unknown[]) => mockRetrieve(...a),
}));

const mockSupabaseFetch = vi.fn();
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (...a: unknown[]) => mockSupabaseFetch(...(a as [])),
}));
const mockRollup = vi.fn();
vi.mock("@features/brain/server/ingest/analytics", () => ({
  brainDailyRollup: (...a: unknown[]) => mockRollup(...(a as [never])),
}));

const mockRateLimit = vi.fn(async () => ({ allowed: true }));
const mockFetch = vi.fn();
vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: (...a: unknown[]) => mockFetch(...(a as [])),
}));

vi.mock("@shared/http/ratelimit", () => ({
  checkRateLimit: (...a: unknown[]) => mockRateLimit(...(a as [])),
  getClientIp: () => "1.2.3.4",
}));

import { POST } from "@/app/api/mcp/route";
import { CorpusUnavailableError } from "@features/brain/server/retrieve";

const TOKEN = "test-token-0123456789";

function rpc(body: unknown, token: string | null = TOKEN): Request {
  return new Request("https://www.loveiq.org/api/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("/api/mcp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRateLimit.mockResolvedValue({ allowed: true });
    process.env.LOVEIQ_MCP_TOKEN = TOKEN;
  });
  afterEach(() => {
    delete process.env.LOVEIQ_MCP_TOKEN;
  });

  describe("auth", () => {
    it("503s while the token is unset, so it is safe to deploy before it exists", async () => {
      delete process.env.LOVEIQ_MCP_TOKEN;
      expect((await POST(rpc({ jsonrpc: "2.0", id: 1, method: "ping" }))).status).toBe(503);
    });

    it("401s with no token, a wrong token, and a wrong-LENGTH token", async () => {
      // The length case matters on its own: a naive constant-time compare throws
      // on mismatched lengths, which would surface as a 500 rather than a 401.
      expect((await POST(rpc({ method: "ping" }, null))).status).toBe(401);
      expect((await POST(rpc({ method: "ping" }, "wrong-but-same-length"))).status).toBe(401);
      expect((await POST(rpc({ method: "ping" }, "short"))).status).toBe(401);
    });

    it("429s when rate limited, before doing any work", async () => {
      mockRateLimit.mockResolvedValue({ allowed: false });
      expect((await POST(rpc({ jsonrpc: "2.0", id: 1, method: "ping" }))).status).toBe(429);
      expect(mockRetrieve).not.toHaveBeenCalled();
    });
  });

  describe("protocol", () => {
    it("answers initialize with a protocol version and tool capability", async () => {
      const body = await (await POST(rpc({ jsonrpc: "2.0", id: 1, method: "initialize" }))).json();
      expect(body.result.protocolVersion).toBeTruthy();
      expect(body.result.capabilities.tools).toBeDefined();
      expect(body.result.serverInfo.name).toBe("loveiq-brain");
    });

    it("lists exactly the six tools, each with a schema", async () => {
      // Asserted exactly, not with toContain: a tool that disappears from the list
      // is unreachable to every connected Claude, and nothing else would notice.
      const body = await (await POST(rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" }))).json();
      expect(body.result.tools.map((t: { name: string }) => t.name)).toEqual([
        "search_company_context",
        "get_business_numbers",
        "list_product_tables",
        "query_product_data",
        "query_external_service",
        "list_sources",
      ]);
      for (const t of body.result.tools) expect(t.inputSchema.type).toBe("object");
    });

    it("tells the client about BOTH halves — indexed history and live state", async () => {
      // The instructions are the server's only chance to say what it is. Twice
      // today a description advertised a source that had 0 chunks while omitting
      // one with hundreds, which makes the data effectively unreachable.
      const body = await (await POST(rpc({ jsonrpc: "2.0", id: 9, method: "initialize" }))).json();
      const text = String(body.result.instructions);
      expect(text).toMatch(/Notion/);
      expect(text).toMatch(/query_product_data/);
      expect(text).toMatch(/live/i);
      expect(text).not.toMatch(/Jira/);
    });

    it("returns 202 with no body for a notification, which expects no response", async () => {
      const res = await POST(rpc({ jsonrpc: "2.0", method: "notifications/initialized" }));
      expect(res.status).toBe(202);
    });

    it("returns -32601 for an unknown method and -32600 for a malformed request", async () => {
      const unknown = await (await POST(rpc({ jsonrpc: "2.0", id: 3, method: "nope" }))).json();
      expect(unknown.error.code).toBe(-32601);
      const bad = await (await POST(rpc({ jsonrpc: "2.0", id: 4 }))).json();
      expect(bad.error.code).toBe(-32600);
    });
  });

  describe("search_company_context", () => {
    const call = (args: Record<string, unknown>) =>
      POST(
        rpc({
          jsonrpc: "2.0",
          id: 9,
          method: "tools/call",
          params: { name: "search_company_context", arguments: args },
        })
      );

    it("renders cited chunks", async () => {
      mockRetrieve.mockResolvedValue([
        {
          source: "analytics",
          sourceId: "monthly:2026-08",
          title: "LoveIQ numbers — August 2026",
          url: null,
          body: "Revenue: EUR 126.98",
          meta: {},
          score: 1,
        },
      ]);
      const body = await (await call({ query: "revenue" })).json();
      const text = body.result.content[0].text;
      expect(text).toContain("[1] (analytics)");
      expect(text).toContain("EUR 126.98");
      expect(body.result.isError).toBe(false);
    });

    /**
     * The single most important behaviour in this file. Telling a model the
     * corpus is empty when the database is unreachable makes it assert absence
     * with confidence — the same failure the Slack path was fixed for.
     */
    it("reports an outage as an outage, never as an empty corpus", async () => {
      mockRetrieve.mockRejectedValue(new CorpusUnavailableError("rpc 500"));
      const body = await (await call({ query: "revenue" })).json();
      expect(body.result.isError).toBe(true);
      expect(body.result.content[0].text).toMatch(/unreachable|outage/i);
      expect(body.result.content[0].text).not.toMatch(/nothing in the indexed corpus/i);
    });

    it("distinguishes a genuine miss, and says what is not indexed", async () => {
      mockRetrieve.mockResolvedValue([]);
      const body = await (await call({ query: "something absent" })).json();
      expect(body.result.isError).toBeFalsy();
      expect(body.result.content[0].text).toMatch(/source code is not/i);
    });

    it("rejects an empty query and clamps the limit", async () => {
      const empty = await (await call({ query: " " })).json();
      expect(empty.result.isError).toBe(true);

      mockRetrieve.mockResolvedValue([]);
      await call({ query: "x".repeat(10), limit: 9999 });
      expect(mockRetrieve).toHaveBeenLastCalledWith(expect.any(String), 30);
    });

    it("surfaces an unexpected failure as a tool result, not a transport error", async () => {
      mockRetrieve.mockRejectedValue(new Error("boom"));
      const res = await call({ query: "revenue" });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.result.isError).toBe(true);
    });
  });

  describe("list_sources", () => {
    /**
     * Drive supabaseFetch by URL shape: the per-source count/newest reads, the
     * per-source updated_at read, and the `not.in` completeness probe.
     */
    function wireCorpus(present: Record<string, number>, unlisted: string[] = []) {
      mockSupabaseFetch.mockImplementation(async (path: string) => {
        if (path.includes("source=not.in.")) {
          return {
            ok: true,
            headers: new Headers(),
            json: async () => unlisted.map((s) => ({ source: s })),
          };
        }
        const m = /source=eq\.([a-z0-9_]+)/.exec(path);
        const source = m?.[1] ?? "";
        const n = present[source] ?? 0;
        if (path.includes("select=updated_at")) {
          return {
            ok: true,
            headers: new Headers(),
            json: async () => [{ updated_at: "2026-08-28T00:00:00Z" }],
          };
        }
        return {
          ok: true,
          headers: new Headers({ "content-range": `0-0/${n}` }),
          json: async () => (n > 0 ? [{ period_end: "2026-08-28" }] : []),
        };
      });
    }

    async function text() {
      const res = await POST(
        rpc({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "list_sources", arguments: {} },
        })
      );
      const body = await res.json();
      return body.result.content[0].text as string;
    }

    it("reports notion, which the fixed source list originally omitted", async () => {
      // The regression: notion had 233 chunks and answered searches, while this
      // tool listed only doc/commit/analytics/ga4/gsc/jira — so it described a
      // corpus without the company board. Fails on the pre-fix SOURCES array.
      wireCorpus({ doc: 418, commit: 1448, analytics: 174, ga4: 108, gsc: 107, notion: 233 });
      expect(await text()).toContain("notion: 233 chunks");
    });

    it("still distinguishes a never-ingested source from a stale one", async () => {
      // The reason the list is fixed at all — a discovered list cannot say this.
      wireCorpus({ doc: 418, commit: 1448, analytics: 174, ga4: 108, gsc: 107, notion: 233 });
      expect(await text()).toContain("slack: 0 chunks — NEVER INGESTED");
    });

    it("names a source that is in the corpus but missing from the list", async () => {
      // The other direction, which is what actually broke. Without the probe the
      // tool silently under-reports and reads as if the corpus were complete.
      wireCorpus({ doc: 1, notion: 1 }, ["transcript", "slack_history"]);
      const t = await text();
      expect(t).toContain("slack_history, transcript");
      expect(t).toMatch(/MISSING from this tool's source list/);
    });

    it("says nothing extra when every source is accounted for", async () => {
      wireCorpus({ doc: 1, notion: 1 }, []);
      expect(await text()).not.toMatch(/MISSING from this tool's source list/);
    });
  });

  describe("query_product_data — live database access", () => {
    const OPENAPI = {
      definitions: {
        payment: { properties: { id: {}, amount: {}, created_date_time: {} } },
        resend_webhook_event: { properties: { id: {}, type: {}, received_at: {} } },
      },
      paths: {
        "/payment": {},
        "/rpc/get_conversion_funnel": {
          post: {
            parameters: [
              {
                in: "body",
                schema: {
                  properties: {
                    since_ts: { format: "timestamp with time zone" },
                    utm_filter: { format: "text" },
                  },
                  required: ["since_ts"],
                },
              },
            ],
          },
        },
        "/rpc/show_limit": { post: { parameters: [{ in: "body", schema: {} }] } },
      },
    };

    function wire(rows: unknown, opts: { ok?: boolean; total?: number; status?: number } = {}) {
      mockSupabaseFetch.mockImplementation(
        async (path: string, init?: { headers?: Record<string, string> }) => {
          if (init?.headers?.Accept === "application/openapi+json") {
            return { ok: true, headers: new Headers(), json: async () => OPENAPI };
          }
          const total = opts.total ?? (Array.isArray(rows) ? rows.length : 0);
          return {
            ok: opts.ok ?? true,
            status: opts.status ?? 200,
            headers: new Headers({ "content-range": `0-0/${total}` }),
            json: async () => rows,
            text: async () => JSON.stringify(rows),
          };
        }
      );
    }

    async function call(args: Record<string, unknown>, tool = "query_product_data") {
      const res = await POST(
        rpc({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: tool, arguments: args },
        })
      );
      const body = await res.json();
      return body.result as { content: Array<{ text: string }>; isError?: boolean };
    }

    it("refuses a table name that is not a plain identifier", async () => {
      wire([]);
      for (const table of ["payment; drop table x", "pay ment", "../secrets", "payment)--"]) {
        const r = await call({ table });
        expect(r.isError, table).toBe(true);
        expect(r.content[0].text).toMatch(/plain identifier/);
      }
    });

    it("refuses a table that is not in the schema, and suggests near matches", async () => {
      wire([]);
      const r = await call({ table: "paymentz" });
      expect(r.isError).toBe(true);
      expect(r.content[0].text).toMatch(/No such table/);
      expect(r.content[0].text).toMatch(/payment/);
    });

    it("never issues a write method", async () => {
      // Read-only by CONSTRUCTION, not by validation: a table read is a GET and a
      // function call is a POST to /rpc, and PostgREST needs PATCH/PUT/DELETE to
      // mutate. This asserts the property directly so a future edit cannot quietly
      // introduce one.
      wire([{ id: 1 }]);
      await call({ table: "payment" });
      await call({ table: "rpc/get_conversion_funnel", params: { days: 7 } });
      const methods = mockSupabaseFetch.mock.calls
        .map(([, init]) => (init as { method?: string } | undefined)?.method ?? "GET")
        .map((m) => m.toUpperCase());
      expect(methods).not.toContain("PATCH");
      expect(methods).not.toContain("PUT");
      expect(methods).not.toContain("DELETE");
      expect(new Set(methods)).toEqual(new Set(["GET", "POST"]));
    });

    it("at the row cap, never advises raising the limit — that provably does nothing", async () => {
      // query_product_data clamps to MAX_PRODUCT_ROWS. Telling a caller to raise the
      // limit sends the model to retry at 5000, receive the identical 1000 rows, and
      // conclude it has everything. Verified against production: limit=5000 returned
      // exactly the same rows as limit=1000.
      wire(
        Array.from({ length: 1000 }, (_, i) => ({ id: i })),
        { total: 104355 }
      );
      const r = await call({ table: "payment", limit: 5000 });
      const text = r.content[0].text as string;
      expect(text).not.toMatch(/Raise limit/);
      expect(text).toMatch(/per-call maximum/);
      expect(text).toMatch(/offset/);
    });

    it("below the cap, raising the limit IS the right advice and is still given", async () => {
      wire([{ id: 1 }, { id: 2 }], { total: 5000 });
      const r = await call({ table: "payment", limit: 2 });
      expect(r.content[0].text).toMatch(/Raise limit/);
    });

    it("says how many rows MATCH, not just how many it returned", async () => {
      // The silent-truncation bug that made list_sources report 307 commits of
      // 1,448: a capped result that does not admit it reads as the whole picture.
      wire([{ id: 1 }, { id: 2 }], { total: 5000 });
      const r = await call({ table: "payment", limit: 2 });
      expect(r.content[0].text).toMatch(/2 rows returned, 5000 match/);
      expect(r.content[0].text).toMatch(/offset/);
    });

    it("does not claim truncation when everything fits", async () => {
      wire([{ id: 1 }, { id: 2 }], { total: 2 });
      expect((await call({ table: "payment" })).content[0].text).toMatch(/^2 rows returned, 2 match\./);
    });

    it("passes filters and order through as PostgREST params", async () => {
      wire([]);
      await call({
        table: "payment",
        select: "id,amount",
        filters: ["created_date_time=gte.2026-08-01", "amount=gt.0"],
        order: "created_date_time.desc",
        limit: 10,
      });
      const path = String(mockSupabaseFetch.mock.calls.at(-1)?.[0]);
      expect(path).toContain("select=id%2Camount");
      expect(path).toContain("created_date_time=gte.2026-08-01");
      expect(path).toContain("amount=gt.0");
      expect(path).toContain("order=created_date_time.desc");
      expect(path).toContain("limit=10");
    });

    it("caps limit at 1000 and floors it at 1", async () => {
      wire([]);
      await call({ table: "payment", limit: 99999 });
      expect(String(mockSupabaseFetch.mock.calls.at(-1)?.[0])).toContain("limit=1000");
      await call({ table: "payment", limit: -5 });
      expect(String(mockSupabaseFetch.mock.calls.at(-1)?.[0])).toContain("limit=1");
    });

    it("surfaces a database error as a tool error rather than pretending there are no rows", async () => {
      wire({ message: "column does not exist" }, { ok: false, status: 400 });
      const r = await call({ table: "payment", filters: ["nope=eq.1"] });
      expect(r.isError).toBe(true);
      expect(r.content[0].text).toMatch(/Query failed \(400\)/);
    });

    it("lists tables with their columns, and narrows on match", async () => {
      wire([]);
      const all = await call({}, "list_product_tables");
      expect(all.content[0].text).toContain("payment(id, amount, created_date_time)");
      const narrowed = await call({ match: "resend" }, "list_product_tables");
      expect(narrowed.content[0].text).toContain("resend_webhook_event");
      expect(narrowed.content[0].text).not.toContain("payment(");
    });

    it("shows each function's ARGUMENTS, or all 63 of them are unusable", async () => {
      // Listing them as "(function)" meant a caller could not know that
      // get_conversion_funnel needs since_ts, so the call failed with PGRST202
      // and the analysis functions that encode our business logic went unused.
      wire([]);
      const r = await call({ match: "rpc" }, "list_product_tables");
      const text = r.content[0].text;
      expect(text).toContain("rpc/get_conversion_funnel");
      expect(text).toContain("since_ts!");
      expect(text).toContain("utm_filter");
      expect(text).not.toContain("utm_filter!");
      expect(text).toContain("rpc/show_limit((no arguments))");
    });
  });

  describe("query_external_service — read-only gateway", () => {
    async function call(args: Record<string, unknown>) {
      const res = await POST(
        rpc({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "query_external_service", arguments: args },
        })
      );
      return (await res.json()).result as { content: Array<{ text: string }>; isError?: boolean };
    }

    beforeEach(() => {
      mockFetch.mockReset();
      mockFetch.mockResolvedValue({ ok: true, status: 200, text: async () => '{"data":[]}' });
      process.env.STRIPE_SECRET_KEY = "sk_test_secret_value";
      process.env.RESEND_API_KEY = "re_secret_value";
      delete process.env.POSTHOG_API_KEY;
    });

    it("only ever issues GET — these keys can refund charges and send mail", async () => {
      // The caller must not be able to pick the method, so this also passes a
      // method it should ignore.
      await call({ service: "stripe", path: "/charges", method: "DELETE" });
      await call({ service: "resend", path: "/domains" });
      expect(mockFetch.mock.calls.length).toBe(2);
      for (const [, init] of mockFetch.mock.calls) {
        expect((init as { method?: string }).method).toBe("GET");
      }
    });

    it("pins the host, so the path cannot redirect the request elsewhere", async () => {
      await call({ service: "stripe", path: "/charges" });
      expect(String(mockFetch.mock.calls[0][0])).toMatch(
        /^https:\/\/api\.stripe\.com\/v1\/charges/
      );
    });

    it("rejects a path that tries to escape the API namespace", async () => {
      for (const path of ["//evil.example.com/x", "/../../admin", "/x@evil.example.com", "/a b"]) {
        const r = await call({ service: "stripe", path });
        expect(r.isError, path).toBe(true);
        expect(r.content[0].text).toMatch(/simple path/);
      }
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("rejects an unknown service rather than guessing a base URL", async () => {
      const r = await call({ service: "mystery", path: "/x" });
      expect(r.isError).toBe(true);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("never returns the API key to the caller", async () => {
      const r = await call({ service: "stripe", path: "/charges" });
      expect(JSON.stringify(r)).not.toContain("sk_test_secret_value");
    });

    it("distinguishes 'not configured' from 'no data', which is the whole point", async () => {
      const r = await call({ service: "posthog", path: "/projects" });
      expect(r.isError).toBe(true);
      expect(r.content[0].text).toMatch(/POSTHOG_API_KEY unset/);
      expect(r.content[0].text).toMatch(/do not conclude the data does not exist/);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("prefers the brain's own Slack token over the one driving journey messages", async () => {
      // Adding read scopes to SLACK_BOT_TOKEN would force a reinstall of the app
      // that posts live journey messages; CLAUDE.md says do not risk it.
      process.env.SLACK_BRAIN_BOT_TOKEN = "xoxb-brain";
      process.env.SLACK_BOT_TOKEN = "xoxb-main";
      await call({ service: "slack", path: "/conversations.list" });
      expect(
        (mockFetch.mock.calls[0][1] as { headers: Record<string, string> }).headers.Authorization
      ).toBe("Bearer xoxb-brain");

      mockFetch.mockClear();
      delete process.env.SLACK_BRAIN_BOT_TOKEN;
      await call({ service: "slack", path: "/conversations.list" });
      expect(
        (mockFetch.mock.calls[0][1] as { headers: Record<string, string> }).headers.Authorization
      ).toBe("Bearer xoxb-main");
      delete process.env.SLACK_BOT_TOKEN;
    });

    it("flattens nested params into bracket syntax, which Stripe and PostHog both need", async () => {
      await call({
        service: "stripe",
        path: "/charges",
        params: { limit: 3, created: { gte: 1756000000 } },
      });
      const url = String(mockFetch.mock.calls[0][0]);
      expect(url).toContain("limit=3");
      expect(url).toContain("created%5Bgte%5D=1756000000");
    });

    it("uses GitHub's token scheme, not Bearer, and works with no credential", async () => {
      delete process.env.GITHUB_TOKEN;
      const r = await call({ service: "github", path: "/repos/loveiqhq/loveiq/issues" });
      expect(r.isError).toBeFalsy();
      expect(
        (mockFetch.mock.calls[0][1] as { headers: Record<string, string> }).headers.Authorization
      ).toBeUndefined();

      mockFetch.mockClear();
      process.env.GITHUB_TOKEN = "ghp_x";
      await call({ service: "github", path: "/repos/loveiqhq/loveiq/issues" });
      expect(
        (mockFetch.mock.calls[0][1] as { headers: Record<string, string> }).headers.Authorization
      ).toBe("token ghp_x");
      delete process.env.GITHUB_TOKEN;
    });

    it("reports an upstream error instead of an empty result", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 402,
        text: async () => '{"error":"card_declined"}',
      });
      const r = await call({ service: "stripe", path: "/charges" });
      expect(r.isError).toBe(true);
      expect(r.content[0].text).toMatch(/stripe returned 402/);
    });

    it("reports a timeout as an outage, not as absence", async () => {
      mockFetch.mockRejectedValue(new Error("timeout"));
      const r = await call({ service: "stripe", path: "/charges" });
      expect(r.isError).toBe(true);
      expect(r.content[0].text).toMatch(/outage, not an empty result/);
    });
  });

describe("no indexed source may be invisible to the model", () => {
  /**
   * The fifth guard on the same recurring bug. Four times a source has been
   * ingested and then left out of the prose the model reads, which makes it
   * unfindable: the model does not know to search for something it was never
   * told exists. `list_sources` naming it is not enough — the model reads the
   * tool description first and decides from that whether the corpus is worth
   * asking. So every source the ingesters can write must be named somewhere the
   * model actually sees.
   */
  it("every source in SOURCES is named in the search description or the instructions", async () => {
    const mod = await import("@/app/api/mcp/route");
    const list = await (
      await POST(rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }))
    ).json();
    const init = await (
      await POST(rpc({ jsonrpc: "2.0", id: 2, method: "initialize" }))
    ).json();
    const prose = (
      JSON.stringify(list.result.tools) + (init.result.instructions ?? "")
    ).toLowerCase();

    // The human-readable word for each source id, since the prose names things the
    // way a person would ("call notes", not "drive").
    const WORD: Record<string, string> = {
      doc: "documentation",
      commit: "commit",
      analytics: "business numbers",
      ga4: "ga4",
      gsc: "search console",
      jira: "jira",
      notion: "notion",
      drive: "call",
      gmail: "email",
      slack: "slack",
    };
    const sources = (mod as { SOURCES_FOR_TEST?: string[] }).SOURCES_FOR_TEST ?? [];
    expect(sources.length).toBeGreaterThan(0);
    for (const src of sources) {
      const word = WORD[src] ?? src;
      expect(prose, `source "${src}" is indexed but never named to the model`).toContain(word);
    }
  });
});

describe("descriptions must not assert configuration state", () => {
  /**
   * This bug has now shipped four times: a tool description advertised Jira
   * (0 chunks) while omitting Notion (1,062), the `initialize` instructions did
   * the same, `list_sources` left Notion out of its source list, and the PostHog
   * registry note said "not configured yet" for a day after it was configured.
   *
   * The pattern is always the same — a fact that lives in the environment gets
   * copied into prose and then drifts. Whether a service is configured is
   * answered at runtime by looking at `process.env`, and the tool already returns
   * a precise message when a key is missing. So a note that also claims it is a
   * duplicate of a moving fact, and this test refuses one.
   */
  it("no service note claims a credential is missing", async () => {
    const { EXTERNAL_SERVICES } = await import("@/app/api/mcp/route");
    const forbidden = /not configured|not set|unconfigured|no credential yet|coming soon/i;
    for (const [name, svc] of Object.entries(EXTERNAL_SERVICES)) {
      expect(svc.note, `${name} note asserts configuration state`).not.toMatch(forbidden);
    }
  });

  it("every service names at least one env key or is explicitly optional", async () => {
    const { EXTERNAL_SERVICES } = await import("@/app/api/mcp/route");
    for (const [name, svc] of Object.entries(EXTERNAL_SERVICES)) {
      expect(svc.envKeys.length > 0 || svc.optional === true, `${name}`).toBe(true);
    }
  });

  it("the enum the model sees matches the registry exactly", async () => {
    // A service in the registry but missing from the enum is unreachable; one in
    // the enum but not the registry is an error the model cannot avoid.
    const { EXTERNAL_SERVICES } = await import("@/app/api/mcp/route");
    const body = await (await POST(rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" }))).json();
    const tool = body.result.tools.find(
      (t: { name: string }) => t.name === "query_external_service"
    );
    expect([...tool.inputSchema.properties.service.enum].sort()).toEqual(
      Object.keys(EXTERNAL_SERVICES).sort()
    );
  });
});

  describe("list_sources reports what it CANNOT see", () => {
    it("names an unreachable service and its missing env key, computed at request time", async () => {
      // "No credential" and "no data" are indistinguishable to a model unless the
      // tool says which. Computed from process.env, never from prose, so it
      // cannot drift the way four descriptions already did.
      wireCorpusForSources();
      delete process.env.TRUSTPILOT_API_KEY;
      process.env.STRIPE_SECRET_KEY = "sk_test_x";
      const text = await sourcesText();
      expect(text).toMatch(/trustpilot: NOT REACHABLE — TRUSTPILOT_API_KEY is unset/);
      expect(text).toMatch(/stripe: reachable/);
      expect(text).toMatch(/NOT the same as having no data/);
    });

    it("flips to reachable the moment the key exists, with no code change", async () => {
      wireCorpusForSources();
      process.env.TRUSTPILOT_API_KEY = "tp_x";
      expect(await sourcesText()).toMatch(/trustpilot: reachable/);
      delete process.env.TRUSTPILOT_API_KEY;
    });

    it("says GitHub is reachable without a credential", async () => {
      wireCorpusForSources();
      delete process.env.GITHUB_TOKEN;
      expect(await sourcesText()).toMatch(/github: reachable without a credential/);
    });
  });

  function wireCorpusForSources() {
    mockSupabaseFetch.mockImplementation(async (path: string) => {
      if (path.includes("source=not.in.")) {
        return { ok: true, headers: new Headers(), json: async () => [] };
      }
      return {
        ok: true,
        headers: new Headers({ "content-range": "0-0/1" }),
        json: async () => [{ period_end: "2026-08-28", updated_at: "2026-08-28T00:00:00Z" }],
      };
    });
  }

  async function sourcesText(extraHeaders: Record<string, string> = {}): Promise<string> {
    const body = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_sources", arguments: {} } };
    const res = await POST(
      new Request("https://www.loveiq.org/api/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${TOKEN}`,
          ...extraHeaders,
        },
        body: JSON.stringify(body),
      })
    );
    return String((await res.json()).result.content[0].text);
  }

  describe("get_business_numbers must not truncate silently", () => {
    it("passes the full requested range through, with no 120-day ceiling", async () => {
      // The old code did Math.min(120, ...), so a caller asking for a year got 120
      // days and no indication — which reads as "that is all the history there is".
      mockRollup.mockResolvedValue([{ day: "2026-08-28" }]);
      await POST(
        rpc({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "get_business_numbers", arguments: { days: 1200 } },
        })
      );
      expect(mockRollup).toHaveBeenLastCalledWith(1200);
    });

    it("says when fewer days came back than were asked for", async () => {
      mockRollup.mockResolvedValue([{ day: "2026-08-28" }, { day: "2026-08-27" }]);
      const res = await POST(
        rpc({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "get_business_numbers", arguments: { days: 400 } },
        })
      );
      const text = (await res.json()).result.content[0].text as string;
      expect(text).toMatch(/Asked for 400 days; 2 returned/);
      expect(text).toMatch(/Not a truncation/);
    });

    it("explains an empty result rather than implying a missing source", async () => {
      mockRollup.mockResolvedValue([]);
      const res = await POST(
        rpc({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "get_business_numbers", arguments: { days: 5 } },
        })
      );
      const text = (await res.json()).result.content[0].text as string;
      expect(text).toMatch(/not a missing data source/);
    });
  });

  describe("list_sources reports Google's credential state", () => {
    it("says which Google routes are available, with flags and never values", async () => {
      // A production cron reported google-token-unavailable while logging nothing.
      // Reporting the shape here is the only way to compare a REQUEST context
      // against a CRON one — if the two differ, that difference is the answer.
      wireCorpusForSources();
      // Supplied as the request HEADER, which is how Vercel actually delivers it.
      delete process.env.VERCEL_OIDC_TOKEN;
      process.env.GOOGLE_WORKLOAD_IDENTITY_AUDIENCE = "//iam.example/aud";
      const text = await sourcesText({ "x-vercel-oidc-token": "a.secret.jwt" });
      expect(text).toMatch(/google credentials visible here:/);
      expect(text).toMatch(/oidc=1/);
      expect(text).not.toContain("a.secret.jwt");
      expect(text).not.toContain("iam.example");
      delete process.env.VERCEL_OIDC_TOKEN;
      delete process.env.GOOGLE_WORKLOAD_IDENTITY_AUDIENCE;
    });
  });
});

describe("an oversized result must announce that it was cut", () => {
  /**
   * `textResult` used a bare `slice(0, MAX_RESULT_CHARS)`, so any result over the
   * ceiling ended mid-sentence with nothing to distinguish it from a complete
   * answer. It was not theoretical: `query_product_data` on
   * `survey_submission_answer` (104,355 rows) came back at exactly 40,000
   * characters. The same shape of bug cost 60 Notion pages their tails and lost
   * Slack threads to a rate limit while the run reported success — silent loss
   * that reads as complete data is the one failure the brain must never have.
   */
  it("appends a truncation notice, and stays within the ceiling", async () => {
    const { capWithNotice } = await import("@/app/api/mcp/route");
    const out = capWithNotice("x".repeat(80_000));
    expect(out).toMatch(/TRUNCATED/);
    expect(out).toMatch(/page with offset/);
    // The notice must fit INSIDE the cap, not push the payload past it.
    expect(out.length).toBeLessThanOrEqual(40_000);
  });

  it("leaves a result that fits completely untouched", async () => {
    const { capWithNotice } = await import("@/app/api/mcp/route");
    expect(capWithNotice("short answer")).toBe("short answer");
    // Exactly at the boundary is not truncated, so the notice cannot appear on a
    // complete result and teach the model to distrust good data.
    expect(capWithNotice("y".repeat(40_000))).not.toMatch(/TRUNCATED/);
  });

  it("does not tell a caller at the row cap to raise the limit, which does nothing", async () => {
    // query_product_data clamps to 1000. Advising "raise limit" sends the model to
    // retry at 5000, get the same 1000 rows back, and conclude it has everything.
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync("app/api/mcp/route.ts", "utf8")
    );
    // Anchor on the CODE, not on prose: an earlier version of this test sliced from
    // the first "rows shown" in the file and started matching a comment instead.
    expect(src).toMatch(/limit >= MAX_PRODUCT_ROWS/);
    expect(src).toMatch(/per-call maximum, so page with offset/);

  });
});

describe("query_external_service must not bypass the truncation notice", () => {
  /**
   * The first version of `capWithNotice` could not fire on this path at all: the
   * external-service branch pre-sliced to `MAX_RESULT_CHARS - 500`, putting every
   * response under the ceiling the notice checks. So oversized Vercel and GitHub
   * responses came back cut mid-JSON, with isError=false and nothing said — the
   * exact failure the notice was added to end, surviving inside the fix for it.
   */
  it("does not slice the body before textResult sees it", async () => {
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync("app/api/mcp/route.ts", "utf8")
    );
    // Narrow on purpose: slicing an ERROR EXCERPT to a few hundred chars is fine
    // and is done elsewhere. What must never recur is a slice measured against the
    // ceiling itself, because that is what silently disarms the notice.
    expect(src).not.toMatch(/\.slice\(0,\s*MAX_RESULT_CHARS\s*-\s*\d/);
    expect(src).toMatch(/const text = await res\.text\(\)\.catch/);
    // capWithNotice is the ONLY place allowed to cut at the ceiling.
    const atCeiling = [...src.matchAll(/\.slice\(0,\s*MAX_RESULT_CHARS/g)];
    expect(atCeiling.length).toBe(1);
  });
});

describe("list results must be cut on a row boundary, and counted honestly", () => {
  /**
   * Both list tools counted the rows they FETCHED, rendered them, and let the
   * ceiling cut the text — so the header said "1000 rows shown" while the body
   * carried 76 and the JSON ended mid-object. A caller following the header's own
   * advice and paging with offset=1000 then SKIPPED the 924 rows that were fetched
   * and never delivered: 92% of a wide-table walk lost, in silence.
   */
  it("returns only whole rows and reports how many it actually returned", async () => {
    const { renderRowsForTest } = await import("@/app/api/mcp/route");
    const rows = Array.from({ length: 500 }, (_, i) => ({ id: i, blob: "x".repeat(200) }));
    const { text, shown } = renderRowsForTest(rows, 5_000);
    expect(shown).toBeLessThan(rows.length);
    expect(text.length).toBeLessThanOrEqual(5_000);
    // The whole point: what comes back must PARSE. A mid-object cut does not.
    const parsed = JSON.parse(text) as unknown[];
    expect(parsed).toHaveLength(shown);
  });

  it("emits every row when they all fit", async () => {
    const { renderRowsForTest } = await import("@/app/api/mcp/route");
    const rows = [{ a: 1 }, { a: 2 }];
    const { text, shown } = renderRowsForTest(rows, 5_000);
    expect(shown).toBe(2);
    expect(JSON.parse(text)).toEqual(rows);
  });

  it("is compact — pretty-printing is what put the first month out of reach", async () => {
    const { renderRowsForTest } = await import("@/app/api/mcp/route");
    const rows = Array.from({ length: 40 }, (_, i) => ({ day: `2026-04-${i}`, visits: i }));
    const compact = renderRowsForTest(rows, 1_000_000).text;
    // The invariant is "not pretty-printed", not a particular ratio — indentation is
    // what multiplied the payload, and small objects do not hit a 2x saving.
    expect(compact).not.toMatch(/\n\s\s/);
    expect(compact.length).toBeLessThan(JSON.stringify(rows, null, 2).length);
  });
});

describe("an empty schema must never be cached", () => {
  /**
   * `productSchema()` cached whatever it parsed, so one 200 that yielded an empty
   * map was pinned for the lambda's life: list_product_tables reported success with
   * zero tables, and query_product_data answered "No such table" for every real
   * one — blindness presented as absence, which is the failure mode that destroys
   * trust in the whole tool.
   */
  it("only stores a non-empty result", async () => {
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync("app/api/mcp/route.ts", "utf8")
    );
    expect(src).toMatch(/if \(out\.size > 0\) schemaCache = out;/);
    expect(src).not.toMatch(/\n  schemaCache = out;/);
  });
});
