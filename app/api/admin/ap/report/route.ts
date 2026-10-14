import { NextResponse } from "next/server";

import { fetchFacts, fetchFactsFor } from "@features/admin/server/ap/facts";
import {
  DATA_START,
  beforeData,
  comparisonRange,
  parseFilters,
} from "@features/admin/server/ap/filters";
import { fetchReportReturns, postHogFailed } from "@features/admin/server/ap/posthog";
import { buildReportPage, fetchReportExtras } from "@features/admin/server/ap/report-page";
import { apGuard, NO_STORE } from "@features/admin/server/ap/route-guard";
import { addDays } from "@features/admin/server/dropoff-weekly";
import { reportingDay } from "@shared/time/reporting-day";
import logger from "@shared/observability/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** AP-Analytics, the report page: tiles, the pre-wizard, reading time, returns, chapters, feedback. */
export async function GET(request: Request) {
  const admin = await apGuard(request, { bucket: "admin-ap-report" });
  if (admin instanceof NextResponse) return admin;

  const now = new Date();
  const today = reportingDay(now);
  const filters = parseFilters(new URL(request.url).searchParams, today);
  const cmp = comparisonRange(filters);

  try {
    const compared = cmp && !beforeData(cmp) ? cmp : null;
    const [facts, previous, benchmark, extras, previousExtras, returns] = await Promise.all([
      fetchFactsFor(filters.from, filters.to, filters),
      compared ? fetchFactsFor(compared.from, compared.to, filters) : Promise.resolve(null),
      fetchFacts(DATA_START, addDays(today, -1)),
      fetchReportExtras(filters.from, filters.to),
      // The earlier period's Skip Intro presses, for that tile's change only: without them the
      // tile is shown uncompared rather than the page failing.
      compared
        ? fetchReportExtras(compared.from, compared.to).catch((err: unknown) => {
            logger.warn({ err }, "AP report: earlier period's extras unavailable");
            return null;
          })
        : Promise.resolve(null),
      fetchReportReturns(filters.from, filters.to).catch(postHogFailed),
    ]);
    return NextResponse.json(
      buildReportPage({
        facts,
        previous,
        benchmark,
        extras,
        previousExtras,
        returns,
        filters,
        today,
        now,
      }),
      {
        headers: NO_STORE,
      }
    );
  } catch (err) {
    logger.error({ err }, "AP report page failed");
    return NextResponse.json({ error: "Unable to load the report page." }, { status: 500 });
  }
}
