import { createHmac } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockAnswerQuestion = vi.fn();
const mockClaimQuestion = vi.fn();
const mockFinishQuestion = vi.fn();
const mockQuestionsToday = vi.fn();
const mockPostBrainReply = vi.fn();

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// The route deliberately does NOT await its post-response work -- Slack needs the
// 200 within 3 seconds. So the mock captures the promise and tests await it
// explicitly via flush(); simply calling fn() would let assertions run before the
// answer had been posted.
let deferred: Promise<void> | null = null;
vi.mock("@shared/http/after-response", () => ({
  scheduleAfterResponse: (_name: string, fn: () => Promise<void>) => {
    deferred = fn();
  },
}));

/** Wait for the work the route scheduled after responding. */
async function flush(): Promise<void> {
  await deferred;
  deferred = null;
}

// postBrainReply makes a real HTTPS call to slack.com. Only it is replaced; the
// pure helpers below (signature verification, mention stripping) stay real,
// because they are the security-critical logic under test.
vi.mock("@features/brain/server/slack", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@features/brain/server/slack")>()),
  postBrainReply: (...args: unknown[]) => mockPostBrainReply(...args),
}));

vi.mock("@features/brain/server/answer", () => ({
  answerQuestion: (...args: unknown[]) => mockAnswerQuestion(...args),
}));

vi.mock("@features/brain/server/log", () => ({
  claimQuestion: (...args: unknown[]) => mockClaimQuestion(...args),
  finishQuestion: (...args: unknown[]) => mockFinishQuestion(...args),
  questionsToday: (...args: unknown[]) => mockQuestionsToday(...args),
  DAILY_QUESTION_LIMIT: 220,
}));

import { POST } from "@/app/api/slack/events/route";
import {
  stripMention,
  verifySlackSignature,
  isBrainSlackConfigured,
} from "@features/brain/server/slack";

const SECRET = "slack_test_signing_secret";
const ORIGINAL_ENV = { ...process.env };

function sign(rawBody: string, tsSec: number, secret = SECRET): string {
  return `v0=${createHmac("sha256", secret).update(`v0:${tsSec}:${rawBody}`).digest("hex")}`;
}

function makeRequest(
  rawBody: string,
  opts: { signature?: string | null; timestamp?: string | null } = {}
): Request {
  const tsSec = Math.floor(Date.now() / 1000);
  const headers: Record<string, string> = { "content-type": "application/json" };
  const signature = opts.signature === undefined ? sign(rawBody, tsSec) : opts.signature;
  const timestamp = opts.timestamp === undefined ? String(tsSec) : opts.timestamp;
  if (signature !== null) headers["x-slack-signature"] = signature;
  if (timestamp !== null) headers["x-slack-request-timestamp"] = timestamp;
  return new Request("https://www.loveiq.org/api/slack/events", {
    method: "POST",
    headers,
    body: rawBody,
  });
}

