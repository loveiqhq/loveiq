import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyCsrfToken } from "@/lib/csrf";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import logger from "@/lib/logger";
import {
  REPORT_ACCESS_TOKEN_REGEX,
  resolveOwnerFromAccessToken,
  revokeReportShare,
} from "@features/report/server/shareAccess";

const bodySchema = z.object({
  ownerToken: z.string().regex(REPORT_ACCESS_TOKEN_REGEX),
});

const DELETE_RATE_LIMIT = { bucket: "report-share-delete", limit: 10, windowMs: 60_000 };

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function DELETE(request: Request, context: RouteContext) {
  if (!(await verifyCsrfToken(request))) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }

  const ip = getClientIp(request);
  const rate = await checkRateLimit(ip, DELETE_RATE_LIMIT);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((rate.resetAt.getTime() - Date.now()) / 1000)),
        },
      }
    );
  }

  const { id } = await context.params;
  const shareId = Number(id);
  if (!Number.isInteger(shareId) || shareId <= 0) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  let owner;
  try {
    owner = await resolveOwnerFromAccessToken(parsed.data.ownerToken);
  } catch (err) {
    logger.error({ err }, "report-share revoke: owner resolve failed");
    return NextResponse.json({ error: "Service temporarily unavailable." }, { status: 503 });
  }
  if (!owner) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }

  let revoked;
  try {
    revoked = await revokeReportShare({
      shareId,
      personalReportId: owner.personalReportId,
    });
  } catch (err) {
    logger.error({ err, shareId }, "report-share revoke: PATCH failed");
    return NextResponse.json({ error: "Unable to revoke share." }, { status: 500 });
  }

  if (!revoked) {
    return NextResponse.json({ error: "Share not found." }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
