/**
 * The building blocks of the reworked emails (Mark's "Email overview" canvas, Playground
 * direction, LoIQ 9.26): one white card on a grey page, a gradient bar on top, Lora headlines
 * over Manrope body copy, a gradient pill button, lilac and sand panels, the step list and the
 * chapter map. Each email in this folder composes these and nothing else, so they look alike.
 *
 * Built to degrade the way the canvas's "Outlook fallback" boards draw it: tables and inline
 * styles only, a solid violet under every gradient (#795fc8), a VML button for Outlook on
 * Windows, live text for everything that carries meaning (images only decorate, with alt
 * text), Georgia and Arial behind Lora and Manrope (no web fonts are loaded: the current
 * emails load none either). Every main button has the "Or paste this link into your browser"
 * line under it (Marcus, 5 Nov).
 */

import { escapeHtml } from "@shared/format/html-escape";
import { EMAIL_LOGO_PATH } from "@shared/emails/shared";
import { getEmailImageBaseUrl } from "@shared/emails/site-url";

export const SERIF = "Lora, Georgia, 'Times New Roman', serif";
export const SANS =
  "Manrope, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export const C = {
  page: "#f5f6f8",
  card: "#ffffff",
  ink: "#161021",
  body: "#3f3a4d",
  muted: "#6b6678",
  faint: "#8a8597",
  line: "#e9e6ee",
  rule: "#efedf2",
  lilac: "#f3ecff",
  lilacPanel: "#f1ebfd",
  violet: "#795fc8",
  linkViolet: "#6b5b95",
  deepViolet: "#4000b6",
  pink: "#bf66d9",
  partRed: "#d05976",
  nextBg: "#fff0eb",
  nextInk: "#c2410c",
  creditBg: "#faf0dc",
  creditInk: "#7a4e12",
  doneDisc: "#d6d4da",
  doneInk: "#a09cab",
  barTrack: "#f0eef4",
  green: "#15803d",
} as const;

/** The brand gradient, and the solid violet every client without gradients shows instead. */
export const GRADIENT = "linear-gradient(135deg,#fe6839 0%,#bf66d9 43%,#958ef6 100%)";
const TEXT_GRADIENT = "linear-gradient(105deg,#d05976 20%,#c167cf 55%,#8887f6 85%)";

/** Static images, all under /images/ (proxy.ts never stamps CORP same-origin there). */
export const EMAIL_IMAGES = {
  archetypeHidden: "/images/email/archetype-hidden.png",
  iconArchetype: "/images/email/icon-archetype.png",
  iconTurnOns: "/images/email/icon-turn-ons.png",
  iconPartner: "/images/email/icon-partner.png",
  iconLock: "/images/email/icon-lock.png",
  iconShare: "/images/email/icon-share.png",
  iconRefer: "/images/email/icon-refer.png",
} as const;

export interface KitEmail {
  subject: string;
  html: string;
  text: string;
}

export const e = escapeHtml;

function img(siteUrl: string, path: string, w: number, h: number, alt: string, style = ""): string {
  const src = `${getEmailImageBaseUrl(siteUrl)}${path}`;
  return `<img src="${e(src)}" width="${w}" height="${h}" alt="${e(alt)}" style="display:block; border:0; outline:none; width:${w}px; height:${h}px; ${style}">`;
}

/** A row of the card: content inside the card's 40px side padding. */
export function row(inner: string, padding = "0 40px 28px"): string {
  return `<tr><td class="px" style="padding:${padding};">${inner}</td></tr>`;
}

export function heading(text: string): string {
  return row(
    `<h1 style="margin:0; font-family:${SERIF}; font-size:32px; line-height:38px; font-weight:500; letter-spacing:-0.3px; color:${C.ink};">${e(text)}</h1>`,
    "32px 40px 20px"
  );
}

/** Paragraphs of body copy. Each item is trusted HTML: callers escape what they put in. */
export function paragraphs(items: string[], size = 17): string {
  const lh = size >= 17 ? 27 : 24;
  return row(
    items
      .map(
        (html, i) =>
          `<p style="margin:${i === items.length - 1 ? "0" : "0 0 16px"}; font-family:${SANS}; font-size:${size}px; line-height:${lh}px; color:${C.body};">${html}</p>`
      )
      .join("")
  );
}

