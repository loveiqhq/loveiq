import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdminSession } from "@/lib/admin/auth";
import { hasRole } from "@/lib/admin/roles";
import { verifyCsrfToken } from "@/lib/csrf";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import { supabaseFetch } from "@/lib/admin/supabase";
import { logAdminAction } from "@/lib/admin/audit";
import logger from "@/lib/logger";

const patchSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).optional().nullable(),
    category: z
      .enum(["survey-change", "site-update", "marketing", "bug-fix", "feature", "other"])
      .optional(),
    ownerEmail: z.string().trim().email().optional().nullable(),
    primaryMetricKey: z.string().trim().max(80).optional().nullable(),
    expectedImpact: z.string().trim().max(1500).optional().nullable(),
    reviewDate: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .nullable(),
    measuredOutcome: z.string().trim().max(1500).optional().nullable(),
    eventDate: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "At least one field must be updated.");

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await verifyAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!hasRole(admin.role, "editor")) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  if (!(await verifyCsrfToken(request))) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }

  const ip = getClientIp(request);
  const rateLimit = await checkRateLimit(ip, {
    bucket: "admin-changelog-write",
    limit: 20,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const { id } = await params;
  const numericId = parseInt(id, 10);
  if (isNaN(numericId)) {
    return NextResponse.json({ error: "Invalid ID." }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (parsed.data.title !== undefined) patch.title = parsed.data.title;
  if (parsed.data.description !== undefined) patch.description = parsed.data.description ?? null;
  if (parsed.data.category !== undefined) patch.category = parsed.data.category;
  if (parsed.data.ownerEmail !== undefined) patch.owner_email = parsed.data.ownerEmail ?? null;
  if (parsed.data.primaryMetricKey !== undefined) {
    patch.primary_metric_key = parsed.data.primaryMetricKey ?? null;
  }
  if (parsed.data.expectedImpact !== undefined) {
    patch.expected_impact = parsed.data.expectedImpact ?? null;
  }
  if (parsed.data.reviewDate !== undefined) patch.review_date = parsed.data.reviewDate ?? null;
  if (parsed.data.measuredOutcome !== undefined) {
    patch.measured_outcome = parsed.data.measuredOutcome ?? null;
  }
  if (parsed.data.eventDate !== undefined) patch.event_date = parsed.data.eventDate;

  try {
    const res = await supabaseFetch(`/rest/v1/product_changelog?id=eq.${numericId}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(patch),
    });

    if (!res.ok) {
      logger.error({ id: numericId, status: res.status }, "Changelog patch failed");
      return NextResponse.json({ error: "Unable to update entry." }, { status: 500 });
    }

    void logAdminAction({
      admin_email: admin.email,
      action: "update_changelog_entry",
      resource_type: "product_changelog",
      resource_id: id,
      metadata: { fields: Object.keys(patch).filter((key) => key !== "updated_at") },
      ip,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error({ err }, "Changelog PATCH error");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await verifyAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!hasRole(admin.role, "admin")) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  if (!(await verifyCsrfToken(request))) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }

  const ip = getClientIp(request);
  const rateLimit = await checkRateLimit(ip, {
    bucket: "admin-changelog-write",
    limit: 10,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const { id } = await params;
  const numericId = parseInt(id, 10);
  if (isNaN(numericId)) {
    return NextResponse.json({ error: "Invalid ID." }, { status: 400 });
  }

  try {
    const res = await supabaseFetch(`/rest/v1/product_changelog?id=eq.${numericId}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    });

    if (!res.ok) {
      logger.error("Changelog delete: Supabase query failed");
      return NextResponse.json({ error: "Unable to delete entry." }, { status: 500 });
    }

    void logAdminAction({
      admin_email: admin.email,
      action: "delete_changelog_entry",
      resource_type: "product_changelog",
      resource_id: id,
      metadata: {},
      ip,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error({ err }, "Changelog DELETE error");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
