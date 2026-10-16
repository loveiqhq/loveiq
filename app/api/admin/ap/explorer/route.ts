import { NextResponse } from "next/server";
import { z } from "zod";

import { logAdminAction } from "@features/admin/server/audit";
import {
  buildCatalog,
  productionSchema,
  SOURCE_KEYS,
  type SourceKey,
} from "@features/admin/server/ap/catalog";
import {
  checkQuery,
  checkUnlock,
  dailyRows,
  DAY,
  EXPORT_MAX,
  PAGE_SIZES,
  parseFilterJson,
  posthogRows,
  productionRows,
  Refused,
  restrictedPeople,
  type ExplorerQuery,
} from "@features/admin/server/ap/explorer";
import { apGuard, NO_STORE } from "@features/admin/server/ap/route-guard";
import { supabaseFetch } from "@features/admin/server/supabase";
import { toCsv } from "@features/admin/server/team-export";
import { getClientIp } from "@shared/http/ratelimit";
import logger from "@shared/observability/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const QUERY = z.object({
  source: z.enum(SOURCE_KEYS as [SourceKey, ...SourceKey[]]),
  table: z.string().min(1).max(63),
  date: z.string().max(63).optional(),
  from: DAY,
  to: DAY,
  filters: z
    .string()
    .max(4000)
    .optional()
    .transform((s, ctx) => {
      const parsed = parseFilterJson(s);
      if (parsed === null) {
        ctx.addIssue({ code: "custom", message: "bad filters" });
        return z.NEVER;
      }
      return parsed;
    }),
  cols: z.string().min(1).max(4000),
  sort: z.string().max(80).optional(),
  dir: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  size: z.coerce
    .number()
    .int()
    .refine((n) => (PAGE_SIZES as readonly number[]).includes(n))
    .default(50),
  unlock: z.string().max(600).optional(),
  cursor: z.string().max(40).optional(),
  format: z.enum(["json", "csv"]).default("json"),
});

/**
 * AP-Analytics, the raw data explorer: a page of rows (or a CSV of up to 10,000), masked
 * unless the admin unlocked the table (POST ./unlock).
 */
export async function GET(request: Request) {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const csv = params.format === "csv";
  // An export is the heavier read and the one that leaves the admin: its own role and limit.
  const admin = await apGuard(
    request,
    csv
      ? { bucket: "admin-ap-explorer-export", role: "admin", limit: 5 }
      : { bucket: "admin-ap-explorer" }
  );
  if (admin instanceof NextResponse) return admin;
  const parsed = QUERY.safeParse(params);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  const p = parsed.data;
  if (p.from > p.to)
    return NextResponse.json({ error: "The range ends before it starts." }, { status: 400 });

  try {
    const schema = p.source === "production" ? await productionSchema() : [];
    const table = buildCatalog(schema, []).find((t) => t.source === p.source && t.name === p.table);
    if (!table) return NextResponse.json({ error: "No such table." }, { status: 400 });
    if (table.closed) return NextResponse.json({ error: table.closed }, { status: 400 });
    // PostHog keeps the same people's visits: paused with the database. GA4 and Ads hold no one.
    const personal = p.source === "production" || p.source === "posthog";
    if (personal && (await restrictedPeople()) > 0) {
      // As the team copy does (team-export.ts assertNobodyRestricted): a person decides.
      return NextResponse.json(
        {
          error:
            "The explorer is paused: someone asked us to restrict processing their data (GDPR Art. 18). See docs/runbooks/TEAM_DATA_EXPORT.md.",
        },
        { status: 409 }
      );
    }
    // Google Analytics and Ads days hold no one's details: nothing to mask there.
    // An unlock counts only for the admin it was issued to, while they are still an admin.
    const masked =
      personal &&
      !(
        admin.role === "admin" &&
        checkUnlock(p.unlock ?? null, admin.email, `${p.source}.${p.table}`)
      );

    const q: ExplorerQuery = {
      dateField: p.date ? p.date : null,
      from: p.from,
      to: p.to,
      filters: p.filters,
      columns: [
        ...new Set(
          p.cols
            .split(",")
            .map((c) => c.trim())
            .filter(Boolean)
        ),
      ],
      sort: p.sort || null,
      dir: p.dir,
      page: p.page,
      size: p.size,
      cursor: p.cursor ?? null,
    };
    if (p.source !== "production") q.dateField = table.dateFields[0] ?? null;
    checkQuery(table, q, masked);

    const now = new Date();
    if (csv) {
      if (p.source !== "production") {
        // PostHog is capped: export what one large page holds. The Google tables hold a row
        // per channel or campaign per day, so they can pass 1,000: export them like production.
        const r =
          p.source === "posthog"
            ? await posthogRows(table, { ...q, page: 1, size: 200, cursor: null }, masked, now)
            : await dailyRows(table, { ...q, page: 1, size: EXPORT_MAX });
        return await csvResponse(
          r.rows,
          r.columns,
          `${p.source}-${p.table}-${p.from}-${p.to}`,
          admin.email,
          request,
          p,
          personal && !masked
        );
      }
      const r = await productionRows(table, q, masked, now, EXPORT_MAX);
      return await csvResponse(
        r.rows,
        r.columns,
        `${p.table}-${p.from}-${p.to}`,
        admin.email,
        request,
        p,
        !masked
      );
    }

    const result =
      p.source === "production"
        ? await productionRows(table, q, masked, now)
        : p.source === "posthog"
          ? await posthogRows(table, q, masked, now)
          : await dailyRows(table, q);
    return NextResponse.json(result, { headers: NO_STORE });
  } catch (err) {
    if (err instanceof Refused) return NextResponse.json({ error: err.message }, { status: 400 });
    logger.error({ err }, "AP explorer failed");
    return NextResponse.json({ error: "Unable to read the table." }, { status: 500 });
  }
}

async function csvResponse(
  rows: Array<Record<string, unknown>>,
  columns: string[],
  name: string,
  email: string,
  request: Request,
  p: z.infer<typeof QUERY>,
  unmasked: boolean
) {
  const entry = {
    admin_email: email,
    action: unmasked ? "ap_explorer_export_unmasked" : "ap_explorer_export",
    resource_type: "table",
    resource_id: `${p.source}.${p.table}`,
    metadata: {
      rows: rows.length,
      from: p.from,
      to: p.to,
      date: p.date ?? null,
      filters: p.filters,
      columns,
    },
    ip: getClientIp(request),
  };
  if (!unmasked) {
    void logAdminAction(entry);
  } else {
    // An unmasked file leaves only once its record is written (logAdminAction never fails).
    const logged = await supabaseFetch("/rest/v1/admin_audit_log", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(entry),
    });
    if (!logged.ok) {
      return NextResponse.json(
        { error: "The export could not be logged, so it was not made." },
        { status: 500 }
      );
    }
  }
  return new NextResponse(`﻿${toCsv(rows, columns)}`, {
    headers: {
      ...NO_STORE,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name.replace(/[^a-z0-9_.-]/gi, "_")}${unmasked ? "-unmasked" : ""}.csv"`,
    },
  });
}
