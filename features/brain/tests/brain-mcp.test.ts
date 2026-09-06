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

import { flushAfterResponse } from "@shared/http/after-response";
import { recordToolCall } from "@features/brain/server/log";
import { POST } from "@/app/api/mcp/route";
import { CorpusUnavailableError } from "@features/brain/server/retrieve";

const TOKEN = "test-token-0123456789";

/**
 * The Supabase calls the TOOL made, excluding the `brain_query` row that every
 * call now writes after the response.
 *
 * Needed because the log write lands on the same mock. Without the filter,
 * `.at(-1)` is the log write rather than the query under test, and
 * `not.toHaveBeenCalled()` can never hold again — which would silently turn the
 * rpc-writer refusal below into an assertion that passes for the wrong reason.
 */
function toolCalls(): unknown[][] {
  return mockSupabaseFetch.mock.calls.filter(
    ([path]) => !String(path).startsWith("/rest/v1/brain_query")
  );
}

/** The `brain_query` rows written so far, decoded, oldest first. */
function writes(): Array<Record<string, unknown>> {
  return mockSupabaseFetch.mock.calls
    .filter(([path]) => String(path).startsWith("/rest/v1/brain_query"))
    .map(
      ([, init]) => JSON.parse(String((init as { body: string }).body)) as Record<string, unknown>
    );
}

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

    it("lists exactly the seven tools, each with a schema", async () => {
      // Asserted exactly, not with toContain: a tool that disappears from the list
      // is unreachable to every connected Claude, and nothing else would notice.
      const body = await (await POST(rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" }))).json();
      expect(body.result.tools.map((t: { name: string }) => t.name)).toEqual([
        "search_company_context",
        "fetch_document",
        "get_business_numbers",
        "list_product_tables",
        "query_product_data",
        "query_external_service",
        "list_sources",
      ]);
      for (const t of body.result.tools) expect(t.inputSchema.type).toBe("object");
    });

    it("marks every tool read-only, and only the outside-services one open-world", async () => {
      /**
       * `readOnlyHint` is what lets a client stop asking permission per call, so it
       * is a promise about behaviour rather than decoration. This endpoint is
       * read-only by construction -- a sibling test asserts it never issues PATCH,
       * PUT or DELETE -- and this assertion is the tripwire for the day someone adds
       * a tool that writes and copies the annotation block along with everything else.
       *
       * `destructiveHint`/`idempotentHint` are deliberately absent: per the MCP spec
       * they only carry meaning when `readOnlyHint` is false, and setting them anyway
       * states something untrue about tools that cannot destroy anything.
       */
      const body = await (await POST(rpc({ jsonrpc: "2.0", id: 21, method: "tools/list" }))).json();
      const tools = body.result.tools as Array<{
        name: string;
        title?: string;
        annotations?: Record<string, boolean>;
      }>;
      for (const t of tools) {
        expect(t.annotations?.readOnlyHint, t.name).toBe(true);
        expect(t.annotations, t.name).not.toHaveProperty("destructiveHint");
        expect(typeof t.title, t.name).toBe("string");
      }
      expect(tools.filter((t) => t.annotations?.openWorldHint === true).map((t) => t.name)).toEqual(
        ["query_external_service"]
      );
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

    it("gives the model a score, a date and a fetch handle for every hit", async () => {
      /**
       * All three were computed and thrown away. `retrieve.ts` dropped `period_end`
       * in its mapper and `renderSources` printed no score, so the caller saw an
       * ORDER and nothing else -- it could not tell a 3.0 hit from a 0.05 one, could
       * not tell a decision from two days ago from a commit from March, and had no
       * way to ask for the rest of a document it could only see one part of.
       */
      mockRetrieve.mockResolvedValue([
        {
          source: "drive",
          sourceId: "doc:1AbC#4",
          title: "Meeting notes: Sync",
          url: null,
          body: "We agreed to ship it.",
          meta: { part: 4 },
          score: 2.5,
          periodEnd: "2026-08-22",
        },
      ]);
      const text = (await (await call({ query: "what did we agree" })).json()).result.content[0]
        .text as string;
      expect(text).toContain("relevance: 2.50");
      expect(text).toContain("date: 2026-08-22");
      expect(text).toContain("id: drive/doc:1AbC#4");
      // and the caller is told the number is not comparable across questions
      expect(text).toMatch(/NOT comparable between questions/);
      expect(text).toMatch(/the later `date:` is the current decision/);
    });

    it("names the sources it actually holds when nothing matches", async () => {
      // The old message advertised Jira, which has 0 chunks, and omitted Notion,
      // Slack, Gmail, Drive, the calendar and WhatsApp, which have 25,000 between
      // them. It told the model to search a source that cannot answer and hid seven
      // that can.
      mockRetrieve.mockResolvedValue([]);
      const text = (await (await call({ query: "something absent" })).json()).result.content[0]
        .text as string;
      expect(text).not.toMatch(/Jira/i);
      expect(text).toMatch(/Notion/);
      expect(text).toMatch(/Slack/);
      expect(text).toMatch(/list_sources/);
      expect(text).toMatch(/source code is not/i);
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

  describe("fetch_document", () => {
    const call = (args: Record<string, unknown>) =>
      POST(
        rpc({
          jsonrpc: "2.0",
          id: 40,
          method: "tools/call",
          params: { name: "fetch_document", arguments: args },
        })
      ).then((r) => r.json().then((b) => b.result));

    /** Rows a `source_id=like.<base>*` read would return, in the order Postgres gives. */
    function wireParts(rows: Array<Record<string, unknown>>) {
      mockSupabaseFetch.mockImplementation(async (path: string) => {
        if (String(path).startsWith("/rest/v1/brain_query")) {
          return { ok: true, headers: new Headers(), json: async () => [] };
        }
        return { ok: true, headers: new Headers(), json: async () => rows };
      });
    }

    const part = (n: number, body: string) => ({
      source: "drive",
      source_id: n === 1 ? "doc:1AbC" : `doc:1AbC#${n}`,
      title: n === 1 ? "Meeting notes: Sync" : `Meeting notes: Sync (part ${n} of 10)`,
      url: "https://docs.google.com/document/d/1AbC/edit",
      body,
      meta: n === 1 ? { kind: "meeting-notes" } : { kind: "meeting-notes", part: n, parts: 10 },
      period_end: "2026-08-22",
    });

    it("reassembles the parts in NUMERIC order, which a lexical sort gets wrong", async () => {
      // Postgres returns `#10` before `#2` on a string sort, so a document read back
      // in id order is a document read out of order — and nothing about the output
      // would say so.
      wireParts([part(1, "ONE"), part(10, "TEN"), part(2, "TWO")]);
      const r = await call({ id: "drive/doc:1AbC" });
      expect(r.isError).toBeFalsy();
      const text = r.content[0].text as string;
      expect(text.indexOf("ONE")).toBeLessThan(text.indexOf("TWO"));
      expect(text.indexOf("TWO")).toBeLessThan(text.indexOf("TEN"));
      expect(text).toContain("parts 1-10 of 3");
    });

    it("keeps the untrusted-data fence and the reading guide", async () => {
      wireParts([part(1, "body text")]);
      const text = (await call({ id: "drive/doc:1AbC" })).content[0].text as string;
      expect(text).toMatch(/UNTRUSTED DATA/);
      expect(text).toMatch(/<<<SOURCE 1>>>/);
      expect(text).toMatch(/date: 2026-08-22/);
    });

    it("cuts on a part boundary and names the part to resume from", async () => {
      // Half a chunk returned as a whole document is the exact failure this file is
      // written against, so the budget can never split one.
      wireParts([part(1, "A".repeat(900)), part(2, "B".repeat(900)), part(3, "C".repeat(900))]);
      const r = await call({ id: "drive/doc:1AbC", max_chars: 2500 });
      const text = r.content[0].text as string;
      expect(text).toContain("from_part=3");
      expect(text).not.toContain("C".repeat(900));
      // and the part it did include is whole, not sliced
      expect(text).toContain("B".repeat(900));
    });

    it("resumes from from_part", async () => {
      wireParts([part(1, "FIRST"), part(2, "SECOND")]);
      const text = (await call({ id: "drive/doc:1AbC", from_part: 2 })).content[0].text as string;
      expect(text).not.toContain("FIRST");
      expect(text).toContain("SECOND");
      expect(text).toContain("this is all of it");
    });

    it("strips a numeric part suffix but never a doc heading that ends in digits", async () => {
      // `docs/api.md#post-apistaging-login-2` is a HEADING, not part 2 of anything.
      // Stripping trailing digits here is the `monthly:2026-08` -> `monthly:2026`
      // collapse that retrieve.ts already carries a scar from.
      wireParts([part(1, "x")]);
      await call({ id: "drive/doc:1AbC#3" });
      const read = toolCalls()
        .map(([path]) => String(path))
        .find((p) => p.includes("brain_chunk"))!;
      expect(decodeURIComponent(read)).toContain("source_id=like.doc:1AbC*");

      mockSupabaseFetch.mockClear();
      wireParts([{ ...part(1, "y"), source: "doc", source_id: "docs/api.md#heading-2" }]);
      await call({ id: "doc/docs/api.md#heading-2" });
      const docRead = toolCalls()
        .map(([path]) => String(path))
        .find((p) => p.includes("brain_chunk"))!;
      expect(decodeURIComponent(docRead)).toContain("source_id=like.docs/api.md#heading-2*");
    });

    it("refuses an id it did not print, and says where ids come from", async () => {
      expect((await call({ id: "nonsense" })).isError).toBe(true);
      expect((await call({ id: "notasource/x" })).isError).toBe(true);
      wireParts([]);
      const missing = await call({ id: "drive/doc:doesnotexist" });
      expect(missing.isError).toBe(true);
      expect(missing.content[0].text).toMatch(/search_company_context/);
    });

    it("reports an outage as an outage, not as a missing document", async () => {
      mockSupabaseFetch.mockRejectedValue(new Error("down"));
      const r = await call({ id: "drive/doc:1AbC" });
      expect(r.isError).toBe(true);
      expect(r.content[0].text).toMatch(/outage, not a missing document/);
    });
  });

  describe("recording every call in brain_query", () => {
    /**
     * Until this landed, a successful `tools/call` wrote no row and logged no
     * line. `brain_query` held ONE row in its entire history -- from Slack, from
     * 2026-08-28 -- while the MCP door served every real question. Nothing could
     * say what the team asks, which answers came back empty, or whether a change
     * to ranking helped. Every later change to retrieval is a claim that needs
     * this instrument to be checkable at all.
     */
    const call = (args: Record<string, unknown>) =>
      POST(
        rpc({
          jsonrpc: "2.0",
          id: 30,
          method: "tools/call",
          params: { name: "search_company_context", arguments: args },
        })
      );

    beforeEach(() => {
      mockSupabaseFetch.mockResolvedValue({
        ok: true,
        headers: new Headers(),
        json: async () => [],
      });
    });

    it("records the tool, the question and what came back", async () => {
      mockRetrieve.mockResolvedValue([
        { source: "doc", sourceId: "a", title: "t", url: null, body: "b", meta: {}, score: 2.5 },
        {
          source: "commit",
          sourceId: "b",
          title: "u",
          url: null,
          body: "c",
          meta: {},
          score: 1.25,
        },
      ]);
      const body = await (await call({ query: "what is our revenue" })).json();
      expect(body.result.isError).toBe(false);

      await flushAfterResponse();
      const rows = writes();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        surface: "mcp",
        tool: "search_company_context",
        question: "what is our revenue",
        source_count: 2,
        // The BEST score, not the last one -- the cheapest signal that retrieval
        // is degrading is the top hit's score, and reading the wrong end of the
        // array would report a healthy search as a failing one.
        top_score: 2.5,
        error: null,
      });
      expect(typeof rows[0]!.latency_ms).toBe("number");
    });

    it("records a refusal with the refusal text, which is the diagnosis", async () => {
      const body = await (await call({ query: " " })).json();
      expect(body.result.isError).toBe(true);

      await flushAfterResponse();
      const rows = writes();
      expect(rows).toHaveLength(1);
      expect(String(rows[0]!.error)).toMatch(/at least two characters/);
      expect(rows[0]!.tool).toBe("search_company_context");
    });

    it("still answers when the recording write fails", async () => {
      // The whole point of writing after the response: a bookkeeping failure must
      // never be able to cost an answer. `finishQuestion` carries the same rule.
      mockSupabaseFetch.mockRejectedValue(new Error("brain_query is down"));
      mockRetrieve.mockResolvedValue([
        { source: "doc", sourceId: "a", title: "t", url: null, body: "hello", meta: {}, score: 1 },
      ]);
      const body = await (await call({ query: "anything" })).json();
      expect(body.result.isError).toBe(false);
      expect(body.result.content[0].text).toContain("hello");
      await expect(flushAfterResponse()).resolves.toBeUndefined();
    });

    it("never throws, even with nothing wrapping it", async () => {
      /**
       * `scheduleAfterResponse` catches too, so through the route this guard is
       * invisible: removing it leaves the whole suite green. It was written that
       * way and mutation testing caught it — a guard no test can fail is worse
       * than none, because it gets trusted.
       *
       * Exercised directly because `recordToolCall` is exported, and the next
       * caller is not obliged to wrap it.
       */
      mockSupabaseFetch.mockRejectedValue(new Error("brain_query is down"));
      await expect(
        recordToolCall({ tool: "t", question: "q", latencyMs: 1 })
      ).resolves.toBeUndefined();
    });

    it("redacts email addresses from both the question and the arguments", async () => {
      // `brain_chunk`'s migration promises this table holds "NO PII BEYOND WHAT
      // SLACK ALREADY HAS ... not a name or email". That was written when the only
      // writer was the Slack route; query_product_data takes filters, so an
      // ordinary call carries a customer address.
      mockRetrieve.mockResolvedValue([]);
      await call({ query: "threads with customer@example.com about refunds" });

      await flushAfterResponse();
      const row = writes()[0]!;
      expect(JSON.stringify(row)).not.toContain("customer@example.com");
      expect(String(row.question)).toBe("threads with [email] about refunds");
      expect(JSON.stringify(row.args)).toContain("[email]");
    });

    it("truncates oversized arguments instead of repairing cut JSON", async () => {
      // A half-object patched back to validity is a lie about what was sent, and
      // this column exists so a call can be reproduced.
      mockRetrieve.mockResolvedValue([]);
      await call({ query: "x".repeat(3000) });

      await flushAfterResponse();
      const args = writes()[0]!.args as Record<string, unknown>;
      expect(typeof args.truncated).toBe("string");
      expect(String(args.truncated).length).toBeLessThanOrEqual(2000);
      expect(args.query).toBeUndefined();
    });

    it("records a non-search tool too, keyed on its own meaningful argument", async () => {
      // Every tool is recorded, not just the one that happens to have a `query`.
      mockRollup.mockResolvedValue([{ day: "2026-09-01", revenue: 10 }]);
      await POST(
        rpc({
          jsonrpc: "2.0",
          id: 31,
          method: "tools/call",
          params: { name: "get_business_numbers", arguments: { days: 7 } },
        })
      );
      await flushAfterResponse();
      const row = writes()[0]!;
      expect(row.tool).toBe("get_business_numbers");
      // No query/id/table/path on this tool, so the name is the legible fallback.
      expect(row.question).toBe("get_business_numbers");
      // Counted for every tool that has a natural count, so the column does not
      // read as "this call returned nothing" when it means "nobody recorded it".
      expect(row.source_count).toBe(1);
      expect(row.top_score).toBeNull();
    });
  });

  describe("list_sources", () => {
    /**
     * Drive supabaseFetch by URL shape: the per-source count/newest reads, the
     * per-source updated_at read, and the `not.in` completeness probe.
     */
    /** Latest cron_run per job, keyed by cron name. Empty means "never ran". */
    let cronRuns: Record<string, { started_at: string; status: string; error_message?: string }> =
      {};

    function wireCorpus(present: Record<string, number>, unlisted: string[] = []) {
      mockSupabaseFetch.mockImplementation(async (path: string) => {
        if (path.includes("/cron_run?")) {
          const name = decodeURIComponent(/cron_name=eq\.([^&]+)/.exec(path)?.[1] ?? "");
          const run = cronRuns[name];
          return { ok: true, headers: new Headers(), json: async () => (run ? [run] : []) };
        }
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

    it("says a source is FAILING when its job is failing, however recent the write looks", async () => {
      /**
       * The regression this exists for. `last ingested` came from the write
       * timestamp, which moves whenever the ingester RUNS — including runs that
       * fetched nothing. Gmail had been fetching zero threads for two days while
       * this tool showed today's date, so anyone asking what the brain could see
       * was told a dead source was healthy.
       */
      cronRuns = {
        "brain-gmail": {
          started_at: "2026-08-30T22:11:05Z",
          status: "error",
          error_message: "gmail skipped: gmail-walk-incomplete",
        },
      };
      wireCorpus({ gmail: 9061 });
      const out = await text();
      expect(out).toContain("brain-gmail FAILING");
      expect(out).toContain("gmail-walk-incomplete");
    });

    it("says a source is ok when its job succeeded", async () => {
      cronRuns = { "brain-notion": { started_at: "2026-08-30T22:41:39Z", status: "success" } };
      wireCorpus({ notion: 1404 });
      expect(await text()).toContain("brain-notion ok at 2026-08-30 22:41");
    });

    /**
     * My own first attempt read the newest 200 cron rows and picked the latest per
     * name — but `brain-fast` alone writes 96 rows a day, so the NIGHTLY job fell
     * outside the window and was reported "never running" hours after it ran. That
     * is the same false confidence, pointed the other way.
     */
    it("does not call an infrequent nightly job 'never run' just because it is rare", async () => {
      cronRuns = { "brain-ingest": { started_at: "2026-08-30T04:47:44Z", status: "success" } };
      wireCorpus({ gsc: 276 });
      const out = await text();
      expect(out).not.toContain("no record of brain-ingest ever running");
      expect(out).toContain("brain-ingest ok at 2026-08-30 04:47");
    });

    it("names a job that genuinely has no record, rather than implying health", async () => {
      cronRuns = {};
      wireCorpus({ gmail: 10 });
      expect(await text()).toContain("no record of brain-gmail ever running");
    });

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
        "/rpc/get_report_counts": { post: { parameters: [{ in: "body", schema: {} }] } },
        // A writer, to prove the catalogue never advertises one.
        "/rpc/submit_survey": { post: { parameters: [{ in: "body", schema: {} }] } },
        // The three read-only non-get_* functions the gate allows by name.
        "/rpc/brain_search": { post: { parameters: [{ in: "body", schema: {} }] } },
        "/rpc/brain_daily_rollup": { post: { parameters: [{ in: "body", schema: {} }] } },
        "/rpc/find_stuck_payments": { post: { parameters: [{ in: "body", schema: {} }] } },
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
      expect((await call({ table: "payment" })).content[0].text).toMatch(
        /^2 rows returned, 2 match\./
      );
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
      const path = String(toolCalls().at(-1)?.[0]);
      expect(path).toContain("select=id%2Camount");
      expect(path).toContain("created_date_time=gte.2026-08-01");
      expect(path).toContain("amount=gt.0");
      expect(path).toContain("order=created_date_time.desc");
      expect(path).toContain("limit=10");
    });

    it("caps limit at 1000 and floors it at 1", async () => {
      wire([]);
      await call({ table: "payment", limit: 99999 });
      expect(String(toolCalls().at(-1)?.[0])).toContain("limit=1000");
      await call({ table: "payment", limit: -5 });
      expect(String(toolCalls().at(-1)?.[0])).toContain("limit=1");
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
      expect(text).toContain("rpc/get_report_counts((no arguments))");
      // A function that WRITES must never be offered to the model: the tool's own
      // description tells it to prefer rpc/ functions, and it cannot tell them apart.
      expect(text).not.toContain("submit_survey");
    });

    it("refuses an rpc/ function that WRITES, and does not call the database", async () => {
      // "Read-only by construction" was false. `table` was checked for identifier
      // shape and for membership in PostgREST's OpenAPI doc -- which lists every
      // function the SERVICE ROLE may execute. 11 of the 21 non-get_* ones wrote.
      wire([]);
      for (const fn of [
        "rpc/submit_survey", // inserts a real app_user + waitlist row
        "rpc/unlock_all_archetypes", // grants a paid report free, from two bigints
        "rpc/brain_set_embeddings", // can wipe the vectors semantic search runs on
        "rpc/upsert_archetype_tier",
        "rpc/create_report_share",
        "rpc/refresh_admin_submission_facts",
      ]) {
        mockSupabaseFetch.mockClear();
        const r = await call({ table: fn });
        expect(r.isError, fn).toBe(true);
        expect(r.content[0].text, fn).toMatch(/writes to the database/);
        // The refusal must happen BEFORE the request, not be inferred from a failure.
        expect(toolCalls(), fn).toHaveLength(0);
      }
    });

    it("REFUSES an unparseable filter instead of silently running unfiltered", async () => {
      /**
       * Measured against production before this fix: `["status=eq.succeeded"]`
       * returned 85 matches, and adding one dotted filter returned 315 — a 3.7x
       * overstatement, `isError: false`, byte-identical in shape to a correct
       * answer. Three bare `continue`s, no notice, no log.
       *
       * The refusal happens BEFORE the request, like the rpc writer gate, so a
       * caller can never receive rows from a query it did not ask for.
       */
      wire([{ id: 1 }], { total: 1 });
      mockSupabaseFetch.mockClear();
      const r = await call({ table: "payment", filters: ["not a filter at all"] });
      expect(r.isError).toBe(true);
      expect(r.content[0].text).toMatch(/could not be parsed/);
      expect(r.content[0].text).toMatch(/UNFILTERED/);
      expect(toolCalls().some(([p]) => String(p).includes("/rest/v1/payment"))).toBe(false);
    });

    it("ACCEPTS the dotted form PostgREST's own docs use, rather than dropping it", async () => {
      // `col.op.value` is the syntax `or=` is documented with, so it is what a model
      // writes. Rewriting it kills the measured bug at source; refusing it would only
      // make the bug loud.
      wire([{ id: 1 }], { total: 1 });
      mockSupabaseFetch.mockClear();
      const r = await call({
        table: "payment",
        filters: ["created_date_time.gte.2026-08-01", "status.not.eq.canceled"],
      });
      expect(r.isError).toBeFalsy();
      const path = decodeURIComponent(String(toolCalls().at(-1)?.[0]));
      expect(path).toContain("created_date_time=gte.2026-08-01");
      expect(path).toContain("status=not.eq.canceled");
    });

    it("keeps dots inside a value when the = form is used", async () => {
      wire([{ id: 1 }], { total: 1 });
      mockSupabaseFetch.mockClear();
      await call({ table: "payment", filters: ["email=like.*@loveiq.org"] });
      const path = decodeURIComponent(String(toolCalls().at(-1)?.[0]));
      expect(path).toContain("email=like.*@loveiq.org");
    });

    it("refuses rpc arguments it would silently ignore, and still runs a clean one", async () => {
      // On the rpc branch select/filters/order/limit/offset were computed and thrown
      // away while the header still printed offset paging advice. A caller who
      // filtered got the full unfiltered set with no way to tell.
      wire([{ day: "2026-09-01" }], { total: 1 });
      mockSupabaseFetch.mockClear();
      const refused = await call({ table: "rpc/get_report_counts", params: {}, limit: 10 });
      expect(refused.isError).toBe(true);
      expect(refused.content[0].text).toMatch(/silently dropped/);
      expect(toolCalls().some(([p]) => String(p).includes("get_report_counts"))).toBe(false);

      // Positive control: params-only still works, or the guard is just an outage.
      wire([{ day: "2026-09-01" }], { total: 1 });
      const ok = await call({ table: "rpc/get_report_counts", params: { since: "2026-01-01" } });
      expect(ok.isError).toBeFalsy();
    });

    it("records the row count it actually delivered, not the number fetched", async () => {
      // `shown`, not `rows.length`: the record has to say what the caller received,
      // or a result cut by the character ceiling reads back as a complete one.
      wire([{ id: 1 }, { id: 2 }, { id: 3 }], { total: 3 });
      await call({ table: "payment" });
      await flushAfterResponse();
      const row = writes().at(-1)!;
      expect(row.tool).toBe("query_product_data");
      expect(row.question).toBe("payment");
      expect(row.source_count).toBe(3);
    });

    it("still calls the read-only functions, including the three non-get_* ones", async () => {
      // Positive control: a gate that refused everything would pass the test above.
      for (const fn of [
        "rpc/get_conversion_funnel",
        "rpc/brain_search",
        "rpc/brain_daily_rollup",
        "rpc/find_stuck_payments",
      ]) {
        wire([]);
        mockSupabaseFetch.mockClear();
        const r = await call({ table: fn });
        expect(r.isError, fn).toBeFalsy();
        expect(String(toolCalls().at(-1)?.[0]), fn).toContain(fn);
      }
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

    it("refuses Slack's write methods, which it happily serves over GET", async () => {
      // Slack is RPC over HTTP: the verb is the path, so GET is not a read. Asking
      // for /files.delete reached Slack and was refused by SCOPE, not by us -- and
      // the brain bot does hold chat:write, im:write and channels:join.
      process.env.SLACK_BRAIN_BOT_TOKEN = "xoxb-test";
      for (const path of [
        "/files.delete",
        "/chat.postMessage",
        "/chat.delete",
        "/conversations.join",
        "/conversations.invite",
        "/admin.users.remove",
        "/files.upload",
      ]) {
        mockFetch.mockClear();
        const r = await call({ service: "slack", path });
        expect(r.isError, path).toBe(true);
        expect(r.content[0].text, path).toMatch(/only exposes its read methods/);
        expect(mockFetch, path).not.toHaveBeenCalled();
      }
    });

    it("still serves Slack's read methods", async () => {
      // Positive control for the allowlist above.
      process.env.SLACK_BRAIN_BOT_TOKEN = "xoxb-test";
      for (const path of [
        "/auth.test",
        "/conversations.list",
        "/conversations.history?channel=C1",
        "/conversations.members",
        "/users.info",
        "/users.list",
        "/team.info",
      ]) {
        mockFetch.mockClear();
        const r = await call({ service: "slack", path });
        expect(r.isError, path).toBeFalsy();
        expect(mockFetch, path).toHaveBeenCalled();
      }
    });

    it("rejects a percent-encoded path escape, which the raw-string check missed", async () => {
      // `%2e%2e` is `..` once the URL constructor normalises it, so the namespace
      // guard has to run on the DECODED path.
      for (const path of ["/%2e%2e/%2e%2e/admin", "/v1%2f%2e%2e%2fadmin"]) {
        mockFetch.mockClear();
        const r = await call({ service: "stripe", path });
        expect(r.isError, path).toBe(true);
        expect(mockFetch, path).not.toHaveBeenCalled();
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
      const list = await (await POST(rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }))).json();
      const init = await (await POST(rpc({ jsonrpc: "2.0", id: 2, method: "initialize" }))).json();
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
    const body = {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "list_sources", arguments: {} },
    };
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

  it("parses both filter syntaxes and names what it cannot parse", async () => {
    const { parseFiltersForTest } = await import("@/app/api/mcp/route");
    expect(parseFiltersForTest(["status=eq.paid"])).toEqual({
      parts: ["status=eq.paid"],
      rejected: [],
    });
    expect(parseFiltersForTest(["created_date_time.gte.2026-08-01"]).parts).toEqual([
      "created_date_time=gte.2026-08-01",
    ]);
    // A value containing dots must survive both forms.
    expect(parseFiltersForTest(["email=like.*@loveiq.org"]).parts[0]).toContain(
      encodeURIComponent("like.*@loveiq.org")
    );
    expect(parseFiltersForTest(["ts.gte.2026-08-01T00:00:00.000Z"]).parts[0]).toContain(
      encodeURIComponent("gte.2026-08-01T00:00:00.000Z")
    );
    // Rejected, not dropped: an unknown operator is a typo, not a filter.
    expect(parseFiltersForTest(["status.wat.paid"]).rejected).toEqual(["status.wat.paid"]);
    expect(parseFiltersForTest(["garbage"]).rejected).toEqual(["garbage"]);
    expect(parseFiltersForTest([42]).rejected).toEqual(["42"]);
    expect(parseFiltersForTest(["=novalue"]).rejected).toEqual(["=novalue"]);
  });

  it("gives advice that fits the tool that was cut", async () => {
    // Every tool used to be told to "select fewer columns", which is
    // query_product_data's advice and means nothing to a search or a document
    // fetch. Advice that does not apply reads as boilerplate, and gets skipped
    // along with the warning it is attached to.
    const { capWithNotice } = await import("@/app/api/mcp/route");
    const cut = capWithNotice("x".repeat(80_000), "lower the limit, then fetch_document");
    expect(cut).toMatch(/TRUNCATED/);
    expect(cut).toMatch(/lower the limit, then fetch_document/);
    expect(cut).not.toMatch(/select fewer columns/);
    expect(cut.length).toBeLessThanOrEqual(40_000);
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

describe("a source must report the health of the job that actually feeds it", () => {
  /**
   * Drive moved from `brain-fast` to its own hourly job, and this map was not
   * updated with it — so `list_sources` said "brain-fast ok" while `brain-drive`
   * was being killed at its timeout. Reporting the wrong job's health is worse than
   * reporting none, because it reads as a clean bill of health.
   */
  it("maps drive to brain-drive, not to the lane it used to live in", async () => {
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync("app/api/mcp/route.ts", "utf8")
    );
    expect(src).toMatch(/drive:\s*"brain-drive"/);
    expect(src).not.toMatch(/drive:\s*"brain-fast"/);
  });
});
