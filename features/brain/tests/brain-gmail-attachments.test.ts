import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

/**
 * Each attachment fetch returns `size` characters of filler, base64url-encoded, or `fill`
 * when set; an attachment id listed in `failing` answers 503, as a download that failed.
 */
const size = { chars: 30_000 };
const fill: { text: string | null } = { text: null };
const failing = new Set<string>();
/** Attachment ids whose download times out: `fetchWithTimeout` throws rather than answering. */
const timingOut = new Set<string>();
vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: vi.fn(async (url: string) => {
    if ([...timingOut].some((id) => url.endsWith(`/attachments/${id}`))) {
      throw new Error("The operation was aborted due to timeout");
    }
    if ([...failing].some((id) => url.endsWith(`/attachments/${id}`))) {
      return { ok: false, status: 503, json: async () => ({}), text: async () => "busy" };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        data: Buffer.from(fill.text ?? "x".repeat(size.chars), "utf8")
          .toString("base64")
          .replace(/\+/g, "-")
          .replace(/\//g, "_"),
      }),
      text: async () => "",
    };
  }),
}));

import {
  threadAttachmentText,
  MAX_ATTACHMENT_CHARS,
  MAX_ATTACHMENT_CHARS_PER_THREAD,
  MAX_ATTACHMENTS_PER_THREAD,
} from "@features/brain/server/ingest/gmail";

/** Read in time, so never null; a null here fails loudly rather than as a type error. */
async function read(mailbox: string, thread: unknown): Promise<string> {
  const got = await threadAttachmentText("tok", mailbox, thread as never);
  if (got === null) throw new Error("ran out of time with no clock running");
  return got.text;
}

beforeEach(() => {
  fill.text = null;
  failing.clear();
  timingOut.clear();
});

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
    const got = await threadAttachmentText(
      "tok",
      "me@loveiq.org",
      withFiles(0) as never,
      () => true
    );
    expect(got).toEqual({ text: "", retry: false });
  });

  /**
   * A FAILED DOWNLOAD IS NOT A FILE WITH NO TEXT. Both used to come back as "", the thread
   * was stored without the file, and its matching historyId meant it was never tried again.
   */
  it("asks for the thread again when a download fails, and not when a file is empty", async () => {
    size.chars = 50;
    failing.add("a1");
    const failed = await threadAttachmentText("tok", "me@loveiq.org", withFiles(2) as never);
    expect(failed).toEqual({ text: expect.stringContaining("notes0.txt"), retry: true });
    failing.clear();
    size.chars = 0;
    const empty = await threadAttachmentText("tok", "me@loveiq.org", withFiles(2) as never);
    expect(empty).toEqual({ text: "", retry: false });
  });

  it("treats a download that timed out as failed, not as empty", async () => {
    // The likelier failure with the hiring inbox's 25 MB files: the 20 s limit throws.
    size.chars = 50;
    timingOut.add("a0");
    const got = await threadAttachmentText("tok", "me@loveiq.org", withFiles(2) as never);
    expect(got).toEqual({ text: expect.stringContaining("notes1.txt"), retry: true });
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

  it("names a photo some mail apps put inline, but not a signature logo", async () => {
    size.chars = 50;
    const big = await read("hr@loveiq.org", withFiles(1, [photo("inline; filename=IMG.jpeg")]));
    expect(big).toContain("open the email to see it): IMG_3282.jpeg");
    const logo = {
      ...photo("inline; filename=logo.png"),
      filename: "logo.png",
      body: { attachmentId: "logo", size: 9_000 },
    };
    expect(await read("hr@loveiq.org", withFiles(1, [logo]))).not.toContain("open the email");
  });

  it("names a file whose download failed, and asks for the thread again", async () => {
    size.chars = 50;
    failing.add("a0");
    const got = await threadAttachmentText("tok", "hr@loveiq.org", withFiles(2) as never);
    expect(got!.retry).toBe(true);
    expect(got!.text).toContain("## Attachment: file1.txt");
    expect(got!.text).toContain("open the email to see it): file0.txt");
  });

  it("reads ten files, and names the eleventh rather than calling it unreadable", async () => {
    size.chars = 50;
    const text = await read("hr@loveiq.org", withFiles(11));
    expect(text.match(/## Attachment: /g)).toHaveLength(10);
    expect(text).toContain("open the email to see it): file10.txt");
  });

  /**
   * A HIRE'S CONTRACT UNDER A NAME THAT DOES NOT SAY SO. Not read, and named: a generic name
   * gives nothing away, and a CV caught by mistake stays visible.
   */
  it("does not read a file that reads as a contract or an offer", async () => {
    fill.text =
      "This Agreement is made between Applied Psychometrics (hereinafter the Company) and";
    const contract = await read("hr@loveiq.org", withFiles(1));
    expect(contract).not.toContain("hereinafter");
    expect(contract).toContain("open the email to see it): file0.txt");
    fill.text = "Jane Doe. MSc Psychology. Research assistant, 2024-2026.";
    expect(await read("hr@loveiq.org", withFiles(1))).toContain("MSc Psychology");
  });

  it("names nothing outside the hiring inbox", async () => {
    size.chars = 50;
    const elsewhere = await read("me@loveiq.org", withFiles(1, [photo("attachment")]));
    expect(elsewhere).not.toContain("open the email");
  });

  it("names a readable file that gave no text, such as a scanned CV", async () => {
    size.chars = 0;
    const text = await read("hr@loveiq.org", withFiles(1));
    expect(text).toBe("Also attached, not read by the brain (open the email to see it): file0.txt");
  });
});
