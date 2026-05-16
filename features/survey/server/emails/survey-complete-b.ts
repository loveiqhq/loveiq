import { EMAIL_FONT, escapeHtml, renderCtaButton, wrapEmailShell } from "@shared/emails/shared";
import { TESTIMONIAL_DIJANA } from "@features/report/server/emails/nurture/shared";

/**
 * Post-survey "your report is ready" — Variant B (Figma node 5086-101).
 * Curiosity framing: "This might surprise you / change how you see yourself".
 * Pair with `surveyCompleteEmail` (variant A) for an A/B test.
 */
export interface SurveyCompleteBEmailParams {
  firstName?: string | null;
  reportUrl: string;
  siteUrl: string;
  unsubscribeUrl?: string;
}

function renderTestimonialCard(siteUrl: string): string {
  const t = TESTIMONIAL_DIJANA;
  const absPhoto = t.photoUrl.startsWith("http") ? t.photoUrl : `${siteUrl}${t.photoUrl}`;
  return `
  <tr>
    <td style="padding:8px 32px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#150A22; border-radius:18px;">
        <tr>
          <td style="padding:16px 18px 18px;">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td style="width:64px; vertical-align:middle;">
                  <img src="${escapeHtml(absPhoto)}" alt="${escapeHtml(t.name)}" width="56" height="56" style="display:block; width:56px; height:56px; border-radius:9999px; background-color:#2A1839; object-fit:cover;" />
                </td>
                <td style="padding-left:12px; vertical-align:middle;">
                  <p style="margin:0; font-family:${EMAIL_FONT}; font-size:14px; font-weight:700; line-height:20px; color:#ffffff;">${escapeHtml(t.name)}</p>
                  <p style="margin:0; font-family:${EMAIL_FONT}; font-size:11px; line-height:16px; color:#d1d5db;">${escapeHtml(t.role)}</p>
                </td>
              </tr>
              <tr>
                <td style="padding:2px 0 6px;">
                  <span style="display:inline-block; font-size:14px; color:#F26D4F; letter-spacing:2px; line-height:1;">&#9733;&#9733;&#9733;&#9733;&#9733;</span>
                </td>
              </tr>
              <tr>
                <td style="padding-top:6px; font-family:Georgia,'Times New Roman',serif; font-size:15px; font-style:italic; line-height:1.55; color:#d1d5db;">
                  &ldquo;${escapeHtml(t.quoteLeading)} <strong style="font-weight:700; font-style:italic; color:#ffffff;">${escapeHtml(t.quoteBold)}</strong>${t.quoteTrailing ? ` ${escapeHtml(t.quoteTrailing)}` : ""}&rdquo;
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

export function surveyCompleteBEmail({
  firstName,
  reportUrl,
  siteUrl,
  unsubscribeUrl,
}: SurveyCompleteBEmailParams) {
  const safeFirstName = firstName?.trim() ? escapeHtml(firstName.trim()) : "there";
  const greetingText = firstName?.trim() || "there";
  const subject = "This might surprise you…";
  const previewText = "Something interesting showed up in your results.";

  const bodyHtml = `
  <tr>
    <td style="padding:24px 32px 8px;">
      <h1 style="margin:0; font-family:${EMAIL_FONT}; font-size:26px; font-weight:600; line-height:1.35; color:#000000; letter-spacing:-0.3px;">
        This might change how you see yourself.
      </h1>
    </td>
  </tr>
  <tr>
    <td style="padding:16px 32px 0;">
      <p style="margin:0 0 16px 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">
        Hi ${safeFirstName},
      </p>
      <p style="margin:0 0 16px 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">
        <strong style="font-weight:700;">Something interesting showed up in your results.</strong>
      </p>
      <p style="margin:0 0 16px 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">
        Most people go through the test expecting one thing &mdash; and discover something slightly different.
      </p>
      <p style="margin:0 0 16px 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">
        <strong style="font-weight:700;">Your LoveIQ report is ready</strong>, and it reveals patterns in how you experience attraction, connection, and desire that are often hard to put into words.
      </p>
      <p style="margin:0 0 8px 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">
        It&rsquo;s not about labels.
      </p>
      <p style="margin:0 0 24px 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">
        It&rsquo;s about seeing yourself more clearly.
      </p>
    </td>
  </tr>
  <tr>
    <td align="center" style="padding:8px 32px 16px;">
      ${renderCtaButton({ href: reportUrl, label: "View your report now" })}
    </td>
  </tr>
  ${renderTestimonialCard(siteUrl)}
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
    "This might surprise you…",
    "",
    `Hi ${greetingText},`,
    "",
    "Something interesting showed up in your results.",
    "",
    "Most people go through the test expecting one thing — and discover something slightly different.",
    "",
    "Your LoveIQ report is ready, and it reveals patterns in how you experience attraction, connection, and desire that are often hard to put into words.",
    "",
    "It's not about labels.",
    "It's about seeing yourself more clearly.",
    "",
    `View your report now: ${reportUrl}`,
    "",
    `"${TESTIMONIAL_DIJANA.quoteLeading} ${TESTIMONIAL_DIJANA.quoteBold}${TESTIMONIAL_DIJANA.quoteTrailing ? ` ${TESTIMONIAL_DIJANA.quoteTrailing}` : ""}"`,
    `— ${TESTIMONIAL_DIJANA.name}, ${TESTIMONIAL_DIJANA.role}`,
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
