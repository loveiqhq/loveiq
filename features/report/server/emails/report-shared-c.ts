import { EMAIL_FONT, escapeHtml, renderCtaButton, wrapEmailShell } from "@shared/emails/shared";

/**
 * Shared-report invitation — Variant C (Figma node 5813-467).
 * More personal subject ("Something personal I wanted you to see") plus a
 * follow-up "P.S. I think you should also try it." nudge to convert the
 * recipient into a future tester.
 *
 * Pair with `reportSharedEmail` (variant A) and `reportSharedBEmail` (variant B)
 * for a 3-way A/B/C test on the share send.
 */
export interface ReportSharedCEmailParams {
  ownerFirstName?: string | null;
  recipientFirstName?: string | null;
  shareUrl: string;
  siteUrl: string;
  unsubscribeUrl?: string;
  personalMessage?: string | null;
}

function ownerDisplay(ownerFirstName?: string | null): { safe: string; plain: string } {
  const trimmed = ownerFirstName?.trim();
  if (trimmed) {
    return { safe: escapeHtml(trimmed), plain: trimmed };
  }
  return { safe: "Someone", plain: "Someone" };
}

function renderPersonalMessageHtml(message: string): string {
  const escaped = escapeHtml(message);
  const normalised = escaped.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n");
  const html = normalised.replace(/\n/g, "<br />");
  return `
  <tr>
    <td style="padding:8px 32px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f7f7f8; border-radius:8px;">
        <tr>
          <td style="padding:16px 20px; font-family:${EMAIL_FONT}; font-size:16px; line-height:1.55; color:#000000; font-style:italic;">
            ${html}
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

export function reportSharedCEmail({
  ownerFirstName,
  recipientFirstName: _recipientFirstName,
  shareUrl,
  siteUrl,
  personalMessage,
  unsubscribeUrl,
}: ReportSharedCEmailParams) {
  const owner = ownerDisplay(ownerFirstName);
  const subject = "Something personal I wanted you to see";
  const previewText = `${owner.plain} has shared their LoveIQ report with you.`;
  const safeShareUrl = escapeHtml(shareUrl);

  const messageHtml = personalMessage?.trim()
    ? renderPersonalMessageHtml(personalMessage.trim())
    : "";

  const bodyHtml = `
  <tr>
    <td style="padding:24px 32px 8px;">
      <p style="margin:0 0 16px 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">
        Hi :),
      </p>
      <p style="margin:0 0 16px 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">
        ${owner.safe} has taken the LoveIQ test and <strong style="font-weight:700;">shared their report with you</strong>.
      </p>
    </td>
  </tr>
  ${messageHtml}
  <tr>
    <td style="padding:8px 32px 8px;">
      <p style="margin:0; font-family:${EMAIL_FONT}; font-size:14px; line-height:1.55; color:#1a73e8; word-break:break-all;">
        <a href="${safeShareUrl}" target="_blank" style="color:#1a73e8; text-decoration:underline;">${safeShareUrl}</a>
      </p>
    </td>
  </tr>
  <tr>
    <td style="padding:8px 32px 16px;">
      <p style="margin:0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">
        P.S. <strong style="font-weight:700;">I think you should also try it.</strong>
      </p>
    </td>
  </tr>
  <tr>
    <td align="center" style="padding:24px 32px 24px;">
      ${renderCtaButton({ href: shareUrl, label: "Check out LoveIQ" })}
    </td>
  </tr>
  <tr>
    <td style="padding:8px 32px 32px;">
      <p style="margin:0 0 6px 0; font-family:${EMAIL_FONT}; font-size:16px; line-height:1.55; color:#000000;">
        With kindness,
      </p>
      <p style="margin:0; font-family:${EMAIL_FONT}; font-size:16px; line-height:1.55; color:#000000;">
        ${owner.safe} sent via <strong style="font-weight:700;">LoveIQ</strong>
      </p>
    </td>
  </tr>`;

  const html = wrapEmailShell({ bodyHtml, previewText, siteUrl, title: subject, unsubscribeUrl });

  const messageText = personalMessage?.trim() ? `\n${personalMessage.trim()}\n` : "";

  const text = [
    subject,
    "",
    "Hi :),",
    "",
    `${owner.plain} has taken the LoveIQ test and shared their report with you.`,
    messageText,
    shareUrl,
    "",
    "P.S. I think you should also try it.",
    "",
    `Check out LoveIQ: ${shareUrl}`,
    "",
    "With kindness,",
    `${owner.plain} sent via LoveIQ`,
  ]
    .filter((line, idx, arr) => !(line === "" && arr[idx - 1] === ""))
    .join("\n");

  return { subject, html, text, siteUrl };
}
