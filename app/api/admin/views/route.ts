import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdminSession } from "@features/admin/server/auth";
import { hasRole } from "@features/admin/server/roles";
import { verifyCsrfToken } from "@shared/http/csrf";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import { supabaseFetch } from "@features/admin/server/supabase";
import logger from "@shared/observability/logger";

const viewSchema = z.object({
  name: z.string().trim().min(1).max(100),
  filters: z.object({
    status: z.string(),
    email: z.string(),
    archetype: z.string(),
    dateFrom: z.string(),
    dateTo: z.string(),
  }),
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
    bucket: "admin-views",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  try {
    // Fetch own views + shared views from others
    const res = await supabaseFetch(
      `/rest/v1/admin_saved_view?or=(admin_email.eq.${encodeURIComponent(admin.email)},is_shared.eq.true)&select=id,admin_email,name,filters,is_shared,created_at&order=created_at.desc`
    );

    if (!res.ok) {
      logger.error({ status: res.status }, "Views query failed");
      return NextResponse.json({ error: "Unable to load views." }, { status: 500 });
    }

    const views = await res.json();
    return NextResponse.json({ views });
  } catch (err) {
    logger.error({ err }, "Views error");
    return NextResponse.json({ error: "Unable to load views." }, { status: 500 });
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
    bucket: "admin-views-write",
    limit: 10,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const parsed = viewSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  try {
    const res = await supabaseFetch("/rest/v1/admin_saved_view", {
      method: "POST",
      body: JSON.stringify({
        admin_email: admin.email,
        name: parsed.data.name,
        filters: parsed.data.filters,
      }),
      headers: { Prefer: "return=representation" },
    });

    if (!res.ok) {
      logger.error({ status: res.status }, "View creation failed");
      return NextResponse.json({ error: "Unable to save view." }, { status: 500 });
    }

    const created = await res.json();
    return NextResponse.json({ success: true, view: created[0] });
  } catch (err) {
    logger.error({ err }, "View creation error");
    return NextResponse.json({ error: "Unable to save view." }, { status: 500 });
  }
}
