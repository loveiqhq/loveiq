import { getEmailImageBaseUrl } from "@shared/emails/site-url";
import { escapeHtml } from "@shared/format/html-escape";

/**
 * One shell for Mira's emails (the weekly session's, the daily nudges and the journal reminder,
 * 22 Nov 2026), in Mira's own look: a white card on a soft grey page, Mira's portrait and name, a
 * Lora heading, an ink pill button, and a light footer with the links and the company line.
 *
 * Tables and inline styles, so it holds in every mail client. The <style> block only adds what a
 * client that reads it can show: phone spacing, the self-hosted fonts and dark colours (Apple
 * Mail, iOS, Outlook for Mac). Without it the email still reads as designed, in Georgia and the
 * system sans. Words stay neutral: an inbox may be shared, so nothing from a chat, a check or the
 * journal goes in.
 */

/** Mira's light tokens (ui/theme-tokens.js AP_LIGHT): mail clients can't read CSS variables. */
const C = {
  ink: "#161021",
  body: "#3f3a4d",
  muted: "#6b6678",
  line: "#e9e6ee",
  ground: "#f5f6f8",
  lilac: "#f3ecff",
  link: "#561dbd",
  paper: "#ffffff",
};
const SANS =
  "Manrope, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const SERIF = "Lora, Georgia, 'Times New Roman', serif";

/** The legal entity under every Mira email, as in the imprint (the sign-in code email has it too). */
export const COMPANY_LINE =
  "Applied Psychometrics UG (haftungsbeschränkt) · Hasenheide 62, 10967 Berlin · HRB 282986 B, Amtsgericht Charlottenburg · Managing director: Marcus Börner";

export type EmailLink = { label: string; url: string };

/** A calendar entry: the date tile (the next start) beside its time, or the time alone. */
export type EmailCard = {
  date?: { month: string; day: string; weekday: string };
  title: string;
  lines: string[];
  /** A cancelled session: its time struck through. */
  struck?: boolean;
};

export type MiraEmail = {
  /** The inbox preview, first in the email, so a shared inbox shows only this neutral line. */
  preheader: string;
  heading?: string;
  paragraphs: string[];
  card?: EmailCard;
  /** Paragraphs under the card, before the button. */
  after?: string[];
  button?: EmailLink | null;
  note?: string | null;
  footer: { why: string; links: EmailLink[] };
};

const style = (rules: Record<string, string | number>) =>
  Object.entries(rules)
    .map(([k, v]) => `${k}: ${v}`)
    .join("; ");

const font = (family: string, size: number, weight: number, lineHeight: number, color: string) => ({
  "font-family": family,
  "font-size": `${size}px`,
  "font-weight": weight,
  "line-height": String(lineHeight),
  color,
});

const HEAD = `<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<style>
@font-face { font-family: "Lora"; font-weight: 400 700; src: url("{{base}}/fonts/lora-normal-latin.6b102ab3.woff2") format("woff2"); }
@font-face { font-family: "Manrope"; font-weight: 200 800; src: url("{{base}}/fonts/manrope-latin.e310b55a.woff2") format("woff2"); }
@media (max-width: 520px) {
  .m-outer { padding: 0 !important; }
  .m-card { border-radius: 0 !important; padding: 28px 22px 26px !important; }
  .m-h1 { font-size: 25px !important; }
  .m-btn, .m-btn tbody, .m-btn tr, .m-btn td, .m-btn a { display: block !important; width: 100% !important; text-align: center !important; box-sizing: border-box; }
  .m-foot { padding: 22px 22px 28px !important; }
}
@media (prefers-color-scheme: dark) {
  .m-page { background: #0c0912 !important; }
  .m-card { background: #161021 !important; }
  .m-ink { color: #f4f0fa !important; }
  .m-copy { color: #d7d0e2 !important; }
  .m-muted { color: #ada6bb !important; }
  .m-tile { background: #2c2244 !important; }
  .m-date { background: #161021 !important; }
  .m-month, .m-link { color: #c3aefc !important; }
  .m-btn td { background: #f4f0fa !important; }
  .m-btn a { color: #161021 !important; }
}
</style>
</head>`;

