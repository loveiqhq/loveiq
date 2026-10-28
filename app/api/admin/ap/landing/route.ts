import { NextResponse } from "next/server";

import { fetchFacts } from "@features/admin/server/ap/facts";
import { beforeData, comparisonRange, parseFilters } from "@features/admin/server/ap/filters";
import { buildLanding, engagementWindows } from "@features/admin/server/ap/landing";
import { payToStartFor } from "@features/admin/server/ap/pay-to-start";
import {
  postHogFailed,
  fetchLandingEngagement,
  fetchLandingTime,
  type PostHogResult,
} from "@features/admin/server/ap/posthog";
import { apGuard, NO_STORE } from "@features/admin/server/ap/route-guard";
import { readVercelOidcToken } from "@shared/http/google-oauth";
import { readInitialUnlockGateSwitch } from "@features/report/server/initialGateState";
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
  // "Free survey" sells the EUR 1.99 only through the report's gate: its switch, for the
  // pre-unlock rate (null when it can't be read, and the tile says so).
  const gateRead =
    filters.funnel === "free"
      ? readInitialUnlockGateSwitch().catch(() => null)
      : Promise.resolve(null);
  try {
    const windows = engagementWindows(filters.from, filters.to, today);
    const factsRead = fetchFacts(filters.from, filters.to);
    const [facts, previous, engagement, pageTime, pts, ...perTest] = await Promise.all([
      factsRead,
      cmp && !beforeData(cmp) ? fetchFacts(cmp.from, cmp.to) : Promise.resolve(null),
      settle(fetchLandingEngagement(filters.from, filters.to)),
      settle(fetchLandingTime(filters.from, filters.to)),
      // The pay-to-start pages, as the Pay to start page counts them.
      factsRead.then((f) => payToStartFor(filters, f, today, readVercelOidcToken(request))),
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
        pts,
        gateOn: await gateRead,
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
