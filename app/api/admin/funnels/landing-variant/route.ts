import { NextResponse } from "next/server";
import { verifyAdminSession } from "@features/admin/server/auth";
import { hasRole } from "@features/admin/server/roles";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import { supabaseFetch } from "@features/admin/server/supabase";
import logger from "@shared/observability/logger";
import { armLabel } from "@features/attribution/server/labels";

interface VariantRow {
  variant: string;
  completed: number;
  paid: number;
  revenue: number;
}

/**
 * Landing-page conversion, one row per arm. Per arm: completed surveys, paid
 * purchases, revenue, and the derived paid rate (paid ÷ completed). Attribution is
 * the buyer's submission `utm_tracker` (source of truth); see the
 * `get_landing_variant_funnel` RPC. Raw visitor counts live in GA4 (landing
 * exposures are not persisted server-side); assignment is ~50/50 so completed
 * volume is a fair top-funnel proxy.
 *
 * The arm NAME is attached here rather than in the component or in SQL, so this
 * screen and the Slack notifications draw from the one `armLabel` vocabulary and
 * cannot disagree. Until 2026-08-27 they did disagree, badly: the RPC collapsed
 * every non-`white` arm into `control` and the tab rendered that column as
 * "Dark / Control", so 805 arm-less submissions and the LIVE V1 arm were both
 * being reported as the retired dark landing page — and with them 61 purchases and
 * €807.89 of revenue, against a dark arm that made zero sales in the six days it
 * ran. Naming and arithmetic were wrong together, which is why fixing the labels
 * alone would not have fixed the screen.
 */
export async function GET(request: Request) {
  const admin = await verifyAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!hasRole(admin.role, "viewer")) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const ip = getClientIp(request);
  const rateLimit = await checkRateLimit(ip, {
    bucket: "admin-funnels-landing-variant",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const url = new URL(request.url);
  const days = parseInt(url.searchParams.get("days") || "0", 10);
  const since =
    days > 0
      ? new Date(Date.now() - days * 86_400_000).toISOString()
      : new Date("2000-01-01").toISOString();

  try {
    const res = await supabaseFetch("/rest/v1/rpc/get_landing_variant_funnel", {
      method: "POST",
      body: JSON.stringify({ since_ts: since }),
    });

    if (!res.ok) {
      logger.error({ status: res.status }, "Admin landing-variant funnel query failed");
      return NextResponse.json({ error: "Unable to load data." }, { status: 500 });
    }

    const raw = (await res.json()) as VariantRow[];
    const rows = (Array.isArray(raw) ? raw : []).map((r) => {
      const label = armLabel("landing", r.variant === "unknown" ? null : r.variant);
      return {
        variant: r.variant,
        // Plain-English name, from the shared vocabulary. `unknown` is mapped to
        // null so it reads as the vocabulary's own "Not recorded" rather than a
        // second phrasing invented here.
        label: label.short,
        // Lets the UI mark a row as history instead of a live comparison.
        retired: Boolean(label.retired),
        completed: r.completed,
        paid: r.paid,
        revenue: r.revenue,
        // paid ÷ completed — the monetisation conversion (the money metric).
        paidRate: r.completed > 0 ? Math.round((r.paid / r.completed) * 1000) / 10 : 0,
      };
    });

    // Active arms first, then retired, then the unattributed bucket last — reading
    // order matches how much the row can tell you.
    const weight = (v: { variant: string; retired: boolean }) =>
      v.variant === "unknown" ? 2 : v.retired ? 1 : 0;
    rows.sort((a, b) => weight(a) - weight(b) || b.completed - a.completed);

    return NextResponse.json({ rows });
  } catch (err) {
    logger.error({ err }, "Admin landing-variant funnel error");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
