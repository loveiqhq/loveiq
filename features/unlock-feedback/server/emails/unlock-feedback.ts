import { EMAIL_FONT, escapeHtml, wrapEmailShell } from "@shared/emails/shared";
import { REASON_COPY, type UnlockReason } from "@features/unlock-feedback/logic/reasons";
import {
  preheaderFor,
  subjectFor,
  type SubjectArm,
} from "@features/unlock-feedback/logic/subjects";

/**
 * "Why didn't you unlock your report?", the design ("Unlock feedback email", Main) as Mark left
 * it on 22.10, with its copy exact but for two typos ("its", "feel"). Eman's calls of 22.10:
 * the reader's first name, and the full report's worth at the price that reader was quoted
 * (Marcus 18.10); "Anonymous by default" and "not a horoscope" are left out of the footer (the
 * answer is tied to the reader, and Mark found the second "AI slop"). Table layout and inline
 * styles so Outlook and Gmail draw it.
 */

const SERIF = "Lora, Georgia, 'Times New Roman', serif";
const INK = "#161021";
const BODY = "#3f3a4d";
const MUTED = "#6b6678";

const HEADING = "Tell us why you didn’t unlock your report, and the ";
const HEADING_ACCENT = "full report is yours";
const DECIDED =
  "You took the LoveIQ test, reviewed your results and decided to not unlock the full report.";
const WHY =
  "To make LoveIQ even better, we would like to understand why and would love to offer you a free unlock in return.";
const TAP_LEAD = "Tap the answer that fits best";
const QUESTION = "Why didn’t you unlock your report?";
const QUESTION_HINT = "One tap is enough. Your report opens right after.";
const READ = "We read every answer ourselves.";
const THANKS = "Thank you for helping us get this right.";
const SIGNATURE = "The LoveIQ Team";
const FOOTER_LINE = "Your answer is only used to improve LoveIQ.";
const COMPANY = "Applied Psychometrics UG · Berlin · ";

/**
 * A button's link. It goes to the open route, not to /why: that route moves the token into a
 * cookie and redirects to /why?r=<code>, so the token never sits in a page address that
 * analytics tools record.
 */
export function unlockFeedbackLink(siteUrl: string, reason: UnlockReason, token: string): string {
  return `${siteUrl}/api/unlock-feedback/open?${new URLSearchParams({ r: reason, t: token })}`;
}

export interface UnlockFeedbackEmailParams {
  arm: SubjectArm;
  /** The reader's archetype as the report titles it: "The Spiritual Lover" (subject D). */
  archetypeName: string;
  /** The greeting's name; without one the email says "Hi there,". */
  firstName?: string | null;
  /** The full report's price as this reader was quoted it ("€29.99"); null leaves "worth" out. */
  worth?: string | null;
  /** The row's reason_order: the order the buttons are shown in, "other" last. */
  reasonOrder: readonly UnlockReason[];
  /** The link token (the row keeps only its hash). */
  token: string;
  siteUrl: string;
  unsubscribeUrl: string;
}

const paragraph = (html: string, marginTop = 0) =>
  `<p style="margin:${marginTop}px 0 0 0; font-family:${EMAIL_FONT}; font-size:16px; line-height:25.6px; color:${BODY};">${html}</p>`;

/**
 * One answer: a pill whose label and arrow are both the link, so the whole pill is a tap
 * target. Two cells rather than a float, which Outlook does not draw.
 */
