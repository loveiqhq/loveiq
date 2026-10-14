import { NextResponse } from "next/server";
import { z } from "zod";

import {
  buildCatalog,
  GA4_DAYS,
  lastGaDay,
  productionSchema,
} from "@features/admin/server/ap/catalog";
import { apGuard, NO_STORE } from "@features/admin/server/ap/route-guard";
import { countRows, supabaseFetch } from "@features/admin/server/supabase";
import { hogqlTable } from "@features/ux-review/server/review";
import logger from "@shared/observability/logger";

export const dynamic = "force-dynamic";

const QUERY = z.object({
  source: z.enum(["production", "posthog", "ga4", "ads"]),
  table: z.string().regex(/^[a-z_][a-z0-9_]{0,62}$/),
});

/** A day stays a day; a time becomes an ISO instant, for the page to write in Berlin time. */
function instant(v: unknown): string | null {
  if (typeof v !== "string" || !v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const at = new Date(v);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
}

/** The newest value of a production table's date field; null when it cannot be read. */
async function newestOf(table: string, field: string): Promise<string | null> {
  const col = encodeURIComponent(field);
  const res = await supabaseFetch(
    `/rest/v1/${table}?select=${col}&order=${col}.desc.nullslast&limit=1`
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<Record<string, unknown>>;
  // The one column asked for.
  return instant(Object.values(rows[0] ?? {})[0]);
}

/**
 * How many rows a catalog table holds (PostHog: events on the live site), and the newest by
 * its main date field. Not when that date is personal (a birthday): the newest is someone's.
 */
export async function GET(request: Request) {
  const admin = await apGuard(request, { bucket: "admin-ap-catalog-rows", limit: 60 });
  if (admin instanceof NextResponse) return admin;
  const q = QUERY.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!q.success) return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  const { source, table } = q.data;
  try {
    let rows: number | null = null;
    let newest: string | null = null;
    if (source === "production") {
      const known = buildCatalog(await productionSchema(), []).find(
        (t) => t.source === "production" && t.name === table
      );
      if (!known) return NextResponse.json({ error: "No such table." }, { status: 400 });
      const date = known.dateFields[0];
      // Not for a closed table (the audit log): it stays closed, its timing included.
      const dated =
        date && !known.closed && !known.fields.find((f) => f.name === date)?.privacy ? date : null;
      [rows, newest] = await Promise.all([
        countRows(`/rest/v1/${table}?select=*`),
        dated ? newestOf(table, dated) : null,
      ]);
    } else if (source === "posthog" && table === "events") {
      const r = await hogqlTable(
        "SELECT count(), max(timestamp) FROM events WHERE properties.$host = 'www.loveiq.org' LIMIT 1",
        1
      );
      if (r.ok) {
        rows = Number(r.rows[0]?.[0]) || 0;
        // No events, no newest: max() of nothing is the zero time.
        newest = rows ? instant(r.rows[0]?.[1]) : null;
      }
    } else if (source === "ga4" || source === "ads") {
      [rows, newest] = await Promise.all([
        countRows(`${GA4_DAYS}${source === "ads" ? "&meta->>ad_cost=not.is.null" : ""}&select=id`),
        lastGaDay(source === "ads"),
      ]);
    }
    return NextResponse.json({ rows, newest }, { headers: NO_STORE });
  } catch (err) {
    logger.error({ err }, "AP catalog rows failed");
    return NextResponse.json({ error: "Unable to count the rows." }, { status: 500 });
  }
}