function eventEnvelope(event: Record<string, unknown>, eventId = "Ev123") {
  return JSON.stringify({ type: "event_callback", event_id: eventId, event });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env = { ...ORIGINAL_ENV };
  process.env.SLACK_BRAIN_SIGNING_SECRET = SECRET;
  process.env.SLACK_BRAIN_BOT_TOKEN = "xoxb-test";
  mockClaimQuestion.mockResolvedValue({ id: 1, duplicate: false });
  mockFinishQuestion.mockResolvedValue(undefined);
  mockQuestionsToday.mockResolvedValue(0);
  mockPostBrainReply.mockResolvedValue(true);
  mockAnswerQuestion.mockResolvedValue({
    status: "answered",
    text: "an answer",
    blocks: [],
    sources: [],
    latencyMs: 10,
  });
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("verifySlackSignature", () => {
  const body = '{"type":"event_callback"}';

  it("accepts a correctly signed request", () => {
    const ts = Math.floor(Date.now() / 1000);
    expect(verifySlackSignature(body, sign(body, ts), String(ts), SECRET)).toBe(true);
  });

  it("rejects a signature made with a different secret", () => {
    const ts = Math.floor(Date.now() / 1000);
    expect(verifySlackSignature(body, sign(body, ts, "wrong"), String(ts), SECRET)).toBe(false);
  });

  it("rejects a tampered body — the signature covers the exact bytes", () => {
    const ts = Math.floor(Date.now() / 1000);
    const sig = sign(body, ts);
    expect(verifySlackSignature(body + " ", sig, String(ts), SECRET)).toBe(false);
  });

  it("rejects a replayed request older than the 5 minute window", () => {
    const stale = Math.floor(Date.now() / 1000) - 301;
    expect(verifySlackSignature(body, sign(body, stale), String(stale), SECRET)).toBe(false);
  });

  it("accepts a request just inside the window", () => {
    const recent = Math.floor(Date.now() / 1000) - 299;
    expect(verifySlackSignature(body, sign(body, recent), String(recent), SECRET)).toBe(true);
  });

  it("rejects a future timestamp beyond the window", () => {
    const future = Math.floor(Date.now() / 1000) + 400;
    expect(verifySlackSignature(body, sign(body, future), String(future), SECRET)).toBe(false);
  });

  it("rejects missing signature or timestamp", () => {
    const ts = String(Math.floor(Date.now() / 1000));
    expect(verifySlackSignature(body, null, ts, SECRET)).toBe(false);
    expect(verifySlackSignature(body, sign(body, Number(ts)), null, SECRET)).toBe(false);
  });

  it("rejects a non-numeric timestamp instead of throwing", () => {
    expect(verifySlackSignature(body, "v0=abc", "not-a-number", SECRET)).toBe(false);
  });

  it("returns false rather than throwing on a length mismatch", () => {
    // timingSafeEqual throws when the buffers differ in length, so the guard in
    // front of it is load-bearing, not an optimisation.
    const ts = String(Math.floor(Date.now() / 1000));
    expect(() => verifySlackSignature(body, "v0=short", ts, SECRET)).not.toThrow();
    expect(verifySlackSignature(body, "v0=short", ts, SECRET)).toBe(false);
  });
});

describe("stripMention", () => {
  it("removes the bot mention and collapses whitespace", () => {
    expect(stripMention("<@U12345ABC>   why is the purge off?")).toBe("why is the purge off?");
  });

  it("removes mentions anywhere in the text", () => {
    expect(stripMention("hey <@U1A> what did <@W2B> change")).toBe("hey what did change");
  });

  it("leaves a question with no mention untouched", () => {
    expect(stripMention("what is the nurture sequence")).toBe("what is the nurture sequence");
  });
});

describe("isBrainSlackConfigured", () => {
  it("is false when either half of the config is missing", () => {
    delete process.env.SLACK_BRAIN_BOT_TOKEN;
    expect(isBrainSlackConfigured()).toBe(false);
    process.env.SLACK_BRAIN_BOT_TOKEN = "xoxb-test";
    delete process.env.SLACK_BRAIN_SIGNING_SECRET;
    expect(isBrainSlackConfigured()).toBe(false);
  });
});

describe("POST /api/slack/events", () => {
  it("returns 503 when the signing secret is unset, so it is safe to deploy early", async () => {
    delete process.env.SLACK_BRAIN_SIGNING_SECRET;
    const res = await POST(makeRequest("{}"));
    expect(res.status).toBe(503);
    expect(mockAnswerQuestion).not.toHaveBeenCalled();
  });

  it("returns 401 on a bad signature", async () => {
    const res = await POST(makeRequest(eventEnvelope({}), { signature: "v0=deadbeef" }));
    expect(res.status).toBe(401);
    expect(mockClaimQuestion).not.toHaveBeenCalled();
  });

  it("answers the url_verification handshake", async () => {
    const body = JSON.stringify({ type: "url_verification", challenge: "abc123" });
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ challenge: "abc123" });
  });

  it("answers an app_mention in-thread", async () => {
    const body = eventEnvelope({
      type: "app_mention",
      user: "U1",
      channel: "C1",
      ts: "1700000000.1",
      text: "<@UBOT> why is the purge off",
    });
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(200);
    await flush();
    expect(mockAnswerQuestion).toHaveBeenCalledWith({ question: "why is the purge off" });
    expect(mockFinishQuestion).toHaveBeenCalled();
    expect(mockPostBrainReply).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "C1", threadTs: "1700000000.1" })
    );
  });

  it("answers a direct message", async () => {
    const body = eventEnvelope({
      type: "message",
      channel_type: "im",
      user: "U1",
      channel: "D1",
      ts: "1700000000.1",
      text: "how does the nurture sequence work",
    });
    await POST(makeRequest(body));
    await flush();
    expect(mockAnswerQuestion).toHaveBeenCalledWith({
      question: "how does the nurture sequence work",
    });
  });

  it("ignores its own reply, so the bot cannot loop against its own quota", async () => {
    const body = eventEnvelope({
      type: "message",
      channel_type: "im",
      bot_id: "B1",
      user: "U1",
      channel: "D1",
      text: "an answer it just posted",
    });
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(200);
    expect(mockClaimQuestion).not.toHaveBeenCalled();
    expect(mockAnswerQuestion).not.toHaveBeenCalled();
  });

  it("ignores message subtypes like edits and joins", async () => {
    const body = eventEnvelope({
      type: "message",
      channel_type: "im",
      subtype: "message_changed",
      user: "U1",
      channel: "D1",
      text: "edited",
    });
    await POST(makeRequest(body));
    expect(mockAnswerQuestion).not.toHaveBeenCalled();
  });

  it("ignores a channel message that does not mention the bot", async () => {
    const body = eventEnvelope({
      type: "message",
      channel_type: "channel",
      user: "U1",
      channel: "C1",
      text: "just chatting",
    });
    await POST(makeRequest(body));
    expect(mockAnswerQuestion).not.toHaveBeenCalled();
  });

  it("does not answer a retried delivery twice", async () => {
    mockClaimQuestion.mockResolvedValue({ id: null, duplicate: true });
    const body = eventEnvelope({
      type: "app_mention",
      user: "U1",
      channel: "C1",
      ts: "1700000000.1",
      text: "<@UBOT> repeated question",
    });
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(200);
    expect(mockAnswerQuestion).not.toHaveBeenCalled();
  });

  it("refuses to spend a model request once the daily quota is gone", async () => {
    mockQuestionsToday.mockResolvedValue(221);
    const body = eventEnvelope({
      type: "app_mention",
      user: "U1",
      channel: "C1",
      ts: "1700000000.1",
      text: "<@UBOT> anything",
    });
    await POST(makeRequest(body));
    await flush();
    expect(mockAnswerQuestion).not.toHaveBeenCalled();
    expect(mockFinishQuestion).toHaveBeenCalledWith(1, { error: "daily quota exceeded" });
  });

  it("still answers when the quota count cannot be read (fails open)", async () => {
    mockQuestionsToday.mockResolvedValue(null);
    const body = eventEnvelope({
      type: "app_mention",
      user: "U1",
      channel: "C1",
      ts: "1700000000.1",
      text: "<@UBOT> anything",
    });
    await POST(makeRequest(body));
    await flush();
    expect(mockAnswerQuestion).toHaveBeenCalled();
  });

  it("ignores an empty question rather than spending a request on it", async () => {
    const body = eventEnvelope({
      type: "app_mention",
      user: "U1",
      channel: "C1",
      ts: "1700000000.1",
      text: "<@UBOT>",
    });
    await POST(makeRequest(body));
    expect(mockClaimQuestion).not.toHaveBeenCalled();
  });
});

