import { NextResponse } from "next/server";

import { fetchAdsSplit } from "@features/admin/server/ap/ads";
import { splitBlocked } from "@features/admin/server/ap/common";
import { fetchFactsFor } from "@features/admin/server/ap/facts";
import {
  beforeData,
  comparisonRange,
  grainOf,
  parseFilters,
} from "@features/admin/server/ap/filters";
import { ageMatched, sameAge } from "@features/admin/server/ap/metrics";
import {
  fetchSessionGroups,
  fetchVisitAudience,
  markVisitors,
  postHogFailed,
} from "@features/admin/server/ap/posthog";
import { apGuard, NO_STORE } from "@features/admin/server/ap/route-guard";
import { buildTraffic } from "@features/admin/server/ap/traffic";
import { adCostByDay } from "@features/brain/server/ingest/analytics";
import { readVercelOidcToken } from "@shared/http/google-oauth";
import { reportingDay } from "@shared/time/reporting-day";
import logger from "@shared/observability/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** AP-Analytics, Assessment A · Traffic: every source, campaign and keyword, and what it brings. */
export async function GET(request: Request) {
  const admin = await apGuard(request, { bucket: "admin-ap-traffic" });
  if (admin instanceof NextResponse) return admin;

  const now = new Date();
  const today = reportingDay(now);
  const filters = parseFilters(new URL(request.url).searchParams, today);
  const cmp = comparisonRange(filters);
  // PostHog's visits are split over all traffic: under a narrowing filter they aren't read.
  const posthogOff = splitBlocked(filters) !== null;

  try {
    const [facts, previousRaw, ad, sessions, audience, ads] = await Promise.all([
      fetchFactsFor(filters.from, filters.to, filters),
      cmp && !beforeData(cmp) ? fetchFactsFor(cmp.from, cmp.to, filters) : Promise.resolve(null),
      adCostByDay(),
      posthogOff
        ? Promise.resolve(null)
        : fetchSessionGroups(filters.from, filters.to, grainOf(filters.from, filters.to)).catch(
            postHogFailed
          ),
      posthogOff
        ? Promise.resolve(null)
        : fetchVisitAudience(filters.from, filters.to).catch(postHogFailed),
      // The identity token is a request header, read here and handed down (see brain-fast).
      fetchAdsSplit(filters.from, filters.to, readVercelOidcToken(request)),
    ]);
    // New or returning for every finisher, for that breakdown; unknown when PostHog fails.
    await markVisitors(facts.subs, (s) => s.startAt).catch((err: unknown) => {
      logger.warn({ err }, "AP traffic: new or returning unavailable");
    });
    // The earlier period at the same age, so "so far" purchases compare like with like.
    const previous = previousRaw ? ageMatched(previousRaw, sameAge(facts, previousRaw, now)) : null;
    return NextResponse.json(
      buildTraffic({ facts, previous, ad, filters, today, now, sessions, audience, ads }),
      { headers: NO_STORE }
    );
  } catch (err) {
    logger.error({ err }, "AP traffic failed");
    return NextResponse.json({ error: "Unable to load the traffic page." }, { status: 500 });
  }
}