export function sectionTitle(text: string): string {
  return `<h2 style="margin:0 0 16px; font-family:${SERIF}; font-size:20px; line-height:24px; font-weight:500; letter-spacing:-0.2px; color:${C.ink};">${e(text)}</h2>`;
}

/** VML needs a width; a pill wide enough for the label, never narrower than 220px. */
export function buttonWidth(label: string): number {
  return Math.max(220, Math.round(label.length * 9.4 + 96));
}

export interface ButtonOptions {
  href: string;
  label: string;
  /** Lines under the button (price, guarantee, "Keep this email"…), trusted HTML. */
  notes?: string[];
  /** The "Or paste this link into your browser" line. On for every main button. */
  pasteLink?: boolean;
}

/**
 * The main call to action: the gradient pill, a VML twin for Outlook on Windows (which draws
 * neither gradients nor rounded corners), the notes and the paste-this-link line.
 */
export function button({ href, label, notes = [], pasteLink = true }: ButtonOptions): string {
  const url = e(href);
  const text = `${e(label)}&nbsp;&rarr;`;
  const width = buttonWidth(label);
  const notesHtml = notes
    .map(
      (n) =>
        `<p style="margin:12px 0 0; text-align:center; font-family:${SANS}; font-size:13px; line-height:20px; color:${C.muted};">${n}</p>`
    )
    .join("");
  const paste = pasteLink
    ? `<p style="margin:12px auto 0; max-width:440px; text-align:center; font-family:${SANS}; font-size:11px; line-height:16px; color:${C.faint}; word-break:break-all;">Or paste this link into your browser: <a href="${url}" style="color:${C.faint}; text-decoration:underline;">${e(href)}</a></p>`
    : "";
  return row(`
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
  <tr>
    <td align="center" bgcolor="${C.violet}" style="border-radius:9999px; background-color:${C.violet}; background-image:${GRADIENT}; box-shadow:0 10px 26px -12px rgba(191,102,217,0.75);">
      <!--[if mso]>
      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${url}" style="height:52px; v-text-anchor:middle; width:${width}px;" arcsize="50%" stroke="f" fillcolor="${C.violet}">
        <w:anchorlock/>
        <center style="color:#ffffff; font-family:Arial, sans-serif; font-size:16px; font-weight:bold;">${text}</center>
      </v:roundrect>
      <![endif]-->
      <!--[if !mso]><!-- -->
      <a class="btn" href="${url}" target="_blank" rel="noopener noreferrer" style="display:inline-block; padding:16px 32px; font-family:${SANS}; font-size:16px; font-weight:700; line-height:20px; color:#ffffff; text-decoration:none; border-radius:9999px;">${text}</a>
      <!--<![endif]-->
    </td>
  </tr>
</table>
${notesHtml}${paste}`);
}

/** An outlined button inside a panel (share, invite). Outlook draws it square, still a link. */
export function outlineButton(href: string, label: string): string {
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 0;">
  <tr>
    <td style="border:1.5px solid ${C.deepViolet}; border-radius:9999px; background-color:#ffffff;">
      <a href="${e(href)}" target="_blank" rel="noopener noreferrer" style="display:inline-block; padding:11px 22px; font-family:${SANS}; font-size:15px; font-weight:700; line-height:20px; color:${C.deepViolet}; text-decoration:none; border-radius:9999px;">${e(label)}&nbsp;&rarr;</a>
    </td>
  </tr>
</table>`;
}

export type StepState = "done" | "next" | "todo";

export interface Step {
  state: StepState;
  title: string;
  detail: string;
  /** A chip on the right: "Next" is added for the next step; this is for "[€10] credit". */
  chip?: string;
}

function stepDisc(state: StepState, n: number): string {
  const base = `width:36px; height:36px; border-radius:9999px; text-align:center; vertical-align:middle; font-family:${SERIF}; font-size:16px; font-weight:600; line-height:36px;`;
  if (state === "done")
    return `<td width="36" style="${base} background-color:${C.doneDisc}; color:#ffffff;">&#10003;</td>`;
  if (state === "next")
    return `<td width="36" style="${base} width:32px; height:32px; line-height:32px; border:2px solid ${C.pink}; background-color:#fcf9ff; color:#3a2a55;">${n}</td>`;
  return `<td width="36" style="${base} width:33px; height:33px; line-height:33px; border:1.5px solid ${C.doneDisc}; background-color:#ffffff; color:${C.muted};">${n}</td>`;
}

