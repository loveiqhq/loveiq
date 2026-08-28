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
vi.mock("@features/brain/server/ingest/analytics", () => ({ brainDailyRollup: vi.fn() }));

const mockRateLimit = vi.fn(async () => ({ allowed: true }));
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

    it("lists exactly the five tools, each with a schema", async () => {
      // Asserted exactly, not with toContain: a tool that disappears from the list
      // is unreachable to every connected Claude, and nothing else would notice.
      const body = await (await POST(rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" }))).json();
      expect(body.result.tools.map((t: { name: string }) => t.name)).toEqual([
        "search_company_context",
        "get_business_numbers",
        "list_product_tables",
        "query_product_data",
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
          return { ok: true, headers: new Headers(), json: async () => [{ updated_at: "2026-08-28T00:00:00Z" }] };
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
        rpc({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_sources", arguments: {} } })
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
      expect(await text()).toContain("jira: 0 chunks — NEVER INGESTED");
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
      paths: { "/rpc/get_conversion_funnel": {}, "/payment": {} },
    };

    function wire(rows: unknown, opts: { ok?: boolean; total?: number; status?: number } = {}) {
      mockSupabaseFetch.mockImplementation(async (path: string, init?: { headers?: Record<string, string> }) => {
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
      });
    }

    async function call(args: Record<string, unknown>, tool = "query_product_data") {
      const res = await POST(
        rpc({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: tool, arguments: args } })
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

    it("says how many rows MATCH, not just how many it returned", async () => {
      // The silent-truncation bug that made list_sources report 307 commits of
      // 1,448: a capped result that does not admit it reads as the whole picture.
      wire([{ id: 1 }, { id: 2 }], { total: 5000 });
      const r = await call({ table: "payment", limit: 2 });
      expect(r.content[0].text).toMatch(/2 rows shown, 5000 match/);
      expect(r.content[0].text).toMatch(/offset/);
    });

    it("does not claim truncation when everything fits", async () => {
      wire([{ id: 1 }, { id: 2 }], { total: 2 });
      expect((await call({ table: "payment" })).content[0].text).toMatch(/^2 rows\./);
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

    it("includes rpc functions, which have no column list", async () => {
      wire([]);
      const r = await call({ match: "rpc" }, "list_product_tables");
      expect(r.content[0].text).toContain("rpc/get_conversion_funnel");
    });
  });
});
