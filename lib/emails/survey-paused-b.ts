import { EMAIL_FONT, escapeHtml, renderCtaButton, wrapEmailShell } from "@/lib/emails/shared";

/**
 * Survey-paused reminder — Variant B (Figma node 5086-354).
 * Loss-aversion framing: "Most people never come back. Don't be one of them."
 * Pair with `surveyPausedEmail` (variant A) for an A/B test from the cron job.
 */
export interface SurveyPausedBEmailParams {
  firstName?: string | null;
  resumeUrl: string;
  siteUrl: string;
  unsubscribeUrl?: string;
}

export function surveyPausedBEmail({
  firstName,
  resumeUrl,
  siteUrl,
  unsubscribeUrl,
}: SurveyPausedBEmailParams) {
  const safeFirstName = firstName?.trim() ? escapeHtml(firstName.trim()) : "there";
  const greetingText = firstName?.trim() || "there";
  const subject = "Continue your LoveIQ survey";
  const previewText = "Your answers are saved. Pick up a few steps from the full picture.";

  const bodyHtml = `
  <tr>
    <td style="padding:24px 32px 8px;">
      <h1 style="margin:0; font-family:${EMAIL_FONT}; font-size:26px; font-weight:600; line-height:1.35; color:#000000; letter-spacing:-0.3px;">
        Your answers are still waiting&hellip;
      </h1>
    </td>
  </tr>
  <tr>
    <td style="padding:16px 32px 0;">
      <p style="margin:0 0 16px 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">
        Hi ${safeFirstName},
      </p>
      <p style="margin:0 0 16px 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">
        You started your LoveIQ test, but didn&rsquo;t get to see what it reveals. <strong style="font-weight:700;">Right now, your answers are still saved &mdash; but unfinished insights often get lost.</strong>
      </p>
      <p style="margin:0 0 16px 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">
        <strong style="font-weight:700;">Most people never come back to complete what they started.</strong> Don&rsquo;t be one of them.
      </p>
      <p style="margin:0 0 24px 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">
        Your results are already taking shape &mdash; <strong style="font-weight:700;">you&rsquo;re just a few steps away from seeing the full picture.</strong>
      </p>
    </td>
  </tr>
  <tr>
    <td align="center" style="padding:8px 32px 24px;">
      ${renderCtaButton({ href: resumeUrl, label: "Finish your LoveIQ test now", width: 280 })}
    </td>
  </tr>
  <tr>
    <td align="center" style="padding:16px 32px 32px;">
      <p style="margin:0 0 12px 0; font-family:${EMAIL_FONT}; font-size:16px; line-height:1.55; color:#000000; text-align:center;">
        If anything felt unclear or you had to step away, you can always reach us at
        <a href="mailto:hello@loveiq.org" style="color:#1a73e8; text-decoration:underline;">hello@loveiq.org</a>.
      </p>
      <p style="margin:0 0 16px 0; font-family:${EMAIL_FONT}; font-size:16px; line-height:1.55; color:#000000; text-align:center;">
        We&rsquo;ll help you pick up right where you left off.
      </p>
      <p style="margin:0; font-family:${EMAIL_FONT}; font-size:16px; line-height:1.55; color:#000000; text-align:center;">
        With kindness,<br />Your LoveIQ team
      </p>
    </td>
  </tr>`;

  const html = wrapEmailShell({ bodyHtml, previewText, siteUrl, title: subject, unsubscribeUrl });

  const text = [
    "Continue your LoveIQ survey",
    "",
    `Hi ${greetingText},`,
    "",
    "You started your LoveIQ test, but didn't get to see what it reveals. Right now, your answers are still saved — but unfinished insights often get lost.",
    "",
    "Most people never come back to complete what they started. Don't be one of them.",
    "",
    "Your results are already taking shape — you're just a few steps away from seeing the full picture.",
    "",
    `Finish your LoveIQ test now: ${resumeUrl}`,
    "",
    "If anything felt unclear or you had to step away, you can always reach us at hello@loveiq.org.",
    "",
    "We'll help you pick up right where you left off.",
    "",
    "With kindness,",
    "Your LoveIQ team",
  ].join("\n");

  return { subject, html, text };
}
