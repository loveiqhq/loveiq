import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin/auth";
import { supabaseFetch } from "@/lib/admin/supabase";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import logger from "@/lib/logger";

export async function GET(request: Request) {
  const isAdmin = await verifyAdminSession();
  if (!isAdmin) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const ip = getClientIp(request);
  const rateLimit = await checkRateLimit(ip, {
    bucket: "admin-submissions",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10)));
  const status = url.searchParams.get("status") || "";
  const email = url.searchParams.get("email") || "";
  const dateFrom = url.searchParams.get("dateFrom") || "";
  const dateTo = url.searchParams.get("dateTo") || "";

  const offset = (page - 1) * limit;

  // PostgREST query with embedded app_user for email/name
  let query = `/rest/v1/survey_submission?select=id,status,start_date_time,created_date_time,duration_ms,app_user!fk_survey_submission_user(email,first_name)&order=created_date_time.desc`;

  if (status) query += `&status=eq.${encodeURIComponent(status)}`;
  if (dateFrom) query += `&start_date_time=gte.${encodeURIComponent(dateFrom)}`;
  if (dateTo) query += `&start_date_time=lte.${encodeURIComponent(dateTo)}`;

  try {
    const res = await supabaseFetch(query, {
      headers: {
        Prefer: "count=exact",
        Range: `${offset}-${offset + limit - 1}`,
      },
    });

    if (!res.ok) {
      logger.error({ status: res.status }, "Admin submissions query failed");
      return NextResponse.json({ error: "Unable to load submissions." }, { status: 500 });
    }

    const total = parseInt(res.headers.get("content-range")?.split("/")[1] || "0", 10);
    const raw = (await res.json()) as Array<{
      id: number;
      status: string;
      start_date_time: string | null;
      created_date_time: string;
      duration_ms: number | null;
      app_user: { email: string; first_name: string } | null;
    }>;

    // Flatten the joined data and apply email filter client-side
    // (PostgREST can't filter on embedded resource fields via query params)
    let submissions = raw.map((r) => ({
      id: r.id,
      email: r.app_user?.email || "",
      first_name: r.app_user?.first_name || "",
      status: r.status,
      started_at: r.start_date_time || r.created_date_time,
      completed_at: r.created_date_time,
      duration_ms: r.duration_ms,
    }));

    if (email) {
      const lowerEmail = email.toLowerCase();
      submissions = submissions.filter((s) => s.email.toLowerCase().includes(lowerEmail));
    }

    return NextResponse.json({ submissions, total, page, limit });
  } catch (err) {
    logger.error({ err }, "Admin submissions error");
    return NextResponse.json({ error: "Unable to load submissions." }, { status: 500 });
  }
}
