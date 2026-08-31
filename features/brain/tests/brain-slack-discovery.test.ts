import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

/** Every Slack API path this run requested, in order. */
const slackCalls: string[] = [];
/** Conversation types Slack will accept; anything else answers missing_scope. */
let supportedTypes = new Set(["public_channel", "private_channel", "mpim"]);
let listHttpFails = false;

vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: vi.fn(async (url: string) => {
    slackCalls.push(url);
    const u = new URL(url);
    const ok = (json: unknown) => ({
      ok: true,
      status: 200,
      json: async () => json,
    });

    if (u.pathname.endsWith("/conversations.list")) {
      if (listHttpFails) return { ok: false, status: 500, json: async () => ({}) };
      const asked = (u.searchParams.get("types") ?? "").split(",").filter(Boolean);
      const unsupported = asked.filter((t) => !supportedTypes.has(t));
      // Slack fails the WHOLE call on an unsupported type rather than filtering.
      if (unsupported.length > 0) {
        return ok({ ok: false, error: "missing_scope", needed: "groups:read" });
      }
      const all = [
        { id: "C1", name: "all-loveiq", is_member: true },
        { id: "C2", name: "founders-private", is_member: true, is_private: true },
        { id: "C3", name: "mpdm-eman--marcus--mark-1", is_member: true, is_mpim: true },
      ];
      return ok({ ok: true, channels: all.filter((c) => asked.some((t) => typeOf(c) === t)) });
    }
    if (u.pathname.endsWith("/users.list")) {
      return ok({ ok: true, members: [{ id: "U1", profile: { real_name: "Eman" } }] });
    }
    if (u.pathname.endsWith("/conversations.history")) {
      return ok({
        ok: true,
        messages: [{ user: "U1", text: "a real human message", ts: "1756600000.0" }],
      });
    }
    if (u.pathname.endsWith("/conversations.replies")) {
      return ok({ ok: true, messages: [] });
    }
    return ok({ ok: true });
  }),
}));

function typeOf(c: { is_private?: boolean; is_mpim?: boolean }): string {
  if (c.is_mpim) return "mpim";
  if (c.is_private) return "private_channel";
  return "public_channel";
}

vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: vi.fn(async (path: string, init?: RequestInit) => {
    const method = (init?.method ?? "GET").toUpperCase();
    if (method === "GET" && path.includes("brain_sweep_state")) {
      return { ok: true, status: 200, headers: new Headers(), json: async () => [] };
    }
    if (method === "GET") {
      return { ok: true, headers: new Headers({ "content-range": "0-0/0" }), json: async () => [] };
    }
    return { ok: true, status: 201, headers: new Headers(), json: async () => [] };
  }),
}));

import { ingestSlack } from "@features/brain/server/ingest/slack";

const STAMP = "2026-08-31T12:00:00.000Z";

beforeEach(() => {
  slackCalls.length = 0;
  supportedTypes = new Set(["public_channel", "private_channel", "mpim"]);
  listHttpFails = false;
  process.env.SLACK_BRAIN_BOT_TOKEN = "xoxb-test";
});

/** The `types=` value of each conversations.list request, in order. */
function listedTypes(): string[] {
  return slackCalls
    .filter((u) => u.includes("/conversations.list"))
    .map((u) => new URL(u).searchParams.get("types") ?? "");
}

describe("Slack discovery reaches private channels and group DMs", () => {
  it("asks for private channels and group DMs, not just public ones", async () => {
    await ingestSlack(STAMP);
    expect(listedTypes()[0]).toBe("public_channel,private_channel,mpim");
  });

  it("reads history from the private channel and the group DM it was invited to", async () => {
    await ingestSlack(STAMP);
    const historyChannels = slackCalls
      .filter((u) => u.includes("/conversations.history"))
      .map((u) => new URL(u).searchParams.get("channel"));
    expect(historyChannels).toContain("C2"); // founders-private
    expect(historyChannels).toContain("C3"); // the group DM
  });
});

describe("missing private scopes must not take public channels down", () => {
  /**
   * THE FAILURE MODE THIS GUARDS.
   *
   * `conversations.list` answers `missing_scope` for the WHOLE call when the app lacks
   * a scope for ANY requested type — it does not return what it can. So widening the
   * request without a fallback turns "we also read private channels" into "we read no
   * Slack at all", which is far worse than the gap it was meant to close.
   */
  beforeEach(() => {
    supportedTypes = new Set(["public_channel"]); // scopes not granted yet
  });

  it("falls back to public channels and still ingests them", async () => {
    const res = await ingestSlack(STAMP);
    expect(listedTypes()).toEqual(["public_channel,private_channel,mpim", "public_channel"]);
    expect(res.skipped).toBeUndefined();
  });

  it("still reads the public channel's history after falling back", async () => {
    await ingestSlack(STAMP);
    const historyChannels = slackCalls
      .filter((u) => u.includes("/conversations.history"))
      .map((u) => new URL(u).searchParams.get("channel"));
    expect(historyChannels).toContain("C1");
  });

  it("reports a genuine listing failure rather than pretending", async () => {
    // Both attempts fail — that is an outage, not a scope gap, and must stay loud.
    listHttpFails = true;
    const res = await ingestSlack(STAMP);
    expect(res.skipped).toBe("slack-list-failed");
  });
});
