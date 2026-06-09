import { EMAIL_FONT, escapeHtml, renderCtaButton, wrapEmailShell } from "@shared/emails/shared";
import { getTrustpilotConfig, TRUSTPILOT_FALLBACK_URL } from "@shared/ui/trustpilot/config";

export interface NurtureBullet {
  text: string;
  bold?: boolean;
}

/**
 * `intro`, `preBulletsNote`, `postBulletsNote`, `preCtaNote`, `preCtaNote2`
 * accept trusted server-authored HTML (e.g. <strong>, <br>). Callers MUST
 * `escapeHtml` any dynamic substitution (promo codes, recipient names, archetype
 * names) before injection. `heading`, `closingNote`, and bullet `text` are
 * escaped automatically.
 */
export interface NurtureBodyParams {
  heading: string;
  intro: string;
  ctaLabel: string;
  ctaUrl: string;
  bullets?: NurtureBullet[];
  preCtaNote?: string;
  /**
   * Optional second paragraph rendered between `preCtaNote` and the CTA. Same
   * trusted-HTML contract as `preCtaNote`. Use when two distinct paragraphs must
   * sit above the CTA (e.g. the chapter tease followed by a "read the full
   * chapter" nudge) so the plaintext twin keeps them on separate lines instead
   * of gluing them together (`<br>` strips to nothing in the text part).
   */
  preCtaNote2?: string;
  preBulletsNote?: string;
  postBulletsNote?: string;
  closingNote?: string;
}

/** Resolve the public Trustpilot profile URL (or a safe fallback). */
function trustpilotProfileUrl(): string {
  return getTrustpilotConfig().profileUrl ?? TRUSTPILOT_FALLBACK_URL;
}

/**
 * Cookieless Trustpilot badge used in place of the former curated testimonial
 * card. Emails are static HTML and cannot host Trustpilot's live widget, so this
 * is a self-contained rating block (no external script, no cookies) linking to
 * the public profile. Green Unicode stars avoid Gmail's remote-image stripping.
 */
