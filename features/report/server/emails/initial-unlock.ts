import {
  EMAIL_FONT,
  escapeHtml,
  renderBrandFooterText,
  renderCtaButton,
  wrapEmailShell,
} from "@shared/emails/shared";
import { INITIAL_UNLOCK_CREDIT_CENTS } from "@features/report/logic/initialUnlock";

/**
 * E06, "Core Archetype unlocked" (Figma Report-3.0 1669:2703, the Pre-Paywall board): sent
 * once, when a reader's EUR 1.99 Core Archetype opens: pay to start's initial report, as its
 * survey ends (app/api/survey/route.ts), or right after the EUR 1.99 from the pre-unlock gate
 * is paid. Copy as the frame has it; the subject and preview line are the board's.
 */

export interface InitialUnlockEmailParams {
  firstName?: string | null;
  reportUrl: string;
  siteUrl: string;
  unsubscribeUrl?: string;
}

/** The four chapters the frame lists as partly open, name and line (E07 lists them too). */
export const PARTLY_OPEN = [
  ["Typical Beliefs:", "the rules about sex you never agreed to"],
  ["Accelerators & Brakes:", "what turns you on, and what shuts you down"],
  ["Challenges in Partnerships:", "where partners misread you"],
  ["Fantasy vs. Reality:", "what your fantasies say about what you want"],
] as const;

function euros(cents: number): string {
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}

export function initialUnlockEmail({
  firstName,
  reportUrl,
  siteUrl,
  unsubscribeUrl,
}: InitialUnlockEmailParams) {
  const safeFirstName = firstName?.trim() ? escapeHtml(firstName.trim()) : "there";
  const displayName = firstName?.trim() || "there";
  const credit = euros(INITIAL_UNLOCK_CREDIT_CENTS);
  const subject = "Your Core Archetype is unlocked";
  const previewText = "Find out which archetype leads for you.";
  const ctaLabel = "See your Core Archetype";
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
        You&rsquo;ve unlocked your Core Archetype.
      </h1>
    </td>
  </tr>
  <tr>
    <td style="padding:16px 32px 0;">
      <p style="${paragraph}">Hi ${safeFirstName},</p>
      <p style="${paragraph}">Thank you for trusting us with something this personal. That means a lot to us.</p>
      <p style="${paragraph}">${bold}Your Core Archetype is ready.</strong></p>
      <p style="${paragraph}">Inside, you&rsquo;ll find ${bold}which archetype leads for you</strong> and how your whole constellation fits together, scored across all 14 archetypes.</p>
      <p style="${paragraph}">You can read ${bold}five chapters in full</strong>. Four featured chapters are partly open:</p>
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
      <p style="margin:0 0 24px 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">Want the rest? You have ${bold}&euro;${credit} off the full report</strong> whenever you&rsquo;re ready.</p>
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
    subject,
    "",
    `Hi ${displayName},`,
    "",
    "Thank you for trusting us with something this personal. That means a lot to us.",
    "",
    "Your Core Archetype is ready.",
    "",
    "Inside, you'll find which archetype leads for you and how your whole constellation fits together, scored across all 14 archetypes.",
    "",
    "You can read five chapters in full. Four featured chapters are partly open:",
    ...PARTLY_OPEN.map(([name, line]) => `- ${name} ${line}`),
    "",
    "Every other chapter opens with a preview, so you can see what's waiting for you.",
    "",
    `${ctaLabel}: ${reportUrl}`,
    "",
    `Want the rest? You have €${credit} off the full report whenever you're ready.`,
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
