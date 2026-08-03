import { EMAIL_FONT, escapeHtml, wrapEmailShell } from "@shared/emails/shared";

export interface PartnerCodeEmailParams {
  firstName?: string | null;
  /** Where the partner starts their own assessment (the code is entered at checkout). */
  ctaUrl: string;
  /** The REAL one-time 100%-off code minted for this buyer (LIQ-100-xxxxxxxx). */
  promoCode: string;
  siteUrl: string;
  unsubscribeUrl?: string;
}

/**
 * Tier-3 ("For you & your partner") partner-code email — pixel-copy of Figma
 * 8578-6607. Sent to the buyer after purchase carrying the REAL one-time
 * 100%-off code minted for them (mintUserPromoCode + STRIPE_COUPON_100). The
 * partner takes their own assessment and types the code on Stripe's hosted
 * checkout (checkout enables `allow_promotion_codes` whenever no owner-scoped
 * `?promo=` is present), so the code is shown as plain text to copy — NOT wired
 * into a `?promo=` link, because the redeemer is a different person than the
 * owner-scoped resolveNurturePromo would ever match.
 */
export function partnerCodeEmail({
  firstName,
  ctaUrl,
  promoCode,
  siteUrl,
  unsubscribeUrl,
}: PartnerCodeEmailParams) {
  const safeFirstName = firstName?.trim() ? escapeHtml(firstName.trim()) : "there";
  const displayName = firstName?.trim() || "there";
  const safeCode = escapeHtml(promoCode);

  const subject = "Your partner’s free code";
  const previewText = `Give code ${promoCode} to your partner — their full report, on us.`;

  const para = (html: string, top = 16) =>
    `<tr><td style="padding:${top}px 32px 0;"><p style="margin:0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">${html}</p></td></tr>`;

  const bodyHtml = `
  <tr>
    <td style="padding:24px 32px 8px;">
      <h1 style="margin:0; font-family:${EMAIL_FONT}; font-size:26px; font-weight:700; line-height:1.35; color:#000000; letter-spacing:-0.3px;">
        Pass the below code to your partner to unlock a free report
      </h1>
    </td>
  </tr>
  ${para(`Hi ${safeFirstName},`)}
  ${para(`You chose the version for two. Good call. These patterns make the most sense when you can see both sides of them.`)}
  ${para(`Below is a one-time code for your partner. It unlocks their full report, free.`)}
  ${para(`Use code: <strong style="font-weight:800; letter-spacing:0.5px;">${safeCode}</strong>`)}
  <tr>
    <td style="padding:16px 32px 0;">
      <p style="margin:0 0 6px 0; font-family:${EMAIL_FONT}; font-size:17px; font-weight:700; line-height:1.55; color:#000000;">How it works:</p>
      <p style="margin:0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.75; color:#000000;">
        1. Send your partner the code<br />
        2. They take the same assessment you did<br />
        3. At checkout, they enter the code and pay nothing
      </p>
    </td>
  </tr>
  <tr>
    <td align="center" style="padding:24px 32px 8px;">
      <a href="${escapeHtml(ctaUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-block; font-family:${EMAIL_FONT}; font-size:15px; font-weight:800; color:#ffffff; background:#5900ac; padding:14px 30px; border-radius:9999px; text-decoration:none;">
        Share the Assessment &rarr;
      </a>
    </td>
  </tr>
  ${para(`<strong style="font-weight:700;">Not sure how to bring it up?</strong> Steal this:`, 20)}
  ${para(`<em>&ldquo;I took this assessment about how I experience desire and connection, and the report was surprisingly accurate. It came with a free one for you. Curious what yours says.&rdquo;</em>`)}
  ${para(`One thing to know: your reports stay private. Neither of you sees the other&rsquo;s results unless you choose to share them.`)}
  ${para(`The most interesting part isn&rsquo;t either report on its own. It&rsquo;s the conversation between them.`)}
  <tr>
    <td align="center" style="padding:24px 32px 32px;">
      <p style="margin:0 0 12px 0; font-family:${EMAIL_FONT}; font-size:16px; line-height:1.55; color:#000000; text-align:center;">
        If anything gets in the way &mdash; missing link, expired access, or trouble opening your report &mdash; reach out to us at
        <a href="mailto:hello@loveiq.org" style="color:#1a73e8; text-decoration:underline;">hello@loveiq.org</a>.
      </p>
      <p style="margin:0 0 16px 0; font-family:${EMAIL_FONT}; font-size:16px; line-height:1.55; color:#000000; text-align:center;">We&rsquo;ll get you back in.</p>
      <p style="margin:0; font-family:${EMAIL_FONT}; font-size:16px; line-height:1.55; color:#000000; text-align:center;">With kindness,<br />Your LoveIQ team</p>
    </td>
  </tr>`;

  const html = wrapEmailShell({ bodyHtml, previewText, siteUrl, title: subject, unsubscribeUrl });

  const text = [
    subject,
    "",
    "Pass the below code to your partner to unlock a free report",
    "",
    `Hi ${displayName},`,
    "",
    "You chose the version for two. Good call. These patterns make the most sense when you can see both sides of them.",
    "",
    "Below is a one-time code for your partner. It unlocks their full report, free.",
    "",
    `Use code: ${promoCode}`,
    "",
    "How it works:",
    "1. Send your partner the code",
    "2. They take the same assessment you did",
    "3. At checkout, they enter the code and pay nothing",
    "",
    `Share the Assessment: ${ctaUrl}`,
    "",
    "Not sure how to bring it up? Steal this:",
    `"I took this assessment about how I experience desire and connection, and the report was surprisingly accurate. It came with a free one for you. Curious what yours says."`,
    "",
    "One thing to know: your reports stay private. Neither of you sees the other's results unless you choose to share them.",
    "",
    "The most interesting part isn't either report on its own. It's the conversation between them.",
    "",
    "If anything gets in the way — missing link, expired access, or trouble opening your report — reach out to us at hello@loveiq.org.",
    "",
    "We'll get you back in.",
    "",
    "With kindness,",
    "Your LoveIQ team",
  ].join("\n");

  return { subject, html, text };
}
