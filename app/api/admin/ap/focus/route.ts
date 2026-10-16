import { NextResponse } from "next/server";

import { fetchFactsFor } from "@features/admin/server/ap/facts";
import { beforeData, comparisonRange, parseFilters } from "@features/admin/server/ap/filters";
import { buildFocus } from "@features/admin/server/ap/focus";
import { fetchReportExtras } from "@features/admin/server/ap/report-page";
import { apGuard, NO_STORE } from "@features/admin/server/ap/route-guard";
import { adCostByDay } from "@features/brain/server/ingest/analytics";
import { reportingDay } from "@shared/time/reporting-day";
import logger from "@shared/observability/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** AP-Analytics Dashboard: the headline tiles, the six charts and the assessments. */
export async function GET(request: Request) {
  const admin = await apGuard(request, { bucket: "admin-ap-focus" });
  if (admin instanceof NextResponse) return admin;

  const now = new Date();
  const today = reportingDay(now);
  const filters = parseFilters(new URL(request.url).searchParams, today);
  const cmp = comparisonRange(filters);

  try {
    const [facts, previous, ad, extras] = await Promise.all([
      fetchFactsFor(filters.from, filters.to, filters),
      cmp && !beforeData(cmp) ? fetchFactsFor(cmp.from, cmp.to, filters) : Promise.resolve(null),
      adCostByDay(),
      // Only the NPS tile's line reads the chapter ratings: their failure blanks that line.
      fetchReportExtras(filters.from, filters.to).catch((err: unknown) => {
        logger.warn({ err }, "AP dashboard: chapter ratings unavailable");
        return null;
      }),
    ]);
    const ratings = extras
      ? extras.chapters.reduce(
          (a, c) => ({ up: a.up + (Number(c.up) || 0), down: a.down + (Number(c.down) || 0) }),
          { up: 0, down: 0 }
        )
      : null;
    return NextResponse.json(buildFocus({ facts, previous, ad, filters, today, now, ratings }), {
      headers: NO_STORE,
    });
  } catch (err) {
    logger.error({ err }, "AP dashboard failed");
    return NextResponse.json({ error: "Unable to load the dashboard." }, { status: 500 });
  }
}
