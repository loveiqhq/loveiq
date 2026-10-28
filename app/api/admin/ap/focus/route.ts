import { NextResponse } from "next/server";

import { fetchFactsFor } from "@features/admin/server/ap/facts";
import { beforeData, comparisonRange, parseFilters } from "@features/admin/server/ap/filters";
import { buildFocus, chartWindows } from "@features/admin/server/ap/focus";
import { freeAdsOnly, payToStartFor } from "@features/admin/server/ap/pay-to-start";
import { fetchReportExtras } from "@features/admin/server/ap/report-page";
import { apGuard, NO_STORE } from "@features/admin/server/ap/route-guard";
import { adCostByDay } from "@features/brain/server/ingest/analytics";
import { readVercelOidcToken } from "@shared/http/google-oauth";
import { readInitialUnlockGateSwitch } from "@features/report/server/initialGateState";
import { reportingDay } from "@shared/time/reporting-day";
import logger from "@shared/observability/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * AP-Analytics Dashboard: the headline tiles, the funnel comparison, the six charts and the
 * assessments.
 */
export async function GET(request: Request) {
  const admin = await apGuard(request, { bucket: "admin-ap-focus" });
  if (admin instanceof NextResponse) return admin;

  const now = new Date();
  const today = reportingDay(now);
  const filters = parseFilters(new URL(request.url).searchParams, today);
  const cmp = comparisonRange(filters);
  // The weekly and monthly charts reach back further than the range (15 weeks, May 2026 on):
  // their days are read once, beside the range's own.
  const w = chartWindows(filters.from, filters.to);
  const wideFrom = w.week.from < w.month.from ? w.week.from : w.month.from;

  // "Free survey" sells the EUR 1.99 only through the report's gate: its switch, for the
  // pre-unlock chart (null when it can't be read, and the chart says so).
  const gateRead =
    filters.funnel === "free"
      ? readInitialUnlockGateSwitch().catch(() => null)
      : Promise.resolve(null);
  try {
    const factsRead = fetchFactsFor(filters.from, filters.to, filters);
    const [facts, wide, previous, ad, extras, pts] = await Promise.all([
      factsRead,
      wideFrom < filters.from
        ? fetchFactsFor(wideFrom, filters.to, filters)
        : Promise.resolve(null),
      cmp && !beforeData(cmp) ? fetchFactsFor(cmp.from, cmp.to, filters) : Promise.resolve(null),
      // "Free survey": the account's spend is the free survey's when no ad landed on a
      // pay-to-start page (freeAdsOnly); its reason otherwise.
      Promise.all([
        adCostByDay(),
        filters.funnel === "free"
          ? freeAdsOnly(
              [filters.from, wideFrom, ...(cmp ? [cmp.from] : [])].sort()[0]!,
              filters.to,
              readVercelOidcToken(request)
            )
          : null,
      ]).then(([cost, freeAds]) => ({ ...cost, freeAds })),
      // Only the NPS tile's line reads the chapter ratings: their failure blanks that line.
      fetchReportExtras(filters.from, filters.to).catch((err: unknown) => {
        logger.warn({ err }, "AP dashboard: chapter ratings unavailable");
        return null;
      }),
      // The funnel comparison: the Pay to start page's figures for the range (null when not
      // read: the comparison says so, the rest of the page doesn't wait on it).
      factsRead.then((f) => payToStartFor(filters, f, today, readVercelOidcToken(request))),
    ]);
    const ratings = extras
      ? extras.chapters.reduce(
          (a, c) => ({ up: a.up + (Number(c.up) || 0), down: a.down + (Number(c.down) || 0) }),
          { up: 0, down: 0 }
        )
      : null;
    return NextResponse.json(
      buildFocus({
        facts,
        wide,
        previous,
        ad,
        filters,
        today,
        now,
        ratings,
        pts,
        gateOn: await gateRead,
      }),
      { headers: NO_STORE }
    );
  } catch (err) {
    logger.error({ err }, "AP dashboard failed");
    return NextResponse.json({ error: "Unable to load the dashboard." }, { status: 500 });
  }
}
