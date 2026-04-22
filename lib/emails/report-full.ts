import { EMAIL_FONT, escapeHtml, renderCtaButton, wrapEmailShell } from "@/lib/emails/shared";

export interface ReportFullEmailParams {
  firstName?: string | null;
  reportUrl: string;
  siteUrl: string;
}

export function reportFullEmail({ firstName, reportUrl, siteUrl }: ReportFullEmailParams) {
  const safeFirstName = firstName?.trim() ? escapeHtml(firstName.trim()) : "there";
  const displayName = firstName?.trim() || "there";
  const subject = `Your full report is ready, ${displayName}`;
  const previewText = "Thank you for trusting us. Your Full Report is inside.";

  const bodyHtml = `
  <tr>
    <td style="padding:24px 32px 8px;">
      <h1 style="margin:0; font-family:${EMAIL_FONT}; font-size:26px; font-weight:600; line-height:1.35; color:#000000; letter-spacing:-0.3px;">
        You went deeper. Here&rsquo;s what you unlocked.
      </h1>
    </td>
  </tr>
  <tr>
    <td style="padding:16px 32px 0;">
      <p style="margin:0 0 16px 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">
        Hi ${safeFirstName},
      </p>
      <p style="margin:0 0 16px 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">
        Thank you for trusting us with something this personal. That means a lot to us.
      </p>
      <p style="margin:0 0 16px 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">
        <strong style="font-weight:700;">Your Full Report is inside.</strong>
      </p>
      <p style="margin:0 0 16px 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">
        It reflects the patterns in your responses across <strong style="font-weight:700;">18 analysed dimensions</strong> &mdash; your archetype probabilities, core motivation, relational stage, desire drivers, attachment style, and more. Most people are surprised by at least one of them.
      </p>
      <p style="margin:0 0 24px 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">
        You can <strong style="font-weight:700;">share this report</strong> with up to two people you trust. Some of the most interesting conversations start here.
      </p>
    </td>
  </tr>
  <tr>
    <td align="center" style="padding:8px 32px 24px;">
      ${renderCtaButton({ href: reportUrl, label: "View your Full Report" })}
    </td>
  </tr>
  <tr>
    <td style="padding:8px 32px 8px;">
      <p style="margin:0 0 12px 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000; font-weight:700;">
        Why it&rsquo;s worth a look:
      </p>
      <ul style="margin:0 0 16px 0; padding-left:22px; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">
        <li style="margin:0 0 6px 0;">Built on psychology + real response patterns</li>
        <li style="margin:0 0 6px 0;">18 dimensions of insight you can actually use</li>
        <li style="margin:0 0 6px 0;">Private by design &mdash; your data stays yours</li>
        <li style="margin:0 0 6px 0;">Includes one complimentary month of the <strong style="font-weight:700;">LoveIQ Journal on Substack</strong>.</li>
      </ul>
      <p style="margin:16px 0 24px 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">
        Curious minds tend to get the most out of this.
      </p>
    </td>
  </tr>
  <tr>
    <td align="center" style="padding:16px 32px 32px;">
      <p style="margin:0 0 12px 0; font-family:${EMAIL_FONT}; font-size:16px; line-height:1.55; color:#000000; text-align:center;">
        If anything gets in the way &mdash; missing link, expired access, or trouble opening your report &mdash; reach out to us at
        <a href="mailto:hello@loveiq.org" style="color:#1a73e8; text-decoration:underline;">hello@loveiq.org</a>.
      </p>
      <p style="margin:0 0 16px 0; font-family:${EMAIL_FONT}; font-size:16px; line-height:1.55; color:#000000; text-align:center;">
        We&rsquo;ll get you back in.
      </p>
      <p style="margin:0; font-family:${EMAIL_FONT}; font-size:16px; line-height:1.55; color:#000000; text-align:center;">
        With kindness,<br />Your LoveIQ team
      </p>
    </td>
  </tr>`;

  const html = wrapEmailShell({ bodyHtml, previewText, siteUrl, title: subject });

  const text = [
    `Your full report is ready, ${displayName}`,
    "",
    `Hi ${displayName},`,
    "",
    "Thank you for trusting us with something this personal. That means a lot to us.",
    "",
    "Your Full Report is inside.",
    "",
    "It reflects the patterns in your responses across 18 analysed dimensions — your archetype probabilities, core motivation, relational stage, desire drivers, attachment style, and more. Most people are surprised by at least one of them.",
    "",
    "You can share this report with up to two people you trust. Some of the most interesting conversations start here.",
    "",
    `View your Full Report: ${reportUrl}`,
    "",
    "Why it's worth a look:",
    "- Built on psychology + real response patterns",
    "- 18 dimensions of insight you can actually use",
    "- Private by design — your data stays yours",
    "- Includes one complimentary month of the LoveIQ Journal on Substack.",
    "",
    "Curious minds tend to get the most out of this.",
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
