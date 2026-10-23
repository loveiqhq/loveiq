import { NextResponse } from "next/server";

import { parseFilters } from "@features/admin/server/ap/filters";
import {
  buildPayToStart,
  fetchAdsByLanding,
  fetchPayToStartRecords,
} from "@features/admin/server/ap/pay-to-start";
import { apGuard, NO_STORE } from "@features/admin/server/ap/route-guard";
import { readVercelOidcToken } from "@shared/http/google-oauth";
import { reportingDay } from "@shared/time/reporting-day";
import logger from "@shared/observability/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** AP-Analytics, Assessment A · Pay to start: the pay-first funnel, its ads and what they cost. */
export async function GET(request: Request) {
  const admin = await apGuard(request, { bucket: "admin-ap-pay-to-start" });
  if (admin instanceof NextResponse) return admin;

  const today = reportingDay(new Date());
  const filters = parseFilters(new URL(request.url).searchParams, today);

  try {
    const [records, ads] = await Promise.all([
      fetchPayToStartRecords(filters),
      // The identity token is a request header, read here and handed down (see brain-fast).
      fetchAdsByLanding(filters.from, filters.to, readVercelOidcToken(request)),
    ]);
    return NextResponse.json(
      buildPayToStart({ ...records, ads, from: filters.from, to: filters.to, today }),
      { headers: NO_STORE }
    );
  } catch (err) {
    logger.error({ err }, "AP pay to start failed");
    return NextResponse.json({ error: "Unable to load the pay-to-start page." }, { status: 500 });
  }
}
