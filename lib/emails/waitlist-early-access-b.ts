/* eslint-disable no-secrets/no-secrets -- inline email HTML triggers entropy false positives on bold-tag style attrs */
import { EMAIL_FONT, escapeHtml, renderCtaButton, wrapEmailShell } from "@/lib/emails/shared";

/**
 * Waitlist early-access invitation — Variant B (Figma node 5391-2133).
 * Urgency framing: 48-hour expiring access window.
 * Pair with `waitlistEarlyAccessEmail` (variant A) for an A/B broadcast test.
 */
export interface WaitlistEarlyAccessBEmailParams {
  firstName?: string | null;
  /** Absolute site URL — used to build the survey CTA. */
  siteUrl: string;
}

export function waitlistEarlyAccessBEmail({ firstName, siteUrl }: WaitlistEarlyAccessBEmailParams) {
  const safeFirstName = firstName?.trim() ? escapeHtml(firstName.trim()) : "there";
  const greetingText = firstName?.trim() || "there";

  const subject = "Exclusive access \u2014 claim it before it closes";
  const previewText =
    "LoveIQ is welcoming its first official users for the next 48h. Your spot is reserved.";

  const site = siteUrl.replace(/\/$/, "");
  const surveyUrl = `${site}/survey`;

  const bodyHtml = `
  <tr>
    <td style="padding:24px 32px 8px;">
      <h1 style="margin:0; font-family:${EMAIL_FONT}; font-size:26px; font-weight:600; line-height:1.35; color:#000000; letter-spacing:-0.3px;">
        Your access link expires in 48h
      </h1>
    </td>
  </tr>
  <tr>
    <td style="padding:16px 32px 0;">
      <p style="margin:0 0 16px 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">
        Hi ${safeFirstName},
      </p>
      <p style="margin:0 0 16px 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">
        After years of research and months of building, LoveIQ is now welcoming its first official users for the next 48h, and you&rsquo;re among the first users invited from our waitlist.
      </p>
      <p style="margin:0 0 12px 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">
        Early feedback has been strong:
      </p>
      <ul style="margin:0 0 16px 0; padding-left:22px; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">
        <li style="margin:0 0 6px 0;">
          &ldquo;<strong style="font-weight:700;">Surprisingly accurate,</strong> it put words to patterns I never understood.&rdquo;
        </li>
        <li style="margin:0 0 6px 0;">
          &ldquo;Insightful without being judgmental. <strong style="font-weight:700;">I actually learned something about myself.</strong>&rdquo;
        </li>
        <li style="margin:0 0 6px 0;">
          &ldquo;<strong style="font-weight:700;">It was worth all the time</strong> spent on it&rdquo;
        </li>
      </ul>
    </td>
  </tr>
  <tr>
    <td align="center" style="padding:8px 32px 24px;">
      ${renderCtaButton({ href: surveyUrl, label: "Start your LoveIQ test" })}
    </td>
  </tr>
  <tr>
    <td style="padding:8px 32px 8px;">
      <p style="margin:0 0 12px 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000; font-weight:700;">
        What you&rsquo;ll get:
      </p>
      <ul style="margin:0 0 16px 0; padding-left:22px; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">
        <li style="margin:0 0 6px 0;">A clear report of your sexual archetype</li>
        <li style="margin:0 0 6px 0;">Insights into your desire &amp; intimacy patterns</li>
        <li style="margin:0 0 6px 0;">Language to better understand and communicate your needs</li>
      </ul>
      <p style="margin:16px 0 24px 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">
        It takes ~15 minutes &mdash; and the payoff is clarity most people never get.
      </p>
    </td>
  </tr>
  <tr>
    <td align="center" style="padding:16px 32px 32px;">
      <p style="margin:0 0 12px 0; font-family:${EMAIL_FONT}; font-size:16px; line-height:1.55; color:#000000; text-align:center;">
        If you have any questions you can always reach us at
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

  const html = wrapEmailShell({ bodyHtml, previewText, siteUrl: site, title: subject });

  const text = [
    "Exclusive access — claim it before it closes",
    "",
    `Hi ${greetingText},`,
    "",
    "After years of research and months of building, LoveIQ is now welcoming its first official users for the next 48h, and you're among the first users invited from our waitlist.",
    "",
    "Early feedback has been strong:",
    '- "Surprisingly accurate, it put words to patterns I never understood."',
    '- "Insightful without being judgmental. I actually learned something about myself."',
    '- "It was worth all the time spent on it"',
    "",
    `Start your LoveIQ test: ${surveyUrl}`,
    "",
    "What you'll get:",
    "- A clear report of your sexual archetype",
    "- Insights into your desire & intimacy patterns",
    "- Language to better understand and communicate your needs",
    "",
    "It takes ~15 minutes — and the payoff is clarity most people never get.",
    "",
    "If you have any questions you can always reach us at hello@loveiq.org.",
    "",
    "We'll help you pick up right where you left off.",
    "",
    "With kindness,",
    "Your LoveIQ team",
  ].join("\n");

  return { subject, html, text };
}
