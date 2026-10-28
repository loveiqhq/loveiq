import { NextResponse } from "next/server";

import { lastGaDay } from "@features/admin/server/ap/catalog";
import { teamVisits } from "@features/admin/server/ap/posthog";
import { apGuard, NO_STORE } from "@features/admin/server/ap/route-guard";
import { supabaseFetch } from "@features/admin/server/supabase";
import { hogqlTable } from "@features/ux-review/server/review";
import logger from "@shared/observability/logger";

export const dynamic = "force-dynamic";

/**
 * The sidebar's footer: who is signed in, and how fresh Google Analytics and PostHog are; and
 * the team's own PostHog visits, which the info cards write into their PostHog queries.
 */
export async function GET(request: Request) {
  const admin = await apGuard(request, { bucket: "admin-ap-status", limit: 60 });
  if (admin instanceof NextResponse) return admin;
  try {
    const [db, gaDay, ph, team] = await Promise.all([
      supabaseFetch("/rest/v1/survey?select=id&limit=1")
        .then((r) => r.ok)
        .catch(() => false),
      // GA4's own last day, not Google Ads' (which can lag it): the line is about GA4.
      lastGaDay(false),
      hogqlTable(
        "SELECT max(timestamp) FROM events WHERE properties.$host = 'www.loveiq.org' AND timestamp > now() - INTERVAL 2 DAY",
        1
      ),
      teamVisits(),
    ]);
    const last = ph.ok ? ph.rows[0]?.[0] : null;
    return NextResponse.json(
      {
        email: admin.email,
        role: admin.role,
        production: { ok: db },
        ga4: { lastDay: gaDay },
        // Reachable but quiet (no event in two days) is not the same as unreachable.
        posthog: ph.ok
          ? { ok: true, lastEvent: last ? new Date(String(last)).toISOString() : null }
          : { ok: false, lastEvent: null },
        teamVisits: team,
      },
      { headers: NO_STORE }
    );
  } catch (err) {
    logger.error({ err }, "AP status failed");
    return NextResponse.json({ error: "Unable to load the status." }, { status: 500 });
  }
}
