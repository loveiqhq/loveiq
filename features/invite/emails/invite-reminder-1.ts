import { EMAIL_FONT, escapeHtml, renderCtaButton, wrapEmailShell } from "@shared/emails/shared";

/**
 * Refer-a-friend reminder #1 (Figma node 6190-1182).
 * Sent N days after a user opened their report if they haven't sent any invite yet.
 * Soft framing: "Could this help a friend?"
 */
export interface InviteReminder1EmailParams {
  firstName?: string | null;
  /** URL that opens the Refer-a-Friend modal on the report page (deep-link). */
  inviteCtaUrl: string;
  siteUrl: string;
  unsubscribeUrl?: string;
}

export function inviteReminder1Email({
  firstName,
  inviteCtaUrl,
  siteUrl,
  unsubscribeUrl,
}: InviteReminder1EmailParams) {
  const safeFirstName = firstName?.trim() ? escapeHtml(firstName.trim()) : "there";
  const greetingText = firstName?.trim() || "there";
  const subject = "Could this help a friend?";
  const previewText = "If your LoveIQ report resonated, maybe a friend would enjoy theirs too.";
  const safeCtaUrl = escapeHtml(inviteCtaUrl);

  const bodyHtml = `
  <tr>
    <td style="padding:24px 32px 8px;">
      <h1 style="margin:0; font-family:${EMAIL_FONT}; font-size:26px; font-weight:600; line-height:1.35; color:#000000; letter-spacing:-0.3px;">
        Know someone who&rsquo;d love this?
      </h1>
    </td>
  </tr>
  <tr>
    <td style="padding:16px 32px 0;">
      <p style="margin:0 0 16px 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">
        Hi ${safeFirstName},
      </p>
      <p style="margin:0 0 16px 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">
        You just viewed your LoveIQ report.
      </p>
      <p style="margin:0 0 16px 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">
        If it resonated &mdash; maybe there&rsquo;s a friend who&rsquo;d enjoy theirs too.
      </p>
      <p style="margin:0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">
        <strong style="font-weight:700;">Refer a friend and let them discover their own report.</strong>
        &nbsp;<a href="${safeCtaUrl}" target="_blank" rel="noopener noreferrer" style="color:#1a73e8; text-decoration:underline;">${safeCtaUrl}</a>
      </p>
    </td>
  </tr>
  <tr>
    <td align="center" style="padding:24px 32px 24px;">
      ${renderCtaButton({ href: inviteCtaUrl, label: "Refer a friend", width: 220 })}
    </td>
  </tr>
  <tr>
    <td align="center" style="padding:16px 32px 32px;">
      <p style="margin:0 0 12px 0; font-family:${EMAIL_FONT}; font-size:16px; line-height:1.55; color:#000000; text-align:center;">
        If you have any questions or you&rsquo;d like to consult, feel free to reach out to us at
        <a href="mailto:hello@loveiq.org" style="color:#1a73e8; text-decoration:underline;">hello@loveiq.org</a>.
      </p>
      <p style="margin:0 0 16px 0; font-family:${EMAIL_FONT}; font-size:16px; line-height:1.55; color:#000000; text-align:center;">
        We are happy to help.
      </p>
      <p style="margin:0; font-family:${EMAIL_FONT}; font-size:16px; line-height:1.55; color:#000000; text-align:center;">
        With kindness,<br />Your LoveIQ team
      </p>
    </td>
  </tr>`;

  const html = wrapEmailShell({ bodyHtml, previewText, siteUrl, title: subject, unsubscribeUrl });

  const text = [
    "Could this help a friend?",
    "",
    `Hi ${greetingText},`,
    "",
    "You just viewed your LoveIQ report.",
    "",
    "If it resonated — maybe there's a friend who'd enjoy theirs too.",
    "",
    `Refer a friend and let them discover their own report. ${inviteCtaUrl}`,
    "",
    `Refer a friend: ${inviteCtaUrl}`,
    "",
    "If you have any questions or you'd like to consult, feel free to reach out to us at hello@loveiq.org.",
    "",
    "We are happy to help.",
    "",
    "With kindness,",
    "Your LoveIQ team",
  ].join("\n");

  return { subject, html, text };
}
