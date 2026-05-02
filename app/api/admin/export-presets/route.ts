import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdminSession } from "@/lib/admin/auth";
import { hasRole } from "@/lib/admin/roles";
import { verifyCsrfToken } from "@/lib/csrf";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import { supabaseFetch } from "@/lib/admin/supabase";
import logger from "@/lib/logger";

const presetSchema = z.object({
  name: z.string().trim().min(1).max(100),
  config: z.object({
    filters: z.object({
      status: z.string(),
      email: z.string(),
      archetype: z.string(),
      dateFrom: z.string(),
      dateTo: z.string(),
    }),
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
    bucket: "admin-export-presets",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  try {
    const res = await supabaseFetch(
      `/rest/v1/admin_export_preset?or=(admin_email.eq.${encodeURIComponent(admin.email)},is_shared.eq.true)&select=id,admin_email,name,config,is_shared,created_at&order=created_at.desc`
    );
    if (!res.ok) {
      logger.error({ status: res.status }, "Export presets query failed");
      return NextResponse.json({ error: "Unable to load presets." }, { status: 500 });
    }
    const presets = await res.json();
    return NextResponse.json({ presets });
  } catch (err) {
    logger.error({ err }, "Export presets error");
    return NextResponse.json({ error: "Unable to load presets." }, { status: 500 });
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
    bucket: "admin-export-presets-write",
    limit: 10,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const parsed = presetSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  try {
    const res = await supabaseFetch("/rest/v1/admin_export_preset", {
      method: "POST",
      body: JSON.stringify({
        admin_email: admin.email,
        name: parsed.data.name,
        config: parsed.data.config,
      }),
      headers: { Prefer: "return=representation" },
    });
    if (!res.ok) {
      logger.error({ status: res.status }, "Export preset creation failed");
      return NextResponse.json({ error: "Unable to save preset." }, { status: 500 });
    }
    const created = await res.json();
    return NextResponse.json({ success: true, preset: created[0] });
  } catch (err) {
    logger.error({ err }, "Export preset creation error");
    return NextResponse.json({ error: "Unable to save preset." }, { status: 500 });
  }
}
