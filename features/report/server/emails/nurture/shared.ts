import { EMAIL_FONT, escapeHtml, renderCtaButton, wrapEmailShell } from "@shared/emails/shared";

export interface NurtureTestimonial {
  name: string;
  role: string;
  photoUrl: string;
  quoteLeading: string;
  quoteBold: string;
  quoteTrailing?: string;
}

export interface NurtureBullet {
  text: string;
  bold?: boolean;
}

/**
 * `intro`, `preBulletsNote`, `postBulletsNote`, `preCtaNote` accept trusted
 * server-authored HTML (e.g. <strong>, <br>). Callers MUST `escapeHtml` any
 * dynamic substitution (promo codes, recipient names) before injection.
 * `heading`, `closingNote`, bullet `text`, and the testimonial fields are
 * escaped automatically.
 */
export interface NurtureBodyParams {
  heading: string;
  intro: string;
  ctaLabel: string;
  ctaUrl: string;
  testimonial: NurtureTestimonial;
  bullets?: NurtureBullet[];
  preCtaNote?: string;
  preBulletsNote?: string;
  postBulletsNote?: string;
  closingNote?: string;
}

function renderTestimonialCard(t: NurtureTestimonial, siteUrl: string): string {
  const absPhoto = t.photoUrl.startsWith("http") ? t.photoUrl : `${siteUrl}${t.photoUrl}`;
  const trailing = t.quoteTrailing ? escapeHtml(t.quoteTrailing) : "";
  // T-03: Outlook desktop (2007-2019) uses the Word HTML renderer which
  // largely ignores CSS `style` on <td>. To keep the two-column avatar+name
  // row aligned in Outlook, the avatar <td> needs an explicit `width="64"`
  // HTML attribute (in addition to the `style="width:64px"` modern clients
  // use), and both <td>s need `valign="middle"` (Outlook ignores the CSS
  // `vertical-align`). Modern clients honour either; this is purely additive.
  return `
  <tr>
    <td style="padding:16px 32px 8px;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#150A22; border-radius:18px;">
        <tr>
          <td style="padding:16px 18px 18px;">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td width="64" valign="middle" style="width:64px; vertical-align:middle;">
                  <img src="${escapeHtml(absPhoto)}" alt="${escapeHtml(t.name)}" width="56" height="56" style="display:block; width:56px; height:56px; border-radius:9999px; background-color:#2A1839; object-fit:cover;" />
                </td>
                <td valign="middle" style="padding-left:12px; vertical-align:middle;">
                  <p style="margin:0; font-family:${EMAIL_FONT}; font-size:14px; font-weight:700; line-height:20px; color:#ffffff;">${escapeHtml(t.name)}</p>
                  <p style="margin:0; font-family:${EMAIL_FONT}; font-size:11px; line-height:16px; color:#d1d5db;">${escapeHtml(t.role)}</p>
                </td>
              </tr>
              <tr>
                <td colspan="2" style="padding:6px 0 6px;">
                  <span style="display:inline-block; font-size:14px; color:#F26D4F; letter-spacing:2px; line-height:1;">&#9733;&#9733;&#9733;&#9733;&#9733;</span>
                </td>
              </tr>
              <tr>
                <td colspan="2" style="padding-top:6px; font-family:Georgia,'Times New Roman',serif; font-size:15px; font-style:italic; line-height:1.55; color:#d1d5db;">
                  &ldquo;${escapeHtml(t.quoteLeading)} <strong style="font-weight:700; font-style:italic; color:#ffffff;">${escapeHtml(t.quoteBold)}</strong>${trailing ? ` ${trailing}` : ""}&rdquo;
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
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
}: {
  subject: string;
  previewText: string;
  body: NurtureBodyParams;
  siteUrl: string;
  unsubscribeUrl?: string;
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

  const ctaRow = `
  <tr>
    <td align="center" style="padding:16px 32px 8px;">
      ${renderCtaButton({ href: body.ctaUrl, label: body.ctaLabel })}
    </td>
  </tr>`;

  const testimonialRow = renderTestimonialCard(body.testimonial, siteUrl);

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
  });

  const stripTags = (s: string) => s.replace(/<[^>]+>/g, "");
  const text = [
    subject,
    "",
    body.heading,
    "",
    stripTags(body.intro),
    ...(body.preCtaNote ? ["", stripTags(body.preCtaNote)] : []),
    "",
    `${body.ctaLabel}: ${body.ctaUrl}`,
    "",
    `"${body.testimonial.quoteLeading} ${body.testimonial.quoteBold}${body.testimonial.quoteTrailing ? ` ${body.testimonial.quoteTrailing}` : ""}"`,
    `— ${body.testimonial.name}, ${body.testimonial.role}`,
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

export const TESTIMONIAL_DIJANA: NurtureTestimonial = {
  name: "Dr. Dijana Galijašević, 36",
  role: "Business founder & CEO",
  photoUrl: "/academic/dijana.jpg",
  quoteLeading: "I hesitated at first, but getting the",
  quoteBold: "full report turned out to be one of the best decisions",
  quoteTrailing: "I made. Completely worth it.",
};

export const TESTIMONIAL_GEBHARDT: NurtureTestimonial = {
  name: "Dr. Philip Gebhardt, 40",
  role: "Dentist and orthodontist",
  photoUrl: "/academic/gebhardt.png",
  quoteLeading: "I almost didn't start, assumed it'd be generic. It wasn't.",
  quoteBold:
    "It felt almost uncomfortably precise and gave me insight I'll probably use for years.",
};
