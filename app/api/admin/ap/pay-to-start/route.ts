import { NextResponse } from "next/server";

import { fetchFacts } from "@features/admin/server/ap/facts";
import { parseFilters } from "@features/admin/server/ap/filters";
import { buildGateTest, readGateTestRows } from "@features/admin/server/ap/gate-reveal-test";
import { ALL, subsIn } from "@features/admin/server/ap/metrics";
import {
  BEFORE_PAYWALL,
  buildPayToStart,
  fetchAdsByLanding,
  fetchPayToStartRecords,
  funnelAndPaywall,
  payToStartPrices,
} from "@features/admin/server/ap/pay-to-start";
import { readGateSeen } from "@features/admin/server/ap/gate-seen";
import { apGuard, NO_STORE } from "@features/admin/server/ap/route-guard";
import { GATE_REVEAL_START_AT } from "@shared/experiments/gateRevealArm";
import { readVercelOidcToken } from "@shared/http/google-oauth";
import { reportingDay } from "@shared/time/reporting-day";
import logger from "@shared/observability/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * AP-Analytics, Assessment A · Funnel and paywall (the Pay to start page, renamed by Marcus on
 * 19 Nov 2026): the running paywall test (#11), and the free funnel before the paywall
 * (BEFORE_PAYWALL) beside the EUR 1.99 page's funnel over the range.
 */
export async function GET(request: Request) {
  const admin = await apGuard(request, { bucket: "admin-ap-pay-to-start" });
  if (admin instanceof NextResponse) return admin;

  const today = reportingDay(new Date());
  const filters = parseFilters(new URL(request.url).searchParams, today);

  const before = parseFilters(
    { period: "custom", from: BEFORE_PAYWALL.from, to: BEFORE_PAYWALL.to },
    today
  );
  // The identity token is a request header, read here and handed down (see brain-fast).
  const token = readVercelOidcToken(request);
  const testOn = filters.to >= reportingDay(new Date(GATE_REVEAL_START_AT));
  try {
    const [facts, records, ads, beforeFacts, beforeRecords, beforeAds, gateRows, gateSeen] =
      await Promise.all([
        fetchFacts(filters.from, filters.to),
        fetchPayToStartRecords(filters),
        fetchAdsByLanding(filters.from, filters.to, token),
        fetchFacts(before.from, before.to),
        fetchPayToStartRecords(before),
        fetchAdsByLanding(before.from, before.to, token),
        // #11's halves and who reached the EUR 1.99 page, from the day it began: its section
        // says so when either fails, and the page still loads.
        testOn
          ? readGateTestRows(filters.from).catch((err: unknown) => {
              logger.warn({ err }, "AP funnel and paywall: #11's halves could not be read");
              return null;
            })
          : null,
        testOn
          ? readGateSeen(filters.from).catch((err: unknown) => {
              logger.warn({ err }, "AP funnel and paywall: the EUR 1.99 page's viewers unread");
              return null;
            })
          : null,
      ]);
    const prices = payToStartPrices();
    const range = { from: filters.from, to: filters.to, today, prices };
    return NextResponse.json(
      funnelAndPaywall(
        buildPayToStart({ ...records, facts, ads, ...range }),
        buildPayToStart({
          ...beforeRecords,
          facts: beforeFacts,
          ads: beforeAds,
          ...range,
          from: before.from,
          to: before.to,
        }),
        // As on AP › Payment, over every free finisher: this page's filters are fixed.
        buildGateTest({
          subs: subsIn(facts, ALL),
          rows: gateRows,
          gateSeen,
          blocked: null,
          from: filters.from,
          to: filters.to,
          today,
        })
      ),
      { headers: NO_STORE }
    );
  } catch (err) {
    logger.error({ err }, "AP pay to start failed");
    return NextResponse.json({ error: "Unable to load the pay-to-start page." }, { status: 500 });
  }
}
