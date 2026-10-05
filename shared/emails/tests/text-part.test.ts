import { describe, expect, it } from "vitest";

/**
 * The plain-text part of every email: all a text-only mail app shows.
 *
 * Each template builds its own, and none carried the unsubscribe link the HTML footer
 * does. The nurture renderer also stripped `<br>` to nothing ("guarantee.If you are not
 * happy") and left a literal `&mdash;`. Templates are discovered, so a new one is checked
 * without anyone remembering to add it here.
 */
const modules = import.meta.glob(
  [
    "/features/report/server/emails/**/*.ts",
    "/features/survey/server/emails/*.ts",
    "/features/invite/emails/*.ts",
  ],
  { eager: true }
);

type Rendered = { subject: string; html: string; text: string };

const UNSUBSCRIBE = "https://www.loveiq.org/api/unsubscribe?token=tok&src=x";
const CTA = "https://www.loveiq.org/report/rpt_cta";

// Every parameter any template takes; each reads the ones it needs.
const PARAMS = {
  firstName: "Ana",
  ownerFirstName: "Ana",
  recipientFirstName: "Bo",
  referrerName: "Ana",
  ctaUrl: CTA,
  reportUrl: CTA,
  shareUrl: CTA,
  resumeUrl: CTA,
  testUrl: CTA,
  inviteCtaUrl: CTA,
  siteUrl: "https://www.loveiq.org",
  unsubscribeUrl: UNSUBSCRIBE,
  promoCode: "PROMO50",
  percentOff: 50,
  chapterIndex: 3,
  chapterTotal: 12,
  chapterTitle: "Desire",
  whatYoullLearn: "What you'll learn",
  teaseText: "A tease.",
  wasTruncated: false,
  archetypeName: "Spiritual Lover",
  archetypes: ["Spiritual Lover"],
  unlockedArchetype: "Spiritual Lover",
  personalMessage: "See you soon",
};

const templates = Object.entries(modules).flatMap(([path, mod]) =>
  Object.entries(mod as Record<string, unknown>)
    // renderNurtureEmail is the renderer the nurture templates share, not a template.
    .filter(([name, fn]) => typeof fn === "function" && /^(?!render).*Email$/.test(name))
    .map(([name, fn]) => ({
      name: `${path.split("/").pop()} ${name}`,
      render: fn as (params: typeof PARAMS) => Rendered,
    }))
);

describe("email plain-text parts", () => {
  it("finds the templates", () => {
    expect(templates.length).toBeGreaterThanOrEqual(25);
  });

  it.each(templates)("$name carries the unsubscribe link", ({ render }) => {
    expect(render(PARAMS).text).toContain(`Unsubscribe from these emails: ${UNSUBSCRIBE}`);
  });

  it.each(templates)("$name has the CTA, no HTML and no glued sentences", ({ render }) => {
    const { text } = render(PARAMS);
    expect(text).toContain(CTA);
    expect(text).not.toMatch(/&[a-zA-Z#0-9]+;/);
    expect(text).not.toMatch(/<[a-z/!]/i);
    expect(text).not.toMatch(/[a-z0-9)][.!?][A-Z][a-z]/);
  });

  it("leaves the unsubscribe line out when there is no link", () => {
    for (const { render } of templates) {
      expect(render({ ...PARAMS, unsubscribeUrl: "" }).text).not.toContain("Unsubscribe from");
    }
  });
});
