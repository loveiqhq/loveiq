import { NextResponse } from "next/server";

import { buildDashboard } from "@features/admin/server/ap/assessment";
import { fetchFactsFor } from "@features/admin/server/ap/facts";
import { beforeData, comparisonRange, parseFilters } from "@features/admin/server/ap/filters";
import { splitBlocked } from "@features/admin/server/ap/common";
import {
  fetchNewReturning,
  fetchSessionSources,
  fetchVisitorGroups,
  postHogFailed,
} from "@features/admin/server/ap/posthog";
import { apGuard, NO_STORE } from "@features/admin/server/ap/route-guard";
import { adCostByDay } from "@features/brain/server/ingest/analytics";
import { reportingDay } from "@shared/time/reporting-day";
import logger from "@shared/observability/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** AP-Analytics, Assessment A dashboard: tiles, scorecard, journey, traffic, prices. */
export async function GET(request: Request) {
  const admin = await apGuard(request, { bucket: "admin-ap-assessment" });
  if (admin instanceof NextResponse) return admin;

  const now = new Date();
  const today = reportingDay(now);
  const filters = parseFilters(new URL(request.url).searchParams, today);
  const cmp = comparisonRange(filters);

  try {
    const factsNow = fetchFactsFor(filters.from, filters.to, filters);
    const [facts, previous, ad, newReturning, sessions, visitorGroups] = await Promise.all([
      factsNow,
      cmp && !beforeData(cmp) ? fetchFactsFor(cmp.from, cmp.to, filters) : Promise.resolve(null),
      adCostByDay(),
      // PostHog is a side panel: its failure shows there, it never fails the page.
      fetchNewReturning(filters.from, filters.to).catch(postHogFailed),
      splitBlocked(filters)
        ? Promise.resolve(null)
        : fetchSessionSources(filters.from, filters.to).catch(postHogFailed),
      // The New & returning panel's € per visit: each payment with its payer's visitor group,
      // asked as soon as the payments are read, beside the other PostHog reads.
      factsNow.then((f) =>
        fetchVisitorGroups(
          filters.from,
          filters.to,
          f.money.map((m) => m.ph)
        ).catch(postHogFailed)
      ),
    ]);
    return NextResponse.json(
      buildDashboard({
        facts,
        previous,
        ad,
        filters,
        today,
        now,
        newReturning,
        sessions,
        visitorGroups,
      }),
      {
        headers: NO_STORE,
      }
    );
  } catch (err) {
    logger.error({ err }, "AP assessment dashboard failed");
    return NextResponse.json({ error: "Unable to load the dashboard." }, { status: 500 });
  }
}
