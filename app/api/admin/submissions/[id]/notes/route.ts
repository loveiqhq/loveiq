import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdminSession } from "@/lib/admin/auth";
import { hasRole } from "@/lib/admin/roles";
import { verifyCsrfToken } from "@/lib/csrf";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import { supabaseFetch } from "@/lib/admin/supabase";
import { logAdminAction } from "@/lib/admin/audit";
import logger from "@/lib/logger";

const noteSchema = z.object({
  content: z.string().trim().min(1).max(2000),
});

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await verifyAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!hasRole(admin.role, "viewer")) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const ip = getClientIp(request);
  const rateLimit = await checkRateLimit(ip, {
    bucket: "admin-notes",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const { id } = await params;
  const submissionId = parseInt(id, 10);
  if (isNaN(submissionId) || submissionId < 1) {
    return NextResponse.json({ error: "Invalid submission ID." }, { status: 400 });
  }

  try {
    const res = await supabaseFetch(
      `/rest/v1/admin_note?submission_id=eq.${submissionId}&select=id,admin_email,content,created_at,updated_at&order=created_at.desc`
    );

    if (!res.ok) {
      logger.error({ status: res.status }, "Notes query failed");
      return NextResponse.json({ error: "Unable to load notes." }, { status: 500 });
    }

    const notes = (await res.json()) as Array<{
      id: number;
      admin_email: string;
      content: string;
      created_at: string;
      updated_at: string;
    }>;

    const enriched = notes.map((n) => ({
      ...n,
      is_mine: n.admin_email === admin.email,
    }));

    return NextResponse.json({ notes: enriched });
  } catch (err) {
    logger.error({ err }, "Notes error");
    return NextResponse.json({ error: "Unable to load notes." }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
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
    bucket: "admin-notes-write",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const { id } = await params;
  const submissionId = parseInt(id, 10);
  if (isNaN(submissionId) || submissionId < 1) {
    return NextResponse.json({ error: "Invalid submission ID." }, { status: 400 });
  }

  const parsed = noteSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  try {
    const res = await supabaseFetch("/rest/v1/admin_note", {
      method: "POST",
      body: JSON.stringify({
        submission_id: submissionId,
        admin_email: admin.email,
        content: parsed.data.content,
      }),
      headers: { Prefer: "return=representation" },
    });

    if (!res.ok) {
      logger.error({ status: res.status }, "Note creation failed");
      return NextResponse.json({ error: "Unable to save note." }, { status: 500 });
    }

    logAdminAction({
      admin_email: admin.email,
      action: "create_note",
      resource_type: "submission",
      resource_id: id,
      metadata: {},
      ip,
    }).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error({ err }, "Note creation error");
    return NextResponse.json({ error: "Unable to save note." }, { status: 500 });
  }
}
