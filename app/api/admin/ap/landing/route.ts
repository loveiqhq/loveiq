import { NextResponse } from "next/server";

import { fetchFacts } from "@features/admin/server/ap/facts";
import { beforeData, comparisonRange, parseFilters } from "@features/admin/server/ap/filters";
import { buildLanding, engagementWindows } from "@features/admin/server/ap/landing";
import {
  postHogFailed,
  fetchLandingEngagement,
  fetchLandingTime,
  type PostHogResult,
} from "@features/admin/server/ap/posthog";
import { apGuard, NO_STORE } from "@features/admin/server/ap/route-guard";
import { reportingDay } from "@shared/time/reporting-day";
import logger from "@shared/observability/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** PostHog failing must not take the page down: its parts say so instead. */
const settle = <T>(p: Promise<PostHogResult<T>>): Promise<PostHogResult<T>> =>
  p.catch(postHogFailed);

/** AP-Analytics, the landing page: six figures, the tests arm by arm, and each version's engagement. */
export async function GET(request: Request) {
  const admin = await apGuard(request, { bucket: "admin-ap-landing" });
  if (admin instanceof NextResponse) return admin;

  const now = new Date();
  const today = reportingDay(now);
  const filters = parseFilters(new URL(request.url).searchParams, today);
  const cmp = comparisonRange(filters);
  try {
    const windows = engagementWindows(filters.from, filters.to, today);
    const [facts, previous, engagement, pageTime, ...perTest] = await Promise.all([
      fetchFacts(filters.from, filters.to),
      cmp && !beforeData(cmp) ? fetchFacts(cmp.from, cmp.to) : Promise.resolve(null),
      settle(fetchLandingEngagement(filters.from, filters.to)),
      settle(fetchLandingTime(filters.from, filters.to)),
      ...windows.map((w) => settle(fetchLandingEngagement(w.from, w.to))),
    ]);
    const armEngagement = Object.fromEntries(windows.map((w, i) => [w.key, perTest[i]!]));
    return NextResponse.json(
      buildLanding({
        facts,
        previous,
        filters,
        today,
        now,
        armEngagement,
        engagement,
        pageTime,
      }),
      {
        headers: NO_STORE,
      }
    );
  } catch (err) {
    logger.error({ err }, "AP landing page failed");
    return NextResponse.json({ error: "Unable to load the landing page." }, { status: 500 });
  }
}