export function renderTrustpilotBadge(): string {
  const href = trustpilotProfileUrl();
  return `
  <tr>
    <td style="padding:16px 32px 8px;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#150A22; border-radius:18px;">
        <tr>
          <td align="center" style="padding:20px 18px;">
            <p style="margin:0 0 8px 0; font-family:${EMAIL_FONT}; font-size:14px; font-weight:700; line-height:20px; color:#ffffff;">Rated Excellent on Trustpilot</p>
            <p style="margin:0 0 10px 0;"><span style="display:inline-block; font-size:20px; color:#00b67a; letter-spacing:2px; line-height:1;">&#9733;&#9733;&#9733;&#9733;&#9733;</span></p>
            <a href="${escapeHtml(href)}" style="font-family:${EMAIL_FONT}; font-size:13px; font-weight:600; color:#34c79a; text-decoration:underline;">See our reviews on Trustpilot</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

/** Plain-text twin of the Trustpilot badge. */
export function renderTrustpilotBadgeText(): string {
  return `Rated Excellent on Trustpilot ★★★★★ — ${trustpilotProfileUrl()}`;
}

function renderBulletsHtml(bullets: NurtureBullet[] | undefined): string {
  if (!bullets || bullets.length === 0) return "";
  const items = bullets
    .map((b) => {
      const inner = b.bold
        ? `<strong style="font-weight:700;">${escapeHtml(b.text)}</strong>`
        : escapeHtml(b.text);
      return `<li style="margin:0 0 6px 0;">${inner}</li>`;
    })
    .join("");
  return `
  <tr>
    <td style="padding:8px 32px 0;">
      <p style="margin:0 0 8px 0; font-family:${EMAIL_FONT}; font-size:17px; font-weight:700; line-height:1.55; color:#000000;">
        Why it&rsquo;s worth it:
      </p>
      <ul style="margin:0 0 12px 0; padding-left:22px; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">
        ${items}
      </ul>
    </td>
  </tr>`;
}

function renderBulletsText(bullets: NurtureBullet[] | undefined): string {
  if (!bullets || bullets.length === 0) return "";
  return ["", "Why it's worth it:", ...bullets.map((b) => `- ${b.text}`), ""].join("\n");
}

function renderClosingHtml(closing: string | undefined): string {
  if (!closing) return "";
  return `
  <tr>
    <td style="padding:4px 32px 8px;">
      <p style="margin:0 0 12px 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">
        ${escapeHtml(closing)}
      </p>
    </td>
  </tr>`;
}

function renderSignOffHtml(): string {
  return `
  <tr>
    <td align="center" style="padding:16px 32px 32px;">
      <p style="margin:0 0 12px 0; font-family:${EMAIL_FONT}; font-size:16px; line-height:1.55; color:#000000; text-align:center;">
        Questions? Reach us at
        <a href="mailto:hello@loveiq.org" style="color:#1a73e8; text-decoration:underline;">hello@loveiq.org</a>.
      </p>
      <p style="margin:0 0 4px 0; font-family:${EMAIL_FONT}; font-size:16px; line-height:1.55; color:#000000; text-align:center;">
        We&rsquo;ll get back to you.
      </p>
      <p style="margin:16px 0 4px 0; font-family:${EMAIL_FONT}; font-size:16px; line-height:1.55; color:#000000; text-align:center;">
        With kindness,
      </p>
      <p style="margin:0; font-family:${EMAIL_FONT}; font-size:16px; line-height:1.55; color:#000000; text-align:center;">
        Your LoveIQ team
      </p>
    </td>
  </tr>`;
}

export interface RenderedNurture {
  subject: string;
  html: string;
  text: string;
}

export function renderNurtureEmail({
  subject,
  previewText,
  body,
  siteUrl,
  unsubscribeUrl,
  hideBrandHeader = false,
}: {
  subject: string;
  previewText: string;
  body: NurtureBodyParams;
  siteUrl: string;
  unsubscribeUrl?: string;
  /**
   * Hide the in-card LoveIQ logo header (forwarded to `wrapEmailShell`).
   * Defaults to `false` so existing nurture emails are unchanged.
   */
  hideBrandHeader?: boolean;
}): RenderedNurture {
  const headingRow = `
  <tr>
    <td style="padding:24px 32px 8px;">
      <h1 style="margin:0; font-family:${EMAIL_FONT}; font-size:26px; font-weight:600; line-height:1.4; color:#000000; letter-spacing:-0.3px;">
        ${escapeHtml(body.heading)}
      </h1>
    </td>
  </tr>`;

  // Email-bug-2026-05-26: convert `\n` separators to <br /> tags before
  // embedding the intro. iOS Mail does not reliably honour
  // `white-space: pre-line` — it strips the rule and renders the raw
  // newlines as ordinary whitespace, collapsing every paragraph into one
  // block. <br /> tags are universally supported across mail clients.
  // The intro is documented (NurtureBodyParams docstring) to accept
  // trusted server-authored HTML, so this string replace is safe — none
  // of the `\n`s are inside HTML attribute values.
  const introRow = `
  <tr>
    <td style="padding:16px 32px 0;">
      <p style="margin:0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">${body.intro.replace(/\n/g, "<br />")}</p>
    </td>
  </tr>`;

  const preCtaRow = body.preCtaNote
    ? `
  <tr>
    <td style="padding:12px 32px 0;">
      <p style="margin:0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">${body.preCtaNote}</p>
    </td>
  </tr>`
    : "";

  const preCtaRow2 = body.preCtaNote2
    ? `
  <tr>
    <td style="padding:12px 32px 0;">
      <p style="margin:0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">${body.preCtaNote2}</p>
    </td>
  </tr>`
    : "";

  const ctaRow = `
  <tr>
    <td align="center" style="padding:16px 32px 8px;">
      ${renderCtaButton({ href: body.ctaUrl, label: body.ctaLabel })}
    </td>
  </tr>`;

  const testimonialRow = renderTrustpilotBadge();

  const preBulletsRow = body.preBulletsNote
    ? `
  <tr>
    <td style="padding:16px 32px 0;">
      <p style="margin:0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">${body.preBulletsNote}</p>
    </td>
  </tr>`
    : "";

  const postBulletsRow = body.postBulletsNote
    ? `
  <tr>
    <td style="padding:0 32px 8px;">
      <p style="margin:0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">${body.postBulletsNote}</p>
    </td>
  </tr>`
    : "";

  const bodyHtml = [
    headingRow,
    introRow,
    preCtaRow,
    preCtaRow2,
    ctaRow,
    testimonialRow,
    preBulletsRow,
    renderBulletsHtml(body.bullets),
    postBulletsRow,
    renderClosingHtml(body.closingNote),
    renderSignOffHtml(),
  ].join("");

  const html = wrapEmailShell({
    bodyHtml,
    previewText,
    siteUrl,
    title: subject,
    unsubscribeUrl,
    hideBrandHeader,
  });

  // Strip tags, then decode the safe display entities so the plain-text twin
  // doesn't show literal `&quot;` / `&#039;` / `&amp;` that `escapeHtml`
  // introduced for the HTML body. Angle-bracket entities are intentionally NOT
  // decoded, so an escaped `<script>` from a hostile name can never reappear as
  // a literal tag in the text part. `&amp;` is decoded last so a double-escaped
  // sequence like `&amp;quot;` collapses to `&quot;`, not `"`.
  const stripTags = (s: string) =>
    s
      .replace(/<[^>]+>/g, "")
      .replace(/&quot;/g, '"')
      .replace(/&#0?39;/g, "'")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&");
  const text = [
    subject,
    "",
    body.heading,
    "",
    stripTags(body.intro),
    ...(body.preCtaNote ? ["", stripTags(body.preCtaNote)] : []),
    ...(body.preCtaNote2 ? ["", stripTags(body.preCtaNote2)] : []),
    "",
    `${body.ctaLabel}: ${body.ctaUrl}`,
    "",
    renderTrustpilotBadgeText(),
    ...(body.preBulletsNote ? ["", stripTags(body.preBulletsNote)] : []),
    renderBulletsText(body.bullets),
    ...(body.postBulletsNote ? [stripTags(body.postBulletsNote), ""] : []),
    ...(body.closingNote ? [body.closingNote, ""] : []),
    "Questions? Reach us at hello@loveiq.org. We'll get back to you.",
    "",
    "With kindness,",
    "Your LoveIQ team",
  ]
    .filter((line, idx, arr) => !(line === "" && arr[idx - 1] === ""))
    .join("\n");

  return { subject, html, text };
}
