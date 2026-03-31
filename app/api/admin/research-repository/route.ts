import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdminSession } from "@/lib/admin/auth";
import { logAdminAction } from "@/lib/admin/audit";
import { buildResearchRepositorySnapshot } from "@/lib/admin/research-repository";
import { hasRole } from "@/lib/admin/roles";
import { supabaseFetch } from "@/lib/admin/supabase";
import { verifyCsrfToken } from "@/lib/csrf";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import logger from "@/lib/logger";

const dateString = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/);

const createSchema = z.object({
  title: z.string().trim().min(3).max(160),
  summary: z.string().trim().max(2000).optional().nullable(),
  entry_type: z.enum([
    "signal",
    "theme",
    "pain-point",
    "contradiction",
    "wording",
    "answer-quality",
    "custom",
  ]),
  status: z.enum(["draft", "active", "validated", "archived"]).optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  owner_email: z.string().trim().email().optional().nullable(),
  primary_metric_key: z.string().trim().max(80).optional().nullable(),
  question_id: z.string().trim().max(40).optional().nullable(),
  theme: z.string().trim().max(120).optional().nullable(),
  source_key: z.string().trim().max(120).optional().nullable(),
  source_href: z.string().trim().max(200).optional().nullable(),
  evidence: z.array(z.string().trim().min(1).max(400)).max(8).optional(),
  recommendation: z.string().trim().max(1500).optional().nullable(),
  linked_action_id: z.number().int().positive().optional().nullable(),
  review_date: dateString.optional().nullable(),
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
    bucket: "admin-research-repository",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  try {
    return NextResponse.json(await buildResearchRepositorySnapshot());
  } catch (err) {
    logger.error({ err }, "Research repository GET error");
    return NextResponse.json({ error: "Unable to load research repository." }, { status: 500 });
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
    bucket: "admin-research-repository-write",
    limit: 20,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const parsed = createSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  try {
    const res = await supabaseFetch("/rest/v1/admin_research_repository_entry", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        admin_email: admin.email,
        title: parsed.data.title,
        summary: parsed.data.summary ?? null,
        entry_type: parsed.data.entry_type,
        status: parsed.data.status ?? "draft",
        priority: parsed.data.priority ?? "medium",
        owner_email: parsed.data.owner_email ?? null,
        primary_metric_key: parsed.data.primary_metric_key ?? null,
        question_id: parsed.data.question_id ?? null,
        theme: parsed.data.theme ?? null,
        source_key: parsed.data.source_key ?? null,
        source_href: parsed.data.source_href ?? null,
        evidence: parsed.data.evidence ?? [],
        recommendation: parsed.data.recommendation ?? null,
        linked_action_id: parsed.data.linked_action_id ?? null,
        review_date: parsed.data.review_date ?? null,
      }),
    });

    if (!res.ok) {
      logger.error({ status: res.status }, "Research repository create failed");
      return NextResponse.json({ error: "Unable to create repository entry." }, { status: 500 });
    }

    const created = (await res.json()) as Array<{ id: number }>;
    await logAdminAction({
      admin_email: admin.email,
      action: "create_admin_research_repository_entry",
      resource_type: "admin_research_repository_entry",
      resource_id: String(created[0]?.id ?? ""),
      metadata: {
        entry_type: parsed.data.entry_type,
        priority: parsed.data.priority ?? "medium",
      },
      ip,
    });

    return NextResponse.json({ success: true, id: created[0]?.id ?? null });
  } catch (err) {
    logger.error({ err }, "Research repository POST error");
    return NextResponse.json({ error: "Unable to create repository entry." }, { status: 500 });
  }
}
