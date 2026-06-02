import { EMAIL_FONT, escapeHtml, renderCtaButton, wrapEmailShell } from "@shared/emails/shared";

export interface Nurture78hNoUnlockParams {
  firstName?: string | null;
  /** External Calendly booking URL (already carries UTM + name/email prefill). */
  ctaUrl: string;
  siteUrl: string;
  unsubscribeUrl?: string;
}

/**
 * Final nurture stage (78h, report still locked): instead of another discount,
 * invite the user to a 20-minute call in exchange for a free second archetype
 * report. The CTA links OUT to Calendly (not /report). Figma node 7102-165.
 *
 * Built directly on the low-level email primitives rather than
 * `renderNurtureEmail` because this design has no testimonial card and a
 * bespoke "hit reply" sign-off (the shared builder forces both). `hideBrandHeader`
 * matches the mock, which omits the in-card logo.
 */
export function nurture78hNoUnlockEmail({
  firstName,
  ctaUrl,
  siteUrl,
  unsubscribeUrl,
}: Nurture78hNoUnlockParams) {
  // Collapse any control chars (CR/LF/TAB) before use — the name flows into the
  // email subject (a header), so this is defence-in-depth against header
  // injection on top of the HTML escaping below.
  const trimmed = firstName ? firstName.replace(/[\r\n\t]+/g, " ").trim() : "";
  const safeFirstName = trimmed ? escapeHtml(trimmed) : "there";

  // Personalize the subject when we have a name; the base form is ≤50 chars so
  // the value-bearing hook isn't truncated on iOS Mail (~38-50) / Gmail (~50-60).
  // Subject is a plain-text header (not HTML), so it uses the raw trimmed name.
  const subject = trimmed
    ? `A free archetype report for you, ${trimmed}`
    : "A free archetype report for you";
  const previewText = "A 20-minute call — and your second archetype report is on us.";

  const heading = "Your next archetype report is on us — if you have 20 minutes.";
  const closing =
    "Not up for a call? Just hit reply — we read every message personally and would still love to hear from you.";

  // Static, server-authored copy (trusted literals — only the recipient name is
  // escaped). Straight apostrophes + em dashes match the Figma source verbatim.
  const bodyParagraphs = [
    "A few days ago you received your LoveIQ report. You've had a little time with it now — and we're genuinely curious what you think.",
    "We're personally reaching out to a handful of users for a 20-minute one-on-one video call. No agenda, no pitch — just an honest conversation about your experience. What landed, what surprised you, what felt off.",
    "Join a call and we'll unlock a second archetype profile for you — whichever one you're most curious about. Because understanding one part of how you connect is just the beginning. Or pass it on to someone in your life who'd find it valuable.",
  ];

  const htmlParagraphs = [`Hi ${safeFirstName},`, ...bodyParagraphs];
  const introHtml = htmlParagraphs
    .map((p, i, arr) => {
      const marginBottom = i === arr.length - 1 ? "0" : "16px";
      return `<p style="margin:0 0 ${marginBottom} 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">${p}</p>`;
    })
    .join("");

  const bodyHtml = [
    `
  <tr>
    <td style="padding:24px 32px 8px;">
      <h1 style="margin:0; font-family:${EMAIL_FONT}; font-size:26px; font-weight:600; line-height:1.4; color:#000000; letter-spacing:-0.3px;">
        ${escapeHtml(heading)}
      </h1>
    </td>
  </tr>`,
    `
  <tr>
    <td style="padding:16px 32px 0;">
      ${introHtml}
    </td>
  </tr>`,
    `
  <tr>
    <td align="center" style="padding:24px 32px 8px;">
      ${renderCtaButton({ href: ctaUrl, label: "Book your 20-minute call" })}
    </td>
  </tr>`,
    `
  <tr>
    <td align="center" style="padding:24px 32px 8px;">
      <p style="margin:0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000; text-align:center;">
        ${escapeHtml(closing)}
      </p>
    </td>
  </tr>`,
    `
  <tr>
    <td align="center" style="padding:16px 32px 32px;">
      <p style="margin:0 0 4px 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000; text-align:center;">
        With kindness,
      </p>
      <p style="margin:0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000; text-align:center;">
        Your LoveIQ team
      </p>
    </td>
  </tr>`,
  ].join("");

  const html = wrapEmailShell({
    bodyHtml,
    previewText,
    siteUrl,
    title: subject,
    unsubscribeUrl,
    hideBrandHeader: true,
  });

  const text = [
    subject,
    "",
    heading,
    "",
    `Hi ${trimmed || "there"},`,
    "",
    ...bodyParagraphs.flatMap((p) => [p, ""]),
    `Book your 20-minute call: ${ctaUrl}`,
    "",
    closing,
    "",
    "With kindness,",
    "Your LoveIQ team",
  ].join("\n");

  return { subject, html, text };
}
