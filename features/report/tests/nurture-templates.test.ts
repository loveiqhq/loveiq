import { describe, expect, it } from "vitest";
import { nurture6hNoViewEmail } from "@features/report/server/emails/nurture/nurture-6h-no-view";
import { nurture6hNoUnlockEmail } from "@features/report/server/emails/nurture/nurture-6h-no-unlock";
import { nurture30hNoUnlockEmail } from "@features/report/server/emails/nurture/nurture-30h-no-unlock";
import { nurture54hNoUnlockEmail } from "@features/report/server/emails/nurture/nurture-54h-no-unlock";
import { surveyCompleteEmail } from "@features/survey/server/emails/survey-complete";

const SITE = "https://loveiq.org";
const CTA = "https://loveiq.org/report/rpt_abc?offer=1";

describe("nurture email templates", () => {
  it("surveyCompleteEmail renders subject + CTA + testimonial card", () => {
    const out = surveyCompleteEmail({
      firstName: "Sam",
      reportUrl: CTA,
      siteUrl: SITE,
    });
    expect(out.subject).toBe("Your LoveIQ report is ready");
    expect(out.html).toContain("View your report now");
    expect(out.html).toContain(CTA);
    // Testimonial card was the new addition vs the pre-Figma template.
    expect(out.html).toContain("Dr. Dijana Galija");
    expect(out.text).toContain("Sam");
  });

  it("nurture-6h-no-view targets the not-viewed branch", () => {
    const out = nurture6hNoViewEmail({
      firstName: "Sam",
      ctaUrl: CTA,
      siteUrl: SITE,
    });
    expect(out.subject.toLowerCase()).toContain("you didn");
    // shared/format/html-escape uses &#039; for apostrophes (numeric ref, not &#x27;).
    expect(out.html).toContain("Don&#039;t miss out");
    expect(out.html).toContain("Gebhardt");
    // No promo in non-discounted stages.
    expect(out.html).not.toContain("Use code:");
  });

  it("nurture-6h-no-unlock leads with money-back guarantee", () => {
    const out = nurture6hNoUnlockEmail({
      firstName: "Sam",
      ctaUrl: CTA,
      siteUrl: SITE,
    });
    expect(out.html).toContain("14-day money-back guarantee");
    expect(out.html).toContain("Dijana");
    expect(out.html).not.toContain("Use code:");
  });

  it("nurture-30h-no-unlock injects the promo code and 50% framing", () => {
    const out = nurture30hNoUnlockEmail({
      firstName: "Sam",
      ctaUrl: CTA,
      promoCode: "LIQ-50-Ab7K9xQ2",
      siteUrl: SITE,
    });
    expect(out.subject).toBe("Your 50% LoveIQ unlock code expires in 24 hours");
    expect(out.html).toContain("LIQ-50-Ab7K9xQ2");
    expect(out.html).toContain("50% off");
    expect(out.html).toContain("14-day money-back guarantee");
    expect(out.text).toContain("LIQ-50-Ab7K9xQ2");
  });

  it("nurture-54h-no-unlock injects the promo code and 75% framing", () => {
    const out = nurture54hNoUnlockEmail({
      firstName: "Sam",
      ctaUrl: CTA,
      promoCode: "LIQ-75-Z9k2X8aB",
      siteUrl: SITE,
    });
    expect(out.subject).toBe("Last chance to unlock your report with 75% discount within 24 hours");
    expect(out.html).toContain("LIQ-75-Z9k2X8aB");
    expect(out.html).toContain("75% off");
    expect(out.text).toContain("LIQ-75-Z9k2X8aB");
  });

  it("escapes HTML special chars in firstName and promoCode", () => {
    const out = nurture30hNoUnlockEmail({
      firstName: "<script>alert(1)</script>",
      ctaUrl: CTA,
      promoCode: "LIQ-50-Ab7K9xQ2",
      siteUrl: SITE,
    });
    expect(out.html).not.toContain("<script>alert(1)</script>");
    expect(out.html).toContain("&lt;script&gt;");
  });

  it("falls back to 'there' when firstName is empty", () => {
    const out = nurture6hNoViewEmail({
      firstName: null,
      ctaUrl: CTA,
      siteUrl: SITE,
    });
    expect(out.html).toContain("Hi there,");
  });

  it("CTA URL is preserved in both HTML and text bodies", () => {
    const ctaWithQuery = "https://loveiq.org/report/rpt_abc?promo=LIQ-50-Ab7K9xQ2&offer=1";
    const out = nurture30hNoUnlockEmail({
      firstName: "Sam",
      ctaUrl: ctaWithQuery,
      promoCode: "LIQ-50-Ab7K9xQ2",
      siteUrl: SITE,
    });
    // The href attribute uses literal ASCII quotes; only & inside the URL is
    // escaped (renderCtaButton runs escapeHtml on the value, not on the quotes).
    expect(out.html).toContain(
      'href="https://loveiq.org/report/rpt_abc?promo=LIQ-50-Ab7K9xQ2&amp;offer=1"'
    );
    expect(out.text).toContain(ctaWithQuery);
  });
});
