import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdminSession } from "@/lib/admin/auth";
import { logAdminAction } from "@/lib/admin/audit";
import {
  buildResearchTaxonomySnapshot,
  type ResearchTaxonomyStatus,
  type ResearchTaxonomyType,
} from "@/lib/admin/research-taxonomy";
import { hasRole } from "@/lib/admin/roles";
import { supabaseFetch } from "@/lib/admin/supabase";
import { verifyCsrfToken } from "@/lib/csrf";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import logger from "@/lib/logger";

const taxonomyTypeSchema = z.enum(["intent", "motivation", "theme"]);
const taxonomyStatusSchema = z.enum(["draft", "active", "deprecated"]);

const createSchema = z.object({
  action: z.literal("create"),
  label: z.string().trim().min(2).max(80),
  taxonomy_type: taxonomyTypeSchema,
  status: taxonomyStatusSchema.default("active"),
  description: z.string().trim().max(2000).optional().nullable(),
  owner_email: z.string().trim().email().optional().nullable(),
  linked_question_ids: z.array(z.string().trim().min(1).max(32)).max(24).default([]),
  example_terms: z.array(z.string().trim().min(1).max(80)).max(24).default([]),
  source_keys: z.array(z.string().trim().min(1).max(120)).max(24).default([]),
  review_date: z.string().trim().max(10).optional().nullable(),
});

const updateSchema = z.object({
  action: z.literal("update"),
  id: z.number().int().positive(),
  label: z.string().trim().min(2).max(80),
  taxonomy_type: taxonomyTypeSchema,
  status: taxonomyStatusSchema,
  description: z.string().trim().max(2000).optional().nullable(),
  owner_email: z.string().trim().email().optional().nullable(),
  linked_question_ids: z.array(z.string().trim().min(1).max(32)).max(24).default([]),
  example_terms: z.array(z.string().trim().min(1).max(80)).max(24).default([]),
  source_keys: z.array(z.string().trim().min(1).max(120)).max(24).default([]),
  review_date: z.string().trim().max(10).optional().nullable(),
});

const deleteSchema = z.object({
  action: z.literal("delete"),
  id: z.number().int().positive(),
});

const postSchema = z.discriminatedUnion("action", [createSchema, updateSchema, deleteSchema]);

type Row = {
  id: number;
  label: string;
  taxonomy_type: ResearchTaxonomyType;
  status: ResearchTaxonomyStatus;
};

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
    bucket: "admin-research-taxonomy",
    limit: 20,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  try {
    return NextResponse.json(await buildResearchTaxonomySnapshot());
  } catch (err) {
    logger.error({ err }, "Research taxonomy GET error");
    return NextResponse.json({ error: "Unable to load research taxonomy." }, { status: 500 });
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
    bucket: "admin-research-taxonomy-write",
    limit: 20,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const parsed = postSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  try {
    if (parsed.data.action === "delete") {
      if (!hasRole(admin.role, "admin")) {
        return NextResponse.json({ error: "Forbidden." }, { status: 403 });
      }

      const res = await supabaseFetch(
        `/rest/v1/admin_research_taxonomy_term?id=eq.${parsed.data.id}`,
        {
          method: "DELETE",
          headers: { Prefer: "return=minimal" },
        }
      );

      if (!res.ok) {
        logger.error({ status: res.status }, "Research taxonomy delete failed");
        return NextResponse.json({ error: "Unable to delete taxonomy term." }, { status: 500 });
      }

      await logAdminAction({
        admin_email: admin.email,
        action: "delete_research_taxonomy_term",
        resource_type: "admin_research_taxonomy_term",
        resource_id: String(parsed.data.id),
        metadata: {},
        ip,
      });

      return NextResponse.json({ success: true });
    }

    const payload = {
      admin_email: admin.email,
      label: parsed.data.label,
      taxonomy_type: parsed.data.taxonomy_type,
      status: parsed.data.status,
      description: parsed.data.description ?? null,
      owner_email: parsed.data.owner_email ?? null,
      linked_question_ids: parsed.data.linked_question_ids,
      example_terms: parsed.data.example_terms,
      source_keys: parsed.data.source_keys,
      review_date: parsed.data.review_date ?? null,
      updated_at: new Date().toISOString(),
    };

    const res =
      parsed.data.action === "create"
        ? await supabaseFetch("/rest/v1/admin_research_taxonomy_term", {
            method: "POST",
            headers: { Prefer: "return=representation" },
            body: JSON.stringify(payload),
          })
        : await supabaseFetch(`/rest/v1/admin_research_taxonomy_term?id=eq.${parsed.data.id}`, {
            method: "PATCH",
            headers: { Prefer: "return=representation" },
            body: JSON.stringify(payload),
          });

    if (!res.ok) {
      logger.error({ status: res.status }, "Research taxonomy write failed");
      return NextResponse.json({ error: "Unable to save taxonomy term." }, { status: 500 });
    }

    const rows = (await res.json()) as Row[];
    const created = rows[0];

    await logAdminAction({
      admin_email: admin.email,
      action:
        parsed.data.action === "create"
          ? "create_research_taxonomy_term"
          : "update_research_taxonomy_term",
      resource_type: "admin_research_taxonomy_term",
      resource_id: String(created?.id ?? (parsed.data.action === "update" ? parsed.data.id : "")),
      metadata: {
        label: parsed.data.label,
        taxonomy_type: parsed.data.taxonomy_type,
        status: parsed.data.status,
      },
      ip,
    });

    return NextResponse.json({ success: true, id: created?.id ?? null });
  } catch (err) {
    logger.error({ err }, "Research taxonomy POST error");
    return NextResponse.json({ error: "Unable to process taxonomy request." }, { status: 500 });
  }
}
