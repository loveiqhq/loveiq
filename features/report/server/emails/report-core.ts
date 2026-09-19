import { EMAIL_FONT, escapeHtml, wrapEmailShell } from "@shared/emails/shared";
import { isArchetypeName, toArchetypeSlug } from "@features/report/server/archetypeSlug";

function buildArchetypeUrl(reportUrl: string, archetype: string): string {
  const slug = toArchetypeSlug(archetype);
  if (!slug) return reportUrl;
  const separator = reportUrl.includes("?") ? "&" : "?";
  return `${reportUrl}${separator}archetype=${encodeURIComponent(slug)}`;
}

export interface ReportCoreEmailParams {
  firstName?: string | null;
  reportUrl: string;
  siteUrl: string;
  /** The buyer's unlocked archetypes (their top matches). Rendered as a link list. */
  archetypes?: string[];
  unsubscribeUrl?: string;
}

/**
 * Tier-2 "All your core archetypes" purchase confirmation: the buyer's closest
 * archetypes (top matches by V5 %) are unlocked at full-report tier. Lists each
 * unlocked report with a direct link; falls back to a single report CTA when the
 * list is unavailable (never blocks the email on a scoring lookup miss).
 */
export function reportCoreEmail({
  firstName,
  reportUrl,
  siteUrl,
  archetypes,
  unsubscribeUrl,
}: ReportCoreEmailParams) {
  const safeFirstName = firstName?.trim() ? escapeHtml(firstName.trim()) : "there";
  const displayName = firstName?.trim() || "there";
  // Only trust real archetype names (guards against a malformed scoring row).
  const names = (archetypes ?? []).filter((name) => isArchetypeName(name));
  const count = names.length;

  const subject = `Your core archetypes are unlocked, ${displayName}`;
  const previewText = "Your closest archetype reports are ready — in full.";

  const listHtml = names
    .map((name) => {
      const url = buildArchetypeUrl(reportUrl, name);
      return `
      <tr>
        <td style="padding:0 0 16px 0;">
          <p style="margin:0 0 2px 0; font-family:${EMAIL_FONT}; font-size:20px; font-weight:600; line-height:1.4; color:#000000;">
            ${escapeHtml(name)}
          </p>
          <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" style="font-family:${EMAIL_FONT}; font-size:16px; line-height:1.55; color:#1a73e8; text-decoration:underline; word-break:break-all;">
            ${escapeHtml(url)}
          </a>
        </td>
      </tr>`;
    })
    .join("");

  const listBlock = count
    ? `
  <tr>
    <td style="padding:8px 32px 8px;">
      <p style="margin:0 0 16px 0; font-family:${EMAIL_FONT}; font-size:20px; font-weight:700; line-height:1.4; color:#000000;">
        Your unlocked reports:
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
        ${listHtml}
      </table>
      <p style="margin:0 0 24px 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">
        P.S. Each report is yours to <strong style="font-weight:700;">share with up to two people you trust.</strong>
      </p>
    </td>
  </tr>`
    : `
  <tr>
    <td align="center" style="padding:8px 32px 24px;">
      <a href="${escapeHtml(reportUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-block; font-family:${EMAIL_FONT}; font-size:17px; font-weight:600; color:#ffffff; background:#000000; padding:14px 28px; border-radius:999px; text-decoration:none;">
        Open your reports
      </a>
    </td>
  </tr>`;

  const bodyHtml = `
  <tr>
    <td style="padding:24px 32px 8px;">
      <h1 style="margin:0; font-family:${EMAIL_FONT}; font-size:26px; font-weight:600; line-height:1.35; color:#000000; letter-spacing:-0.3px;">
        Your closest archetypes, unlocked.
      </h1>
    </td>
  </tr>
  <tr>
    <td style="padding:16px 32px 0;">
      <p style="margin:0 0 16px 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">
        Hi ${safeFirstName},
      </p>
      <p style="margin:0 0 16px 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">
        Thank you for going deeper with us. Your closest archetype reports are now unlocked <strong style="font-weight:700;">in full</strong> — the patterns you match most, explained end to end.
      </p>
    </td>
  </tr>
  ${listBlock}
  <tr>
    <td align="center" style="padding:16px 32px 32px;">
      <p style="margin:0 0 12px 0; font-family:${EMAIL_FONT}; font-size:16px; line-height:1.55; color:#000000; text-align:center;">
        If anything gets in the way &mdash; missing link, expired access, or trouble opening your report &mdash; reach out to us at
        <a href="mailto:hello@loveiq.org" style="color:#1a73e8; text-decoration:underline;">hello@loveiq.org</a>.
      </p>
      <p style="margin:0; font-family:${EMAIL_FONT}; font-size:16px; line-height:1.55; color:#000000; text-align:center;">
        With kindness,<br />Your LoveIQ team
      </p>
    </td>
  </tr>`;

  const html = wrapEmailShell({ bodyHtml, previewText, siteUrl, title: subject, unsubscribeUrl });

  const listText = count
    ? [
        "Your unlocked reports:",
        "",
        names.map((n) => `${n}\n${buildArchetypeUrl(reportUrl, n)}`).join("\n\n"),
      ].join("\n")
    : `Open your reports: ${reportUrl}`;

  const text = [
    `Your core archetypes are unlocked, ${displayName}`,
    "",
    `Hi ${displayName},`,
    "",
    "Thank you for going deeper with us. Your closest archetype reports are now unlocked in full — the patterns you match most, explained end to end.",
    "",
    listText,
    "",
    "If anything gets in the way — missing link, expired access, or trouble opening your report — reach out to us at hello@loveiq.org.",
    "",
    "With kindness,",
    "Your LoveIQ team",
  ].join("\n");

  return { subject, html, text };
}
