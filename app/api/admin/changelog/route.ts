import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdminSession } from "@/lib/admin/auth";
import { hasRole } from "@/lib/admin/roles";
import { verifyCsrfToken } from "@/lib/csrf";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import { supabaseFetch } from "@/lib/admin/supabase";
import { logAdminAction } from "@/lib/admin/audit";
import { maskEmail } from "@/lib/admin/format";
import logger from "@/lib/logger";

const changelogSchema = z.object({
  kind: z.literal("changelog").default("changelog"),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  category: z.enum(["survey-change", "site-update", "marketing", "bug-fix", "feature", "other"]),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const decisionStatusSchema = z.enum([
  "draft",
  "approved",
  "monitoring",
  "validated",
  "rolled-back",
]);

const evidenceLinkSchema = z.object({
  label: z.string().trim().min(1).max(80),
  href: z.string().trim().min(1).max(200),
});

const decisionSchema = z.object({
  kind: z.literal("decision"),
  entryType: z.enum(["decision", "scoring-change", "memo"]),
  title: z.string().trim().min(1).max(200),
  ownerEmail: z.string().trim().email().optional().nullable(),
  status: decisionStatusSchema.optional(),
  rationale: z.string().trim().min(1).max(2000),
  expectedImpact: z.string().trim().max(1500).optional().nullable(),
  observedEffect: z.string().trim().max(1500).optional().nullable(),
  changeSummary: z.string().trim().max(1500).optional().nullable(),
  reviewWindowDays: z.number().int().min(1).max(365).optional().nullable(),
  linkedReleaseId: z.number().int().positive().optional().nullable(),
  linkedExperimentId: z.number().int().positive().optional().nullable(),
  evidenceLinks: z.array(evidenceLinkSchema).max(8).optional(),
});

const patchSchema = z.object({
  id: z.number().int().positive(),
  status: decisionStatusSchema.optional(),
  ownerEmail: z.string().trim().email().optional().nullable(),
  rationale: z.string().trim().min(1).max(2000).optional(),
  expectedImpact: z.string().trim().max(1500).optional().nullable(),
  observedEffect: z.string().trim().max(1500).optional().nullable(),
  changeSummary: z.string().trim().max(1500).optional().nullable(),
  reviewWindowDays: z.number().int().min(1).max(365).optional().nullable(),
  evidenceLinks: z.array(evidenceLinkSchema).max(8).optional(),
});

const postSchema = z.discriminatedUnion("kind", [changelogSchema, decisionSchema]);

type ChangelogRow = {
  id: number;
  title: string;
  description: string | null;
  category: string;
  admin_email: string;
  event_date: string;
  created_at: string;
};

type AnnotationRow = {
  id: number;
  chart_key: string;
  annotation_date: string;
  note: string;
  admin_email: string;
  created_at: string;
};

type DecisionRow = {
  id: number;
  admin_email: string;
  owner_email: string | null;
  title: string;
  entry_type: "decision" | "scoring-change" | "memo";
  status: z.infer<typeof decisionStatusSchema>;
  rationale: string;
  expected_impact: string | null;
  observed_effect: string | null;
  change_summary: string | null;
  review_window_days: number | null;
  linked_release_id: number | null;
  linked_experiment_id: number | null;
  evidence_links: Array<{ label: string; href: string }> | null;
  created_at: string;
  updated_at: string;
};

function normalizeEvidenceLinks(
  links: Array<{ label: string; href: string }> | null | undefined
): Array<{ label: string; href: string }> {
  return (links ?? []).filter((link) => link.label && link.href);
}

async function checkReadAccess(request: Request) {
  const admin = await verifyAdminSession();
  if (!admin) {
    return {
      admin: null,
      response: NextResponse.json({ error: "Unauthorized." }, { status: 401 }),
    };
  }
  if (!hasRole(admin.role, "viewer")) {
    return { admin: null, response: NextResponse.json({ error: "Forbidden." }, { status: 403 }) };
  }

  const ip = getClientIp(request);
  const rateLimit = await checkRateLimit(ip, {
    bucket: "admin-changelog",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return {
      admin: null,
      response: NextResponse.json({ error: "Please try again later." }, { status: 429 }),
    };
  }

  return { admin, response: null };
}

async function checkWriteAccess(request: Request) {
  const admin = await verifyAdminSession();
  if (!admin) {
    return {
      admin: null,
      ip: "",
      response: NextResponse.json({ error: "Unauthorized." }, { status: 401 }),
    };
  }
  if (!hasRole(admin.role, "editor")) {
    return {
      admin: null,
      ip: "",
      response: NextResponse.json({ error: "Forbidden." }, { status: 403 }),
    };
  }
  if (!(await verifyCsrfToken(request))) {
    return {
      admin: null,
      ip: "",
      response: NextResponse.json({ error: "Invalid request." }, { status: 403 }),
    };
  }

  const ip = getClientIp(request);
  const rateLimit = await checkRateLimit(ip, {
    bucket: "admin-changelog-write",
    limit: 12,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return {
      admin: null,
      ip,
      response: NextResponse.json({ error: "Please try again later." }, { status: 429 }),
    };
  }

  return { admin, ip, response: null };
}

export async function GET(request: Request) {
  const access = await checkReadAccess(request);
  if (access.response) {
    return access.response;
  }

  try {
    const [changelogRes, annotationsRes, decisionsRes] = await Promise.all([
      supabaseFetch("/rest/v1/product_changelog?select=*&order=event_date.desc", {
        headers: { Range: "0-999" },
      }),
      supabaseFetch("/rest/v1/admin_chart_annotation?select=*&order=annotation_date.desc", {
        headers: { Range: "0-999" },
      }),
      supabaseFetch("/rest/v1/admin_decision_entry?select=*&order=updated_at.desc", {
        headers: { Range: "0-999" },
      }),
    ]);

    if (!changelogRes.ok) {
      logger.error("Changelog: product changelog query failed");
      return NextResponse.json({ error: "Unable to load data." }, { status: 500 });
    }

    const changelog = (await changelogRes.json()) as ChangelogRow[];
    const annotations = annotationsRes.ok ? ((await annotationsRes.json()) as AnnotationRow[]) : [];
    const decisions = decisionsRes.ok ? ((await decisionsRes.json()) as DecisionRow[]) : [];

    return NextResponse.json({
      changelog: changelog.map((entry) => ({
        id: entry.id,
        title: entry.title,
        description: entry.description,
        category: entry.category,
        adminEmail: maskEmail(entry.admin_email),
        eventDate: entry.event_date,
        createdAt: entry.created_at,
      })),
      annotations: annotations.map((entry) => ({
        id: entry.id,
        chartKey: entry.chart_key,
        annotationDate: entry.annotation_date,
        note: entry.note,
        adminEmail: maskEmail(entry.admin_email),
        createdAt: entry.created_at,
      })),
      decisions: decisions.map((entry) => ({
        id: entry.id,
        title: entry.title,
        entryType: entry.entry_type,
        status: entry.status,
        rationale: entry.rationale,
        expectedImpact: entry.expected_impact,
        observedEffect: entry.observed_effect,
        changeSummary: entry.change_summary,
        reviewWindowDays: entry.review_window_days,
        linkedReleaseId: entry.linked_release_id,
        linkedExperimentId: entry.linked_experiment_id,
        evidenceLinks: normalizeEvidenceLinks(entry.evidence_links),
        adminEmail: maskEmail(entry.admin_email),
        ownerEmail: entry.owner_email ? maskEmail(entry.owner_email) : null,
        createdAt: entry.created_at,
        updatedAt: entry.updated_at,
      })),
      summary: {
        changelogCount: changelog.length,
        annotationCount: annotations.length,
        decisionCount: decisions.filter((entry) => entry.entry_type === "decision").length,
        scoringGovernanceCount: decisions.filter((entry) => entry.entry_type === "scoring-change")
          .length,
        memoCount: decisions.filter((entry) => entry.entry_type === "memo").length,
      },
      totalEntries: changelog.length + annotations.length + decisions.length,
    });
  } catch (err) {
    logger.error({ err }, "Changelog GET error");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const access = await checkWriteAccess(request);
  if (access.response || !access.admin) {
    return access.response as NextResponse;
  }

  const rawBody = await request.json().catch(() => ({}));
  const parsed = postSchema.safeParse(
    rawBody && typeof rawBody === "object" && !("kind" in rawBody)
      ? { kind: "changelog", ...rawBody }
      : rawBody
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  const admin = access.admin;
  const ip = access.ip;

  try {
    if (parsed.data.kind === "changelog") {
      const { title, description, category, eventDate } = parsed.data;
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
    }

    const {
      title,
      entryType,
      ownerEmail,
      status,
      rationale,
      expectedImpact,
      observedEffect,
      changeSummary,
      reviewWindowDays,
      linkedReleaseId,
      linkedExperimentId,
      evidenceLinks,
    } = parsed.data;

    const res = await supabaseFetch("/rest/v1/admin_decision_entry", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        admin_email: admin.email,
        owner_email: ownerEmail ?? admin.email,
        title,
        entry_type: entryType,
        status: status ?? "draft",
        rationale,
        expected_impact: expectedImpact ?? null,
        observed_effect: observedEffect ?? null,
        change_summary: changeSummary ?? null,
        review_window_days: reviewWindowDays ?? null,
        linked_release_id: linkedReleaseId ?? null,
        linked_experiment_id: linkedExperimentId ?? null,
        evidence_links: evidenceLinks ?? [],
      }),
    });

    if (!res.ok) {
      logger.error("Decision journal: insert failed");
      return NextResponse.json({ error: "Unable to save decision entry." }, { status: 500 });
    }

    const rows = (await res.json()) as Array<{ id: number }>;
    logAdminAction({
      admin_email: admin.email,
      action:
        entryType === "scoring-change"
          ? "create_scoring_governance_entry"
          : "create_decision_entry",
      resource_type: "admin_decision_entry",
      resource_id: String(rows[0]?.id),
      metadata: { title, entryType, status: status ?? "draft" },
      ip,
    });

    return NextResponse.json({ success: true, id: rows[0]?.id });
  } catch (err) {
    logger.error({ err }, "Changelog POST error");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const access = await checkWriteAccess(request);
  if (access.response || !access.admin) {
    return access.response as NextResponse;
  }

  const parsed = patchSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  const admin = access.admin;
  const ip = access.ip;
  const { id, ...rest } = parsed.data;
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (rest.status !== undefined) updates.status = rest.status;
  if (rest.ownerEmail !== undefined) updates.owner_email = rest.ownerEmail;
  if (rest.rationale !== undefined) updates.rationale = rest.rationale;
  if (rest.expectedImpact !== undefined) updates.expected_impact = rest.expectedImpact ?? null;
  if (rest.observedEffect !== undefined) updates.observed_effect = rest.observedEffect ?? null;
  if (rest.changeSummary !== undefined) updates.change_summary = rest.changeSummary ?? null;
  if (rest.reviewWindowDays !== undefined)
    updates.review_window_days = rest.reviewWindowDays ?? null;
  if (rest.evidenceLinks !== undefined) updates.evidence_links = rest.evidenceLinks;

  if (Object.keys(updates).length === 1) {
    return NextResponse.json({ error: "No changes provided." }, { status: 400 });
  }

  try {
    const res = await supabaseFetch(`/rest/v1/admin_decision_entry?id=eq.${id}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(updates),
    });

    if (!res.ok) {
      logger.error({ id }, "Decision journal: patch failed");
      return NextResponse.json({ error: "Unable to update decision entry." }, { status: 500 });
    }

    logAdminAction({
      admin_email: admin.email,
      action: "update_decision_entry",
      resource_type: "admin_decision_entry",
      resource_id: String(id),
      metadata: { fields: Object.keys(updates).filter((key) => key !== "updated_at") },
      ip,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error({ err }, "Changelog PATCH error");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
