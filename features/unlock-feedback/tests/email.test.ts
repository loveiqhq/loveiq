import { describe, expect, it } from "vitest";

import { REASON_COPY, type UnlockReason } from "@features/unlock-feedback/logic/reasons";
import { SUBJECT_ARMS, preheaderFor } from "@features/unlock-feedback/logic/subjects";
import { unlockFeedbackEmail } from "@features/unlock-feedback/server/emails/unlock-feedback";
import { escapeHtml } from "@shared/emails/shared";

const SITE = "https://www.loveiq.org";
const UNSUBSCRIBE = "https://www.loveiq.org/api/unsubscribe?token=tok&src=unlock_feedback";
// base64url, with both of its non-alphanumeric characters, 43 long like newLinkToken's.
const TOKEN = "Ab-_9".padEnd(43, "x");
// Not the design's order: the email must follow the row's.
const ORDER: UnlockReason[] = [
  "time_commitment",
  "privacy",
  "result_off",
  "unclear_content",
  "free_enough",
  "low_value",
  "too_expensive",
  "other",
];

function render(
  arm: (typeof SUBJECT_ARMS)[number] = "A",
  reader: { firstName?: string | null; worth?: string | null } = {
    firstName: "Ana",
    worth: "€29.99",
  }
) {
  return unlockFeedbackEmail({
    arm,
    archetypeName: "The Spiritual Lover",
    ...reader,
    reasonOrder: ORDER,
    token: TOKEN,
    siteUrl: SITE,
    unsubscribeUrl: UNSUBSCRIBE,
  });
}

/** The answer links in the order the HTML has them, one per button (label and arrow share it). */
function answerLinks(html: string): URL[] {
  const hrefs = [...html.matchAll(/href="([^"]+)"/g)]
    .map((m) => m[1]!.replace(/&amp;/g, "&"))
    .filter((h) => h.includes("/api/unlock-feedback/open"));
  return hrefs.filter((h, i) => h !== hrefs[i - 1]).map((h) => new URL(h));
}

