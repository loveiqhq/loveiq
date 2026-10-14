import { NextResponse } from "next/server";
import { z } from "zod";

import { buildCatalog, productionSchema } from "@features/admin/server/ap/catalog";
import { DAY, LOOKS_PERSONAL_VALUE, VIEW, viewRefusal } from "@features/admin/server/ap/explorer";
import {
  ASSESSMENTS,
  COMPARES,
  DEVICES,
  PERIODS,
  SOURCES,
  TIERS,
  VISITORS,
} from "@features/admin/server/ap/filters";
import { apGuard, NO_STORE } from "@features/admin/server/ap/route-guard";
import { supabaseFetch } from "@features/admin/server/supabase";
import { verifyCsrfToken } from "@shared/http/csrf";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import logger from "@shared/observability/logger";

/**
 * AP-Analytics saved filters (the filter bar) and saved views (the raw data explorer):
 * your own, and those the team shared. Only the owner can delete one.
 */
const KIND = z.enum(["filter", "explorer"]);

// The URL parameters of a state: strings only, never a nested object. A view's columns and
// filters run long (the explorer takes up to 4,000 characters of each).
const PARAMS = z
  .record(z.string().regex(/^[a-z_]{1,20}$/), z.string().max(4000))
  .refine((p) => Object.keys(p).length <= 30, "too many parameters")
  .refine((p) => JSON.stringify(p).length <= 9000, "too long");

const values = <T extends { value: string }>(list: readonly T[]) =>
  z.enum(list.map((x) => x.value) as [T["value"], ...Array<T["value"]>]);

/** A saved filter-bar state: the bar's own parameters (filterParams) and nothing else. */
const FILTER_STATE = z
  .object({
    period: values(PERIODS).optional(),
    from: DAY.optional(),
    to: DAY.optional(),
    compare: values(COMPARES).optional(),
    assessment: values(ASSESSMENTS).optional(),
    source: values(SOURCES).optional(),
    device: values(DEVICES).optional(),
    tier: values(TIERS).optional(),
    visitor: values(VISITORS).optional(),
  })
  .strict();

const CREATE = z.object({
  kind: KIND,
  name: z.string().trim().min(1).max(80),
  shared: z.boolean(),
  filters: PARAMS,
});

interface Row {
  id: number;
  admin_email: string;
  title: string;
  filters: Record<string, string>;
  is_shared: boolean;
  created_at: string;
}

export async function GET(request: Request) {
  const admin = await apGuard(request, { bucket: "admin-ap-saved" });
  if (admin instanceof NextResponse) return admin;
  const kind = KIND.safeParse(new URL(request.url).searchParams.get("kind"));
  if (!kind.success) return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  try {
    const res = await supabaseFetch(
      `/rest/v1/admin_ap_saved_filter?kind=eq.${kind.data}&or=(admin_email.eq.${encodeURIComponent(admin.email)},is_shared.eq.true)` +
        "&select=id,admin_email,title,filters,is_shared,created_at&order=created_at.asc&limit=200"
    );
    if (!res.ok) throw new Error(`saved filters ${res.status}`);
    const rows = (await res.json()) as Row[];
    return NextResponse.json(
      {
        saved: rows.map((r) => ({
          id: r.id,
          name: r.title,
          filters: r.filters,
          is_shared: r.is_shared,
          mine: r.admin_email === admin.email,
          owner: r.admin_email.split("@")[0],
        })),
      },
      { headers: NO_STORE }
    );
  } catch (err) {
    logger.error({ err }, "AP saved filters GET failed");
    return NextResponse.json({ error: "Unable to load saved filters." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!(await verifyCsrfToken(request))) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }
  const rate = await checkRateLimit(getClientIp(request), {
    bucket: "admin-ap-saved-write",
    limit: 10,
    windowMs: 60_000,
  });
  if (!rate.allowed)
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  const admin = await apGuard(request, { role: "editor", write: true });
  if (admin instanceof NextResponse) return admin;
  const parsed = CREATE.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  // The name is shown to the whole team when shared: no one's address or link in it.
  if (LOOKS_PERSONAL_VALUE.test(parsed.data.name)) {
    return NextResponse.json(
      { error: "Not saved: a name cannot hold an email address or a report link." },
      { status: 400 }
    );
  }
  try {
    if (parsed.data.kind === "explorer") {
      const v = VIEW.safeParse(parsed.data.filters);
      if (!v.success) return NextResponse.json({ error: "Invalid input." }, { status: 400 });
      const schema = v.data.source === "production" ? await productionSchema() : [];
      const refusal = viewRefusal(
        buildCatalog(schema, []).find((t) => t.source === v.data.source && t.name === v.data.table),
        v.data
      );
      if (refusal) return NextResponse.json({ error: refusal }, { status: 400 });
    } else if (!FILTER_STATE.safeParse(parsed.data.filters).success) {
      return NextResponse.json({ error: "Invalid input." }, { status: 400 });
    }
    const res = await supabaseFetch("/rest/v1/admin_ap_saved_filter", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        admin_email: admin.email,
        kind: parsed.data.kind,
        title: parsed.data.name,
        filters: parsed.data.filters,
        is_shared: parsed.data.shared,
      }),
    });
    if (!res.ok) throw new Error(`saved filter insert ${res.status}`);
    const [row] = (await res.json()) as Row[];
    return NextResponse.json({ success: true, id: row?.id ?? null });
  } catch (err) {
    logger.error({ err }, "AP saved filters POST failed");
    return NextResponse.json({ error: "Unable to save the filter." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!(await verifyCsrfToken(request))) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }
  const rate = await checkRateLimit(getClientIp(request), {
    bucket: "admin-ap-saved-write",
    limit: 10,
    windowMs: 60_000,
  });
  if (!rate.allowed)
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  const admin = await apGuard(request, { role: "editor", write: true });
  if (admin instanceof NextResponse) return admin;
  const id = z.coerce
    .number()
    .int()
    .positive()
    .safeParse(new URL(request.url).searchParams.get("id"));
  if (!id.success) return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  try {
    // Only the owner's own row: someone else's shared filter is not theirs to remove.
    const res = await supabaseFetch(
      `/rest/v1/admin_ap_saved_filter?id=eq.${id.data}&admin_email=eq.${encodeURIComponent(admin.email)}`,
      { method: "DELETE", headers: { Prefer: "return=representation" } }
    );
    if (!res.ok) throw new Error(`saved filter delete ${res.status}`);
    const deleted = (await res.json()) as Row[];
    if (deleted.length === 0) return NextResponse.json({ error: "Not found." }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error({ err }, "AP saved filters DELETE failed");
    return NextResponse.json({ error: "Unable to delete the filter." }, { status: 500 });
  }
}
