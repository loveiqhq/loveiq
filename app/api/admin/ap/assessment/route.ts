import { NextResponse } from "next/server";

import { buildDashboard } from "@features/admin/server/ap/assessment";
import { fetchFactsFor } from "@features/admin/server/ap/facts";
import {
  beforeData,
  comparisonRange,
  parseFilters,
  rangeLabel,
} from "@features/admin/server/ap/filters";
import { splitBlocked } from "@features/admin/server/ap/common";
import {
  fetchNewReturning,
  fetchSessionSources,
  fetchVisitorGroups,
  POSTHOG_FROM,
  postHogFailed,
} from "@features/admin/server/ap/posthog";
import { apGuard, NO_STORE } from "@features/admin/server/ap/route-guard";
import { freeAdsOnly } from "@features/admin/server/ap/pay-to-start";
import { adCostByDay } from "@features/brain/server/ingest/analytics";
import { readVercelOidcToken } from "@shared/http/google-oauth";
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
  // New or returning needs PostHog's history from before the range: a range starting before
  // PostHog does would read everyone as new. Blank with the reason instead.
  const noHistory =
    filters.from < POSTHOG_FROM
      ? {
          ok: false as const,
          error: `New and returning come from PostHog, which starts on ${rangeLabel(POSTHOG_FROM, POSTHOG_FROM)}: pick a range from that day on.`,
        }
      : null;

  try {
    const factsNow = fetchFactsFor(filters.from, filters.to, filters);
    const [facts, previous, ad, newReturning, sessions, visitorGroups] = await Promise.all([
      factsNow,
      cmp && !beforeData(cmp) ? fetchFactsFor(cmp.from, cmp.to, filters) : Promise.resolve(null),
      // "Free survey": the account's spend is the free survey's when no ad landed on a
      // pay-to-start page (freeAdsOnly); its reason otherwise.
      Promise.all([
        adCostByDay(),
        filters.funnel === "free"
          ? freeAdsOnly(
              cmp && cmp.from < filters.from ? cmp.from : filters.from,
              filters.to,
              readVercelOidcToken(request)
            )
          : null,
      ]).then(([cost, freeAds]) => ({ ...cost, freeAds })),
      // PostHog is a side panel: its failure shows there, it never fails the page.
      noHistory ?? fetchNewReturning(filters.from, filters.to).catch(postHogFailed),
      splitBlocked(filters)
        ? Promise.resolve(null)
        : fetchSessionSources(filters.from, filters.to).catch(postHogFailed),
      // The New & returning panel's € per visit: each payment with its payer's visitor group,
      // asked as soon as the payments are read, beside the other PostHog reads.
      noHistory ??
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