describe("the unlock feedback email", () => {
  it("shows all eight answers in the row's order, each linking to the open route with r and t", () => {
    const { html } = render();
    const links = answerLinks(html);
    expect(links.map((u) => u.searchParams.get("r"))).toEqual(ORDER);
    for (const u of links) {
      expect(u.origin + u.pathname).toBe(`${SITE}/api/unlock-feedback/open`);
      expect(u.searchParams.get("t")).toBe(TOKEN);
      expect([...u.searchParams.keys()]).toEqual(["r", "t"]);
    }
    // Each button is two cells, both the same link, so the whole pill can be tapped.
    expect(html.match(/\/api\/unlock-feedback\/open/g)).toHaveLength(16);
    // The labels too, in that order: Mark's button copy.
    const at = ORDER.map((r) => html.indexOf(REASON_COPY[r].email));
    expect(at.every((i) => i > 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it("keeps Something else last, the only one with a dashed border", () => {
    const { html } = render();
    expect(html.match(/dashed/g)).toHaveLength(1);
    const dashed = html.indexOf("dashed");
    expect(dashed).toBeGreaterThan(html.indexOf(REASON_COPY.too_expensive.email));
    expect(dashed).toBeLessThan(html.indexOf("Something else (tell us in a sentence)"));
  });

  it("names the archetype only in arm D's subject, and opens with Mark's subject line in A", () => {
    for (const arm of SUBJECT_ARMS) {
      const { subject, html, text } = render(arm);
      expect(subject.includes("The Spiritual Lover")).toBe(arm === "D");
      // The page title is the subject; the body itself never names it.
      expect(html.replaceAll(escapeHtml(subject), "")).not.toContain("Spiritual Lover");
      expect(text).not.toContain("Spiritual Lover");
      expect(html).toContain(preheaderFor(arm));
    }
    expect(render("A").subject).toBe(
      "Get your full report for free. We just want to know one thing."
    );
    expect(render("D").subject).toBe(
      "The Spiritual Lover, your full report is free for one answer"
    );
    // Mark, 22.10: no "50+ pages", which reads as a big commitment.
    for (const arm of SUBJECT_ARMS) expect(preheaderFor(arm)).not.toMatch(/50\+|pages/);
  });

  it("greets the reader by first name, and says Hi there without one", () => {
    expect(render().text).toContain("Hi Ana,\nYou took the LoveIQ test, reviewed your results");
    expect(render().html).toContain("Hi Ana,<br>You took the LoveIQ test");
    for (const firstName of [null, undefined, "", "  "]) {
      const { html, text } = render("A", { firstName, worth: "€29.99" });
      expect(text).toContain("Hi there,\n");
      expect(html).toContain("Hi there,<br>");
    }
    // A name is the reader's own input: escaped, never markup.
    const { html } = render("A", { firstName: "<b>Ana</b>", worth: null });
    expect(html).toContain("Hi &lt;b&gt;Ana&lt;/b&gt;,");
    expect(html).not.toContain("<b>Ana</b>");
  });

  it("says what the full report is worth at the reader's own price, and nothing without one", () => {
    const tap = (worth: string) =>
      `Tap the answer that fits best and we unlock the full report${worth} with all its chapters for you. This is entirely free. No payment details, no catch.`;
    expect(render("A", { firstName: "Ana", worth: "€4.99" }).text).toContain(tap(", worth €4.99,"));
    expect(render("A", { firstName: "Ana", worth: null }).text).toContain(tap(""));
    expect(render("A", { firstName: "Ana", worth: null }).html).not.toContain("worth");
    expect(render().html).toContain(
      "and we unlock the full report, worth €29.99, with all its chapters for you."
    );
  });

  it("ends with one footer line and a working Unsubscribe link", () => {
    const { html, text } = render();
    expect(html).toContain("Your answer is only used to improve LoveIQ.</p>");
    // Left out (Eman and Mark, 22.10): the answer is tied to the reader, and "not a horoscope"
    // read as filler.
    for (const part of [html, text]) {
      expect(part).not.toContain("Anonymous");
      expect(part).not.toContain("horoscope");
    }
    expect(html).toContain(
      'Applied Psychometrics UG · Berlin · <a href="https://www.loveiq.org/api/unsubscribe?token=tok&amp;src=unlock_feedback"'
    );
    expect(html).toContain(">Unsubscribe</a>");
    // The shell's own footer is replaced, not added to.
    expect(html).not.toContain("Unsubscribe from these emails");
    expect(text).toContain(
      `Your answer is only used to improve LoveIQ.\nApplied Psychometrics UG · Berlin · Unsubscribe: ${UNSUBSCRIBE}`
    );
  });

  it("carries the logo, Mark's heading, the question and the team's sign-off", () => {
    const { html, text } = render();
    expect(html).toContain("/images/loveiq-mark-512.png");
    expect(html).toContain("Tell us why you didn’t unlock your report, and the <span");
    expect(html).toContain(">full report is yours</span>.</h1>");
    for (const line of [
      "To make LoveIQ even better, we would like to understand why and would love to offer you a free unlock in return.",
      "Why didn’t you unlock your report?",
      "One tap is enough. Your report opens right after.",
      "The LoveIQ Team",
    ]) {
      expect(html).toContain(line);
      expect(text).toContain(line);
    }
    expect(html).toContain(
      "We read every answer ourselves.<br>Thank you for helping us get this right."
    );
    expect(text).toContain(
      "We read every answer ourselves.\nThank you for helping us get this right."
    );
    expect(
      text.startsWith("Tell us why you didn’t unlock your report, and the full report is yours.\n")
    ).toBe(true);
    // Taken out on 22.10: the free-text block (the page asks for it) and Marcus's sign-off.
    for (const gone of ["Want to say more?", "Founder", "Marcus"]) {
      expect(html).not.toContain(gone);
      expect(text).not.toContain(gone);
    }
  });

  it("gives a plain-text part with every answer and its link, and no HTML", () => {
    const { text } = render();
    for (const r of ORDER) {
      expect(text).toContain(
        `${REASON_COPY[r].email}\n${SITE}/api/unlock-feedback/open?r=${r}&t=${TOKEN}`
      );
    }
    expect(text).not.toMatch(/<[a-z/!]/i);
    expect(text).not.toMatch(/&[a-zA-Z#0-9]+;/);
  });

  it("has no em or en dash anywhere, in any arm", () => {
    for (const arm of SUBJECT_ARMS) {
      const { subject, html, text } = render(arm);
      for (const part of [subject, html, text, preheaderFor(arm)]) {
        expect(part).not.toMatch(/[—–]|&mdash;|&ndash;/);
      }
    }
  });
});
