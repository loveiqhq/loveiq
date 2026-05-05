import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdminSession } from "@/lib/admin/auth";
import { hasRole } from "@/lib/admin/roles";
import { supabaseFetch } from "@/lib/admin/supabase";
import { verifyCsrfToken } from "@/lib/csrf";
import { logAdminAction } from "@/lib/admin/audit";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import logger from "@/lib/logger";

const upsertSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  channel: z.string().trim().min(1).max(64),
  spend_eur: z.number().min(0).max(10_000_000),
  clicks: z.number().int().min(0).max(100_000_000),
  impressions: z.number().int().min(0).max(10_000_000_000),
  unique_visitors: z.number().int().min(0).max(100_000_000),
  notes: z.string().max(500).optional().nullable(),
});

// ─────────────────────────────────────────────────────────────────────────────
// GET — list rows (viewer)
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const admin = await verifyAdminSession();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!hasRole(admin.role, "viewer"))
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const ip = getClientIp(request);
  const rl = await checkRateLimit(ip, {
    bucket: "admin-marketing-spend-list",
    limit: 60,
    windowMs: 60_000,
  });
  if (!rl.allowed) return NextResponse.json({ error: "Please try again later." }, { status: 429 });

  const url = new URL(request.url);
  const days = parseInt(url.searchParams.get("days") || "30", 10);
  const sinceDate =
    days > 0 ? new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10) : "2000-01-01";

  try {
    const res = await supabaseFetch(
      `/rest/v1/marketing_spend?select=id,date,channel,spend_eur,clicks,impressions,unique_visitors,notes,created_by_email,updated_at&date=gte.${sinceDate}&order=date.desc,channel.asc`,
      { headers: { Range: "0-9999" } }
    );
    if (!res.ok) {
      // Table may not exist yet (migration unapplied) — treat as empty.
      logger.warn("marketing_spend GET non-OK; assuming empty");
      return NextResponse.json({ rows: [], totals: emptyTotals() });
    }
    const rows = (await res.json()) as Array<{
      id: number;
      date: string;
      channel: string;
      spend_eur: string | number;
      clicks: number;
      impressions: number;
      unique_visitors: number;
      notes: string | null;
      created_by_email: string | null;
      updated_at: string;
    }>;
    const normalized = rows.map((r) => ({ ...r, spend_eur: Number(r.spend_eur) }));
    const totals = normalized.reduce(
      (acc, r) => ({
        spend_eur: acc.spend_eur + r.spend_eur,
        clicks: acc.clicks + r.clicks,
        impressions: acc.impressions + r.impressions,
        unique_visitors: acc.unique_visitors + r.unique_visitors,
      }),
      emptyTotals()
    );
    return NextResponse.json({ rows: normalized, totals });
  } catch (err) {
    logger.error({ err }, "marketing_spend GET failed");
    return NextResponse.json({ error: "Unable to load marketing spend." }, { status: 500 });
  }
}

function emptyTotals() {
  return { spend_eur: 0, clicks: 0, impressions: 0, unique_visitors: 0 };
}

// ─────────────────────────────────────────────────────────────────────────────
// POST — upsert by (date, channel) (admin)
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  if (!(await verifyCsrfToken(request))) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }

  const admin = await verifyAdminSession();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!hasRole(admin.role, "admin"))
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const ip = getClientIp(request);
  const rl = await checkRateLimit(ip, {
    bucket: "admin-marketing-spend-write",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rl.allowed) return NextResponse.json({ error: "Please try again later." }, { status: 429 });

  const json = await request.json().catch(() => ({}));
  const parsed = upsertSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const payload = {
    ...parsed.data,
    created_by_email: admin.email,
    updated_at: new Date().toISOString(),
  };

  try {
    const res = await supabaseFetch("/rest/v1/marketing_spend?on_conflict=date,channel", {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      logger.error({ status: res.status, body: text }, "marketing_spend upsert failed");
      return NextResponse.json({ error: "Unable to save row." }, { status: 500 });
    }
    const inserted = await res.json();

    void logAdminAction({
      admin_email: admin.email,
      action: "marketing_spend_upsert",
      resource_type: "marketing_spend",
      metadata: { date: parsed.data.date, channel: parsed.data.channel },
      ip,
    });

    return NextResponse.json({ row: Array.isArray(inserted) ? inserted[0] : inserted });
  } catch (err) {
    logger.error({ err }, "marketing_spend POST failed");
    return NextResponse.json({ error: "Unable to save row." }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE — remove a row by id (admin)
// ─────────────────────────────────────────────────────────────────────────────

export async function DELETE(request: Request) {
  if (!(await verifyCsrfToken(request))) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }

  const admin = await verifyAdminSession();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!hasRole(admin.role, "admin"))
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const ip = getClientIp(request);
  const rl = await checkRateLimit(ip, {
    bucket: "admin-marketing-spend-write",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rl.allowed) return NextResponse.json({ error: "Please try again later." }, { status: 429 });

  const url = new URL(request.url);
  const idStr = url.searchParams.get("id");
  const id = idStr ? parseInt(idStr, 10) : NaN;
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }

  try {
    const res = await supabaseFetch(`/rest/v1/marketing_spend?id=eq.${id}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      logger.error({ status: res.status, body: text }, "marketing_spend delete failed");
      return NextResponse.json({ error: "Unable to delete row." }, { status: 500 });
    }

    void logAdminAction({
      admin_email: admin.email,
      action: "marketing_spend_delete",
      resource_type: "marketing_spend",
      resource_id: String(id),
      ip,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error({ err }, "marketing_spend DELETE failed");
    return NextResponse.json({ error: "Unable to delete row." }, { status: 500 });
  }
}
