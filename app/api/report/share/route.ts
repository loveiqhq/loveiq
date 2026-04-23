import { NextResponse } from "next/server";
import { Resend } from "resend";
import { z } from "zod";
import { verifyCsrfToken } from "@/lib/csrf";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import { scheduleAfterResponse } from "@/lib/after-response";
import logger from "@/lib/logger";
import { reportSharedEmail } from "@/lib/emails/report-shared";
import {
  canSharePlan,
  getReportPlanByPersonalReportId,
  getShareSeatLimit,
} from "@/lib/report/planAccess";
import {
  REPORT_ACCESS_TOKEN_REGEX,
  createReportShareViaRpc,
  generateShareToken,
  listActiveSharesForReport,
  resolveOwnerFromAccessToken,
} from "@/lib/report/shareAccess";

const postSchema = z.object({
  ownerToken: z.string().regex(REPORT_ACCESS_TOKEN_REGEX),
  recipientEmail: z.string().email().max(320),
  personalMessage: z.string().max(2000).optional().nullable(),
});

const POST_RATE_LIMIT = { bucket: "report-share-post", limit: 5, windowMs: 60_000 };
const GET_RATE_LIMIT = { bucket: "report-share-get", limit: 30, windowMs: 60_000 };

let _resend: Resend | null = null;
function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!_resend) _resend = new Resend(key);
  return _resend;
}

function retryAfterHeaders(resetAt: Date) {
  return {
    "Retry-After": String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)),
  };
}

export async function POST(request: Request) {
  if (!(await verifyCsrfToken(request))) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }

  const ip = getClientIp(request);
  const rate = await checkRateLimit(ip, POST_RATE_LIMIT);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Please try again later." },
      { status: 429, headers: retryAfterHeaders(rate.resetAt) }
    );
  }

  const parsed = postSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const ownerToken = parsed.data.ownerToken;
  const recipientEmail = parsed.data.recipientEmail.trim().toLowerCase();
  const personalMessageRaw = parsed.data.personalMessage?.trim() || null;
  const personalMessage =
    personalMessageRaw && personalMessageRaw.length > 0 ? personalMessageRaw : null;

  let owner;
  try {
    owner = await resolveOwnerFromAccessToken(ownerToken);
  } catch (err) {
    logger.error({ err }, "report-share: owner resolve failed");
    return NextResponse.json({ error: "Service temporarily unavailable." }, { status: 503 });
  }
  if (!owner) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }

  if (owner.ownerEmail && owner.ownerEmail === recipientEmail) {
    return NextResponse.json({ error: "You already own this report." }, { status: 400 });
  }

  let plan;
  try {
    plan = await getReportPlanByPersonalReportId(owner.personalReportId);
  } catch (err) {
    logger.error({ err }, "report-share: plan lookup failed");
    return NextResponse.json({ error: "Service temporarily unavailable." }, { status: 503 });
  }

  if (!canSharePlan(plan)) {
    return NextResponse.json(
      { error: "Sharing is available on the Full Report and All Reports plans." },
      { status: 403 }
    );
  }

  const seatLimit = getShareSeatLimit(plan);
  const shareToken = generateShareToken();

  let result;
  try {
    result = await createReportShareViaRpc({
      personalReportId: owner.personalReportId,
      recipientEmail,
      sharedByUserId: owner.ownerUserId,
      plan: plan as "full_report" | "all_reports",
      seatLimit,
      shareToken,
      personalMessage,
    });
  } catch (err) {
    logger.error({ err }, "report-share: RPC failed");
    return NextResponse.json({ error: "Unable to share right now." }, { status: 500 });
  }

  if (result.error === "seat_limit_reached") {
    return NextResponse.json(
      { error: "Seat limit reached.", active: result.active, limit: result.limit },
      { status: 409 }
    );
  }
  if (result.error === "duplicate_recipient") {
    return NextResponse.json(
      { error: "You've already shared the report with that email." },
      { status: 409 }
    );
  }
  if (result.error) {
    return NextResponse.json({ error: "Unable to share right now." }, { status: 400 });
  }
  if (!result.row) {
    return NextResponse.json({ error: "Unable to share right now." }, { status: 500 });
  }

  const row = result.row;

  // Fire-and-forget email — never blocks the response or rolls back the DB row.
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://loveiq.org").replace(/\/$/, "");
  const shareUrl = `${siteUrl}/report/${row.share_token}`;
  const resend = getResend();
  if (resend) {
    scheduleAfterResponse("report-share-email", async () => {
      try {
        const tpl = reportSharedEmail({
          ownerFirstName: owner.ownerFirstName,
          shareUrl,
          siteUrl,
          personalMessage,
        });
        const { error } = await Promise.race([
          resend.emails.send({
            from: process.env.RESEND_FROM || "LoveIQ <hello@send.loveiq.org>",
            to: recipientEmail,
            replyTo: process.env.RESEND_REPLY_TO || "hello@loveiq.org",
            subject: tpl.subject,
            html: tpl.html,
            text: tpl.text,
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Resend timeout")), 8_000)
          ),
        ]);
        if (error) {
          logger.error({ error, shareId: row.id }, "report-share email send failed");
        }
      } catch (err) {
        logger.error({ err, shareId: row.id }, "report-share email error");
      }
    });
  } else {
    logger.warn({ shareId: row.id }, "RESEND_API_KEY missing — skipping share email");
  }

  return NextResponse.json({
    share: {
      id: row.id,
      recipientEmail: row.recipient_email,
      createdAt: row.created_at,
    },
    seatLimit,
  });
}

export async function GET(request: Request) {
  const ip = getClientIp(request);
  const rate = await checkRateLimit(ip, GET_RATE_LIMIT);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Please try again later." },
      { status: 429, headers: retryAfterHeaders(rate.resetAt) }
    );
  }

  const url = new URL(request.url);
  const ownerToken = url.searchParams.get("ownerToken");
  if (!ownerToken || !REPORT_ACCESS_TOKEN_REGEX.test(ownerToken)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  let owner;
  try {
    owner = await resolveOwnerFromAccessToken(ownerToken);
  } catch (err) {
    logger.error({ err }, "report-share GET: owner resolve failed");
    return NextResponse.json({ error: "Service temporarily unavailable." }, { status: 503 });
  }
  if (!owner) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }

  let plan;
  try {
    plan = await getReportPlanByPersonalReportId(owner.personalReportId);
  } catch (err) {
    logger.error({ err }, "report-share GET: plan lookup failed");
    return NextResponse.json({ error: "Service temporarily unavailable." }, { status: 503 });
  }
  const seatLimit = getShareSeatLimit(plan);

  let shares;
  try {
    shares = await listActiveSharesForReport(owner.personalReportId);
  } catch (err) {
    logger.error({ err }, "report-share GET: list failed");
    return NextResponse.json({ error: "Service temporarily unavailable." }, { status: 503 });
  }

  return NextResponse.json({
    plan,
    seatLimit,
    seatsUsed: shares.length,
    shares: shares.map((s) => ({
      id: s.id,
      recipientEmail: s.recipient_email,
      createdAt: s.created_at,
      lastViewedAt: s.last_viewed_at,
    })),
  });
}
