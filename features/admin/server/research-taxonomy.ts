import { supabaseFetch } from "@features/admin/server/supabase";
import logger from "@/lib/logger";

export type ResearchTaxonomyType = "intent" | "motivation" | "theme";
export type ResearchTaxonomyStatus = "draft" | "active" | "deprecated";

interface ResearchTaxonomyRow {
  id: number;
  admin_email: string;
  label: string;
  taxonomy_type: ResearchTaxonomyType;
  status: ResearchTaxonomyStatus;
  description: string | null;
  owner_email: string | null;
  linked_question_ids: string[] | null;
  example_terms: string[] | null;
  source_keys: string[] | null;
  review_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface ResearchTaxonomyTerm {
  id: number;
  adminEmail: string;
  label: string;
  taxonomyType: ResearchTaxonomyType;
  status: ResearchTaxonomyStatus;
  description: string | null;
  ownerEmail: string | null;
  linkedQuestionIds: string[];
  exampleTerms: string[];
  sourceKeys: string[];
  reviewDate: string | null;
  reviewState: "fresh" | "due" | "overdue" | "none";
  createdAt: string;
  updatedAt: string;
}

export interface ResearchTaxonomySnapshot {
  generatedAt: string;
  summary: {
    total: number;
    active: number;
    intent: number;
    motivation: number;
    theme: number;
    reviewDue: number;
    submissionTags: number;
    autoTagRules: number;
  };
  terms: ResearchTaxonomyTerm[];
}

function reviewState(date: string | null): "fresh" | "due" | "overdue" | "none" {
  if (!date) return "none";
  const dueAt = new Date(date).getTime();
  if (Number.isNaN(dueAt)) return "none";
  const diff = dueAt - Date.now();
  if (diff < 0) return "overdue";
  if (diff <= 7 * 86_400_000) return "due";
  return "fresh";
}

async function fetchExactCount(path: string): Promise<number> {
  try {
    const res = await supabaseFetch(path, {
      method: "HEAD",
      headers: { Prefer: "count=exact" },
    });
    if (!res.ok) return 0;
    const range = res.headers.get("content-range");
    if (!range) return 0;
    const total = range.split("/")[1];
    return total && total !== "*" ? Number.parseInt(total, 10) : 0;
  } catch (err) {
    logger.warn({ err, path }, "Research taxonomy count unavailable");
    return 0;
  }
}

export async function buildResearchTaxonomySnapshot(): Promise<ResearchTaxonomySnapshot> {
  const [termsRes, submissionTags, autoTagRules] = await Promise.all([
    supabaseFetch("/rest/v1/admin_research_taxonomy_term?select=*&order=updated_at.desc", {
      headers: { Range: "0-199" },
    }),
    fetchExactCount("/rest/v1/submission_tag?select=id"),
    fetchExactCount("/rest/v1/admin_tag_rules?select=id&is_active=eq.true"),
  ]);

  if (!termsRes.ok) {
    throw new Error("Research taxonomy query failed.");
  }

  const rows = (await termsRes.json()) as ResearchTaxonomyRow[];
  const terms = rows.map((row) => ({
    id: row.id,
    adminEmail: row.admin_email,
    label: row.label,
    taxonomyType: row.taxonomy_type,
    status: row.status,
    description: row.description,
    ownerEmail: row.owner_email,
    linkedQuestionIds: Array.isArray(row.linked_question_ids) ? row.linked_question_ids : [],
    exampleTerms: Array.isArray(row.example_terms) ? row.example_terms : [],
    sourceKeys: Array.isArray(row.source_keys) ? row.source_keys : [],
    reviewDate: row.review_date,
    reviewState: reviewState(row.review_date),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      total: terms.length,
      active: terms.filter((term) => term.status === "active").length,
      intent: terms.filter((term) => term.taxonomyType === "intent").length,
      motivation: terms.filter((term) => term.taxonomyType === "motivation").length,
      theme: terms.filter((term) => term.taxonomyType === "theme").length,
      reviewDue: terms.filter(
        (term) => term.reviewState === "due" || term.reviewState === "overdue"
      ).length,
      submissionTags,
      autoTagRules,
    },
    terms,
  };
}
