import { Resend } from "resend";
import {
  EMAIL_FONT,
  escapeHtml,
  renderBrandFooterText,
  renderCtaButton,
  wrapEmailShell,
} from "@shared/emails/shared";
import { getEmailSiteUrl } from "@shared/emails/site-url";
import { buildUnsubscribeUrl, UNSUBSCRIBE_CAMPAIGNS } from "@shared/emails/unsubscribe-token";
import logger from "@shared/observability/logger";
import { PAY_TO_START_JOURNEY } from "@features/pay-to-start/logic/journey";

/**
 * The email a buyer gets the moment their payment is confirmed, before any survey.
 *
 * Figma draws none: Stripe's receipt (1475:2114) is the only mail in the frames, and it
 * cannot carry a link. The page's FAQ promises "a link in your receipt email" to come back
 * to the survey; this is that link. Copy is a proposal, flagged for Marcus in the PR.
 */

export interface PayToStartConfirmationParams {
  /** "€29.00": what was actually paid. */
  amountText: string;
  continueUrl: string;
  productName: string;
  siteUrl: string;
  unsubscribeUrl?: string;
  /**
   * `report` when the survey was finished before the payment settled (a checkout left
   * open, then paid; a delayed method): the report is what unlocks now, and asking them
   * to start the survey would be wrong. The same continue link opens it.
   */
  variant?: "survey" | "report";
}

/** The copy that differs between the two versions. Proposals, flagged for Marcus. */
const CONFIRMATION_COPY = {
  survey: {
    subject: "Payment received: your survey is ready",
    previewText: "Finish the survey and your full report unlocks straight away.",
    heading: "Payment received. Your survey is ready.",
    body: "Take the survey whenever you&rsquo;re ready. When you finish it, your full report unlocks straight away, with nothing more to pay.",
    bodyText:
      "Take the survey whenever you're ready. When you finish it, your full report unlocks straight away, with nothing more to pay.",
    returnHtml:
      "This button always brings you back to it. If you stop halfway, open it again on the same device to carry on where you left off.",
    returnText:
      "This link always brings you back to it. If you stop halfway, open it again on the same device to carry on where you left off.",
    cta: "Start my survey",
  },
  report: {
    subject: "Payment received: your report is unlocked",
    previewText: "Your survey is already done, so your full report is open now.",
    heading: "Payment received. Your report is unlocked.",
    body: "Your survey is already done, so your full report is unlocked now, with nothing more to pay.",
    bodyText:
      "Your survey is already done, so your full report is unlocked now, with nothing more to pay.",
    returnHtml: "This button always brings you back to it.",
    returnText: "This link always brings you back to it.",
    cta: "Open my report",
  },
} as const;

export function payToStartConfirmationEmail({
  amountText,
  continueUrl,
  productName,
  siteUrl,
  unsubscribeUrl,
  variant = "survey",
}: PayToStartConfirmationParams) {
  const copy = CONFIRMATION_COPY[variant];
  const subject = copy.subject;
  const previewText = copy.previewText;
  const safeAmount = escapeHtml(amountText);
  const safeProduct = escapeHtml(productName);
  const ctaLabel = copy.cta;
  const paragraph = `margin:0 0 16px 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;`;

  const bodyHtml = `
  <tr>
    <td style="padding:24px 32px 8px;">
      <h1 style="margin:0; font-family:${EMAIL_FONT}; font-size:26px; font-weight:600; line-height:1.35; color:#000000; letter-spacing:-0.3px;">
        ${copy.heading}
      </h1>
    </td>
  </tr>
  <tr>
    <td style="padding:16px 32px 0;">
      <p style="${paragraph}">Hi there,</p>
      <p style="${paragraph}">
        Thank you for your purchase: <strong style="font-weight:700;">${safeAmount}</strong> for the <strong style="font-weight:700;">${safeProduct}</strong>.
      </p>
      <p style="${paragraph}">
        ${copy.body}
      </p>
      <p style="margin:0 0 24px 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">
        ${copy.returnHtml}
      </p>
    </td>
  </tr>
  <tr>
    <td align="center" style="padding:8px 32px 24px;">
      ${renderCtaButton({ href: continueUrl, label: ctaLabel })}
    </td>
  </tr>
  <tr>
    <td align="center" style="padding:16px 32px 32px;">
      <p style="margin:0 0 12px 0; font-family:${EMAIL_FONT}; font-size:16px; line-height:1.55; color:#000000; text-align:center;">
        If anything gets in the way, reach out to us at
        <a href="mailto:hello@loveiq.org" style="color:#1a73e8; text-decoration:underline;">hello@loveiq.org</a>.
      </p>
      <p style="margin:0; font-family:${EMAIL_FONT}; font-size:16px; line-height:1.55; color:#000000; text-align:center;">
        With kindness,<br />Your LoveIQ team
      </p>
    </td>
  </tr>`;

  const html = wrapEmailShell({ bodyHtml, previewText, siteUrl, title: subject, unsubscribeUrl });

  const text = [
    subject,
    "",
    "Hi there,",
    "",
    `Thank you for your purchase: ${amountText} for the ${productName}.`,
    "",
    copy.bodyText,
    "",
    copy.returnText,
    "",
    `${ctaLabel}: ${continueUrl}`,
    "",
    "If anything gets in the way, reach out to us at hello@loveiq.org.",
    "",
    "With kindness,",
    "Your LoveIQ team",
    ...renderBrandFooterText(unsubscribeUrl),
  ].join("\n");

  return { subject, html, text };
}

