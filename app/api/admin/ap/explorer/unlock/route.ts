import { NextResponse } from "next/server";
import { z } from "zod";

import { buildCatalog, productionSchema } from "@features/admin/server/ap/catalog";
import { signUnlock, UNLOCK_MINUTES } from "@features/admin/server/ap/explorer";
import { apGuard, NO_STORE } from "@features/admin/server/ap/route-guard";
import { supabaseFetch } from "@features/admin/server/supabase";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import { verifyCsrfToken } from "@shared/http/csrf";
import logger from "@shared/observability/logger";

export const dynamic = "force-dynamic";

const BODY = z.object({
  source: z.enum(["production", "posthog"]),
  table: z.string().min(1).max(63),
  reason: z.string().trim().min(10).max(300),
});

/**
 * Unlock one table's personal fields in the raw data explorer for 15 minutes. Admins only,
 * with a reason; the unlock and its reason go to the admin audit log.
 */
export async function POST(request: Request) {
  if (!(await verifyCsrfToken(request))) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }
  const rate = await checkRateLimit(getClientIp(request), {
    bucket: "admin-ap-explorer-unlock",
    limit: 5,
    windowMs: 60_000,
  });
  if (!rate.allowed)
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  const admin = await apGuard(request, { role: "admin", write: true });
  if (admin instanceof NextResponse) return admin;
  const parsed = BODY.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Give a reason of at least 10 characters." },
      { status: 400 }
    );
  const { source, table, reason } = parsed.data;
  try {
    const schema = source === "production" ? await productionSchema() : [];
    const t = buildCatalog(schema, []).find((x) => x.source === source && x.name === table);
    if (!t) return NextResponse.json({ error: "No such table." }, { status: 400 });
    // A closed table stays closed: no unlock to log for a read that would be refused anyway.
    if (t.closed) return NextResponse.json({ error: t.closed }, { status: 400 });
    const until = Date.now() + UNLOCK_MINUTES * 60_000;
    // Written, and checked, before the unlock is handed out: an unlock nobody can account
    // for must not exist (logAdminAction never fails, so it is not used here).
    const logged = await supabaseFetch("/rest/v1/admin_audit_log", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        admin_email: admin.email,
        action: "ap_explorer_unlock",
        resource_type: "table",
        resource_id: `${source}.${table}`,
        metadata: { reason, until: new Date(until).toISOString() },
        ip: getClientIp(request),
      }),
    });
    if (!logged.ok) throw new Error(`audit log ${logged.status}`);
    return NextResponse.json(
      {
        token: signUnlock(admin.email, `${source}.${table}`, until),
        until: new Date(until).toISOString(),
      },
      { headers: NO_STORE }
    );
  } catch (err) {
    logger.error({ err }, "AP explorer unlock failed");
    return NextResponse.json({ error: "Unable to unlock." }, { status: 500 });
  }
}
