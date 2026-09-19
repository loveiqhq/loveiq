import { describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

/** Each attachment fetch returns `size` characters of filler, base64url-encoded. */
const size = { chars: 30_000 };
vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      data: Buffer.from("x".repeat(size.chars), "utf8")
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_"),
    }),
    text: async () => "",
  })),
}));

import {
  threadAttachmentText,
  MAX_ATTACHMENT_CHARS,
  MAX_ATTACHMENT_CHARS_PER_THREAD,
} from "@features/brain/server/ingest/gmail";

/**
 * Attachments were worth indexing and are also the easiest way to drown the corpus.
 * Measured 2026-09-19: five 20k attachments is 100,000 characters — 42 chunks for ONE
 * thread, and 200 such threads would add a third again to a corpus of 24,694, all of
 * it attachment text. The domain vocabulary caused exactly this in miniature and cost
 * battery probes when it did.
 */
describe("attachment budgets", () => {
  const withFiles = (n: number) => ({
    id: "t1",
    messages: [
      {
        id: "m1",
        payload: {
          parts: Array.from({ length: n }, (_, i) => ({
            mimeType: "text/plain",
            filename: `notes${i}.txt`,
            body: { attachmentId: `a${i}`, size: 1000 },
          })),
        },
      },
    ],
  });

  it("caps ONE attachment so it cannot outweigh its conversation", async () => {
    size.chars = 30_000;
    const text = await threadAttachmentText("tok", "me@loveiq.org", withFiles(1) as never);
    expect(text.length).toBeLessThanOrEqual(MAX_ATTACHMENT_CHARS + 200);
    expect(text).toContain("truncated");
  });

  it("caps the WHOLE thread so five of them cannot outweigh the corpus", async () => {
    size.chars = 20_000;
    const text = await threadAttachmentText("tok", "me@loveiq.org", withFiles(5) as never);
    // Headings and the truncation note add a little; the budget is what matters.
    expect(text.length).toBeLessThan(MAX_ATTACHMENT_CHARS_PER_THREAD + 500);
  });

  it("still returns a small attachment untouched", async () => {
    // The control: a budget that clips everything is indistinguishable from a bug.
    size.chars = 50;
    const text = await threadAttachmentText("tok", "me@loveiq.org", withFiles(1) as never);
    expect(text).toContain("## Attachment: notes0.txt");
    expect(text).not.toContain("truncated");
  });

  it("stops early when the run is out of time", async () => {
    size.chars = 100;
    const text = await threadAttachmentText(
      "tok",
      "me@loveiq.org",
      withFiles(5) as never,
      () => true
    );
    expect(text).toBe("");
  });
});
