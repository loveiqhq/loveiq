import {
  EMAIL_FONT,
  buildArchetypeReportUrl,
  escapeHtml,
  renderCtaButton,
  wrapEmailShell,
} from "@/lib/emails/shared";
import { toArchetypeSlug } from "@/lib/report/archetypeSlug";

export interface ReportEssentialsEmailParams {
  firstName?: string | null;
  reportUrl: string;
  siteUrl: string;
  unsubscribeUrl?: string;
  unlockedArchetype?: string | null;
}

export function reportEssentialsEmail({
  firstName,
  reportUrl,
  siteUrl,
  unlockedArchetype,
  unsubscribeUrl,
}: ReportEssentialsEmailParams) {
  const safeFirstName = firstName?.trim() ? escapeHtml(firstName.trim()) : "there";
  const displayName = firstName?.trim() || "there";
  const trimmedArchetype = unlockedArchetype?.trim() ?? "";
  const safeArchetype = trimmedArchetype ? escapeHtml(trimmedArchetype) : "";
  const archetypeSlug = trimmedArchetype ? toArchetypeSlug(trimmedArchetype) : null;
  const targetReportUrl = buildArchetypeReportUrl(reportUrl, archetypeSlug);

  const subject = trimmedArchetype
    ? `Your ${trimmedArchetype} essentials report is ready, ${displayName}`
    : `Your report is ready, ${displayName}`;
  const previewText = trimmedArchetype
    ? `Thank you for unlocking the ${trimmedArchetype} essentials report.`
    : "Thank you for trusting us. Your Essentials report is ready.";

  const insideHtml = trimmedArchetype
    ? `<strong style="font-weight:700;">Your ${safeArchetype} Essentials report is ready.</strong>`
    : `<strong style="font-weight:700;">Your Essentials report is ready.</strong>`;
  const ctaLabel = trimmedArchetype
    ? `View your ${trimmedArchetype} essentials report`
    : "View your essentials report";

  const bodyHtml = `
  <tr>
    <td style="padding:24px 32px 8px;">
      <h1 style="margin:0; font-family:${EMAIL_FONT}; font-size:26px; font-weight:600; line-height:1.35; color:#000000; letter-spacing:-0.3px;">
        Here&rsquo;s what you just unlocked.
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
        ${insideHtml}
      </p>
      <p style="margin:0 0 16px 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">
        Inside, you&rsquo;ll find three dimensions that together give you a grounded read on how you experience desire and connection &mdash; your archetype probabilities, core motivation, and relational stage. Most people have felt these patterns for years. Now you&rsquo;ll have language for them.
      </p>
      <p style="margin:0 0 24px 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">
        You can also <strong style="font-weight:700;">share the report</strong> with one person you trust &mdash; sometimes the most valuable insight is a conversation it starts.
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
    subject,
    "",
    `Hi ${displayName},`,
    "",
    "Thank you for trusting us with something this personal. That means a lot to us.",
    "",
    trimmedArchetype
      ? `Your ${trimmedArchetype} Essentials report is ready.`
      : "Your Essentials report is ready.",
    "",
    "Inside, you'll find three dimensions that together give you a grounded read on how you experience desire and connection — your archetype probabilities, core motivation, and relational stage. Most people have felt these patterns for years. Now you'll have language for them.",
    "",
    "You can also share the report with one person you trust — sometimes the most valuable insight is a conversation it starts.",
    "",
    `${ctaLabel}: ${targetReportUrl}`,
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
