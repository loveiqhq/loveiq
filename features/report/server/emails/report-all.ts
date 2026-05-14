import { EMAIL_FONT, escapeHtml, wrapEmailShell } from "@/lib/emails/shared";
import {
  KNOWN_ARCHETYPES,
  toArchetypeSlug,
  type ArchetypeName,
} from "@features/report/server/archetypeSlug";

const ARCHETYPE_DISPLAY_ORDER: readonly ArchetypeName[] = [
  "Spark Seeker",
  "Sensual Connector",
  "Power Orchestrator",
  "Loyal Ritualist",
  "Minimalist Companion",
  "Exhibitionist Performer",
  "Curious Apprentice",
  "Relational Nurturer",
  "Explorer of Edges",
  "Emotional Voyeur",
  "Analytical Sexualist",
  "Spiritual Lover",
  "Quiet Withdrawer",
  "Approval Seeker",
] as const;

function buildArchetypeUrl(reportUrl: string, archetype: ArchetypeName): string {
  const slug = toArchetypeSlug(archetype);
  if (!slug) return reportUrl;
  const separator = reportUrl.includes("?") ? "&" : "?";
  return `${reportUrl}${separator}archetype=${encodeURIComponent(slug)}`;
}

export interface ReportAllEmailParams {
  firstName?: string | null;
  reportUrl: string;
  siteUrl: string;
  unsubscribeUrl?: string;
}

export function reportAllEmail({
  firstName,
  reportUrl,
  siteUrl,
  unsubscribeUrl,
}: ReportAllEmailParams) {
  const safeFirstName = firstName?.trim() ? escapeHtml(firstName.trim()) : "there";
  const displayName = firstName?.trim() || "there";
  const subject = `All 14 archetypes are now yours, ${displayName}`;
  const previewText = "Your complete archetype library is ready. Every report, every pattern.";

  const archetypesHtml = ARCHETYPE_DISPLAY_ORDER.filter((name) => KNOWN_ARCHETYPES.includes(name))
    .map((name) => {
      const url = buildArchetypeUrl(reportUrl, name);
      return `
      <tr>
        <td style="padding:0 0 16px 0;">
          <p style="margin:0 0 2px 0; font-family:${EMAIL_FONT}; font-size:20px; font-weight:600; line-height:1.4; color:#000000;">
            ${escapeHtml(name)}
          </p>
          <a href="${escapeHtml(url)}" target="_blank" style="font-family:${EMAIL_FONT}; font-size:16px; line-height:1.55; color:#1a73e8; text-decoration:underline; word-break:break-all;">
            ${escapeHtml(url)}
          </a>
        </td>
      </tr>`;
    })
    .join("");

  const archetypesText = ARCHETYPE_DISPLAY_ORDER.map(
    (name) => `${name}\n${buildArchetypeUrl(reportUrl, name)}`
  ).join("\n\n");

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
        <strong style="font-weight:700;">Your complete archetype library is ready.</strong>
      </p>
      <p style="margin:0 0 24px 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">
        Inside, you&rsquo;ll find <strong style="font-weight:700;">all 14 archetype reports</strong> &mdash; <strong style="font-weight:700;">your own profile in full</strong>, alongside the psychology behind every relational pattern you&rsquo;ve encountered. <strong style="font-weight:700;">Most people find it changes how they read the people around them as much as how they read themselves.</strong>
      </p>
    </td>
  </tr>
  <tr>
    <td style="padding:8px 32px 8px;">
      <p style="margin:0 0 16px 0; font-family:${EMAIL_FONT}; font-size:20px; font-weight:700; line-height:1.4; color:#000000;">
        Below are your reports:
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
        ${archetypesHtml}
      </table>
      <p style="margin:16px 0 16px 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">
        Curious minds tend to get the most out of this.
      </p>
      <p style="margin:0 0 24px 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">
        P.S. Each report is yours to <strong style="font-weight:700;">share with up to two people you trust.</strong>
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
    `All 14 archetypes are now yours, ${displayName}`,
    "",
    `Hi ${displayName},`,
    "",
    "Thank you for trusting us with something this personal. That means a lot to us.",
    "",
    "Your complete archetype library is ready.",
    "",
    "Inside, you'll find all 14 archetype reports — your own profile in full, alongside the psychology behind every relational pattern you've encountered. Most people find it changes how they read the people around them as much as how they read themselves.",
    "",
    "Below are your reports:",
    "",
    archetypesText,
    "",
    "Curious minds tend to get the most out of this.",
    "",
    "P.S. Each report is yours to share with up to two people you trust.",
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