function cardHtml(card: EmailCard): string {
  const title = style({
    margin: "0",
    ...font(SANS, 18, 700, 1.35, card.struck ? C.muted : C.ink),
    ...(card.struck ? { "text-decoration": "line-through" } : {}),
  });
  const line = style({ margin: "4px 0 0", ...font(SANS, 15, 400, 1.5, C.body) });
  const tile = card.date
    ? `<td valign="top" width="64" style="${style({ width: "64px", "padding-right": "16px" })}">` +
      `<table role="presentation" width="64" cellpadding="0" cellspacing="0"><tr>` +
      `<td class="m-date" align="center" style="${style({ background: C.paper, "border-radius": "14px", padding: "8px 0 9px" })}">` +
      `<div class="m-month" style="${style({ ...font(SANS, 11, 700, 1.3, C.link), "letter-spacing": "0.08em", "text-transform": "uppercase" })}">${escapeHtml(card.date.month)}</div>` +
      `<div class="m-ink" style="${style(font(SANS, 26, 700, 1.1, C.ink))}">${escapeHtml(card.date.day)}</div>` +
      `<div class="m-muted" style="${style(font(SANS, 12, 600, 1.3, C.muted))}">${escapeHtml(card.date.weekday)}</div>` +
      `</td></tr></table></td>`
    : "";
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="${style({ margin: "4px 0 24px" })}"><tr>` +
    `<td class="m-tile" style="${style({ background: C.lilac, "border-radius": "20px", padding: "16px" })}">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${tile}` +
    `<td valign="middle"><p class="${card.struck ? "m-muted" : "m-ink"}" style="${title}">${escapeHtml(card.title)}</p>` +
    card.lines.map((l) => `<p class="m-copy" style="${line}">${escapeHtml(l)}</p>`).join("") +
    `</td></tr></table></td></tr></table>`
  );
}

/** The email's HTML and its plain-text part, from the same words. */
export function miraEmail(email: MiraEmail): { html: string; text: string } {
  const base = getEmailImageBaseUrl();
  const para = style({ margin: "0 0 16px", ...font(SANS, 16, 400, 1.6, C.body) });
  const link = (l: EmailLink) =>
    `<a class="m-link" href="${escapeHtml(l.url)}" style="${style({ ...font(SANS, 14, 700, 1.6, C.link), "text-decoration": "underline" })}">${escapeHtml(l.label)}</a>`;
  const dot = `<span class="m-muted" style="${style({ color: C.muted, padding: "0 8px" })}">·</span>`;
  const hidden = style({
    display: "none",
    "max-height": "0",
    "max-width": "0",
    overflow: "hidden",
    opacity: "0",
    "mso-hide": "all",
    "font-size": "1px",
    "line-height": "1px",
    color: C.ground,
  });
  const html = [
    `<!doctype html><html lang="en">${HEAD.replaceAll("{{base}}", base)}`,
    `<body class="m-page" style="${style({ margin: "0", padding: "0", background: C.ground })}">`,
    `<div style="${hidden}">${escapeHtml(email.preheader)}${"&#8199;&#65279;&#847; ".repeat(60)}</div>`,
    `<table role="presentation" class="m-page" width="100%" cellpadding="0" cellspacing="0" style="${style({ background: C.ground })}"><tr>`,
    `<td class="m-outer" align="center" style="${style({ padding: "32px 16px" })}">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="${style({ "max-width": "560px" })}">`,
    // The card
    `<tr><td class="m-card" style="${style({ background: C.paper, "border-radius": "24px", padding: "32px 36px 30px", "font-family": SANS })}">`,
    `<table role="presentation" cellpadding="0" cellspacing="0"><tr>`,
    `<td width="40" style="${style({ width: "40px" })}"><img src="${escapeHtml(base)}/images/mira/mira-email.jpg" width="40" height="40" alt="" style="${style({ display: "block", width: "40px", height: "40px", "border-radius": "20px", border: "0", background: C.lilac })}"></td>`,
    `<td style="${style({ "padding-left": "12px" })}">`,
    `<div class="m-ink" style="${style(font(SANS, 16, 700, 1.25, C.ink))}">Mira</div>`,
    `<div class="m-muted" style="${style(font(SANS, 13, 400, 1.4, C.muted))}">Applied Psychometrics</div>`,
    `</td></tr></table>`,
    email.heading
      ? `<h1 class="m-ink m-h1" style="${style({ margin: "28px 0 12px", ...font(SERIF, 28, 500, 1.25, C.ink), "letter-spacing": "-0.01em" })}">${escapeHtml(email.heading)}</h1>`
      : `<div style="${style({ height: "24px" })}"></div>`,
    ...email.paragraphs.map((p) => `<p class="m-copy" style="${para}">${escapeHtml(p)}</p>`),
    email.card ? cardHtml(email.card) : "",
    ...(email.after ?? []).map((p) => `<p class="m-copy" style="${para}">${escapeHtml(p)}</p>`),
    email.button
      ? `<table role="presentation" class="m-btn" cellpadding="0" cellspacing="0" style="${style({ margin: "8px 0 0" })}"><tr>` +
        `<td bgcolor="${C.ink}" style="${style({ background: C.ink, "border-radius": "9999px" })}">` +
        `<a href="${escapeHtml(email.button.url)}" style="${style({ display: "inline-block", padding: "15px 28px", ...font(SANS, 16, 700, 1.25, C.paper), "text-decoration": "none", "border-radius": "9999px" })}">${escapeHtml(email.button.label)}</a>` +
        `</td></tr></table>`
      : "",
    email.note
      ? `<p class="m-muted" style="${style({ margin: "14px 0 0", ...font(SANS, 14, 400, 1.55, C.muted) })}">${escapeHtml(email.note)}</p>`
      : "",
    `</td></tr>`,
    // The footer, on the page
    `<tr><td class="m-foot" align="center" style="${style({ padding: "24px 28px 8px", "font-family": SANS })}">`,
    email.footer.links.length
      ? `<p style="${style({ margin: "0 0 12px" })}">${email.footer.links.map(link).join(dot)}</p>`
      : "",
    `<p class="m-muted" style="${style({ margin: "0 0 12px", ...font(SANS, 13, 400, 1.6, C.muted) })}">${escapeHtml(email.footer.why)}</p>`,
    `<p class="m-muted" style="${style({ margin: "0", ...font(SANS, 12, 400, 1.6, C.muted) })}">${escapeHtml(COMPANY_LINE)}</p>`,
    `</td></tr></table></td></tr></table></body></html>`,
  ].join("\n");

  const text = [
    email.preheader,
    "",
    ...(email.heading ? [email.heading, ""] : []),
    ...email.paragraphs.flatMap((p) => [p, ""]),
    ...(email.card
      ? [`${email.card.title}${email.card.struck ? " (cancelled)" : ""}`, ...email.card.lines, ""]
      : []),
    ...(email.after ?? []).flatMap((p) => [p, ""]),
    ...(email.button ? [`${email.button.label}: ${email.button.url}`] : []),
    ...(email.note ? [email.note] : []),
    "",
    email.footer.why,
    ...email.footer.links.map((l) => `${l.label}: ${l.url}`),
    "",
    COMPANY_LINE,
  ].join("\n");
  return { html, text };
}