function chipHtml(text: string, bg: string, ink: string): string {
  return `<span style="display:inline-block; padding:4px 10px; border-radius:9999px; background-color:${bg}; color:${ink}; font-family:${SANS}; font-size:12px; font-weight:700; line-height:16px; white-space:nowrap;">${e(text)}</span>`;
}

/** "Where you are now": the reader's progress, one row per step. */
export function steps(list: Step[], title = "Where you are now"): string {
  const rows = list
    .map((s, i) => {
      const done = s.state === "done";
      const titleInk = done ? C.doneInk : C.ink;
      const detailInk = done ? C.doneInk : C.muted;
      const chip =
        s.state === "next"
          ? chipHtml("Next", C.nextBg, C.nextInk)
          : s.chip
            ? chipHtml(s.chip, C.creditBg, C.creditInk)
            : "";
      const border = i === list.length - 1 ? "" : `border-bottom:1px solid ${C.rule};`;
      return `
<tr>
  <td style="padding:16px 0; ${border}">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        ${stepDisc(s.state, i + 1)}
        <td style="padding-left:16px; vertical-align:middle;">
          <div style="font-family:${SANS}; font-size:15px; line-height:22px; font-weight:700; color:${titleInk};">${e(s.title)}</div>
          <div style="font-family:${SANS}; font-size:14px; line-height:20px; color:${detailInk};">${e(s.detail)}</div>
        </td>
        <td align="right" style="padding-left:8px; vertical-align:middle; white-space:nowrap;">${chip}</td>
      </tr>
    </table>
  </td>
</tr>`;
    })
    .join("");
  return row(`${sectionTitle(title)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${C.line}; border-radius:20px;">
  <tr><td style="padding:4px 24px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>
  </td></tr>
</table>`);
}

export interface Progress {
  answered: number;
  total: number;
  minutesLeft: number;
}

/** "[37] of [62] questions · About 6 minutes left", with the bar. */
export function progressCard({ answered, total, minutesLeft }: Progress): string {
  const pct = total > 0 ? Math.min(100, Math.max(0, Math.round((answered / total) * 100))) : 0;
  const filled = Math.max(pct, 2);
  return row(`
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${C.line}; border-radius:20px;">
  <tr><td style="padding:20px 24px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="font-family:${SANS}; font-size:15px; line-height:22px; font-weight:700; color:${C.ink};">${answered} of ${total} questions</td>
        <td align="right" style="font-family:${SANS}; font-size:14px; line-height:22px; color:${C.muted};">${e(minutesText(minutesLeft))}</td>
      </tr>
    </table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:12px 0;">
      <tr>
        <td width="${filled}%" height="10" bgcolor="${C.pink}" style="height:10px; font-size:0; line-height:0; border-radius:9999px 0 0 9999px; background-color:${C.pink}; background-image:${GRADIENT};">&nbsp;</td>
        <td width="${100 - filled}%" height="10" bgcolor="${C.barTrack}" style="height:10px; font-size:0; line-height:0; border-radius:0 9999px 9999px 0; background-color:${C.barTrack};">&nbsp;</td>
      </tr>
    </table>
    <div style="font-family:${SANS}; font-size:13px; line-height:20px; color:${C.muted};">${pct}% done &middot; your answers are saved on this device</div>
  </td></tr>
</table>`);
}

export function minutesText(minutes: number): string {
  return minutes <= 1 ? "About a minute left" : `About ${minutes} minutes left`;
}

function gradientKicker(text: string): string {
  return `<div style="font-family:${SANS}; font-size:12px; font-weight:800; letter-spacing:1px; text-transform:uppercase; line-height:16px; color:${C.pink}; background:${TEXT_GRADIENT}; -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent;">${e(text)}</div>`;
}

