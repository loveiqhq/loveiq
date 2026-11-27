import { NextResponse } from "next/server";

import { fetchFactsFor } from "@features/admin/server/ap/facts";
import { parseFilters } from "@features/admin/server/ap/filters";
import { buildPayment, FREE_GATE_ON_DAY } from "@features/admin/server/ap/payment";
import { readGateSeen } from "@features/admin/server/ap/gate-seen";
import {
  GATE_PRICE_FROM,
  readPriceTestChoices,
  readPriceTestRows,
} from "@features/admin/server/ap/gate-price-test";
import { apGuard, NO_STORE } from "@features/admin/server/ap/route-guard";
import { readInitialUnlockGateSwitch } from "@features/report/server/initialGateState";
import { readFeatureFlag } from "@shared/flags/system-flags";
import { reportingDay } from "@shared/time/reporting-day";
import logger from "@shared/observability/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** AP-Analytics, Assessment A · Payment: who pays, how, at what price, and the price test. */
export async function GET(request: Request) {
  const admin = await apGuard(request, { bucket: "admin-ap-payment" });
  if (admin instanceof NextResponse) return admin;

  const now = new Date();
  const today = reportingDay(now);
  const filters = parseFilters(new URL(request.url).searchParams, today);

  try {
    const priceTestInRange = filters.to >= GATE_PRICE_FROM;
    const [facts, gateOn, priceOn, gateSeen, priceRows, priceChoices] = await Promise.all([
      fetchFactsFor(filters.from, filters.to, filters),
      // The report's EUR 1.99 gate, for its payment type's line: null when the switch can't be
      // read (the gate itself reads that as off), and the line says so.
      readInitialUnlockGateSwitch().catch((err: unknown) => {
        logger.warn({ err }, "AP payment: the EUR 1.99 gate's switch could not be read");
        return null;
      }),
      // The price test's switch, for choose your price's payment type: null when unreadable,
      // which its line says, never read as off.
      readFeatureFlag("report_gate_choose_price", false),
      // Who saw the EUR 1.99 page: the payment types' "Paywall shown" and the price test's
      // "Reached the paywall" (blank without).
      filters.to < FREE_GATE_ON_DAY
        ? null
        : readGateSeen(filters.from).catch((err: unknown) => {
            logger.warn({ err }, "AP payment: the EUR 1.99 page's viewers could not be read");
            return null;
          }),
      // The price test's halves, every one since it could begin (a range's sale can come from
      // a survey finished before the range), and the choosing half's picks: its section and
      // the pre-unlock rows say so when either fails.
      priceTestInRange
        ? readPriceTestRows(GATE_PRICE_FROM, filters.to).catch((err: unknown) => {
            logger.warn({ err }, "AP payment: the price test's halves could not be read");
            return null;
          })
        : null,
      priceTestInRange
        ? readPriceTestChoices(filters.from).catch((err: unknown) => {
            logger.warn({ err }, "AP payment: the price test's picks could not be read");
            return null;
          })
        : null,
    ]);
    return NextResponse.json(
      buildPayment({
        facts,
        filters,
        today,
        now,
        gateOn,
        priceOn,
        gateSeen,
        priceRows,
        priceChoices,
      }),
      {
        headers: NO_STORE,
      }
    );
  } catch (err) {
    logger.error({ err }, "AP payment failed");
    return NextResponse.json({ error: "Unable to load the payment page." }, { status: 500 });
  }
}
