import { NextResponse } from "next/server";

import { beforeData, comparisonRange, parseFilters } from "@features/admin/server/ap/filters";
import { apGuard, NO_STORE } from "@features/admin/server/ap/route-guard";
import { buildEmailsPage, fetchEmails, readWindow } from "@features/admin/server/ap/emails";
import { reportingDay } from "@shared/time/reporting-day";
import logger from "@shared/observability/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** AP-Analytics, the Emails pages: every email (scope=overall) or Assessment A's (scope=assessment). */
export async function GET(request: Request) {
  const admin = await apGuard(request, { bucket: "admin-ap-emails" });
  if (admin instanceof NextResponse) return admin;

  const now = new Date();
  const today = reportingDay(now);
  const params = new URL(request.url).searchParams;
  const filters = parseFilters(params, today);
  const scope = params.get("scope") === "assessment" ? "assessment" : "overall";
  const cmp = comparisonRange(filters);
  const read = readWindow(filters);

  try {
    const [data, previous] = await Promise.all([
      fetchEmails(read.from, read.to),
      // The period before, for the tiles' change only: without it they are shown uncompared
      // rather than the page failing.
      cmp && !beforeData(cmp)
        ? fetchEmails(cmp.from, cmp.to).catch((err: unknown) => {
            logger.warn({ err }, "AP emails: the period before is unavailable");
            return null;
          })
        : Promise.resolve(null),
    ]);
    return NextResponse.json(buildEmailsPage({ data, previous, filters, scope, today, now }), {
      headers: NO_STORE,
    });
  } catch (err) {
    logger.error({ err }, "AP emails page failed");
    return NextResponse.json({ error: "Unable to load the emails page." }, { status: 500 });
  }
}