/**
 * The lilac card with the reader's Core Archetype, its name blurred, as on every board that
 * draws it. Email apps ignore CSS blur, so it is one image for everyone (the same blurred
 * words for every archetype: the €1.99 step sells the name, so no email may carry it).
 */
export function archetypeCard(siteUrl: string): string {
  return row(`
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.lilac}" style="background-color:${C.lilac}; border-radius:24px;">
  <tr><td class="panel-pad" style="padding:32px 28px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="background-color:#ffffff; border-radius:16px;">
      <tr><td class="panel-pad" align="center" style="padding:28px 24px;">
        ${gradientKicker("Your core archetype")}
        <div style="height:14px; line-height:14px; font-size:0;">&nbsp;</div>
        <img src="${e(`${getEmailImageBaseUrl(siteUrl)}${EMAIL_IMAGES.archetypeHidden}`)}" width="300" alt="Your Core Archetype, revealed in your report" style="display:block; border:0; outline:none; width:100%; max-width:300px; height:auto; margin:0 auto;">
      </td></tr>
    </table>
  </td></tr>
</table>`);
}

export interface Tile {
  icon: keyof typeof EMAIL_IMAGES;
  title: string;
  body: string;
}

/** The three tiles ("What you'll find inside"), side by side; stacked on a narrow screen. */
export function tiles(siteUrl: string, title: string, list: Tile[]): string {
  const cells = list
    .map(
      (t, i) => `
<td class="stack" width="33%" valign="top" style="padding:${i === 0 ? "0 6px 0 0" : i === list.length - 1 ? "0 0 0 6px" : "0 6px"};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${C.line}; border-radius:20px;">
    <tr><td style="padding:20px 16px;">
      ${img(siteUrl, EMAIL_IMAGES[t.icon], 40, 40, "")}
      <div style="height:12px; line-height:12px; font-size:0;">&nbsp;</div>
      <div style="font-family:${SERIF}; font-size:17px; line-height:22px; font-weight:500; color:${C.ink};">${e(t.title)}</div>
      <div style="height:8px; line-height:8px; font-size:0;">&nbsp;</div>
      <div style="font-family:${SANS}; font-size:13px; line-height:20px; color:${C.muted};">${e(t.body)}</div>
    </td></tr>
  </table>
</td>`
    )
    .join("");
  return row(`${sectionTitle(title)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${cells}</tr></table>`);
}

/** The three tiles most boards share. */
export const INSIDE_TILES: Tile[] = [
  {
    icon: "iconArchetype",
    title: "Your Core archetype",
    body: "Your Core Motivation, Communication and Initiation of desire.",
  },
  {
    icon: "iconTurnOns",
    title: "Turn-ons and brakes",
    body: "What turns you on, and what shuts your desire down.",
  },
  {
    icon: "iconPartner",
    title: "With a partner",
    body: "Where partners misread you, and what helps.",
  },
];

/** A lilac panel with a small kicker (icon + caps), a heading, a line and an outlined button. */
export function panel(
  siteUrl: string,
  opts: {
    icon: keyof typeof EMAIL_IMAGES;
    kicker: string;
    title: string;
    body: string;
    href: string;
    cta: string;
  }
): string {
  return row(`
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.lilacPanel}" style="background-color:${C.lilacPanel}; border-radius:20px;">
  <tr><td style="padding:24px 28px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="vertical-align:middle; padding-right:8px;">${img(siteUrl, EMAIL_IMAGES[opts.icon], 14, 14, "")}</td>
      <td style="vertical-align:middle; font-family:${SANS}; font-size:11px; font-weight:700; letter-spacing:1px; text-transform:uppercase; line-height:16px; color:${C.linkViolet};">${e(opts.kicker)}</td>
    </tr></table>
    <div style="height:12px; line-height:12px; font-size:0;">&nbsp;</div>
    <div style="font-family:${SERIF}; font-size:20px; line-height:26px; font-weight:500; color:${C.ink};">${e(opts.title)}</div>
    <div style="height:8px; line-height:8px; font-size:0;">&nbsp;</div>
    <div style="font-family:${SANS}; font-size:15px; line-height:24px; color:${C.body};">${e(opts.body)}</div>
    ${outlineButton(opts.href, opts.cta)}
  </td></tr>
</table>`);
}

