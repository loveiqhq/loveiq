import { NextResponse } from "next/server";
import { verifyAdminSession } from "@features/admin/server/auth";
import { hasRole } from "@features/admin/server/roles";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import { supabaseFetch } from "@features/admin/server/supabase";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

const responseHeaders = {
  "Cache-Control": "no-store, max-age=0",
};

const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "with",
  "by",
  "from",
  "is",
  "it",
  "this",
  "that",
  "was",
  "are",
  "be",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "could",
  "should",
  "may",
  "might",
  "can",
  "not",
  "no",
  "so",
  "if",
  "then",
  "than",
  "very",
  "just",
  "about",
  "up",
  "out",
  "my",
  "me",
  "i",
  "you",
  "he",
  "she",
  "we",
  "they",
  "them",
  "his",
  "her",
  "its",
  "our",
  "your",
  "their",
  "what",
  "which",
  "who",
  "when",
  "where",
  "how",
  "all",
  "each",
  "every",
  "both",
  "few",
  "more",
  "most",
  "other",
  "some",
  "such",
  "only",
  "own",
  "same",
  "also",
  "as",
  "like",
  "because",
  "really",
  "much",
  "been",
]);

interface AnswerRow {
  id: number;
  answer_text: string;
  survey_question: { id: number; frontend_qid: string; question_text: string } | null;
  survey_submission: {
    scoring_result: { primary_archetype: string | null } | null;
  } | null;
}

function incrementCount<K>(map: Map<K, number>, key: K, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function getOrCreate<K, V>(map: Map<K, V>, key: K, create: () => V): V {
  const existing = map.get(key);
  if (existing) return existing;
  const value = create();
  map.set(key, value);
  return value;
}

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
    bucket: "admin-text-analysis",
    limit: 15,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const url = new URL(request.url);
  const questionId = url.searchParams.get("questionId");

  try {
    let query = `/rest/v1/survey_submission_answer?select=id,answer_text,survey_question(id,frontend_qid,question_text),survey_submission(scoring_result(primary_archetype))&answer_text=not.is.null&answer_text=neq.&order=id.desc`;
    if (questionId) {
      query += `&survey_question_id=eq.${questionId}`;
    }

    const res = await supabaseFetch(query, { headers: { Range: "0-4999" } });

    if (!res.ok) {
      logger.error({ status: res.status }, "Text analysis query failed");
      return NextResponse.json({ error: "Unable to load data." }, { status: 500 });
    }

    const rows = (await res.json()) as AnswerRow[];

    // Group by question for summary
    const questionMap = new Map<
      string,
      { text: string; qid: string; count: number; totalLen: number }
    >();
    for (const r of rows) {
      const q = r.survey_question;
      if (!q) continue;
      const key = String(q.id);
      const question = getOrCreate(questionMap, key, () => ({
        text: q.question_text,
        qid: q.frontend_qid,
        count: 0,
        totalLen: 0,
      }));
      question.count++;
      question.totalLen += r.answer_text.length;
    }

    const questions = [...questionMap.entries()].map(([id, d]) => ({
      questionId: id,
      questionText: d.text?.slice(0, 80) || d.qid,
      responseCount: d.count,
      avgLength: d.count > 0 ? Math.round(d.totalLen / d.count) : 0,
    }));

    // Word frequency
    const wordCounts = new Map<string, number>();
    for (const r of rows) {
      const words = r.answer_text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .split(/\s+/)
        .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
      for (const w of words) {
        incrementCount(wordCounts, w);
      }
    }
    const keywords = [...wordCounts.entries()]
      .map(([word, count]) => ({ word, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 50);

    // Responses for display
    const responses = rows.slice(0, 200).map((r) => ({
      id: r.id,
      text: r.answer_text,
      archetype: r.survey_submission?.scoring_result?.primary_archetype || "",
    }));

    const totalLen = rows.reduce((s, r) => s + r.answer_text.length, 0);
    const avgLength = rows.length > 0 ? Math.round(totalLen / rows.length) : 0;

    return NextResponse.json(
      {
        questions,
        keywords,
        responses,
        totalResponses: rows.length,
        avgLength,
        responseCount: responses.length,
      },
      {
        headers: responseHeaders,
      }
    );
  } catch (err) {
    logger.error({ err }, "Text analysis error");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
