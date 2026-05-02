import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin/auth";
import { buildAllAdminIntelligenceEntries } from "@/lib/admin/intelligence";
import { buildAllAdminKnowledgeArtifacts } from "@/lib/admin/knowledge";
import { hasRole } from "@/lib/admin/roles";
import { excerpt, semanticScore } from "@/lib/admin/next-level";
import { supabaseFetch } from "@/lib/admin/supabase";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import logger from "@/lib/logger";

const PAGE_INDEX = [
  { title: "Submissions", href: "/admin/submissions", keywords: ["responses", "review"] },
  { title: "Strategy Hub", href: "/admin/strategy", keywords: ["opportunities", "guardrails"] },
  { title: "Growth", href: "/admin/growth", keywords: ["channel", "quality", "attribution"] },
  { title: "User Journey", href: "/admin/journey", keywords: ["lineage", "partials"] },
  {
    title: "Question Effectiveness",
    href: "/admin/question-effectiveness",
    keywords: ["dropoff", "friction"],
  },
  { title: "Replay", href: "/admin/replay", keywords: ["clusters", "sessions"] },
  { title: "Risk Score", href: "/admin/risk-score", keywords: ["fraud", "duplicate"] },
  { title: "Retention", href: "/admin/retention", keywords: ["entry path", "cohorts"] },
  { title: "Revenue", href: "/admin/revenue", keywords: ["payments", "attribution"] },
  { title: "Changelog", href: "/admin/changelog", keywords: ["decision", "governance"] },
  { title: "Org Directory", href: "/admin/org", keywords: ["ownership", "assets"] },
  { title: "Report Builder", href: "/admin/report-builder", keywords: ["memo", "summary"] },
];

