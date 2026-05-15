import {
  EMAIL_FONT,
  buildArchetypeReportUrl,
  escapeHtml,
  renderCtaButton,
  wrapEmailShell,
} from "@shared/emails/shared";
import { toArchetypeSlug } from "@features/report/server/archetypeSlug";

export interface ReportFullEmailParams {
  firstName?: string | null;
  reportUrl: string;
  siteUrl: string;
  unsubscribeUrl?: string;
  unlockedArchetype?: string | null;
}

export function reportFullEmail({
  firstName,
  reportUrl,
  siteUrl,
  unlockedArchetype,
  unsubscribeUrl,
}: ReportFullEmailParams) {
  const safeFirstName = firstName?.trim() ? escapeHtml(firstName.trim()) : "there";
  const displayName = firstName?.trim() || "there";
  const trimmedArchetype = unlockedArchetype?.trim() ?? "";
  const safeArchetype = trimmedArchetype ? escapeHtml(trimmedArchetype) : "";
  const archetypeSlug = trimmedArchetype ? toArchetypeSlug(trimmedArchetype) : null;
  const targetReportUrl = buildArchetypeReportUrl(reportUrl, archetypeSlug);

  const subject = trimmedArchetype
    ? `Your ${trimmedArchetype} full report is ready, ${displayName}`
    : `Your full report is ready, ${displayName}`;
  const previewText = trimmedArchetype
    ? `Thank you for unlocking the ${trimmedArchetype} full report.`
    : "Thank you for trusting us. Your Full Report is inside.";

  const heroHeading = trimmedArchetype
    ? `You&rsquo;ve unlocked the ${safeArchetype} full report.`
    : "You went deeper. Here&rsquo;s what you unlocked.";
  const insideLine = trimmedArchetype
    ? `<strong style="font-weight:700;">Your ${safeArchetype} Full Report is inside.</strong>`
    : `<strong style="font-weight:700;">Your Full Report is inside.</strong>`;
  const ctaLabel = trimmedArchetype
    ? `View your ${trimmedArchetype} full report`
    : "View your full report";

  const bodyHtml = `
  <tr>
    <td style="padding:24px 32px 8px;">
      <h1 style="margin:0; font-family:${EMAIL_FONT}; font-size:26px; font-weight:600; line-height:1.35; color:#000000; letter-spacing:-0.3px;">
        ${heroHeading}
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
        ${insideLine}
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
      ${renderCtaButton({ href: targetReportUrl, label: ctaLabel })}
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
    subject,
    "",
    `Hi ${displayName},`,
    "",
    "Thank you for trusting us with something this personal. That means a lot to us.",
    "",
    trimmedArchetype
      ? `Your ${trimmedArchetype} Full Report is inside.`
      : "Your Full Report is inside.",
    "",
    "It reflects the patterns in your responses across 18 analysed dimensions — your archetype probabilities, core motivation, relational stage, desire drivers, attachment style, and more. Most people are surprised by at least one of them.",
    "",
    "You can share this report with up to two people you trust. Some of the most interesting conversations start here.",
    "",
    `${ctaLabel}: ${targetReportUrl}`,
    "",
    "Why it's worth a look:",
    "- Built on psychology + real response patterns",
    "- 18 dimensions of insight you can actually use",
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
