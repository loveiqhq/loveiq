import {
  EMAIL_FONT,
  escapeHtml,
  renderBrandFooterText,
  renderCtaButton,
  wrapEmailShell,
} from "@shared/emails/shared";
import { INITIAL_UNLOCK_CREDIT_CENTS } from "@features/report/logic/initialUnlock";
import { PARTLY_OPEN } from "./initial-unlock";

/**
 * E07, "Core Archetype gifted" (Figma Report-3.0 1669:2835, the Pre-Paywall board): sent
 * on day 4 to a reader the EUR 1.99 gate stopped who has not paid, with the unlock it gives
 * (app/api/cron/initial-unlock-gift; 20% are held out and get neither). Copy as the frame
 * has it; the subject and preview line are the board's. The frame is named "day 2–3", the
 * board's journey says day 4: day 4 is built, and the name is flagged for Marcus.
 */

export interface InitialUnlockGiftEmailParams {
  firstName?: string | null;
  reportUrl: string;
  siteUrl: string;
  unsubscribeUrl?: string;
}

function euros(cents: number): string {
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}

export function initialUnlockGiftEmail({
  firstName,
  reportUrl,
  siteUrl,
  unsubscribeUrl,
}: InitialUnlockGiftEmailParams) {
  const safeFirstName = firstName?.trim() ? escapeHtml(firstName.trim()) : "there";
  const displayName = firstName?.trim() || "there";
  const credit = euros(INITIAL_UNLOCK_CREDIT_CENTS);
  const subject = "We unlocked your Core Archetype for you";
  const previewText = "No payment needed. Your result is waiting.";
  const heading = "Your Core Archetype is on us.";
  const ctaLabel = "Open your Core Archetype";
  const paragraph = `margin:0 0 16px 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;`;
  const bold = `<strong style="font-weight:700;">`;

  const listItems = PARTLY_OPEN.map(
    ([name, line]) =>
      `<li style="margin:0 0 6px 0;">${bold}${escapeHtml(name)}</strong> ${escapeHtml(line)}</li>`
  ).join("\n        ");

  const bodyHtml = `
  <tr>
    <td style="padding:24px 32px 8px;">
      <h1 style="margin:0; font-family:${EMAIL_FONT}; font-size:26px; font-weight:600; line-height:1.35; color:#000000; letter-spacing:-0.3px;">
        ${heading}
      </h1>
    </td>
  </tr>
  <tr>
    <td style="padding:16px 32px 0;">
      <p style="${paragraph}">Hi ${safeFirstName},</p>
      <p style="${paragraph}">A few days ago you answered some very personal questions. Your result has been waiting ever since, and we&rsquo;d rather you read it than leave it there.</p>
      <p style="${paragraph}">${bold}So we&rsquo;ve unlocked it for you.<br />No payment, no catch.</strong></p>
      <p style="${paragraph}">Inside, you&rsquo;ll find ${bold}which archetype leads for you</strong> and how your whole constellation fits together, scored across all 14 archetypes.</p>
      <p style="${paragraph}">You can also read ${bold}four chapters in full</strong>. Four featured chapters are partly open:</p>
      <ul style="margin:0 0 16px 0; padding-left:22px; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">
        ${listItems}
      </ul>
      <p style="margin:0 0 24px 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">Every other chapter opens with a preview, so you can see what&rsquo;s waiting for you.</p>
    </td>
  </tr>
  <tr>
    <td align="center" style="padding:8px 32px 24px;">
      ${renderCtaButton({ href: reportUrl, label: ctaLabel })}
    </td>
  </tr>
  <tr>
    <td style="padding:8px 32px 8px;">
      <p style="margin:0 0 24px 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">P.S. If it lands and you want the rest, you have ${bold}&euro;${credit} off the full report</strong>.</p>
    </td>
  </tr>
  <tr>
    <td align="center" style="padding:16px 32px 32px;">
      <p style="margin:0 0 12px 0; font-family:${EMAIL_FONT}; font-size:16px; line-height:1.55; color:#000000; text-align:center;">
        If anything gets in the way, like a missing link or trouble opening your report, reach out to us at
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
    heading,
    "",
    `Hi ${displayName},`,
    "",
    "A few days ago you answered some very personal questions. Your result has been waiting ever since, and we'd rather you read it than leave it there.",
    "",
    "So we've unlocked it for you.",
    "No payment, no catch.",
    "",
    "Inside, you'll find which archetype leads for you and how your whole constellation fits together, scored across all 14 archetypes.",
    "",
    "You can also read four chapters in full. Four featured chapters are partly open:",
    ...PARTLY_OPEN.map(([name, line]) => `- ${name} ${line}`),
    "",
    "Every other chapter opens with a preview, so you can see what's waiting for you.",
    "",
    `${ctaLabel}: ${reportUrl}`,
    "",
    `P.S. If it lands and you want the rest, you have €${credit} off the full report.`,
    "",
    "If anything gets in the way, like a missing link or trouble opening your report, reach out to us at hello@loveiq.org.",
    "",
    "We'll get you back in.",
    "",
    "With kindness,",
    "Your LoveIQ team",
    ...renderBrandFooterText(unsubscribeUrl),
  ].join("\n");

  return { subject, html, text };
}