/** "Why unlock your Full Report?": the four reasons U1 and I3 end on. */
export function whyUnlock(guaranteeDays = 14): string {
  const card = (title: string, body: string) => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${C.line}; border-radius:20px; margin:0 0 14px;">
  <tr><td style="padding:20px 24px;">
    <div style="font-family:${SERIF}; font-size:19px; line-height:25px; font-weight:600; color:${C.ink};">${title}</div>
    <div style="height:8px; line-height:8px; font-size:0;">&nbsp;</div>
    <div style="font-family:${SANS}; font-size:15px; line-height:24px; color:${C.body};">${body}</div>
  </td></tr>
</table>`;
  const em = (text: string, color: string) =>
    `<em style="font-weight:400; color:${color};">${e(text)}</em>`;
  return row(`
<div style="text-align:center; font-family:${SERIF}; font-size:30px; line-height:36px; font-weight:500; color:${C.ink};">Why unlock your<br><span style="color:${C.pink};">Full Report</span>?</div>
<div style="height:24px; line-height:24px; font-size:0;">&nbsp;</div>
${card(
  `<span style="color:${C.green};">${guaranteeDays}-day money-back guarantee.</span> ${em("Zero risk.", "#8887f6")}`,
  `Learn about your Arousal, Attachment and Initiation Style. If it doesn’t land within ${guaranteeDays} days, every cent back, no questions asked.`
)}
${card(
  `Your Core Archetype, ${em("explained.", "#c167cf")}`,
  "Which archetype leads for you and what that means for your desire and your relationships."
)}
${card(
  em("Insights from hundreds of research papers and books.", C.partRed),
  "Your Archetype is based on insights from hundreds of scientific papers and leading books on sexuality."
)}
${card(
  `Become ${em("an expert around your sexuality", "#c167cf")}`,
  "Learn the essential concepts and language to better understand and improve your sexuality grounded in the latest science and practical wisdom."
)}`);
}

/** A line set apart from the copy above it (the "last reminder" lines, "Keep this email"). */
export function smallNote(html: string, align: "left" | "center" = "center"): string {
  return row(
    `<p style="margin:0; text-align:${align}; font-family:${SANS}; font-size:13px; line-height:20px; color:${C.muted};">${html}</p>`
  );
}

/** "Something not working?" and the sign-off, above the card's end. */
export function signOff(): string {
  return row(
    `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr><td style="padding-top:24px; border-top:1px solid ${C.line};">
    <p style="margin:0 0 16px; font-family:${SANS}; font-size:15px; line-height:24px; color:${C.body};">Something not working? Write to <a href="mailto:hello@loveiq.org" style="color:${C.linkViolet}; font-weight:600;">hello@loveiq.org</a> and we&rsquo;ll get you back in.</p>
    <div style="font-family:${SERIF}; font-style:italic; font-size:17px; line-height:24px; color:${C.body};">With kindness,</div>
    <div style="font-family:${SERIF}; font-size:17px; line-height:24px; font-weight:600; color:${C.ink};">Your LoveIQ team</div>
  </td></tr>
</table>`,
    "8px 40px 40px"
  );
}

/** Where a trial send puts its notice (scripts/email-trials.ts); an HTML comment, so it shows nothing. */
export const CARD_TOP = "<!-- loveiq:card-top -->";

export interface ShellOptions {
  siteUrl: string;
  title: string;
  previewText: string;
  /** The card's rows, built with the helpers above. */
  rows: string[];
  /** "You get this email because you finished the LoveIQ test." */
  reason: string;
  unsubscribeUrl?: string;
}

/** Hidden preview text, padded so the body's first words never trail into the preview. */
function preheader(text: string): string {
  const pad = "&#8199;&#65279;&#847; ".repeat(60);
  return `<div style="display:none; max-height:0; max-width:0; overflow:hidden; opacity:0; mso-hide:all; font-size:1px; line-height:1px; color:${C.page};">${e(text)}${pad}</div>`;
}

export function shell({
  siteUrl,
  title,
  previewText,
  rows,
  reason,
  unsubscribeUrl,
}: ShellOptions): string {
  const logo = `${getEmailImageBaseUrl(siteUrl)}${EMAIL_LOGO_PATH}`;
  const unsubscribe = unsubscribeUrl
    ? `<div style="padding-top:6px;"><a href="${e(unsubscribeUrl)}" style="color:${C.muted}; text-decoration:underline;">Unsubscribe from these emails</a></div>`
    : "";
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${e(title)}</title>
<!--[if gte mso 9]><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
<style>
  @media only screen and (max-width: 520px) {
    .px { padding-left: 24px !important; padding-right: 24px !important; }
    .stack { display: block !important; width: 100% !important; padding: 0 0 12px 0 !important; box-sizing: border-box; }
    .panel-pad { padding-left: 16px !important; padding-right: 16px !important; }
    .btn { padding: 14px 22px !important; }
  }
</style>
</head>
<body style="margin:0; padding:0; background-color:${C.page}; -webkit-font-smoothing:antialiased;">
${preheader(previewText)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.page}" style="background-color:${C.page};">
  <tr>
    <td align="center" style="padding:24px 12px 32px;">
      <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.card}" style="max-width:600px; background-color:${C.card}; border-radius:24px; overflow:hidden; box-shadow:0 22px 54px -20px rgba(103,60,120,0.3);">
        <tr><td height="4" bgcolor="${C.violet}" style="height:4px; font-size:0; line-height:0; background-color:${C.violet}; background-image:${GRADIENT};">&nbsp;</td></tr>
        ${CARD_TOP}
        <tr><td class="px" style="padding:28px 40px 0;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="vertical-align:middle;"><img src="${e(logo)}" width="28" height="28" alt="LoveIQ" style="display:block; border:0; width:28px; height:28px; border-radius:7px;"></td>
            <td style="vertical-align:middle; padding-left:10px; font-family:${SERIF}; font-size:20px; font-weight:700; line-height:20px;"><span style="color:${C.ink};">Love</span><span style="color:#c167cf; background:${TEXT_GRADIENT}; -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent;">IQ</span></td>
          </tr></table>
        </td></tr>
        ${rows.join("\n")}
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">
        <tr><td align="center" style="padding:24px 40px 0; font-family:${SANS}; font-size:12px; line-height:18px; color:${C.muted}; text-align:center;">
          <div style="font-weight:600; color:${C.body};">Applied Psychometrics UG &middot; Berlin</div>
          <div>A science-led psychometric research and insights platform</div>
          <div>${e(reason)}</div>
          ${unsubscribe}
        </td></tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

// ── Plain text ───────────────────────────────────────────────────────────────────────────
// The canvas's plain-text boards: headline first, blank lines between sections, section
// names in capitals, numbered lists, no hard breaks inside a paragraph, one main link.

export function textSteps(list: Step[], title = "WHERE YOU ARE NOW"): string[] {
  return [
    title,
    ...list.map((s, i) => {
      const tag = s.state === "done" ? " (done)" : s.state === "next" ? " (next)" : "";
      const detail = s.detail ? `: ${s.detail.charAt(0).toLowerCase()}${s.detail.slice(1)}` : "";
      return `${i + 1}. ${s.title}${tag}${s.state === "done" ? "" : detail}`;
    }),
  ];
}

export function textFooter(reason: string, unsubscribeUrl?: string): string[] {
  return [
    "Questions? Reply to this email or write to hello@loveiq.org.",
    "",
    "With kindness,",
    "Your LoveIQ team",
    "",
    "-- ",
    "Applied Psychometrics UG · Berlin",
    reason,
    ...(unsubscribeUrl ? [`Unsubscribe: ${unsubscribeUrl}`] : []),
  ];
}

/** Sections joined by one blank line; a section is a line or a list of lines. */
export function joinText(sections: Array<string | string[] | null | false | undefined>): string {
  return sections
    .filter((s): s is string | string[] => Boolean(s) && (!Array.isArray(s) || s.length > 0))
    .map((s) => (Array.isArray(s) ? s.join("\n") : s))
    .join("\n\n");
}

/** "Hi Alex," or "Hi there,". */
export function hiLine(name: string | null): string {
  return `Hi ${name ?? "there"},`;
}
