import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdminSession } from "@/lib/admin/auth";
import { hasRole } from "@/lib/admin/roles";
import { verifyCsrfToken } from "@/lib/csrf";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import { supabaseFetch } from "@/lib/admin/supabase";
import { logAdminAction } from "@/lib/admin/audit";
import logger from "@/lib/logger";

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const conditionSchema = z.object({
  field: z.enum([
    "archetype",
    "v5_archetype",
    "gender",
    "sexual_orientation",
    "relationship_status",
    "country",
    "status",
    "duration_ms",
    "created_date_time",
    "utm_source",
    "utm_medium",
    "has_report",
    "has_payment",
  ]),
  operator: z.enum(["eq", "neq", "lt", "gt", "lte", "gte", "contains"]),
  value: z.union([z.string(), z.number(), z.boolean()]),
});

const rulesSchema = z.object({
  logic: z.enum(["and", "or"]),
  conditions: z.array(conditionSchema).min(1).max(20),
});

const previewSchema = z.object({
  action: z.literal("preview"),
  rules: rulesSchema,
});

const createSchema = z.object({
  action: z.literal("create"),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  rules: rulesSchema,
  is_shared: z.boolean().optional(),
});

const updateSchema = z.object({
  action: z.literal("update"),
  segmentId: z.number().int().positive(),
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  rules: rulesSchema.optional(),
  is_shared: z.boolean().optional(),
});

const deleteSchema = z.object({
  action: z.literal("delete"),
  segmentId: z.number().int().positive(),
});

const postSchema = z.discriminatedUnion("action", [
  previewSchema,
  createSchema,
  updateSchema,
  deleteSchema,
]);

