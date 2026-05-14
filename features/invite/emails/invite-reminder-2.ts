import { EMAIL_FONT, escapeHtml, renderCtaButton, wrapEmailShell } from "@/lib/emails/shared";

/**
 * Refer-a-friend reminder #2 (Figma node 6190-1891).
 * Sent N days after reminder #1 if the user still hasn't sent any invite.
 * Stronger framing: "Don't your friends deserve to know too?"
 */
export interface InviteReminder2EmailParams {
  firstName?: string | null;
  /** URL that opens the Refer-a-Friend modal on the report page (deep-link). */
  inviteCtaUrl: string;
  siteUrl: string;
  unsubscribeUrl?: string;
}

export function inviteReminder2Email({
  firstName,
  inviteCtaUrl,
  siteUrl,
  unsubscribeUrl,
}: InviteReminder2EmailParams) {
  const safeFirstName = firstName?.trim() ? escapeHtml(firstName.trim()) : "there";
  const greetingText = firstName?.trim() || "there";
  const subject = "Why keep this to yourself?";
  const previewText = "Your report showed you something. A friend deserves theirs too.";
  const safeCtaUrl = escapeHtml(inviteCtaUrl);

  const bodyHtml = `
  <tr>
    <td style="padding:24px 32px 8px;">
      <h1 style="margin:0; font-family:${EMAIL_FONT}; font-size:26px; font-weight:600; line-height:1.35; color:#000000; letter-spacing:-0.3px;">
        Don&rsquo;t your friends deserve to know too?
      </h1>
    </td>
  </tr>
  <tr>
    <td style="padding:16px 32px 0;">
      <p style="margin:0 0 16px 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">
        Hi ${safeFirstName},
      </p>
      <p style="margin:0 0 16px 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">
        You&rsquo;ve seen your LoveIQ report. You know what it showed you. Why not share some of the love?
      </p>
      <p style="margin:0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">
        If there&rsquo;s someone in your life you think deserves to know &mdash; <strong style="font-weight:700;">refer a friend and let them find out for themselves.</strong>
        &nbsp;<a href="${safeCtaUrl}" target="_blank" style="color:#1a73e8; text-decoration:underline;">${safeCtaUrl}</a>
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
    "Why keep this to yourself?",
    "",
    `Hi ${greetingText},`,
    "",
    "You've seen your LoveIQ report. You know what it showed you. Why not share some of the love?",
    "",
    `If there's someone in your life you think deserves to know — refer a friend and let them find out for themselves. ${inviteCtaUrl}`,
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
