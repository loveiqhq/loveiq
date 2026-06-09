import { EMAIL_FONT, escapeHtml, renderCtaButton, wrapEmailShell } from "@shared/emails/shared";
import {
  renderTrustpilotBadge,
  renderTrustpilotBadgeText,
} from "@features/report/server/emails/nurture/shared";

/**
 * Post-survey "your report is ready" — Variant B (Figma node 5086-101).
 * Curiosity framing: "This might surprise you / change how you see yourself".
 * Pair with `surveyCompleteEmail` (variant A) for an A/B test.
 */
export interface SurveyCompleteBEmailParams {
  firstName?: string | null;
  reportUrl: string;
  siteUrl: string;
  unsubscribeUrl?: string;
}

export function surveyCompleteBEmail({
  firstName,
  reportUrl,
  siteUrl,
  unsubscribeUrl,
}: SurveyCompleteBEmailParams) {
  const safeFirstName = firstName?.trim() ? escapeHtml(firstName.trim()) : "there";
  const greetingText = firstName?.trim() || "there";
  const subject = "This might surprise you…";
  const previewText = "Something interesting showed up in your results.";

  const bodyHtml = `
  <tr>
    <td style="padding:24px 32px 8px;">
      <h1 style="margin:0; font-family:${EMAIL_FONT}; font-size:26px; font-weight:600; line-height:1.35; color:#000000; letter-spacing:-0.3px;">
        This might change how you see yourself.
      </h1>
    </td>
  </tr>
  <tr>
    <td style="padding:16px 32px 0;">
      <p style="margin:0 0 16px 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">
        Hi ${safeFirstName},
      </p>
      <p style="margin:0 0 16px 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">
        <strong style="font-weight:700;">Something interesting showed up in your results.</strong>
      </p>
      <p style="margin:0 0 16px 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">
        Most people go through the test expecting one thing &mdash; and discover something slightly different.
      </p>
      <p style="margin:0 0 16px 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">
        <strong style="font-weight:700;">Your LoveIQ report is ready</strong>, and it reveals patterns in how you experience attraction, connection, and desire that are often hard to put into words.
      </p>
      <p style="margin:0 0 8px 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">
        It&rsquo;s not about labels.
      </p>
      <p style="margin:0 0 24px 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">
        It&rsquo;s about seeing yourself more clearly.
      </p>
    </td>
  </tr>
  <tr>
    <td align="center" style="padding:8px 32px 16px;">
      ${renderCtaButton({ href: reportUrl, label: "View your report now" })}
    </td>
  </tr>
  ${renderTrustpilotBadge()}
  <tr>
    <td style="padding:8px 32px 8px;">
      <p style="margin:0 0 12px 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000; font-weight:700;">
        Why it&rsquo;s worth a look:
      </p>
      <ul style="margin:0 0 16px 0; padding-left:22px; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">
        <li style="margin:0 0 6px 0;">Built on psychology + real response patterns</li>
        <li style="margin:0 0 6px 0;">Practical insights you can actually use</li>
        <li style="margin:0 0 6px 0;">Private by design &mdash; your data stays yours</li>
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

  const html = wrapEmailShell({ bodyHtml, previewText, siteUrl, title: subject, unsubscribeUrl });

  const text = [
    "This might surprise you…",
    "",
    `Hi ${greetingText},`,
    "",
    "Something interesting showed up in your results.",
    "",
    "Most people go through the test expecting one thing — and discover something slightly different.",
    "",
    "Your LoveIQ report is ready, and it reveals patterns in how you experience attraction, connection, and desire that are often hard to put into words.",
    "",
    "It's not about labels.",
    "It's about seeing yourself more clearly.",
    "",
    `View your report now: ${reportUrl}`,
    "",
    renderTrustpilotBadgeText(),
    "",
    "Why it's worth a look:",
    "- Built on psychology + real response patterns",
    "- Practical insights you can actually use",
    "- Private by design — your data stays yours",
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