// ---------------------------------------------------------------------------
// GET — list segments (own + shared)
// ---------------------------------------------------------------------------

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
    bucket: "admin-segments",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  try {
    const res = await supabaseFetch(
      `/rest/v1/admin_segment?or=(admin_email.eq.${encodeURIComponent(admin.email)},is_shared.eq.true)&select=*&order=created_at.desc`
    );

    if (!res.ok) {
      logger.error({ status: res.status }, "Segments query failed");
      return NextResponse.json({ error: "Unable to load data." }, { status: 500 });
    }

    const segments = await res.json();
    return NextResponse.json({ segments });
  } catch (err) {
    logger.error({ err }, "Segments error");
    return NextResponse.json({ error: "Unable to load data." }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST — create / update / delete / preview
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  // 1. CSRF verification
  const csrfValid = await verifyCsrfToken(request);
  if (!csrfValid) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }

  // Auth
  const admin = await verifyAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!hasRole(admin.role, "editor")) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  // 2. Rate limiting
  const ip = getClientIp(request);
  const rateLimit = await checkRateLimit(ip, {
    bucket: "admin-segments-write",
    limit: 20,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  // 3. Zod validation
  const parsed = postSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  const data = parsed.data;

  // 4. Business logic
  try {
    // ---------------------------------------------------------------
    // PREVIEW — run RPC and return count + sample
    // ---------------------------------------------------------------
    if (data.action === "preview") {
      const rpcRes = await supabaseFetch("/rest/v1/rpc/get_segment_match_count", {
        method: "POST",
        body: JSON.stringify({ p_rules: data.rules }),
      });

      if (!rpcRes.ok) {
        logger.error({ status: rpcRes.status }, "Segment preview RPC failed");
        return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
      }

      const result = await rpcRes.json();
      return NextResponse.json({ success: true, count: result.count, sample: result.sample });
    }

    // ---------------------------------------------------------------
    // CREATE — insert new segment, compute match_count
    // ---------------------------------------------------------------
    if (data.action === "create") {
      // Compute match count via RPC
      let matchCount: number | null = null;
      try {
        const rpcRes = await supabaseFetch("/rest/v1/rpc/get_segment_match_count", {
          method: "POST",
          body: JSON.stringify({ p_rules: data.rules }),
        });
        if (rpcRes.ok) {
          const rpcResult = await rpcRes.json();
          matchCount = rpcResult.count ?? null;
        }
      } catch {
        // Non-blocking — segment is still created with null match_count
      }

      const insertRes = await supabaseFetch("/rest/v1/admin_segment", {
        method: "POST",
        body: JSON.stringify({
          admin_email: admin.email,
          name: data.name,
          description: data.description || null,
          rules: data.rules,
          is_shared: data.is_shared ?? false,
          match_count: matchCount,
        }),
        headers: { Prefer: "return=representation" },
      });

      if (!insertRes.ok) {
        logger.error({ status: insertRes.status }, "Segment creation failed");
        return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
      }

      const created = await insertRes.json();

      await logAdminAction({
        admin_email: admin.email,
        action: "create_segment",
        resource_type: "segment",
        resource_id: String(created[0]?.id),
        metadata: { name: data.name },
        ip,
      });

      return NextResponse.json({ success: true, segment: created[0] });
    }

    // ---------------------------------------------------------------
    // UPDATE — patch existing segment, recompute match_count
    // ---------------------------------------------------------------
    if (data.action === "update") {
      // Ownership check: only owner or admin can update
      const checkRes = await supabaseFetch(
        `/rest/v1/admin_segment?id=eq.${data.segmentId}&select=id,admin_email`
      );
      if (!checkRes.ok) {
        logger.error({ status: checkRes.status }, "Segment ownership check failed");
        return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
      }
      const existing = (await checkRes.json()) as Array<{ id: number; admin_email: string }>;
      if (existing.length === 0) {
        return NextResponse.json({ error: "Not found." }, { status: 404 });
      }
      if (existing[0]!.admin_email !== admin.email && !hasRole(admin.role, "admin")) {
        return NextResponse.json({ error: "Forbidden." }, { status: 403 });
      }

      // Build patch payload
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (data.name !== undefined) patch.name = data.name;
      if (data.description !== undefined) patch.description = data.description;
      if (data.is_shared !== undefined) patch.is_shared = data.is_shared;
      if (data.rules !== undefined) {
        patch.rules = data.rules;
        // Recompute match count
        try {
          const rpcRes = await supabaseFetch("/rest/v1/rpc/get_segment_match_count", {
            method: "POST",
            body: JSON.stringify({ p_rules: data.rules }),
          });
          if (rpcRes.ok) {
            const rpcResult = await rpcRes.json();
            patch.match_count = rpcResult.count ?? null;
          }
        } catch {
          // Non-blocking
        }
      }

      const patchRes = await supabaseFetch(`/rest/v1/admin_segment?id=eq.${data.segmentId}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
        headers: { Prefer: "return=representation" },
      });

      if (!patchRes.ok) {
        logger.error({ status: patchRes.status }, "Segment update failed");
        return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
      }

      const updated = await patchRes.json();

      await logAdminAction({
        admin_email: admin.email,
        action: "update_segment",
        resource_type: "segment",
        resource_id: String(data.segmentId),
        metadata: { fields: Object.keys(patch).filter((k) => k !== "updated_at") },
        ip,
      });

      return NextResponse.json({ success: true, segment: updated[0] });
    }

    // ---------------------------------------------------------------
    // DELETE — remove segment by id
    // ---------------------------------------------------------------
    if (data.action === "delete") {
      // Ownership check: only owner or admin can delete
      const checkRes = await supabaseFetch(
        `/rest/v1/admin_segment?id=eq.${data.segmentId}&select=id,admin_email`
      );
      if (!checkRes.ok) {
        logger.error({ status: checkRes.status }, "Segment delete ownership check failed");
        return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
      }
      const existing = (await checkRes.json()) as Array<{ id: number; admin_email: string }>;
      if (existing.length === 0) {
        return NextResponse.json({ error: "Not found." }, { status: 404 });
      }
      if (existing[0]!.admin_email !== admin.email && !hasRole(admin.role, "admin")) {
        return NextResponse.json({ error: "Forbidden." }, { status: 403 });
      }

      const deleteRes = await supabaseFetch(`/rest/v1/admin_segment?id=eq.${data.segmentId}`, {
        method: "DELETE",
        headers: { Prefer: "return=minimal" },
      });

      if (!deleteRes.ok) {
        logger.error({ status: deleteRes.status }, "Segment deletion failed");
        return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
      }

      await logAdminAction({
        admin_email: admin.email,
        action: "delete_segment",
        resource_type: "segment",
        resource_id: String(data.segmentId),
        ip,
      });

      return NextResponse.json({ success: true });
    }

    // Should not reach here due to discriminated union
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  } catch (err) {
    logger.error({ err }, "Segments POST error");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
