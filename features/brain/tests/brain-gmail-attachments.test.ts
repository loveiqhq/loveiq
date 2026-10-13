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
  MAX_ATTACHMENTS_PER_THREAD,
} from "@features/brain/server/ingest/gmail";

/** Read in time, so never null; a null here fails loudly rather than as a type error. */
async function read(mailbox: string, thread: unknown): Promise<string> {
  const text = await threadAttachmentText("tok", mailbox, thread as never);
  if (text === null) throw new Error("ran out of time with no clock running");
  return text;
}

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
    const text = await read("me@loveiq.org", withFiles(1));
    expect(text.length).toBeLessThanOrEqual(MAX_ATTACHMENT_CHARS + 200);
    expect(text).toContain("truncated");
  });

  it("caps the WHOLE thread so five of them cannot outweigh the corpus", async () => {
    size.chars = 20_000;
    const text = await read("me@loveiq.org", withFiles(5));
    // Headings and the truncation note add a little; the budget is what matters.
    expect(text.length).toBeLessThan(MAX_ATTACHMENT_CHARS_PER_THREAD + 500);
  });

  it("still returns a small attachment untouched", async () => {
    // The control: a budget that clips everything is indistinguishable from a bug.
    size.chars = 50;
    const text = await read("me@loveiq.org", withFiles(1));
    expect(text).toContain("## Attachment: notes0.txt");
    expect(text).not.toContain("truncated");
  });

  /**
   * NULL, NOT "". An empty string was stored as "this thread has no attachment text", and
   * with its historyId matching, the thread was never read again.
   */
  it("says so when the run is out of time, so the thread is left for the next run", async () => {
    size.chars = 100;
    const text = await threadAttachmentText(
      "tok",
      "me@loveiq.org",
      withFiles(5) as never,
      () => true
    );
    expect(text).toBeNull();
  });

  it("says so when the clock stops it part-way through a thread's files", async () => {
    size.chars = 100;
    let calls = 0;
    const text = await threadAttachmentText(
      "tok",
      "me@loveiq.org",
      withFiles(3) as never,
      () => ++calls > 1
    );
    expect(text).toBeNull();
  });

  it("is not out of time over a thread with nothing to read", async () => {
    // The control: no file was pending, so nothing was cut short.
    const text = await threadAttachmentText(
      "tok",
      "me@loveiq.org",
      withFiles(0) as never,
      () => true
    );
    expect(text).toBe("");
  });
});

/**
 * THE HIRING INBOX (owner's decision, 2026-10-13): a CV, a cover letter and a task
 * submission are each the point of an application, so there the thread has no ceiling
 * beyond the per-file one, and a file that gives no text is named rather than dropped.
 */
describe("the hiring inbox's attachments", () => {
  const withFiles = (n: number, extra: unknown[] = []) => ({
    id: "t1",
    messages: [
      {
        id: "m1",
        payload: {
          parts: [
            ...Array.from({ length: n }, (_, i) => ({
              mimeType: "text/plain",
              filename: `file${i}.txt`,
              body: { attachmentId: `a${i}`, size: 1000 + i },
            })),
            ...extra,
          ],
        },
      },
    ],
  });
  const photo = (disposition: string) => ({
    mimeType: "image/jpeg",
    filename: "IMG_3282.jpeg",
    headers: [{ name: "Content-Disposition", value: disposition }],
    body: { attachmentId: "img", size: 302_237 },
  });

  it("reads every file whole, past the thread ceiling other mailboxes keep", async () => {
    size.chars = 20_000;
    const text = await read("hr@loveiq.org", withFiles(MAX_ATTACHMENTS_PER_THREAD));
    expect(text.length).toBeGreaterThan(MAX_ATTACHMENTS_PER_THREAD * 20_000);
    expect(text).not.toContain("exceed what the brain indexes");
    // The control: the same thread in a colleague's mailbox is held to the ceiling.
    const elsewhere = await read("me@loveiq.org", withFiles(MAX_ATTACHMENTS_PER_THREAD));
    expect(elsewhere.length).toBeLessThan(MAX_ATTACHMENT_CHARS_PER_THREAD + 500);
  });

  it("names a CV sent as a photo, which it cannot read", async () => {
    size.chars = 50;
    const text = await read(
      "hr@loveiq.org",
      withFiles(1, [photo('attachment; filename="IMG_3282.jpeg"')])
    );
    expect(text).toContain("## Attachment: file0.txt");
    expect(text).toContain("open the email to see it): IMG_3282.jpeg");
  });

  it("does not name a picture inside the message, or anything outside the hiring inbox", async () => {
    size.chars = 50;
    const inline = await read("hr@loveiq.org", withFiles(1, [photo("inline; filename=logo.jpeg")]));
    expect(inline).not.toContain("open the email");
    const elsewhere = await read("me@loveiq.org", withFiles(1, [photo("attachment")]));
    expect(elsewhere).not.toContain("open the email");
  });

  it("names a readable file that gave no text, such as a scanned CV", async () => {
    size.chars = 0;
    const text = await read("hr@loveiq.org", withFiles(1));
    expect(text).toBe(
      "Also attached, with no text the brain can read (open the email to see it): file0.txt"
    );
  });
});
