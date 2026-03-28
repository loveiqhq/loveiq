import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin/auth";
import { hasRole } from "@/lib/admin/roles";
import { verifyCsrfToken } from "@/lib/csrf";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import { supabaseFetch } from "@/lib/admin/supabase";
import { logAdminAction } from "@/lib/admin/audit";
import { maskEmail } from "@/lib/admin/format";
import logger from "@/lib/logger";
import { z } from "zod";

const createSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  category: z.enum(["survey-change", "site-update", "marketing", "bug-fix", "feature", "other"]),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

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
    bucket: "admin-changelog",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  try {
    const [changelogRes, annotationsRes] = await Promise.all([
      supabaseFetch(`/rest/v1/product_changelog?select=*&order=event_date.desc`, {
        headers: { Range: "0-999" },
      }),
      supabaseFetch(`/rest/v1/admin_chart_annotation?select=*&order=annotation_date.desc`, {
        headers: { Range: "0-999" },
      }),
    ]);

    if (!changelogRes.ok) {
      logger.error("Changelog: Supabase query failed");
      return NextResponse.json({ error: "Unable to load data." }, { status: 500 });
    }

    const changelog = (await changelogRes.json()) as Array<{
      id: number;
      title: string;
      description: string | null;
      category: string;
      admin_email: string;
      event_date: string;
      created_at: string;
    }>;

    const annotations = annotationsRes.ok
      ? ((await annotationsRes.json()) as Array<{
          id: number;
          chart_key: string;
          annotation_date: string;
          note: string;
          admin_email: string;
          created_at: string;
        }>)
      : [];

    return NextResponse.json({
      changelog: changelog.map((c) => ({
        id: c.id,
        title: c.title,
        description: c.description,
        category: c.category,
        adminEmail: maskEmail(c.admin_email),
        eventDate: c.event_date,
        createdAt: c.created_at,
      })),
      annotations: annotations.map((a) => ({
        id: a.id,
        chartKey: a.chart_key,
        annotationDate: a.annotation_date,
        note: a.note,
        adminEmail: maskEmail(a.admin_email),
        createdAt: a.created_at,
      })),
      totalEntries: changelog.length + annotations.length,
    });
  } catch (err) {
    logger.error({ err }, "Changelog GET error");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}

export async function POST(request: Request) {
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
    limit: 10,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const parsed = createSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  const { title, description, category, eventDate } = parsed.data;

  try {
    const res = await supabaseFetch("/rest/v1/product_changelog", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        title,
        description: description || null,
        category,
        event_date: eventDate,
        admin_email: admin.email,
      }),
    });

    if (!res.ok) {
      logger.error("Changelog: insert failed");
      return NextResponse.json({ error: "Unable to save entry." }, { status: 500 });
    }

    const rows = (await res.json()) as Array<{ id: number }>;

    logAdminAction({
      admin_email: admin.email,
      action: "create_changelog_entry",
      resource_type: "product_changelog",
      resource_id: String(rows[0]?.id),
      metadata: { title, category },
      ip,
    });

    return NextResponse.json({ success: true, id: rows[0]?.id });
  } catch (err) {
    logger.error({ err }, "Changelog POST error");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
