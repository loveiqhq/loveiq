export const EMAIL_FONT =
  "'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif";

export function buildArchetypeReportUrl(reportUrl: string, archetypeSlug: string | null): string {
  if (!archetypeSlug) return reportUrl;
  const separator = reportUrl.includes("?") ? "&" : "?";
  return `${reportUrl}${separator}archetype=${encodeURIComponent(archetypeSlug)}`;
}

// Re-export from the shared util so existing email-template imports keep
// working. Use `@shared/format/html-escape` for new call sites — emails should not be
// the canonical location for a generic HTML helper.
import { escapeHtml } from "@shared/format/html-escape";
export { escapeHtml };

export function renderBrandHeader(siteUrl: string): string {
  const logoUrl = `${siteUrl}/apple-touch-icon.png`;
  // "IQ" gradient: clients without -webkit-text-fill-color (e.g. Outlook desktop)
  // fall back to the solid `color` value.
  return `
  <tr>
    <td style="padding:24px 32px 8px;">
      <table role="presentation" cellpadding="0" cellspacing="0">
        <tr>
          <td style="width:32px; height:32px; vertical-align:middle;">
            <img src="${logoUrl}" alt="LoveIQ" width="32" height="32" style="display:block; border-radius:8px;" />
          </td>
          <td style="padding-left:12px; font-family:Georgia,'Times New Roman',serif; font-size:20px; font-weight:700; letter-spacing:-0.2px; vertical-align:middle; line-height:1;">
            <span style="color:#111111;">Love</span><span style="color:#C167CF; background:linear-gradient(105deg,#D05976 20.51%,#C167CF 48.14%,#8887F6 79.16%); -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent;">IQ</span>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

export function renderBrandFooter(unsubscribeUrl?: string): string {
  const unsubscribeRow = unsubscribeUrl
    ? `
        <tr>
          <td align="center" style="padding-top:16px; font-family:${EMAIL_FONT}; font-size:13px; color:#666666;">
            <a href="${escapeHtml(unsubscribeUrl)}" style="color:#666666; text-decoration:underline;">Unsubscribe from these emails</a>
          </td>
        </tr>`
    : "";

  return `
  <tr>
    <td style="padding:24px 32px 32px; background-color:#f7f7f8; border-top:1px solid #eeeef1;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td align="center" style="font-family:${EMAIL_FONT}; font-size:13px; color:#111111; padding-bottom:4px;">
            <span style="font-weight:400;">Copyright © 2026</span>
            <span style="font-weight:600;">&nbsp;Applied Psychometrics UG</span>
          </td>
        </tr>
        <tr>
          <td align="center" style="font-family:${EMAIL_FONT}; font-size:13px; font-style:italic; color:#111111; font-weight:300; line-height:1.5;">
            A science-led psychometric<br />research and insights platform
          </td>
        </tr>
        ${unsubscribeRow}
      </table>
    </td>
  </tr>`;
}

export interface CtaButton {
  href: string;
  label: string;
  width?: number;
}

export function renderCtaButton({ href, label, width }: CtaButton): string {
  const widthStyle = typeof width === "number" ? `width:${width}px;` : "";
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto;">
    <tr>
      <td align="center" bgcolor="#5900AC" style="border-radius:9999px; ${widthStyle} box-shadow:0 0 15px rgba(254,104,57,0.2);">
        <a href="${escapeHtml(href)}" target="_blank" style="display:inline-block; padding:13px 28px; font-family:${EMAIL_FONT}; font-size:14px; font-weight:600; color:#ffffff; text-decoration:none; letter-spacing:0.2px; line-height:20px;">
          ${escapeHtml(label)}&nbsp;&rarr;
        </a>
      </td>
    </tr>
  </table>`;
}

export interface EmailShellParams {
  bodyHtml: string;
  previewText?: string;
  siteUrl: string;
  title: string;
  unsubscribeUrl?: string;
}

export function wrapEmailShell({
  bodyHtml,
  previewText,
  siteUrl,
  title,
  unsubscribeUrl,
}: EmailShellParams): string {
  const preview = previewText
    ? `<div style="display:none; max-height:0; overflow:hidden; opacity:0; color:transparent;">${escapeHtml(previewText)}</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0; padding:0; background-color:#f7f7f8; font-family:${EMAIL_FONT}; color:#000000; -webkit-font-smoothing:antialiased;">
${preview}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f7f7f8;">
  <tr>
    <td align="center" style="padding:24px 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px; background-color:#ffffff; border-radius:8px; overflow:hidden;">
        ${renderBrandHeader(siteUrl)}
        ${bodyHtml}
        ${renderBrandFooter(unsubscribeUrl)}
      </table>
    </td>
  </tr>
</table>
</body>
</html>`.trim();
}