const ANSWERS_SEARCH_PATH =
  "/rest/v1/survey_submission_answer?select=" +
  "survey_submission_id,answer_text," +
  "survey_question!inner(frontend_qid)," +
  "answer_option!fk_ssa_answer_option(option_text)&order=created_date_time.desc";

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
    bucket: "admin-semantic-search",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const url = new URL(request.url);
  const query = (url.searchParams.get("q") || "").trim();
  const limit = Math.min(20, Math.max(5, parseInt(url.searchParams.get("limit") || "10", 10)));

  if (query.length < 2) {
    return NextResponse.json({
      query,
      pages: PAGE_INDEX.slice(0, 8),
      results: [],
    });
  }

  try {
    const [
      answersRes,
      notesRes,
      investigationsRes,
      changelogRes,
      decisionsRes,
      experimentsRes,
      intelligenceEntries,
      knowledgeArtifacts,
    ] = await Promise.all([
      supabaseFetch(ANSWERS_SEARCH_PATH, { headers: { Range: "0-9999" } }),
      supabaseFetch(
        "/rest/v1/admin_note?select=id,submission_id,content,admin_email,updated_at&order=updated_at.desc",
        {
          headers: { Range: "0-999" },
        }
      ),
      supabaseFetch(
        "/rest/v1/admin_investigation_case?select=id,title,summary,root_cause,status,submission_id,updated_at&order=updated_at.desc",
        { headers: { Range: "0-999" } }
      ),
      supabaseFetch(
        "/rest/v1/product_changelog?select=id,title,description,category,event_date&order=event_date.desc",
        { headers: { Range: "0-499" } }
      ),
      supabaseFetch(
        "/rest/v1/admin_decision_entry?select=id,title,entry_type,status,rationale,expected_impact,observed_effect,updated_at&order=updated_at.desc",
        { headers: { Range: "0-499" } }
      ),
      supabaseFetch(
        "/rest/v1/admin_experiment?select=id,name,hypothesis,status,expected_impact,result_summary,updated_at&order=updated_at.desc",
        { headers: { Range: "0-499" } }
      ),
      buildAllAdminIntelligenceEntries(30, admin.email),
      buildAllAdminKnowledgeArtifacts(30, admin.email, query),
    ]);

    const results: Array<{
      type: string;
      title: string;
      snippet: string;
      href: string;
      score: number;
      meta: string;
    }> = [];

    if (answersRes.ok) {
      const rows = (await answersRes.json()) as Array<{
        survey_submission_id: number;
        answer_text: string | null;
        survey_question: { frontend_qid: string } | null;
        answer_option: { option_text: string } | null;
      }>;

      for (const row of rows) {
        const text = (row.answer_text || row.answer_option?.option_text || "").trim();
        if (!text) continue;
        const score = semanticScore(query, text, [row.survey_question?.frontend_qid ?? ""]);
        if (score <= 0) continue;
        results.push({
          type: "response",
          title: `Submission #${row.survey_submission_id}`,
          snippet: excerpt(text),
          href: `/admin/submissions/${row.survey_submission_id}`,
          score,
          meta: row.survey_question?.frontend_qid ?? "response",
        });
      }
    }

    if (notesRes.ok) {
      const rows = (await notesRes.json()) as Array<{
        id: number;
        submission_id: number;
        content: string;
        admin_email: string;
        updated_at: string;
      }>;
      for (const row of rows) {
        const score = semanticScore(query, row.content, [row.admin_email]);
        if (score <= 0) continue;
        results.push({
          type: "note",
          title: `Admin note on #${row.submission_id}`,
          snippet: excerpt(row.content),
          href: `/admin/submissions/${row.submission_id}`,
          score,
          meta: row.admin_email,
        });
      }
    }

    if (investigationsRes.ok) {
      const rows = (await investigationsRes.json()) as Array<{
        id: number;
        title: string;
        summary: string | null;
        root_cause: string | null;
        status: string;
        submission_id: number | null;
      }>;
      for (const row of rows) {
        const text = [row.title, row.summary, row.root_cause, row.status].filter(Boolean).join(" ");
        const score = semanticScore(query, text, [row.root_cause ?? "", row.status]);
        if (score <= 0) continue;
        results.push({
          type: "investigation",
          title: row.title,
          snippet: excerpt(row.summary || row.root_cause || row.status),
          href: row.submission_id ? `/admin/submissions/${row.submission_id}` : "/admin/strategy",
          score,
          meta: row.status,
        });
      }
    }

    if (changelogRes.ok) {
      const rows = (await changelogRes.json()) as Array<{
        id: number;
        title: string;
        description: string | null;
        category: string;
      }>;
      for (const row of rows) {
        const text = [row.title, row.description, row.category].filter(Boolean).join(" ");
        const score = semanticScore(query, text, [row.category]);
        if (score <= 0) continue;
        results.push({
          type: "change",
          title: row.title,
          snippet: excerpt(row.description || row.category),
          href: "/admin/changelog",
          score,
          meta: row.category,
        });
      }
    }

    if (decisionsRes.ok) {
      const rows = (await decisionsRes.json()) as Array<{
        id: number;
        title: string;
        entry_type: string;
        status: string;
        rationale: string | null;
        expected_impact: string | null;
        observed_effect: string | null;
      }>;
      for (const row of rows) {
        const text = [
          row.title,
          row.entry_type,
          row.status,
          row.rationale,
          row.expected_impact,
          row.observed_effect,
        ]
          .filter(Boolean)
          .join(" ");
        const score = semanticScore(query, text, [row.entry_type, row.status]);
        if (score <= 0) continue;
        results.push({
          type: "decision",
          title: row.title,
          snippet: excerpt(
            row.rationale || row.expected_impact || row.observed_effect || row.status
          ),
          href: "/admin/changelog",
          score,
          meta: `${row.entry_type} · ${row.status}`,
        });
      }
    }

    if (experimentsRes.ok) {
      const rows = (await experimentsRes.json()) as Array<{
        id: number;
        name: string;
        hypothesis: string;
        status: string;
        expected_impact: string | null;
        result_summary: string | null;
      }>;
      for (const row of rows) {
        const text = [row.name, row.hypothesis, row.status, row.expected_impact, row.result_summary]
          .filter(Boolean)
          .join(" ");
        const score = semanticScore(query, text, [row.status]);
        if (score <= 0) continue;
        results.push({
          type: "experiment",
          title: row.name,
          snippet: excerpt(row.hypothesis),
          href: "/admin/experiments",
          score,
          meta: row.status,
        });
      }
    }

    for (const entry of intelligenceEntries) {
      const text = [
        entry.sectionTitle,
        entry.item.title,
        entry.item.detail,
        entry.item.recommendation,
        ...entry.item.capabilities,
        ...entry.item.evidence.map((evidence) => evidence.value),
      ]
        .filter(Boolean)
        .join(" ");
      const score = semanticScore(query, text, [entry.surface, entry.sectionTitle]);
      if (score <= 0) continue;
      results.push({
        type: "intelligence",
        title: entry.item.title,
        snippet: excerpt(entry.item.detail || entry.item.recommendation),
        href: entry.item.href,
        score,
        meta: `${entry.surface} · ${entry.sectionTitle}`,
      });
    }

    for (const artifact of knowledgeArtifacts) {
      const text = [
        artifact.title,
        artifact.summary,
        ...artifact.evidence.map((entry) => entry.value),
      ]
        .filter(Boolean)
        .join(" ");
      const score = semanticScore(query, text, [artifact.type]);
      if (score <= 0) continue;
      results.push({
        type: "knowledge",
        title: artifact.title,
        snippet: excerpt(artifact.summary),
        href: artifact.href,
        score,
        meta: artifact.type,
      });
    }

    const pages = PAGE_INDEX.map((page) => ({
      ...page,
      score: semanticScore(query, page.title, page.keywords),
    }))
      .filter((page) => page.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);

    return NextResponse.json({
      query,
      pages: pages.map(({ score, ...page }) => page),
      results: results.sort((a, b) => b.score - a.score).slice(0, limit),
    });
  } catch (err) {
    logger.error({ err }, "Semantic admin search error");
    return NextResponse.json({ error: "Unable to search admin content." }, { status: 500 });
  }
}
