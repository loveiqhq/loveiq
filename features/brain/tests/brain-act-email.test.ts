import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
const mockNotify = vi.fn();
vi.mock("@shared/observability/slack", () => ({
  notifySlack: (...a: unknown[]) => mockNotify(...(a as [])),
  escapeSlack: (s: string) => s,
}));
const mockSuppression = vi.fn();
vi.mock("@shared/emails/suppression", () => ({
  suppressionState: (...a: unknown[]) => mockSuppression(...(a as [])),
}));
const mockSend = vi.fn();
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: (...a: unknown[]) => mockSend(...(a as [])) };
  },
}));

import {
  EmailRefusal,
  MAX_RECIPIENTS,
  prepareEmail,
  sendEmail,
} from "@features/brain/server/act/email";

const ok = { to: ["someone@example.com"], subject: "Hello", body: "Body text." };

beforeEach(() => {
  mockSuppression.mockReset().mockResolvedValue("clear");
  mockSend.mockReset().mockResolvedValue({ data: { id: "resend-1" }, error: null });
  mockNotify.mockReset().mockResolvedValue(undefined);
  process.env.RESEND_API_KEY = "re_test";
  delete process.env.RESEND_FROM;
});

describe("drafting", () => {
  /**
   * THE DEFAULT IS THE WHOLE SAFETY MODEL. Every other tool on this server acts freely,
   * which the owner chose because those actions are reversible and visible. An email is
   * neither, so this one renders and stops.
   */
  it("sends nothing without an explicit send", async () => {
    const r = await sendEmail({ ...ok, send: false });
    expect(r.sent).toBe(false);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("checks the opt-out list even for a draft", async () => {
    mockSuppression.mockResolvedValue("suppressed");
    const r = await sendEmail({ ...ok, send: false });
    // Answered before the message is written rather than after it is refused.
    expect(r.draft.suppression).toEqual([{ email: "someone@example.com", state: "suppressed" }]);
  });

  it("normalises recipients so the same person is not addressed twice differently", async () => {
    const d = await prepareEmail({ ...ok, to: ["  Someone@Example.com  "] });
    expect(d.to).toEqual(["someone@example.com"]);
  });
});

describe("what it refuses before anything is composed", () => {
  it("refuses no recipients", async () => {
    await expect(prepareEmail({ ...ok, to: [] })).rejects.toThrow(EmailRefusal);
  });

  /**
   * A CHANGE OF KIND, NOT A RATE LIMIT. One email to a colleague is a normal action; the
   * same tool addressing two hundred people is an unreviewed mailshot under our domain,
   * and it would be gone before anyone could read the log.
   */
  it("refuses more recipients than a message can reasonably have", async () => {
    const many = Array.from({ length: MAX_RECIPIENTS + 1 }, (_, i) => `p${i}@example.com`);
    await expect(prepareEmail({ ...ok, to: many })).rejects.toThrow(/campaign/);
  });

  it("accepts exactly the maximum", async () => {
    const max = Array.from({ length: MAX_RECIPIENTS }, (_, i) => `p${i}@example.com`);
    expect((await prepareEmail({ ...ok, to: max })).to).toHaveLength(MAX_RECIPIENTS);
  });

  it.each([["not-an-address"], ["missing@tld"], ["two@@at.com"]])(
    "refuses %j as a recipient",
    async (bad) => {
      await expect(prepareEmail({ ...ok, to: [bad] })).rejects.toThrow(/not an email address/);
    }
  );

  /**
   * AN ORDINARY SUBJECT MUST STILL GO THROUGH, and this pins the header guard to
   * NEWLINES specifically.
   *
   * Found by mutation: replacing the pattern with one that matches a SPACE passed every
   * test here, because every "bad header" string used for the refusals also contains
   * spaces — so the guard could have been rejecting every multi-word subject in the
   * company and nothing would have failed.
   */
  it("accepts a perfectly ordinary subject line", async () => {
    const d = await prepareEmail({ ...ok, subject: "Monthly numbers for August" });
    expect(d.subject).toBe("Monthly numbers for August");
  });

  /** A newline in a header field lets the rest of the string append headers of its own. */
  it("refuses a header that could carry its own headers", async () => {
    await expect(prepareEmail({ ...ok, subject: "Hi\nBcc:everyone@example.com" })).rejects.toThrow(
      /line break/
    );
    await expect(prepareEmail({ ...ok, to: ["a@b.com\nBcc:c@d.com"] })).rejects.toThrow(
      /not an email address/
    );
    await expect(prepareEmail({ ...ok, replyTo: "a@b.com\nX: y" })).rejects.toThrow(
      /not an email address/
    );
  });

  it("refuses an empty subject or body", async () => {
    await expect(prepareEmail({ ...ok, subject: "   " })).rejects.toThrow(/subject/);
    await expect(prepareEmail({ ...ok, body: "  " })).rejects.toThrow(/no message/);
  });

  /** Resend will send anything on a verified domain, so a caller-settable `from` is a
   *  caller-settable impersonation of a colleague. */
  it("uses the company address and offers no way to change it", async () => {
    expect((await prepareEmail(ok)).from).toContain("@send.loveiq.org");
    process.env.RESEND_FROM = "LoveIQ <hi@send.loveiq.org>";
    expect((await prepareEmail(ok)).from).toBe("LoveIQ <hi@send.loveiq.org>");
  });
});

describe("sending", () => {
  it("dispatches and returns the id when told to", async () => {
    const r = await sendEmail({ ...ok, send: true });
    expect(r.sent).toBe(true);
    expect(r.id).toBe("resend-1");
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ to: ["someone@example.com"], subject: "Hello" })
    );
  });

  it("refuses to email someone who opted out", async () => {
    mockSuppression.mockResolvedValue("suppressed");
    await expect(sendEmail({ ...ok, send: true })).rejects.toThrow(/asked not to be emailed/);
    expect(mockSend).not.toHaveBeenCalled();
  });

  /**
   * THE ONE PLACE IN THIS CODEBASE WHERE AN UNREADABLE SUPPRESSION LIST STOPS A SEND.
   *
   * Everywhere else "unknown" means send anyway, and that is right for transactional mail
   * — a confirmation that never arrives because a lookup timed out is the worse outcome.
   * Nobody is waiting for this one, so unknown means stop.
   */
  it("refuses to send when it could not check whether someone opted out", async () => {
    mockSuppression.mockResolvedValue("unknown");
    await expect(sendEmail({ ...ok, send: true })).rejects.toThrow(/not permission to proceed/);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("still drafts when the check could not be made", async () => {
    mockSuppression.mockResolvedValue("unknown");
    expect((await sendEmail({ ...ok, send: false })).sent).toBe(false);
  });

  it("reports a Resend failure rather than claiming it sent", async () => {
    mockSend.mockResolvedValue({ data: null, error: { message: "domain not verified" } });
    await expect(sendEmail({ ...ok, send: true })).rejects.toThrow(/domain not verified/);
  });

  it("refuses when there is no key rather than failing silently", async () => {
    delete process.env.RESEND_API_KEY;
    await expect(sendEmail({ ...ok, send: true })).rejects.toThrow(/RESEND_API_KEY/);
  });

  /** Act-freely's compensating control is that a write cannot be quiet, and that matters
   *  most for the write that leaves the company. */
  it("mirrors every send to the ops channel", async () => {
    await sendEmail({ ...ok, send: true });
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "ops", kind: "brain_email_sent" })
    );
  });

  it("does not mirror a draft", async () => {
    await sendEmail({ ...ok, send: false });
    expect(mockNotify).not.toHaveBeenCalled();
  });

  /** The email is gone either way; losing the result because a webhook was down would be
   *  the worse outcome. */
  it("does not lose a sent email because the mirror failed", async () => {
    mockNotify.mockRejectedValue(new Error("slack down"));
    const r = await sendEmail({ ...ok, send: true });
    expect(r.sent).toBe(true);
  });
});
