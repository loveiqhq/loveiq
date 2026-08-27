import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockRetrieve = vi.fn();
vi.mock("@features/brain/server/retrieve", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@features/brain/server/retrieve")>()),
  retrieve: (...a: unknown[]) => mockRetrieve(...a),
}));

vi.mock("@features/admin/server/supabase", () => ({ supabaseFetch: vi.fn() }));
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

    it("lists exactly the three tools, each with a schema", async () => {
      const body = await (await POST(rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" }))).json();
      expect(body.result.tools.map((t: { name: string }) => t.name)).toEqual([
        "search_company_context",
        "get_business_numbers",
        "list_sources",
      ]);
      for (const t of body.result.tools) expect(t.inputSchema.type).toBe("object");
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
});
