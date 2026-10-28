import { NextResponse } from "next/server";
import { addDays, shortDate } from "@features/admin/server/ap/days";
import { reportingDay } from "@shared/time/reporting-day";
import { z } from "zod";

import { logAdminAction } from "@features/admin/server/audit";
import {
  buildCatalog,
  fetchNotes,
  lastGaDay,
  productionSchema,
  SOURCE_KEYS,
  type CatalogPayload,
  type CatalogSource,
  type SourceKey,
} from "@features/admin/server/ap/catalog";
import { apGuard, NO_STORE } from "@features/admin/server/ap/route-guard";
import { supabaseFetch } from "@features/admin/server/supabase";
import { getClientIp } from "@shared/http/ratelimit";
import { verifyCsrfToken } from "@shared/http/csrf";
import logger from "@shared/observability/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** AP-Analytics, the data catalog: sources, tables and fields, with the team's notes. */
export async function GET(request: Request) {
  const admin = await apGuard(request, { bucket: "admin-ap-catalog" });
  if (admin instanceof NextResponse) return admin;
  try {
    const [schema, notes, gaDay, adsDay] = await Promise.all([
      productionSchema().catch((err: unknown) => {
        logger.error({ err }, "AP catalog schema read failed");
        return null;
      }),
      fetchNotes(),
      lastGaDay(false),
      lastGaDay(true),
    ]);
    const tables = buildCatalog(schema ?? [], notes);
    const count = (k: SourceKey) => tables.filter((t) => t.source === k).length;
    // Both sync every 15 minutes with today's partial day: a last day before yesterday means the
    // syncs have stopped (just after midnight the new day may not have rows yet).
    const behind = (day: string | null) =>
      day !== null && day < addDays(reportingDay(new Date()), -1);
    const posthog = Boolean(process.env.POSTHOG_API_KEY);
    const sources: CatalogSource[] = [
      {
        key: "production",
        name: "Production",
        status: schema ? "Live" : "Unreachable",
        ok: Boolean(schema),
        description:
          "The app database: surveys, answers, reports, payments, prices, visits and email.",
        fresh: "Real time",
        tables: count("production"),
      },
      {
        key: "posthog",
        name: "PostHog",
        status: posthog ? "Connected" : "Not set up",
        ok: posthog,
        description:
          "Product events and visits from the site and the report, for part of the visitors.",
        // Its first day is in the events table's description; the page swaps in the last event.
        fresh: "Real time",
        tables: count("posthog"),
      },
      // The cards say what each source holds, in a line; what to watch out for (who is
      // counted, what is read live, the days still filling in) is in its tables' descriptions.
      {
        key: "ga4",
        name: "Google Analytics",
        status: gaDay ? (behind(gaDay) ? "Behind" : "Synced") : "No data",
        ok: Boolean(gaDay) && !behind(gaDay),
        description: "GA4 sessions, users, channels, pages and events by day.",
        // How fresh, and the last day it holds: a stalled sync shows here.
        fresh: gaDay ? `Every 15 minutes, to ${shortDate(gaDay)}` : "Every 15 minutes",
        tables: count("ga4"),
      },
      {
        key: "ads",
        name: "Google Ads",
        status: adsDay ? (behind(adsDay) ? "Behind" : "Synced") : "No data",
        ok: Boolean(adsDay) && !behind(adsDay),
        description:
          "Campaign spend, clicks and conversions, by campaign, keyword, device and country.",
        fresh: adsDay ? `Every 15 minutes, to ${shortDate(adsDay)}` : "Every 15 minutes",
        tables: count("ads"),
      },
      {
        key: "gsc",
        name: "Search Console",
        status: process.env.SEARCH_CONSOLE_SITE ? "Live" : "Not set up",
        ok: Boolean(process.env.SEARCH_CONSOLE_SITE),
        description: "Google Search clicks, impressions and position, by search and page.",
        fresh: "Live, 2–3 days behind",
        tables: count("gsc"),
      },
    ];
    const payload: CatalogPayload = { sources, tables, generatedAt: new Date().toISOString() };
    return NextResponse.json(payload, { headers: NO_STORE });
  } catch (err) {
    logger.error({ err }, "AP catalog failed");
    return NextResponse.json({ error: "Unable to load the catalog." }, { status: 500 });
  }
}

const NOTE = z.object({
  source: z.enum(SOURCE_KEYS as [SourceKey, ...SourceKey[]]),
  table: z.string().min(1).max(63),
  /** Empty for the table itself. */
  column: z.string().max(80),
  /** Empty removes the team's note (the draft or the database's comment shows again). */
  description: z.string().trim().max(600),
});

/** Write, or clear, the team's description of a table or field. */
export async function PUT(request: Request) {
  if (!(await verifyCsrfToken(request))) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }
  const admin = await apGuard(request, {
    bucket: "admin-ap-catalog-write",
    role: "editor",
    write: true,
  });
  if (admin instanceof NextResponse) return admin;
  const parsed = NOTE.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  const { source, table, column, description } = parsed.data;
  try {
    const schema = source === "production" ? await productionSchema() : [];
    const known = buildCatalog(schema, []).find((t) => t.source === source && t.name === table);
    if (!known || (column && !known.fields.some((f) => f.name === column))) {
      return NextResponse.json({ error: "No such table or field." }, { status: 400 });
    }
    const key = `source=eq.${source}&relation=eq.${encodeURIComponent(table)}&field=eq.${encodeURIComponent(column)}`;
    const res = description
      ? await supabaseFetch("/rest/v1/admin_field_note?on_conflict=source,relation,field", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify({
            source,
            relation: table,
            field: column,
            description,
            updated_by: admin.email,
            updated_at: new Date().toISOString(),
          }),
        })
      : await supabaseFetch(`/rest/v1/admin_field_note?${key}`, {
          method: "DELETE",
          headers: { Prefer: "return=minimal" },
        });
    if (!res.ok) throw new Error(`field note ${res.status}`);
    void logAdminAction({
      admin_email: admin.email,
      action: description ? "ap_field_note_saved" : "ap_field_note_cleared",
      resource_type: "catalog_field",
      resource_id: `${source}.${table}${column ? `.${column}` : ""}`,
      ip: getClientIp(request),
    });
    return NextResponse.json({ success: true }, { headers: NO_STORE });
  } catch (err) {
    logger.error({ err }, "AP field note failed");
    return NextResponse.json({ error: "Unable to save the description." }, { status: 500 });
  }
}
