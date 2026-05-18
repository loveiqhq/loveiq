import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { addToSuppression } from "@shared/emails/suppression";
import logger from "@shared/observability/logger";
import { notifySlack, maskEmail, escapeSlack } from "@shared/observability/slack";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    logger.warn("RESEND_WEBHOOK_SECRET not set — rejecting webhook");
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }

  const rawBody = await request.text();
  const svixHeaders = {
    "svix-id": request.headers.get("svix-id") ?? "",
    "svix-timestamp": request.headers.get("svix-timestamp") ?? "",
    "svix-signature": request.headers.get("svix-signature") ?? "",
  };

  let payload: { type: string; data: { to?: string[] } };
  try {
    const wh = new Webhook(secret);
    payload = wh.verify(rawBody, svixHeaders) as typeof payload;
  } catch (err) {
    logger.warn({ err }, "Resend webhook signature verification failed");
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  const email = payload.data?.to?.[0]?.toLowerCase().trim();
  if (!email) {
    return NextResponse.json({ ok: true });
  }

  if (payload.type === "email.bounced") {
    logger.info({ email }, "Hard bounce — suppressing email address");
    await addToSuppression(email, "hard_bounce");
    await notifySlack({
      channel: "ops",
      kind: "email_bounce",
      text: `:envelope_with_arrow: Hard bounce — ${escapeSlack(maskEmail(email))} suppressed`,
      username: "ops_alerts",
    });
  } else if (payload.type === "email.complained") {
    logger.info({ email }, "Spam complaint — suppressing email address");
    await addToSuppression(email, "complaint");
    await notifySlack({
      channel: "ops",
      kind: "email_complaint",
      text: `:rotating_light: Spam complaint — ${escapeSlack(maskEmail(email))} suppressed. Review template + sender reputation.`,
      username: "ops_alerts",
    });
  } else {
    logger.info({ email, type: payload.type }, "Resend webhook received");
  }

  return NextResponse.json({ ok: true });
}
