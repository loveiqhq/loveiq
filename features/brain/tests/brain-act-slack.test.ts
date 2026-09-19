import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
const mockFetch = vi.fn();
vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: (...a: unknown[]) => mockFetch(...(a as [])),
}));

import {
  clearSlackCache,
  postToSlack,
  resolveTarget,
  SlackTargetError,
} from "@features/brain/server/act/slack";

/** Slack answers 200 with `ok:false` for every failure, so status never reveals one. */
const reply = (body: Record<string, unknown>) => ({ ok: true, json: async () => body });

const CHANNELS = {
  ok: true,
  channels: [
    { id: "C1", name: "all-loveiq", is_member: true },
    { id: "C2", name: "prod-alerts", is_member: true },
    { id: "C3", name: "founders-only", is_member: false },
  ],
};
const USERS = {
  ok: true,
  members: [
    { id: "U1", name: "eman.cickusic", real_name: "Eman", deleted: false, is_bot: false },
    { id: "U2", name: "mb", real_name: "Marcus Börner", deleted: false, is_bot: false },
    { id: "U3", name: "gone", deleted: true, is_bot: false },
    { id: "B1", name: "loveiq_brain", deleted: false, is_bot: true },
  ],
};

function wire(over: Record<string, Record<string, unknown>> = {}) {
  mockFetch.mockImplementation(async (url: string) => {
    const u = String(url);
    for (const [needle, body] of Object.entries(over)) if (u.includes(needle)) return reply(body);
    if (u.includes("conversations.list")) return reply(CHANNELS);
    if (u.includes("users.list")) return reply(USERS);
    if (u.includes("conversations.open")) return reply({ ok: true, channel: { id: "D9" } });
    if (u.includes("chat.postMessage")) return reply({ ok: true, ts: "123.456" });
    if (u.includes("chat.getPermalink")) return reply({ ok: true, permalink: "https://s/p/123" });
    return reply({ ok: false, error: "unexpected_method" });
  });
}

beforeEach(() => {
  clearSlackCache();
  mockFetch.mockReset();
  process.env.SLACK_BRAIN_BOT_TOKEN = "xoxb-test";
  wire();
});