/**
 * Hosts a continue link may point at: the request origin the checkout was started from,
 * stamped on the Stripe session, when it is one of ours. Anything else falls back to
 * `getEmailSiteUrl()` (production). A domain added for this page later joins this list.
 */
const LINK_HOSTS = new Set(["www.loveiq.org", "loveiq.org", "staging.loveiq.org"]);

export function resolveEmailOrigin(stampedOrigin: string | null | undefined): string {
  if (stampedOrigin) {
    try {
      const url = new URL(stampedOrigin);
      const local =
        process.env.NODE_ENV !== "production" &&
        url.protocol === "http:" &&
        (url.hostname === "localhost" || url.hostname === "127.0.0.1");
      if ((url.protocol === "https:" && LINK_HOSTS.has(url.hostname)) || local) {
        return url.origin;
      }
    } catch {
      /* not a URL: fall back */
    }
  }
  return getEmailSiteUrl();
}

export function buildContinueUrl(origin: string, token: string): string {
  return `${origin}/sexual-archetype/continue?t=${encodeURIComponent(token)}`;
}

let _resend: Resend | null = null;
function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!_resend) _resend = new Resend(key);
  return _resend;
}

/**
 * Send it. Never throws: the payment is confirmed whether or not the mail goes out, and
 * the checkout status page takes the buyer to the survey either way.
 */
export async function sendPayToStartConfirmationEmail({
  amountText,
  email,
  entitlementId,
  origin,
  productName,
  token,
  variant = "survey",
}: {
  amountText: string;
  email: string;
  entitlementId: number;
  /** The origin stamped on the Stripe session (see `resolveEmailOrigin`). */
  origin: string | null;
  productName: string;
  token: string;
  variant?: "survey" | "report";
}): Promise<boolean> {
  const resend = getResend();
  if (!resend) {
    logger.warn({ entitlementId }, "pay-to-start: RESEND_API_KEY missing, confirmation not sent");
    return false;
  }

  const linkOrigin = resolveEmailOrigin(origin);
  const siteUrl = getEmailSiteUrl();
  const unsubSecret = process.env.UNSUBSCRIBE_SECRET;
  const unsubscribeUrl = unsubSecret
    ? buildUnsubscribeUrl(email, siteUrl, unsubSecret, UNSUBSCRIBE_CAMPAIGNS.reportUnlocked)
    : undefined;
  const tpl = payToStartConfirmationEmail({
    amountText,
    continueUrl: buildContinueUrl(linkOrigin, token),
    productName,
    siteUrl,
    unsubscribeUrl,
    variant,
  });

  try {
    const { error } = await Promise.race([
      resend.emails.send({
        from: process.env.RESEND_FROM || "LoveIQ <hello@send.loveiq.org>",
        to: email,
        replyTo: process.env.RESEND_REPLY_TO || "hello@loveiq.org",
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
        tags: [
          { name: "journey", value: PAY_TO_START_JOURNEY },
          {
            name: "email",
            value: variant === "report" ? "pts_confirmation_report" : "pts_confirmation",
          },
        ],
        headers: unsubscribeUrl
          ? {
              "List-Unsubscribe": `<${unsubscribeUrl}>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            }
          : undefined,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Resend timeout")), 8_000)
      ),
    ]);
    if (error) {
      // Not mirrored to #ops: the caller posts pts_confirmation_failed, with what to do.
      logger.error(
        { error, entitlementId, slack: false },
        "pay-to-start: confirmation email failed"
      );
      return false;
    }
    logger.info({ entitlementId }, "pay-to-start: confirmation email sent");
    return true;
  } catch (err) {
    logger.error({ err, entitlementId, slack: false }, "pay-to-start: confirmation email error");
    return false;
  }
}
