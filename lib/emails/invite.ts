import { EMAIL_FONT, escapeHtml, renderCtaButton, wrapEmailShell } from "@/lib/emails/shared";

export interface InviteEmailParams {
  ctaUrl: string;
  referrerName?: string | null;
  siteUrl: string;
  variant?: "a" | "b";
}

export function inviteEmail({ ctaUrl, referrerName, siteUrl }: InviteEmailParams) {
  const firstName = referrerName?.trim() ? referrerName.trim().split(/\s+/)[0] : null;
  const safeFirstName = firstName ? escapeHtml(firstName) : "A friend";

  const subject = "Check out LoveIQ - It was super helpful";
  const previewText = "It gave me real clarity on my intimate patterns, desires, and potentials.";

  const bodyHtml = `
  <tr>
    <td style="padding:24px 32px 8px;">
      <h1 style="margin:0; font-family:${EMAIL_FONT}; font-size:26px; font-weight:600; line-height:1.35; color:#000000; letter-spacing:-0.3px;">
        You should definitely try LoveIQ
      </h1>
    </td>
  </tr>
  <tr>
    <td style="padding:16px 32px 0;">
      <p style="margin:0 0 16px 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">
        Hi :),
      </p>
      <p style="margin:0 0 16px 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">
        I took the LoveIQ test and it <strong style="font-weight:700;">gave me real clarity on my intimate patterns, desires, and potentials</strong>. It is much better than I expected.
      </p>
      <p style="margin:0 0 24px 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">
        You should try it. <a href="${escapeHtml(ctaUrl)}" target="_blank" style="color:#1a73e8; text-decoration:underline;">[Link]</a>
      </p>
    </td>
  </tr>
  <tr>
    <td align="center" style="padding:8px 32px 32px;">
      ${renderCtaButton({ href: ctaUrl, label: "Check out LoveIQ", width: 200 })}
    </td>
  </tr>
  <tr>
    <td align="center" style="padding:16px 32px 32px;">
      <p style="margin:0 0 16px 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000; text-align:center;">
        With kindness,
      </p>
      <p style="margin:0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000; text-align:center;">
        ${safeFirstName} sent via LoveIQ
      </p>
    </td>
  </tr>`;

  const html = wrapEmailShell({ bodyHtml, previewText, siteUrl, title: subject });

  const text = [
    "You should definitely try LoveIQ",
    "",
    "Hi :),",
    "",
    "I took the LoveIQ test and it gave me real clarity on my intimate patterns, desires, and potentials. It is much better than I expected.",
    "",
    `You should try it. ${ctaUrl}`,
    "",
    `Check out LoveIQ: ${ctaUrl}`,
    "",
    "With kindness,",
    `${firstName || "A friend"} sent via LoveIQ`,
  ].join("\n");

  return { subject, html, text };
}
