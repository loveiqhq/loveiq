import { EMAIL_FONT, escapeHtml, renderCtaButton, wrapEmailShell } from "@/lib/emails/shared";

/**
 * Friend referral / invite — Variant B (Figma node 5319-1846).
 * First-person testimonial framing: "This opened my eyes."
 * Pair with `inviteEmail` (variant A) for an A/B test on the invite send.
 *
 * Default body text mirrors the Figma testimonial but is overridable when the
 * referrer types their own personal note in the invite modal.
 */
export interface InviteBEmailParams {
  ctaUrl: string;
  referrerName?: string | null;
  siteUrl: string;
  personalMessage?: string | null;
}

const DEFAULT_BODY_A = `I took the LoveIQ test and it gave me real clarity on my intimate patterns, desires, and potentials. It is much better than I expected — specific enough that I'm still sitting with some of what came up.`;
const DEFAULT_BODY_B = `I won't tell you what it found. That's kind of the point. What I can tell you is that it named patterns I'd felt for years but never had language for.`;
const DEFAULT_BODY_LEAD = `This is worth your time.`;

export function inviteBEmail({
  ctaUrl,
  referrerName,
  siteUrl,
  personalMessage,
}: InviteBEmailParams) {
  const firstName = referrerName?.trim() ? referrerName.trim().split(/\s+/)[0] : null;
  const safeFirstName = firstName ? escapeHtml(firstName) : "A friend";

  const userMessage = personalMessage?.trim() || "";
  const isCustom = userMessage.length > 0;

  const safeCtaUrl = escapeHtml(ctaUrl);
  const subject = "I found out something about myself I can\u2019t stop thinking about\u2026";
  const previewText = "This opened my eyes \u2014 a testimonial from a friend.";

  const customBlockHtml = isCustom
    ? `
  <tr>
    <td style="padding:0 32px 8px;">
      <p style="margin:0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000; white-space:pre-wrap;">${escapeHtml(userMessage).replace(/\n/g, "<br />")}</p>
    </td>
  </tr>`
    : `
  <tr>
    <td style="padding:0 32px 8px;">
      <p style="margin:0 0 16px 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">
        I took the LoveIQ test and it <strong style="font-weight:700;">gave me real clarity on my intimate patterns, desires, and potentials</strong>. It is much better than I expected &mdash; specific enough that I&rsquo;m still sitting with some of what came up.
      </p>
      <p style="margin:0 0 16px 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">
        I won&rsquo;t tell you what it found. That&rsquo;s kind of the point. What I can tell you is that it named patterns I&rsquo;d felt for years but never had language for.
      </p>
      <p style="margin:0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">
        <strong style="font-weight:700;">This is worth your time.</strong>
        &nbsp;<a href="${safeCtaUrl}" target="_blank" style="color:#1a73e8; text-decoration:underline;">${safeCtaUrl}</a>
      </p>
    </td>
  </tr>`;

  const bodyHtml = `
  <tr>
    <td style="padding:24px 32px 8px;">
      <h1 style="margin:0; font-family:${EMAIL_FONT}; font-size:26px; font-weight:600; line-height:1.35; color:#000000; letter-spacing:-0.3px;">
        This opened my eyes.
      </h1>
    </td>
  </tr>
  <tr>
    <td style="padding:16px 32px 8px;">
      <p style="margin:0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">
        Hi :),
      </p>
    </td>
  </tr>
  ${customBlockHtml}
  <tr>
    <td align="center" style="padding:24px 32px 24px;">
      ${renderCtaButton({ href: ctaUrl, label: "Take the test", width: 200 })}
    </td>
  </tr>
  <tr>
    <td align="center" style="padding:16px 32px 32px;">
      <p style="margin:0 0 12px 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000; text-align:center;">
        With kindness,
      </p>
      <p style="margin:0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000; text-align:center;">
        ${safeFirstName} sent via LoveIQ
      </p>
    </td>
  </tr>`;

  const html = wrapEmailShell({ bodyHtml, previewText, siteUrl, title: subject });

  const bodyForText = isCustom
    ? userMessage
    : [DEFAULT_BODY_A, "", DEFAULT_BODY_B, "", `${DEFAULT_BODY_LEAD} ${ctaUrl}`].join("\n");

  const text = [
    "This opened my eyes.",
    "",
    "Hi :),",
    "",
    bodyForText,
    "",
    "Take the test:",
    ctaUrl,
    "",
    "With kindness,",
    `${firstName || "A friend"} sent via LoveIQ`,
  ].join("\n");

  return { subject, html, text };
}
