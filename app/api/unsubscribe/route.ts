import { NextResponse } from "next/server";
import {
  verifyUnsubscribeToken,
  sanitizeCampaign,
  describeUnsubscribeSource,
} from "@shared/emails/unsubscribe-token";
import { addToSuppression } from "@shared/emails/suppression";
import { getEmailSiteUrl } from "@shared/emails/site-url";
import logger from "@shared/observability/logger";
import { notifySlack, maskEmail, escapeSlack } from "@shared/observability/slack";

async function pingUnsubscribe(
  email: string,
  mode: "footer" | "one-click",
  campaign: string,
  issuedAt: number | null
) {
  // `campaign` is already sanitized to a safe slug; escapeSlack guards the label
  // (which falls back to that slug for unknown campaigns). When no campaign is
  // resolved, the token's age tells us whether this is benign pre-tracking
  // backlog or a genuine gap worth investigating.
  const source = describeUnsubscribeSource(campaign, issuedAt);
  const via = source.attributed ? `via *${escapeSlack(source.label)}*` : source.note;
  await notifySlack({
    channel: "ops",
    kind: "unsubscribe",
    text: `:no_bell: Unsubscribe (${mode}) — ${escapeSlack(maskEmail(email))} — ${via}`,
    username: "ops_alerts",
  });
}

// CSRF-exempt by design. The HMAC-signed `token` URL param IS the auth.
// Email clients (Gmail, Outlook, Apple Mail) call the RFC 8058 one-click
// endpoint without browser cookies; they couldn't include a CSRF token
// even if we required one. The token already authenticates the request
// via UNSUBSCRIBE_SECRET — see lib/emails/unsubscribe-token.ts. The
// exemption is also documented in `proxy.ts`.

function getSecret(): string | null {
  return process.env.UNSUBSCRIBE_SECRET || null;
}

function htmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// One stylesheet for the three pages (the CSP allows inline styles), in the look the
// old confirmation page had.
const PAGE_CSS = [
  "body{font-family:sans-serif;max-width:480px;margin:60px auto;padding:0 24px;text-align:center}",
  "h1{font-size:24px;font-weight:600}",
  "p{color:#555;line-height:1.6}",
  "a{color:#5900AC;text-decoration:none;font-weight:600}",
  ".back{margin-top:32px}",
  "form{margin-top:28px}",
  "button{font:inherit;font-size:16px;font-weight:600;min-height:48px;padding:12px 28px;border:0;border-radius:999px;background:#5900AC;color:#fff;cursor:pointer}",
  "button:focus-visible{outline:3px solid #5900AC;outline-offset:3px}",
].join("");

function page(title: string, body: string, status = 200): Response {
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${title}</title><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><style>${PAGE_CSS}</style></head><body>${body}</body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

/** The same link, as a form a person submits. Only a POST unsubscribes. */
function unsubscribeForm(request: Request, label: string): string {
  const { pathname, search } = new URL(request.url);
  return `<form method="post" action="${htmlEscape(pathname + search)}"><input type="hidden" name="confirm" value="1"><button type="submit">${label}</button></form>`;
}

/**
 * Footer link: a page with an Unsubscribe button, never the unsubscribe itself.
 *
 * It used to unsubscribe on GET. Mail security scanners (Microsoft Safe Links, Mimecast,
 * Proofpoint) fetch every link in a message before the person sees it, and Next answers
 * HEAD with this same handler, so people were unsubscribed without clicking anything.
 * RFC 8058 says as much: the one-click unsubscribe is a POST, and a GET must not act.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token") ?? "";
  const secret = getSecret();

  if (!secret) {
    // Misconfiguration, not a bad link: a 400 would silently swallow every real
    // unsubscribe. Surface it (logger.error → ops) and return 503 so RFC 8058
    // clients retry rather than treat the link as permanently invalid.
    logger.error("UNSUBSCRIBE_SECRET not set — unsubscribe requests cannot be verified");
    return new Response("Unsubscribe is temporarily unavailable.", {
      status: 503,
      headers: { "Content-Type": "text/plain" },
    });
  }

  if (!verifyUnsubscribeToken(token, secret)) {
    return new Response("Invalid or expired unsubscribe link.", {
      status: 400,
      headers: { "Content-Type": "text/plain" },
    });
  }

  const siteUrl = getEmailSiteUrl();
  return page(
    "Unsubscribe from LoveIQ emails?",
    `<h1>Unsubscribe from LoveIQ emails?</h1><p>You'll stop getting informational emails from us. Your report link keeps working.</p>${unsubscribeForm(request, "Unsubscribe")}<p class="back"><a href="${htmlEscape(siteUrl)}">Keep my emails</a></p>`
  );
}

/**
 * Two callers. Mail clients, for the RFC 8058 one-click (body
 * `List-Unsubscribe=One-Click`, no cookies, JSON is fine), and a person pressing the
 * button on the page above (`confirm=1`, who needs a page back). Either way the answer
 * reflects whether the address was actually written to the suppression list.
 */
export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token") ?? "";
  const secret = getSecret();
  const form = new URLSearchParams(await request.text().catch(() => ""));
  const fromPage = form.get("confirm") === "1";

  if (!secret) {
    logger.error("UNSUBSCRIBE_SECRET not set — unsubscribe requests cannot be verified");
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }

  const result = verifyUnsubscribeToken(token, secret);
  if (!result) {
    return NextResponse.json({ error: "Invalid token." }, { status: 400 });
  }

  const { email, issuedAt } = result;
  // Prefer the signed campaign baked into the token; fall back to the unsigned
  // ?src= param for in-flight links minted before campaigns were embedded.
  const campaign = result.campaign || sanitizeCampaign(searchParams.get("src"));
  const channel = fromPage ? "footer" : "one-click";
  const written = await addToSuppression(email, "unsubscribed", { campaign, channel });

  if (!written) {
    // A 503 so a mail client retries, and a page that says so instead of a false success.
    if (fromPage) {
      return page(
        "We couldn't unsubscribe you",
        `<h1>We couldn't unsubscribe you just now</h1><p>Nothing changed yet. Please try again in a moment.</p>${unsubscribeForm(request, "Try again")}`,
        503
      );
    }
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }

  logger.info({ email, campaign, channel }, "Email unsubscribed");
  await pingUnsubscribe(email, channel, campaign, issuedAt);

  if (fromPage) {
    const siteUrl = getEmailSiteUrl();
    return page(
      "Unsubscribed",
      `<h1>You've been unsubscribed</h1><p>You won't receive informational emails from LoveIQ anymore.</p><p class="back"><a href="${htmlEscape(siteUrl)}">← Back to LoveIQ</a></p>`
    );
  }
  return NextResponse.json({ ok: true });
}
