import { EMAIL_FONT, escapeHtml, renderCtaButton, wrapEmailShell } from "@/lib/emails/shared";

/**
 * Shared-report invitation — Variant B (Figma node 5813-551).
 * Subject identical to A; copy keeps the owner's first name + personal message
 * but swaps the primary CTA to "View report now" and pulls the report link
 * inline into the message block (above the button) for higher-context first
 * impressions.
 *
 * Pair with `reportSharedEmail` (variant A) and `reportSharedCEmail` (variant C)
 * for a 3-way A/B/C test on the share send.
 */
export interface ReportSharedBEmailParams {
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

export function reportSharedBEmail({
  ownerFirstName,
  recipientFirstName: _recipientFirstName,
  shareUrl,
  siteUrl,
  personalMessage,
  unsubscribeUrl,
}: ReportSharedBEmailParams) {
  const owner = ownerDisplay(ownerFirstName);
  const subject = "A LoveIQ report has been shared with you";
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
    <td style="padding:8px 32px 16px;">
      <p style="margin:0; font-family:${EMAIL_FONT}; font-size:14px; line-height:1.55; color:#1a73e8; word-break:break-all;">
        <a href="${safeShareUrl}" target="_blank" style="color:#1a73e8; text-decoration:underline;">${safeShareUrl}</a>
      </p>
    </td>
  </tr>
  <tr>
    <td align="center" style="padding:32px 32px 24px;">
      ${renderCtaButton({ href: shareUrl, label: "View report now" })}
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
    `View report now: ${shareUrl}`,
    "",
    "With kindness,",
    `${owner.plain} sent via LoveIQ`,
  ]
    .filter((line, idx, arr) => !(line === "" && arr[idx - 1] === ""))
    .join("\n");

  return { subject, html, text, siteUrl };
}
