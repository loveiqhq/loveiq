import { NextResponse } from "next/server";

import { beforeData, comparisonRange, parseFilters } from "@features/admin/server/ap/filters";
import { apGuard, NO_STORE } from "@features/admin/server/ap/route-guard";
import {
  buildUnlockFeedbackPage,
  fetchUnlockFeedback,
} from "@features/admin/server/ap/unlock-feedback";
import { reportingDay } from "@shared/time/reporting-day";
import logger from "@shared/observability/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** AP-Analytics, the Unlock feedback page: the "why didn't you unlock?" email, send to answer. */
export async function GET(request: Request) {
  const admin = await apGuard(request, { bucket: "admin-ap-unlock-feedback" });
  if (admin instanceof NextResponse) return admin;

  const now = new Date();
  const today = reportingDay(now);
  const filters = parseFilters(new URL(request.url).searchParams, today);
  const cmp = comparisonRange(filters);

  try {
    const [data, previous] = await Promise.all([
      fetchUnlockFeedback(filters.from, filters.to),
      // The period before, for the tiles' change only: without it they are shown uncompared
      // rather than the page failing.
      cmp && !beforeData(cmp)
        ? fetchUnlockFeedback(cmp.from, cmp.to).catch((err: unknown) => {
            logger.warn({ err }, "AP unlock feedback: the period before is unavailable");
            return null;
          })
        : Promise.resolve(null),
    ]);
    return NextResponse.json(buildUnlockFeedbackPage({ data, previous, filters, today, now }), {
      headers: NO_STORE,
    });
  } catch (err) {
    logger.error({ err }, "AP unlock feedback page failed");
    return NextResponse.json(
      { error: "Unable to load the unlock feedback page." },
      { status: 500 }
    );
  }
}
