// Template-level tests for invite emails. Email-bug-2026-05-26: when a
// user types a multi-line personal message, the rendered HTML must use
// <br /> separators (iOS Mail does not honour white-space:pre-wrap).
import { describe, expect, it } from "vitest";
import { inviteEmail } from "@features/invite/emails/invite";
import { inviteBEmail } from "@features/invite/emails/invite-b";

const SITE = "https://loveiq.org";
const CTA = "https://loveiq.org/?invited=1";

describe("invite email — multi-line personal message", () => {
  it("inviteEmail renders user newlines as <br /> in HTML", () => {
    const out = inviteEmail({
      ctaUrl: CTA,
      referrerName: "Alice",
      siteUrl: SITE,
      personalMessage: "Hey there!\n\nThought you'd find this useful.",
    });
    // The replace runs on the escaped output, so the raw input \n
    // characters must be substituted by <br /> tags before reaching the
    // HTML output. Assert the canonical post-substitution string is
    // present — this is the actual behaviour iOS Mail will render.
    expect(out.html).toContain("Hey there!<br /><br />Thought you&#039;d find this useful.");
    // No reliance on white-space CSS — must be stripped now that <br />
    // tags do the work universally across mail clients.
    expect(out.html).not.toMatch(/white-space:\s*pre-wrap/);
    expect(out.html).not.toMatch(/white-space:\s*pre-line/);
  });

  it("inviteBEmail renders user newlines as <br /> in HTML", () => {
    const out = inviteBEmail({
      ctaUrl: CTA,
      referrerName: "Alice",
      siteUrl: SITE,
      personalMessage: "Heads up!\n\nThis tool is great.",
    });
    expect(out.html).toContain("<br />");
    expect(out.html).not.toMatch(/white-space:\s*pre-wrap/);
    expect(out.html).not.toMatch(/white-space:\s*pre-line/);
  });

  it("does not double-encode existing <br /> from server fallback message", () => {
    // When personalMessage is null, the email uses SHARE_MESSAGE_BODY (a
    // canned message). The output must still be valid HTML and contain
    // no literal `\n` in the rendered paragraph.
    const out = inviteEmail({
      ctaUrl: CTA,
      referrerName: "Alice",
      siteUrl: SITE,
      personalMessage: null,
    });
    expect(out.html.includes("&lt;br")).toBe(false);
  });
});
