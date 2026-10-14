import { NextResponse } from "next/server";

import { fetchFactsFor } from "@features/admin/server/ap/facts";
import {
  activeNarrowing,
  beforeData,
  comparisonRange,
  parseFilters,
} from "@features/admin/server/ap/filters";
import { buildOverview, splitBlocked } from "@features/admin/server/ap/overview";
import { fetchSessionSources, postHogFailed } from "@features/admin/server/ap/posthog";
import { apGuard, NO_STORE } from "@features/admin/server/ap/route-guard";
import { fetchSurveyQuestions, questionSegment, topExit } from "@features/admin/server/ap/survey";
import { adCostByDay } from "@features/brain/server/ingest/analytics";
import { reportingDay } from "@shared/time/reporting-day";
import logger from "@shared/observability/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** AP-Analytics Overview: the headline tiles and the five sections, for the filter bar's state. */
export async function GET(request: Request) {
  const admin = await apGuard(request, { bucket: "admin-ap-overview" });
  if (admin instanceof NextResponse) return admin;

  const now = new Date();
  const today = reportingDay(now);
  const filters = parseFilters(new URL(request.url).searchParams, today);
  const cmp = comparisonRange(filters);

  try {
    const [facts, previous, ad, questions, sessions] = await Promise.all([
      fetchFactsFor(filters.from, filters.to, filters),
      cmp && !beforeData(cmp) ? fetchFactsFor(cmp.from, cmp.to, filters) : Promise.resolve(null),
      adCostByDay(),
      fetchSurveyQuestions(filters.from, filters.to, filters).catch((err: unknown) => {
        // The survey card's one cell is not worth failing the page for.
        logger.warn({ err }, "AP overview: survey questions unavailable");
        return null;
      }),
      // Visitors per source are estimated from PostHog's split: its failure blanks them only.
      splitBlocked(filters)
        ? Promise.resolve(null)
        : fetchSessionSources(filters.from, filters.to).catch(postHogFailed),
    ]);
    const payload = buildOverview({
      facts,
      previous,
      ad,
      filters,
      today,
      now,
      topExit: questions ? topExit(questions) : null,
      // The survey steps split by Google Ads or by device only: anything else reads all traffic.
      topExitScope:
        activeNarrowing(filters).length > 0 && questionSegment(filters).segment === "All traffic"
          ? "all traffic"
          : null,
      sessions,
    });
    return NextResponse.json(payload, { headers: NO_STORE });
  } catch (err) {
    logger.error({ err }, "AP overview failed");
    return NextResponse.json({ error: "Unable to load the overview." }, { status: 500 });
  }
}
