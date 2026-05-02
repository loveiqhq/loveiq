import { EMAIL_FONT, escapeHtml, renderCtaButton, wrapEmailShell } from "@/lib/emails/shared";

export interface SurveyPausedEmailParams {
  firstName?: string | null;
  resumeUrl: string;
  siteUrl: string;
}

export function surveyPausedEmail({ firstName, resumeUrl, siteUrl }: SurveyPausedEmailParams) {
  const safeFirstName = firstName?.trim() ? escapeHtml(firstName.trim()) : "there";
  const subject = "You paused your LoveIQ survey";
  const previewText = "We saved your progress. Pick up where you left off.";

  const bodyHtml = `
  <tr>
    <td style="padding:24px 32px 8px;">
      <h1 style="margin:0; font-family:${EMAIL_FONT}; font-size:26px; font-weight:600; line-height:1.35; color:#000000; letter-spacing:-0.3px;">
        Don&rsquo;t leave your story unfinished
      </h1>
    </td>
  </tr>
  <tr>
    <td style="padding:16px 32px 0;">
      <p style="margin:0 0 16px 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">
        Hi ${safeFirstName},
      </p>
      <p style="margin:0 0 16px 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">
        You were just a few steps away from unlocking your personal LoveIQ insights and <strong style="font-weight:700;">we saved your progress</strong> for you.
      </p>
      <p style="margin:0 0 12px 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">
        It <strong style="font-weight:700;">only takes a moment to finish</strong>, and you&rsquo;ll get:
      </p>
      <ul style="margin:0 0 16px 0; padding-left:22px; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">
        <li style="margin:0 0 6px 0;">A clearer understanding of your relationship patterns</li>
        <li style="margin:0 0 6px 0;">Personalized insights you can actually use</li>
        <li style="margin:0 0 6px 0;">A fresh perspective on what matters most to you</li>
      </ul>
      <p style="margin:16px 0 24px 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">
        Ready to pick up where you left off?
      </p>
    </td>
  </tr>
  <tr>
    <td align="center" style="padding:8px 32px 24px;">
      ${renderCtaButton({ href: resumeUrl, label: "Continue your LoveIQ test", width: 264 })}
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

  const html = wrapEmailShell({ bodyHtml, previewText, siteUrl, title: subject });

  const text = [
    "Don't leave your story unfinished",
    "",
    `Hi ${firstName?.trim() || "there"},`,
    "",
    "You were just a few steps away from unlocking your personal LoveIQ insights and we saved your progress for you.",
    "",
    "It only takes a moment to finish, and you'll get:",
    "- A clearer understanding of your relationship patterns",
    "- Personalized insights you can actually use",
    "- A fresh perspective on what matters most to you",
    "",
    "Ready to pick up where you left off?",
    "",
    `Continue your LoveIQ test: ${resumeUrl}`,
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
