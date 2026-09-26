/**
 * POST /api/jarvis/decision — the signed-in member allows or cancels connecting Claude.
 * Answers with where to send the browser: back to Claude with a code, or with a refusal.
 * An approval is posted to #brain, so every new connection is seen.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { decide } from "@features/brain/server/connect";
import { verifyCsrfToken } from "@shared/http/csrf";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import logger from "@shared/observability/logger";
import { escapeSlack, notifySlack } from "@shared/observability/slack";

const schema = z.object({
  authorization_id: z.string().min(1).max(200),
  decision: z.enum(["approve", "deny"]),
});

export async function POST(request: Request) {
  if (!(await verifyCsrfToken(request))) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }
  const rate = await checkRateLimit(getClientIp(request), {
    bucket: "jarvis-decision",
    limit: 10,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json({ error: "Please try again in a minute." }, { status: 429 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const approve = parsed.data.decision === "approve";
  const outcome = await decide(parsed.data.authorization_id, approve);
  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.message }, { status: outcome.status });
  }
  if (approve && outcome.app) {
    try {
      await notifySlack({
        channel: "brain",
        kind: "brain_connected",
        username: "ops_alerts",
        text: `:key: ${escapeSlack(outcome.member)} connected ${escapeSlack(outcome.app)} to Jarvis`,
      });
    } catch (err) {
      logger.warn({ err }, "jarvis: connection made but not posted to #brain");
    }
  }
  return NextResponse.json({ redirect_url: outcome.url });
}
