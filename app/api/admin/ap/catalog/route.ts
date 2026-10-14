import { NextResponse } from "next/server";
import { shortDate } from "@features/admin/server/ap/days";
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
import { POSTHOG_FROM } from "@features/admin/server/ap/posthog";
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
        fresh: `Real time, from ${POSTHOG_FROM}`,
        tables: count("posthog"),
      },
      {
        key: "ga4",
        name: "Google Analytics",
        status: gaDay ? "Synced" : "No data",
        ok: Boolean(gaDay),
        description: "GA4 sessions and users by day, for visitors who accepted cookies.",
        fresh: gaDay ? `Nightly, last day ${shortDate(gaDay)} ${gaDay.slice(0, 4)}` : "Nightly",
        tables: count("ga4"),
      },
      {
        key: "ads",
        name: "Google Ads",
        status: adsDay ? "Synced" : "No data",
        ok: Boolean(adsDay),
        description: "Ad spend, clicks and impressions by day, through Google Analytics.",
        fresh: adsDay ? `Nightly, last day ${shortDate(adsDay)} ${adsDay.slice(0, 4)}` : "Nightly",
        tables: count("ads"),
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
