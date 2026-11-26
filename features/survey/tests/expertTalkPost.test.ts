import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockConfigured, mockPost, mockWarn, mockError } = vi.hoisted(() => ({
  mockConfigured: vi.fn(),
  mockPost: vi.fn(),
  mockWarn: vi.fn(),
  mockError: vi.fn(),
}));

vi.mock("@shared/observability/logger", () => ({
  default: { warn: mockWarn, error: mockError, info: vi.fn(), debug: vi.fn() },
}));
// Never Slack from a test.
vi.mock("@shared/observability/slack-bot", () => ({
  isSlackBotConfigured: () => mockConfigured(),
  postJourneyMessage: (...args: unknown[]) => mockPost(...args),
}));

import {
  buildExpertTalkMessage,
  expertTalkRequestOf,
  expertTalksChannel,
  postExpertTalkRequest,
  type ExpertTalkRequest,
} from "@features/survey/server/expertTalkPost";

const CHANNEL = "C0EXPERTTALKS";
const YES = "Yes, I'd like a free talk with an expert";
const PHONE = "+49 151 2345678";

/** A Survey 2.0 run that said Yes on the expert question (17004) and left its number. */
function answers(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    "17003": "€10 to €19",
    "17004": YES,
    "17004_other": PHONE,
    "15001": "Germany",
    "15002": "10115",
    ...overrides,
  };
}

function request(overrides: Partial<ExpertTalkRequest> = {}): ExpertTalkRequest {
  return {
    submissionId: 2891,
    firstName: "Anna",
    email: "anna@example.com",
    phone: PHONE,
    country: "Germany",
    ...overrides,
  };
}

/** Every string a post carries, blocks and the notification text alike. */
function everything(message: { text: string; blocks: unknown[] }): string {
  return [message.text, JSON.stringify(message.blocks)].join("\n");
}

describe("expertTalkRequestOf", () => {
  const run = (given: Record<string, unknown>) =>
    expertTalkRequestOf({
      submissionId: 2891,
      firstName: "Anna",
      email: "anna@example.com",
      answers: given,
    });

  it("turns a Yes with a phone number into a request", () => {
    expect(run(answers())).toEqual({
      submissionId: 2891,
      firstName: "Anna",
      email: "anna@example.com",
      phone: PHONE,
      country: "Germany",
    });
  });

  it("asks nothing of a Maybe later or a No", () => {
    expect(run(answers({ "17004": "Maybe later, after I've read my report" }))).toBeNull();
    expect(run(answers({ "17004": "No, thanks" }))).toBeNull();
  });

  it("asks nothing of a run that never saw the question (every survey but 2.0)", () => {
    expect(run({ "15001": "Germany" })).toBeNull();
  });

  it("asks nothing when the Yes came without a number anyone could call", () => {
    expect(run(answers({ "17004_other": undefined }))).toBeNull();
    // The country code alone, or fewer than six digits: the screen's own bar for Next.
    expect(run(answers({ "17004_other": "+49 " }))).toBeNull();
    expect(run(answers({ "17004_other": "+49 12345" }))).toBeNull();
  });

  it("keeps a request whose country is missing", () => {
    expect(run(answers({ "15001": undefined }))?.country).toBeNull();
  });
});

describe("expertTalksChannel", () => {
  afterEach(() => {
    delete process.env.SLACK_EXPERT_TALKS_CHANNEL_ID;
  });

  it("is off without the channel id", () => {
    mockConfigured.mockReturnValue(true);
    expect(expertTalksChannel()).toBeNull();
  });

  it("is off without the journey bot, which does the posting", () => {
    process.env.SLACK_EXPERT_TALKS_CHANNEL_ID = CHANNEL;
    mockConfigured.mockReturnValue(false);
    expect(expertTalksChannel()).toBeNull();
  });

  it("names the channel once both are set", () => {
    process.env.SLACK_EXPERT_TALKS_CHANNEL_ID = ` ${CHANNEL} `;
    mockConfigured.mockReturnValue(true);
    expect(expertTalksChannel()).toBe(CHANNEL);
  });
});

