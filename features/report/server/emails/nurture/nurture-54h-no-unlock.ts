import { escapeHtml } from "@shared/emails/shared";
import { renderNurtureEmail } from "./shared";

export interface Nurture54hNoUnlockParams {
  firstName?: string | null;
  ctaUrl: string;
  promoCode: string;
  /** Defaults to 75. */
  percentOff?: number;
  siteUrl: string;
  unsubscribeUrl?: string;
}

export function nurture54hNoUnlockEmail({
  firstName,
  ctaUrl,
  promoCode,
  percentOff = 75,
  siteUrl,
  unsubscribeUrl,
}: Nurture54hNoUnlockParams) {
  const safeFirstName = firstName?.trim() ? escapeHtml(firstName.trim()) : "there";
  const safePromoCode = escapeHtml(promoCode);
  // T-07: keep ≤50 chars so mobile clients (iOS Mail ~38-50, Gmail ~50-60)
  // don't truncate the discount hook. 75% off + 24h are the conversion-load-
  // bearing tokens; keep them at the start.
  const subject = `Last chance: ${percentOff}% off your report (24h)`;
  const previewText = `Use code ${promoCode} to save ${percentOff}% on your full report.`;

  return renderNurtureEmail({
    subject,
    previewText,
    siteUrl,
    unsubscribeUrl,
    body: {
      heading: `${percentOff}% discount on your full report only within the next 24h`,
      intro: [
        `Hi ${safeFirstName},`,
        "",
        "so far we couldn't convince you to unlock your report yet. This is your last chance to do it at a discount.",
        "",
        `<strong style="font-weight:700;">For the next 24 hours,</strong> you can unlock your full personal <strong style="font-weight:700;">LoveIQ report with ${percentOff}% off.</strong>`,
        "",
        `Use code: <strong style="font-weight:800; letter-spacing:0.5px;">${safePromoCode}</strong>`,
      ].join("\n"),
      ctaLabel: "View your report now",
      ctaUrl,
      preBulletsNote: [
        'Unlocking your full report is <strong style="font-weight:700;">100% risk-free</strong>, as we offer a <strong style="font-weight:700;">14-day money-back guarantee.</strong>',
        "<br /><br />",
        'If you are not happy with the report, we will refund your full payment. <strong style="font-weight:700;">No questions asked.</strong>',
        "<br /><br />",
        "We're offering this because we believe the report becomes most valuable when you see the full picture, not just your basic results, but the deeper patterns behind how you desire, connect, communicate, and grow.",
      ].join(""),
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
