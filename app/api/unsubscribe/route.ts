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

// Browser-facing confirmation page — linked from the email footer
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
  const result = verifyUnsubscribeToken(token, secret);

  if (!result) {
    return new Response("Invalid or expired unsubscribe link.", {
      status: 400,
      headers: { "Content-Type": "text/plain" },
    });
  }

  const { email, issuedAt } = result;
  // Prefer the signed campaign baked into the token; fall back to the unsigned
  // ?src= param for in-flight links minted before campaigns were embedded.
  const campaign = result.campaign || sanitizeCampaign(searchParams.get("src"));

  await addToSuppression(email, "unsubscribed", { campaign, channel: "footer" });
  logger.info({ email, campaign }, "Email unsubscribed via GET");
  await pingUnsubscribe(email, "footer", campaign, issuedAt);

  const siteUrl = getEmailSiteUrl();
  // eslint-disable-next-line no-secrets/no-secrets
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Unsubscribed</title><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="font-family:sans-serif;max-width:480px;margin:60px auto;padding:0 24px;text-align:center"><h1 style="font-size:24px;font-weight:600">You've been unsubscribed</h1><p style="color:#555;line-height:1.6">You won't receive informational emails from LoveIQ anymore.</p><p style="margin-top:32px"><a href="${siteUrl}" style="color:#5900AC;text-decoration:none;font-weight:600">← Back to LoveIQ</a></p></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

// RFC 8058 one-click unsubscribe — called by email clients, not browsers.
// The client POSTs with body: List-Unsubscribe=One-Click
export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token") ?? "";
  const secret = getSecret();
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

  await addToSuppression(email, "unsubscribed", { campaign, channel: "one-click" });
  logger.info({ email, campaign }, "Email unsubscribed via one-click POST");
  await pingUnsubscribe(email, "one-click", campaign, issuedAt);
  return NextResponse.json({ ok: true });
}