describe("push-based ingest: a public channel message is corpus, not a question", () => {
  /**
   * Polling every 15 minutes left the brain up to 15 minutes behind the
   * conversation. Slack tells us the moment something is said, so this makes it
   * seconds. The cron stays as the safety net: if this webhook is unsubscribed or
   * failing, the corpus degrades to quarter-hourly rather than stopping.
   */
  const channelMessage = (over: Record<string, unknown> = {}) =>
    JSON.stringify({
      type: "event_callback",
      event_id: `Ev${Math.random().toString(36).slice(2)}`,
      team_id: "T09Q1FE9WFJ",
      event: {
        type: "message",
        channel_type: "channel",
        channel: "C0AN7REQFLG",
        user: "U0BSZ4VRX26",
        text: "we should raise the price",
        ts: "1787941701.811139",
        ...over,
      },
    });

  beforeEach(() => {
    process.env.SLACK_BRAIN_SIGNING_SECRET = SECRET;
    process.env.SLACK_BRAIN_TEAM_ID = "T09Q1FE9WFJ";
    // `deferred` is module-level and only cleared by flush(); a test that asserts
    // NOTHING was scheduled would otherwise pass or fail on the previous test's
    // leftovers rather than on its own behaviour.
    deferred = null;
  });

  it("acks immediately and does the ingest AFTER responding", async () => {
    // Slack's deadline is 3s; the pass takes 4-12s. Doing it inline would time out
    // and Slack would retry, multiplying the work.
    const body = channelMessage();
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(200);
    // The work must have been deferred, not awaited.
    expect(deferred).not.toBeNull();
  });

  it("ignores a bot's own post, so the brain cannot feed itself", async () => {
    const res = await POST(makeRequest(channelMessage({ bot_id: "B123", user: undefined })));
    expect(res.status).toBe(200);
    expect(deferred).toBeNull();
  });

  it("ignores joins and edits, which carry a subtype and are not conversation", async () => {
    for (const subtype of ["channel_join", "message_changed", "message_deleted"]) {
      deferred = null;
      await POST(makeRequest(channelMessage({ subtype })));
      expect(deferred, subtype).toBeNull();
    }
  });

  it("refuses a message from a DIFFERENT Slack workspace", async () => {
    // A signed request proves the sender is Slack, not that it is OUR Slack — and
    // this branch WRITES to the corpus, so the team check is repeated for it.
    const body = channelMessage();
    const foreign = body.replace('"team_id":"T09Q1FE9WFJ"', '"team_id":"T_SOMEONE_ELSE"');
    await POST(makeRequest(foreign));
    expect(deferred).toBeNull();
  });

  it("still treats a DM as a question, not as corpus", async () => {
    // The two paths must not collide: a DM is answered, a channel post is indexed.
    await POST(
      makeRequest(channelMessage({ channel_type: "im", text: "what did we decide on pricing" }))
    );
    expect(deferred).not.toBeNull();
    await flush();
    expect(mockAnswerQuestion).toHaveBeenCalled();
  });
});