describe("buildExpertTalkMessage", () => {
  it("gives Mark and Marcus what a call needs: the name, the whole number and the country", () => {
    const message = buildExpertTalkMessage(request());
    const shown = JSON.stringify(message.blocks);
    expect(shown).toContain("Free expert talk request");
    expect(shown).toContain("#2891");
    expect(shown).toContain("Name: *Anna*");
    expect(shown).toContain(`Phone: *${PHONE}*`);
    expect(shown).toContain("Country (self-reported): *Germany*");
  });

  it("shows the email masked, as every other team post does", () => {
    const message = buildExpertTalkMessage(request());
    expect(everything(message)).not.toContain("anna@example.com");
    expect(JSON.stringify(message.blocks)).toContain("`a***@example.com`");
  });

  it("keeps the number out of the notification text, which lock screens show", () => {
    const message = buildExpertTalkMessage(request());
    expect(message.text).toContain("#2891");
    expect(message.text).not.toContain("2345678");
    expect(message.text).not.toContain("Anna");
  });

  it("marks a team run as most likely a test, and leaves the call to Mark and Marcus", () => {
    const message = buildExpertTalkMessage(request({ email: "fh@loveiq.org" }));
    expect(message.text).toMatch(/^Team test/);
    // The email question invites any address, so a reader can type one at our domain.
    expect(JSON.stringify(message.blocks)).toContain("most likely a team test");
    expect(JSON.stringify(message.blocks)).not.toContain("no call needed");
    expect(JSON.stringify(buildExpertTalkMessage(request()).blocks)).not.toContain("Team test");
  });

  it("says so when the country is missing", () => {
    const message = buildExpertTalkMessage(request({ country: null }));
    expect(JSON.stringify(message.blocks)).toContain("Country (self-reported): *—*");
  });

  it("cannot be made to ping the channel or open a link by what a reader types", () => {
    const message = buildExpertTalkMessage(
      request({
        firstName: "<!channel>",
        phone: "+49 <https://evil.example|call me>",
        country: "A&B",
      })
    );
    const shown = everything(message);
    expect(shown).not.toContain("<!channel>");
    expect(shown).not.toContain("<https://evil.example");
    expect(shown).toContain("&lt;!channel&gt;");
    expect(shown).toContain("A&amp;B");
  });

  it("keeps a plain @here, @channel or a bare link as text: the reader's lines are verbatim", () => {
    // Escaping can't reach these: without `verbatim` Slack itself turns a plain "@channel"
    // into a mention of the whole channel and a bare URL into a link.
    const message = buildExpertTalkMessage(
      request({ firstName: "@here", phone: "@channel 0151234567", country: "https://evil.example" })
    );
    const readerLines = message.blocks.filter((b) => JSON.stringify(b).includes("@channel"));
    expect(readerLines).toHaveLength(1);
    expect(readerLines[0]).toMatchObject({ type: "section", text: { verbatim: true } });
    expect(JSON.stringify(readerLines[0])).toContain("@here");
    expect(JSON.stringify(readerLines[0])).toContain("https://evil.example");
  });

  it("keeps each line to one line and a sane length", () => {
    const message = buildExpertTalkMessage(
      request({ firstName: `Anna\nPhone: *0000*`, phone: `${PHONE}${"9".repeat(200)}` })
    );
    const shown = JSON.stringify(message.blocks);
    expect(shown).not.toContain("Anna\\nPhone");
    // 40 characters at most, the cut marked: 39 of the number and "…".
    expect(shown).toContain(`Phone: *${`${PHONE}${"9".repeat(200)}`.slice(0, 39)}…*`);
  });

  it("cuts by characters, never through an emoji", () => {
    const fits = buildExpertTalkMessage(request({ firstName: `${"a".repeat(58)}😀😀` }));
    expect(JSON.stringify(fits.blocks)).toContain(`Name: *${"a".repeat(58)}😀😀*`);
    const cut = buildExpertTalkMessage(request({ firstName: `${"a".repeat(59)}😀😀` }));
    expect(JSON.stringify(cut.blocks)).toContain(`Name: *${"a".repeat(59)}…*`);
    // No half of a surrogate pair left behind for Slack to choke on.
    expect(JSON.stringify(cut.blocks)).not.toMatch(/\\ud83d(?!\\ude00)/i);
  });
});

describe("postExpertTalkRequest", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockConfigured.mockReturnValue(true);
    process.env.SLACK_EXPERT_TALKS_CHANNEL_ID = CHANNEL;
  });

  afterEach(() => {
    delete process.env.SLACK_EXPERT_TALKS_CHANNEL_ID;
    vi.unstubAllEnvs();
  });

  it("on production, a missing setting is an error #prod-alerts shows, naming the survey", async () => {
    delete process.env.SLACK_EXPERT_TALKS_CHANNEL_ID;
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.loveiq.org");

    await expect(postExpertTalkRequest(request())).resolves.toBe(false);

    expect(mockWarn).not.toHaveBeenCalled();
    expect(mockError).toHaveBeenCalledTimes(1);
    // The alert shows the message, not the log's fields: the id must be in the words.
    expect(String(mockError.mock.calls[0]![1])).toContain("#2891");
    expect(JSON.stringify(mockError.mock.calls)).not.toContain("2345678");
  });

  it("posts the request into #expert-talks through the journey bot", async () => {
    mockPost.mockResolvedValue({ channel: CHANNEL, ts: "1795690000.000100" });

    await expect(postExpertTalkRequest(request())).resolves.toBe(true);

    expect(mockPost).toHaveBeenCalledTimes(1);
    const sent = mockPost.mock.calls[0]![0] as { channel: string; text: string; blocks: unknown[] };
    expect(sent.channel).toBe(CHANNEL);
    expect(sent).toEqual({ channel: CHANNEL, ...buildExpertTalkMessage(request()) });
  });

  it("posts nothing while the channel is unset, and says so without the number", async () => {
    delete process.env.SLACK_EXPERT_TALKS_CHANNEL_ID;

    await expect(postExpertTalkRequest(request())).resolves.toBe(false);

    expect(mockPost).not.toHaveBeenCalled();
    expect(mockWarn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(mockWarn.mock.calls)).toContain("2891");
    expect(JSON.stringify(mockWarn.mock.calls)).not.toContain("2345678");
  });

  it("raises an error the team sees when Slack refuses it, without the number", async () => {
    mockPost.mockResolvedValue(null);

    await expect(postExpertTalkRequest(request())).resolves.toBe(false);

    expect(mockError).toHaveBeenCalledTimes(1);
    expect(String(mockError.mock.calls[0]![1])).toContain("#2891");
    expect(JSON.stringify(mockError.mock.calls)).not.toContain("2345678");
  });

  it("never throws: it runs after the reader's response", async () => {
    mockPost.mockRejectedValue(new Error("socket hang up"));

    await expect(postExpertTalkRequest(request())).resolves.toBe(false);
    expect(mockError).toHaveBeenCalledTimes(1);
  });
});
