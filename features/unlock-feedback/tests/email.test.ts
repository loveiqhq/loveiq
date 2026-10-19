import { describe, expect, it } from "vitest";

import { REASON_COPY, type UnlockReason } from "@features/unlock-feedback/logic/reasons";
import { SUBJECT_ARMS, preheaderFor } from "@features/unlock-feedback/logic/subjects";
import { unlockFeedbackEmail } from "@features/unlock-feedback/server/emails/unlock-feedback";

const SITE = "https://www.loveiq.org";
const UNSUBSCRIBE = "https://www.loveiq.org/api/unsubscribe?token=tok&src=unlock_feedback";
// base64url, with both of its non-alphanumeric characters, 43 long like newLinkToken's.
const TOKEN = "Ab-_9".padEnd(43, "x");
// Not the design's order: the email must follow the row's.
const ORDER: UnlockReason[] = [
  "later",
  "checkout",
  "privacy",
  "result_off",
  "unclear_content",
  "free_enough",
  "low_value",
  "too_expensive",
  "other",
];

function render(arm: (typeof SUBJECT_ARMS)[number] = "A") {
  return unlockFeedbackEmail({
    arm,
    archetypeName: "The Spiritual Lover",
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
  it("shows all nine answers in the row's order, each linking to the open route with r and t", () => {
    const { html } = render();
    const links = answerLinks(html);
    expect(links.map((u) => u.searchParams.get("r"))).toEqual(ORDER);
    for (const u of links) {
      expect(u.origin + u.pathname).toBe(`${SITE}/api/unlock-feedback/open`);
      expect(u.searchParams.get("t")).toBe(TOKEN);
      expect([...u.searchParams.keys()]).toEqual(["r", "t"]);
    }
    // Each button is two cells, both the same link, so the whole pill can be tapped.
    expect(html.match(/\/api\/unlock-feedback\/open/g)).toHaveLength(18);
    // The labels too, in that order: Marcus's button copy.
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

  it("names the archetype in the body for every arm, and in the subject only for arm D", () => {
    for (const arm of SUBJECT_ARMS) {
      const { subject, html, text } = render(arm);
      expect(subject.includes("The Spiritual Lover")).toBe(arm === "D");
      expect(html).toContain(">The Spiritual Lover</strong>");
      expect(text).toContain(
        "You took the LoveIQ test and met your result, The Spiritual Lover. You stopped before the full report, and that’s completely fine."
      );
      expect(html).toContain(preheaderFor(arm));
    }
    expect(render("D").subject).toBe(
      "The Spiritual Lover, your full report is free for one answer"
    );
  });

  it("ends with Marcus's two footer lines and a working Unsubscribe link", () => {
    const { html, text } = render();
    expect(html).toContain(
      "Your answer is only used to improve LoveIQ. Anonymous by default · Science-backed, not a horoscope"
    );
    expect(html).toContain(
      'Applied Psychometrics UG · Berlin · <a href="https://www.loveiq.org/api/unsubscribe?token=tok&amp;src=unlock_feedback"'
    );
    expect(html).toContain(">Unsubscribe</a>");
    // The shell's own footer is replaced, not added to.
    expect(html).not.toContain("Unsubscribe from these emails");
    expect(text).toContain(
      "Your answer is only used to improve LoveIQ. Anonymous by default · Science-backed, not a horoscope"
    );
    expect(text).toContain(`Applied Psychometrics UG · Berlin · Unsubscribe: ${UNSUBSCRIBE}`);
  });

  it("carries the logo, the question, the follow-up note and Marcus's sign-off", () => {
    const { html, text } = render();
    expect(html).toContain("/images/loveiq-mark-512.png");
    for (const line of [
      "Why didn’t you unlock your report?",
      "One tap is enough. Your report opens right after.",
      "Want to say more?",
      "We read every answer ourselves. Thank you for helping us get this right.",
      "Founder, LoveIQ",
    ]) {
      expect(html).toContain(line);
      expect(text).toContain(line);
    }
    expect(text.startsWith("Tell us why you didn’t unlock it, and the full report is yours.")).toBe(
      true
    );
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