function renderButton(href: string, reason: UnlockReason): string {
  const other = reason === "other";
  const border = other ? "1px dashed #d5d4d7" : "1px solid #e9e6ee";
  const link = (content: string, padding: string, extra = "") =>
    `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer"${extra} style="display:block; padding:${padding}; font-family:${EMAIL_FONT}; font-size:15px; line-height:22px; font-weight:600; color:${other ? BODY : INK}; text-decoration:none;">${content}</a>`;
  return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate; margin:0 0 10px 0;">
        <tr>
          <td style="border:${border}; border-radius:9999px; background-color:#ffffff;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td valign="middle">${link(escapeHtml(REASON_COPY[reason].email), "14px 8px 14px 20px")}</td>
                <td valign="middle" align="right" width="40" style="width:40px;">${link(`<span style="color:#795fc8;">&rarr;</span>`, "14px 20px 14px 0", ' aria-hidden="true" tabindex="-1"')}</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>`;
}

export function unlockFeedbackEmail({
  arm,
  archetypeName,
  firstName,
  worth,
  reasonOrder,
  token,
  siteUrl,
  unsubscribeUrl,
}: UnlockFeedbackEmailParams): { subject: string; html: string; text: string } {
  const subject = subjectFor(arm, archetypeName);
  const links = reasonOrder.map((reason) => ({
    reason,
    href: unlockFeedbackLink(siteUrl, reason, token),
  }));

  const name = firstName?.trim() || "there";
  const tap = `and we unlock the full report${worth ? `, worth ${worth},` : ""} with all its chapters for you. This is entirely free. No payment details, no catch.`;

  // The heading's accent is a gradient where the mail app draws one and its middle colour
  // where it does not (Outlook), like the wordmark in the shared header.
  const bodyHtml = `
  <tr>
    <td style="padding:24px 32px 0;">
      <h1 style="margin:0; font-family:${SERIF}; font-size:34px; line-height:1.22; font-weight:500; letter-spacing:-0.3px; color:${INK};">${escapeHtml(HEADING)}<span style="font-style:italic; color:#bf66d9; background:linear-gradient(135deg,#fe6839 0%,#bf66d9 43%,#958ef6 100%); -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent;">${escapeHtml(HEADING_ACCENT)}</span>.</h1>
      ${paragraph(`Hi ${escapeHtml(name)},<br>${escapeHtml(DECIDED)}<br>${escapeHtml(WHY)}`, 22)}
      ${paragraph(`<strong style="color:${INK};">${escapeHtml(TAP_LEAD)}</strong> ${escapeHtml(tap)}`, 14)}
    </td>
  </tr>
  <tr>
    <td style="padding:32px 32px 0;">
      <h2 style="margin:0 0 12px 0; font-family:${SERIF}; font-size:34px; line-height:1.1; font-weight:500; color:${INK};">${escapeHtml(QUESTION)}</h2>
      <p style="margin:0 0 14px 0; font-family:${EMAIL_FONT}; font-size:12px; line-height:19.2px; color:${MUTED};">${escapeHtml(QUESTION_HINT)}</p>
      ${links.map((l) => renderButton(l.href, l.reason)).join("")}
    </td>
  </tr>
  <tr>
    <td style="padding:18px 32px 36px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="border-top:1px solid #e9e6ee; padding-top:40px;">
            ${paragraph(`${escapeHtml(READ)}<br>${escapeHtml(THANKS)}`)}
            <p style="margin:8px 0 0 0; font-family:${SERIF}; font-style:italic; font-size:18px; line-height:24px; color:${INK};">${escapeHtml(SIGNATURE)}</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;

  const footerHtml = `
  <tr>
    <td style="padding:20px 32px 28px; background-color:#f5f6f8;">
      <p style="margin:0 0 6px 0; font-family:${EMAIL_FONT}; font-size:12px; line-height:19.2px; color:${MUTED};">${escapeHtml(FOOTER_LINE)}</p>
      <p style="margin:0; font-family:${EMAIL_FONT}; font-size:12px; line-height:19.2px; color:${MUTED};">${escapeHtml(COMPANY)}<a href="${escapeHtml(unsubscribeUrl)}" style="color:#6b5b95; text-decoration:underline;">Unsubscribe</a></p>
    </td>
  </tr>`;

  const html = wrapEmailShell({
    bodyHtml,
    previewText: preheaderFor(arm),
    siteUrl,
    title: subject,
    footerHtml,
  });

  const text = [
    `${HEADING}${HEADING_ACCENT}.`,
    "",
    `Hi ${name},`,
    DECIDED,
    WHY,
    "",
    `${TAP_LEAD} ${tap}`,
    "",
    QUESTION,
    QUESTION_HINT,
    "",
    ...links.flatMap((l) => [REASON_COPY[l.reason].email, l.href, ""]),
    READ,
    THANKS,
    "",
    SIGNATURE,
    "",
    FOOTER_LINE,
    `${COMPANY}Unsubscribe: ${unsubscribeUrl}`,
  ].join("\n");

  return { subject, html, text };
}
