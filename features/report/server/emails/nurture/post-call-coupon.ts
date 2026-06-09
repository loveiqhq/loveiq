import { escapeHtml } from "@shared/emails/shared";
import { renderNurtureEmail } from "./shared";

export interface PostCallCouponParams {
  firstName?: string | null;
  /** /report link carrying the one-time 100%-off promo code. */
  ctaUrl: string;
  promoCode: string;
  siteUrl: string;
  unsubscribeUrl?: string;
}

/**
 * Sent by the admin "grant post-call 100% coupon" action after a 20-minute
 * call: delivers the one-time 100%-off code that unlocks the full report. The
 * code is pre-applied at checkout via `?promo=` (see resolveNurturePromo), so
 * the user just clicks through to a $0 unlock.
 */
export function postCallCouponEmail({
  firstName,
  ctaUrl,
  promoCode,
  siteUrl,
  unsubscribeUrl,
}: PostCallCouponParams) {
  const safeFirstName = firstName?.trim() ? escapeHtml(firstName.trim()) : "there";
  const safePromoCode = escapeHtml(promoCode);

  // ≤50 chars so the hook isn't truncated on mobile.
  const subject = "As promised — your report is on us";
  const previewText = `Use code ${promoCode} to unlock your full report — free.`;

  return renderNurtureEmail({
    subject,
    previewText,
    siteUrl,
    unsubscribeUrl,
    body: {
      heading: "As promised, your full report is on us.",
      intro: [
        `Hi ${safeFirstName},`,
        "",
        "thank you for taking the time to hop on a call with us — it genuinely helps.",
        "",
        `As promised, your full personal <strong style="font-weight:700;">LoveIQ report is on us.</strong> Use the code below at checkout and it covers <strong style="font-weight:700;">100% of the price.</strong>`,
        "",
        `Use code: <strong style="font-weight:800; letter-spacing:0.5px;">${safePromoCode}</strong>`,
      ].join("\n"),
      ctaLabel: "Unlock your full report",
      ctaUrl,
      closingNote: "This code is just for you and works once.",
    },
  });
}
