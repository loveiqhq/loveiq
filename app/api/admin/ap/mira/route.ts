import { NextResponse } from "next/server";

import { parseFilters } from "@features/admin/server/ap/filters";
import { buildMiraPage, fetchMira } from "@features/admin/server/ap/mira";
import { apGuard, NO_STORE } from "@features/admin/server/ap/route-guard";
import { reportingDay } from "@shared/time/reporting-day";
import logger from "@shared/observability/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** AP-Analytics, Mira (beta): the AI coach's success figures from her own tables. */
export async function GET(request: Request) {
  const admin = await apGuard(request, { bucket: "admin-ap-mira" });
  if (admin instanceof NextResponse) return admin;

  const now = new Date();
  const today = reportingDay(now);
  const filters = parseFilters(new URL(request.url).searchParams, today);

  try {
    const data = await fetchMira();
    return NextResponse.json(buildMiraPage({ data, filters, today, now }), { headers: NO_STORE });
  } catch (err) {
    logger.error({ err }, "AP mira page failed");
    return NextResponse.json({ error: "Unable to load the Mira page." }, { status: 500 });
  }
}
