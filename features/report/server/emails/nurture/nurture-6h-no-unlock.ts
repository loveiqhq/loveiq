import { escapeHtml } from "@shared/emails/shared";
import { renderNurtureEmail, TESTIMONIAL_DIJANA } from "./shared";

export interface Nurture6hNoUnlockParams {
  firstName?: string | null;
  ctaUrl: string;
  siteUrl: string;
  unsubscribeUrl?: string;
}

export function nurture6hNoUnlockEmail({
  firstName,
  ctaUrl,
  siteUrl,
  unsubscribeUrl,
}: Nurture6hNoUnlockParams) {
  const safeFirstName = firstName?.trim() ? escapeHtml(firstName.trim()) : "there";
  const subject = "You didn't view your report yet.";
  const previewText =
    "Unlocking your full report is 100% risk-free with a 14-day money-back guarantee.";

  return renderNurtureEmail({
    subject,
    previewText,
    siteUrl,
    unsubscribeUrl,
    body: {
      heading: "Unlock your full report with a 14-day money-back guarantee.",
      intro: [
        `Hi ${safeFirstName},`,
        "",
        'Unlocking your full report is <strong style="font-weight:700;">100% risk-free</strong>, as we offer a <strong style="font-weight:700;">14-day money-back guarantee.</strong>',
        "",
        'If you are not happy with the report, we will refund your full payment. <strong style="font-weight:700;">No questions asked.</strong>',
      ].join("\n"),
      ctaLabel: "View your report now",
      ctaUrl,
      testimonial: TESTIMONIAL_DIJANA,
      bullets: [
        { text: "+60 pages of insights into your sexuality" },
        { text: "Results based on 100+ science papers" },
        {
          text: "30+ chapters on your fantasies, arousal, desire patterns, and intimacy style",
        },
        {
          text: "Personalized growth paths to better understand your needs, boundaries, and sex life",
        },
        {
          text: "Share access with up to 2 extra emails, so you can open deeper conversations with a partner or someone close to you",
        },
      ],
      closingNote: "Curious minds tend to get the most out of this.",
    },
  });
}
