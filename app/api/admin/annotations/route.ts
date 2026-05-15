import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdminSession } from "@features/admin/server/auth";
import { hasRole } from "@features/admin/server/roles";
import { verifyCsrfToken } from "@/lib/csrf";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import { supabaseFetch } from "@features/admin/server/supabase";
import logger from "@/lib/logger";

const annotationSchema = z.object({
  chart_key: z.string().trim().min(1).max(100),
  annotation_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().trim().min(1).max(500),
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
    bucket: "admin-annotations",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const url = new URL(request.url);
  const chartKey = url.searchParams.get("chartKey") || "";

  try {
    let query = `/rest/v1/admin_chart_annotation?select=id,admin_email,chart_key,annotation_date,note,created_at&order=annotation_date.desc`;
    if (chartKey) {
      query += `&chart_key=eq.${encodeURIComponent(chartKey)}`;
    }
    const res = await supabaseFetch(query);
    if (!res.ok) {
      logger.error({ status: res.status }, "Annotations query failed");
      return NextResponse.json({ error: "Unable to load annotations." }, { status: 500 });
    }
    const annotations = await res.json();
    return NextResponse.json({ annotations });
  } catch (err) {
    logger.error({ err }, "Annotations error");
    return NextResponse.json({ error: "Unable to load annotations." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const csrfValid = await verifyCsrfToken(request);
  if (!csrfValid) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }

  const admin = await verifyAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!hasRole(admin.role, "editor")) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const ip = getClientIp(request);
  const rateLimit = await checkRateLimit(ip, {
    bucket: "admin-annotations-write",
    limit: 10,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const parsed = annotationSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  try {
    const res = await supabaseFetch("/rest/v1/admin_chart_annotation", {
      method: "POST",
      body: JSON.stringify({
        admin_email: admin.email,
        chart_key: parsed.data.chart_key,
        annotation_date: parsed.data.annotation_date,
        note: parsed.data.note,
      }),
      headers: { Prefer: "return=representation" },
    });
    if (!res.ok) {
      logger.error({ status: res.status }, "Annotation creation failed");
      return NextResponse.json({ error: "Unable to save annotation." }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error({ err }, "Annotation creation error");
    return NextResponse.json({ error: "Unable to save annotation." }, { status: 500 });
  }
}
