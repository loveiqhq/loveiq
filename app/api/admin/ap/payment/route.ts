import { NextResponse } from "next/server";

import { fetchFactsFor } from "@features/admin/server/ap/facts";
import { parseFilters } from "@features/admin/server/ap/filters";
import { peopleBlocked } from "@features/admin/server/ap/metrics";
import {
  buildPayment,
  CHECKOUT_FROM,
  fitMonths,
  type UpliftFlag,
} from "@features/admin/server/ap/payment";
import { apGuard, NO_STORE } from "@features/admin/server/ap/route-guard";
import { supabaseFetch } from "@features/admin/server/supabase";
import { readInitialUnlockGateSwitch } from "@features/report/server/initialGateState";
import { reportingDay } from "@shared/time/reporting-day";
import logger from "@shared/observability/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Whether per-visitor prices are switched on, as the pricing reads it; null when unreadable. */
async function upliftFlag(): Promise<UpliftFlag | null> {
  try {
    const res = await supabaseFetch(
      // eslint-disable-next-line no-secrets/no-secrets -- a PostgREST query path, not a secret
      "/rest/v1/system_flags?key=eq.pricing_uplift_enabled&select=enabled,updated_at&limit=1"
    );
    if (!res.ok) return null;
    const [row] = (await res.json()) as Array<{ enabled?: unknown; updated_at?: unknown }>;
    // No row: the pricing reads the flag as off (isFeatureEnabled's default).
    return row
      ? {
          enabled: row.enabled === true,
          updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
        }
      : { enabled: false, updatedAt: null };
  } catch (err) {
    logger.warn({ err }, "AP payment: the price switch could not be read");
    return null;
  }
}

/** AP-Analytics, Assessment A · Payment: who pays, how, at what price, and the price tests. */
export async function GET(request: Request) {
  const admin = await apGuard(request, { bucket: "admin-ap-payment" });
  if (admin instanceof NextResponse) return admin;

  const now = new Date();
  const today = reportingDay(now);
  const filters = parseFilters(new URL(request.url).searchParams, today);

  // The price-elasticity model fits every whole month since paid checkout began, whatever the
  // range's start: those months' own facts, unless the range's cover them (or a filter can't
  // follow them back, and the model is blank).
  const fit = peopleBlocked(filters, CHECKOUT_FROM) ? null : fitMonths(filters.to);

  try {
    const [facts, uplift, fitFacts, gateOn] = await Promise.all([
      fetchFactsFor(filters.from, filters.to, filters),
      upliftFlag(),
      fit && fit.from < filters.from ? fetchFactsFor(fit.from, fit.to, filters) : null,
      // The report's EUR 1.99 gate, for its payment type's line: null when the switch can't be
      // read (the gate itself reads that as off), and the line says so.
      readInitialUnlockGateSwitch().catch((err: unknown) => {
        logger.warn({ err }, "AP payment: the EUR 1.99 gate's switch could not be read");
        return null;
      }),
    ]);
    return NextResponse.json(
      buildPayment({ facts, filters, today, now, uplift, fitFacts, gateOn }),
      {
        headers: NO_STORE,
      }
    );
  } catch (err) {
    logger.error({ err }, "AP payment failed");
    return NextResponse.json({ error: "Unable to load the payment page." }, { status: 500 });
  }
}