describe("resolving where to post", () => {
  it.each([
    ["#all-loveiq", "C1"],
    ["all-loveiq", "C1"],
    ["ALL-LOVEIQ", "C1"],
    ["C09P0Q266R1", "C09P0Q266R1"],
  ])("resolves %j", async (given, id) => {
    expect((await resolveTarget(given)).id).toBe(id);
  });

  it("resolves a person by handle or by real name", async () => {
    expect((await resolveTarget("@mb")).id).toBe("U2");
    expect((await resolveTarget("@marcus börner")).id).toBe("U2");
  });

  /**
   * "NO SUCH CHANNEL" AND "THE BOT IS NOT IN IT" ARE DIFFERENT PROBLEMS, and telling them
   * apart is the whole difference between rewording and asking someone to invite the bot.
   * Relaying Slack's own `not_in_channel` reads as a fault rather than as a permission
   * nobody has granted yet.
   */
  it("distinguishes a channel it cannot see from one it is not in", async () => {
    await expect(resolveTarget("#nope")).rejects.toThrow(/no channel called "#nope"/);
    await expect(resolveTarget("#founders-only")).rejects.toThrow(/not in it/);
    await expect(resolveTarget("#founders-only")).rejects.toThrow(/Invite it/);
  });

  /** A refusal that lists the options is one the caller can act on; one that does not
   *  invites a second guess, and a third. */
  it("lists what it CAN reach when it refuses", async () => {
    await expect(resolveTarget("#nope")).rejects.toThrow(/#all-loveiq/);
    // Never offers a channel it could not post to anyway.
    await expect(resolveTarget("#nope")).rejects.not.toThrow(/founders-only/);
    await expect(resolveTarget("@nobody")).rejects.toThrow(/@mb/);
  });

  it("refuses an empty target rather than guessing one", async () => {
    await expect(resolveTarget("   ")).rejects.toThrow(SlackTargetError);
  });

  it("leaves out bots and deactivated people", async () => {
    await expect(resolveTarget("@gone")).rejects.toThrow(/No one/);
    await expect(resolveTarget("@loveiq_brain")).rejects.toThrow(/No one/);
  });

  /** Two lists per post is three API calls where one would do; both change rarely. */
  it("reads the directory once, not once per post", async () => {
    await resolveTarget("#all-loveiq");
    const first = mockFetch.mock.calls.length;
    await resolveTarget("#prod-alerts");
    expect(mockFetch.mock.calls.length).toBe(first);
  });
});

describe("posting", () => {
  it("posts and reports back the link and the thread handle", async () => {
    const r = await postToSlack({ channel: "#all-loveiq", text: "hello" });
    expect(r.target.label).toBe("#all-loveiq");
    expect(r.ts).toBe("123.456");
    expect(r.permalink).toBe("https://s/p/123");
    const [, init] = mockFetch.mock.calls.find(([u]) => String(u).includes("chat.postMessage"))!;
    expect(JSON.parse(String((init as { body: string }).body))).toMatchObject({
      channel: "C1",
      text: "hello",
    });
  });

  it("opens a conversation before sending a direct message", async () => {
    const r = await postToSlack({ channel: "@mb", text: "hi" });
    expect(mockFetch.mock.calls.some(([u]) => String(u).includes("conversations.open"))).toBe(true);
    const [, init] = mockFetch.mock.calls.find(([u]) => String(u).includes("chat.postMessage"))!;
    // The DM channel, not the user id — posting to a user id silently fails.
    expect(JSON.parse(String((init as { body: string }).body)).channel).toBe("D9");
    expect(r.target.kind).toBe("dm");
  });

  it("replies inside a thread when given one", async () => {
    await postToSlack({ channel: "#all-loveiq", text: "re", threadTs: "999.1" });
    const [, init] = mockFetch.mock.calls.find(([u]) => String(u).includes("chat.postMessage"))!;
    expect(JSON.parse(String((init as { body: string }).body)).thread_ts).toBe("999.1");
  });

  it("does not thread when not asked to", async () => {
    await postToSlack({ channel: "#all-loveiq", text: "new" });
    const [, init] = mockFetch.mock.calls.find(([u]) => String(u).includes("chat.postMessage"))!;
    expect(JSON.parse(String((init as { body: string }).body))).not.toHaveProperty("thread_ts");
  });

  /**
   * NOTHING FROM HERE MAY NOTIFY A WHOLE CHANNEL.
   *
   * Slack expands `<!channel>` and `<!here>` out of raw message text. A message assembled
   * from corpus content is assembled from text anyone can write — the public contact form
   * emails a mailbox this brain indexes, and people from other workspaces write in shared
   * channels it reads. `link_names: false` is the difference between a quoted string and
   * a notification to ten colleagues.
   */
  it("never lets a message notify everyone", async () => {
    await postToSlack({ channel: "#all-loveiq", text: "<!channel> urgent" });
    const [, init] = mockFetch.mock.calls.find(([u]) => String(u).includes("chat.postMessage"))!;
    expect(JSON.parse(String((init as { body: string }).body)).link_names).toBe(false);
  });

  /** Slack reports failure as `ok:false` inside a 200. Reading the status alone would
   *  report every failure as a success. */
  it("treats ok:false as the failure it is", async () => {
    wire({ "chat.postMessage": { ok: false, error: "channel_not_found" } });
    await expect(postToSlack({ channel: "#all-loveiq", text: "x" })).rejects.toThrow(
      /channel_not_found/
    );
  });

  /** The message is posted either way; a missing link is cosmetic and must not undo it. */
  it("still reports a successful post when the permalink cannot be read", async () => {
    wire({ "chat.getPermalink": { ok: false, error: "message_not_found" } });
    const r = await postToSlack({ channel: "#all-loveiq", text: "x" });
    expect(r.ts).toBe("123.456");
    expect(r.permalink).toBeNull();
  });
});
