import { EMAIL_FONT, escapeHtml, renderCtaButton, wrapEmailShell } from "@/lib/emails/shared";
import { SHARE_MESSAGE_BODY } from "@/lib/share-message";

export interface InviteEmailParams {
  ctaUrl: string;
  referrerName?: string | null;
  siteUrl: string;
  unsubscribeUrl?: string;
  variant?: "a" | "b";
  personalMessage?: string | null;
}

export function inviteEmail({
  ctaUrl,
  referrerName,
  siteUrl,
  personalMessage,
  unsubscribeUrl,
}: InviteEmailParams) {
  const firstName = referrerName?.trim() ? referrerName.trim().split(/\s+/)[0] : null;
  const safeFirstName = firstName ? escapeHtml(firstName) : "A friend";

  const userMessage = personalMessage?.trim() || "";
  const isCustom = userMessage.length > 0;
  const bodyMessage = isCustom ? userMessage : SHARE_MESSAGE_BODY;
  const safeBodyMessage = escapeHtml(bodyMessage).replace(/\n/g, "<br />");

  const subject = "Check out LoveIQ - It was super helpful";
  const previewText = bodyMessage.slice(0, 140);
  const safeCtaUrl = escapeHtml(ctaUrl);

  const bodyHtml = `
  <tr>
    <td style="padding:24px 32px 8px;">
      <h1 style="margin:0; font-family:${EMAIL_FONT}; font-size:26px; font-weight:600; line-height:1.35; color:#000000; letter-spacing:-0.3px;">
        You should definitely try LoveIQ
      </h1>
    </td>
  </tr>
  <tr>
    <td style="padding:16px 32px 8px;">
      <p style="margin:0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000; white-space:pre-wrap;">${safeBodyMessage}</p>
    </td>
  </tr>
  <tr>
    <td style="padding:8px 32px 16px;">
      <p style="margin:0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000; word-break:break-all;">
        <a href="${safeCtaUrl}" target="_blank" style="color:#1a73e8; text-decoration:underline;">${safeCtaUrl}</a>
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

  const html = wrapEmailShell({ bodyHtml, previewText, siteUrl, title: subject, unsubscribeUrl });

  const text = [
    "You should definitely try LoveIQ",
    "",
    bodyMessage,
    "",
    ctaUrl,
    "",
    "With kindness,",
    `${firstName || "A friend"} sent via LoveIQ`,
  ].join("\n");

  return { subject, html, text };
}
