import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin/auth";
import { hasRole } from "@/lib/admin/roles";
import { supabaseFetch } from "@/lib/admin/supabase";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import { surveyQuestions } from "@/data/survey-data";
import { reportSections } from "@/data/product-kpis";
import logger from "@/lib/logger";

import type { QuestionKpi, ChapterKpi } from "@/data/product-kpis";

// ─── Helpers ────────────────────────────────────────────────

/** Build a map of qId → question text from survey-data.ts */
const questionTextMap = new Map(surveyQuestions.map((q) => [q.qId, q.question]));

/** Build a map of qId → cId (as string) */
const questionChapterMap = new Map(surveyQuestions.map((q) => [q.qId, String(q.cId)]));

/** Build chapter name lookup: cId (string) → chapter name */
const chapterNameMap = new Map<string, string>();
for (const q of surveyQuestions) {
  const key = String(q.cId);
  if (!chapterNameMap.has(key)) chapterNameMap.set(key, q.chapter);
}

/** Count questions per chapter */
const questionsPerChapter = new Map<string, number>();
for (const q of surveyQuestions) {
  const key = String(q.cId);
  questionsPerChapter.set(key, (questionsPerChapter.get(key) ?? 0) + 1);
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((s, v) => s + (v - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function zScore(value: number, m: number, sd: number): number {
  return sd === 0 ? 0 : (value - m) / sd;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── RPC response shape ─────────────────────────────────────

interface RpcQuestion {
  q_id: string;
  chapter: string;
  reach_n: number;
  dropoff_n: number;
  avg_active_time_s: number | null;
  backtrack_n: number;
}

interface RpcResult {
  questions: RpcQuestion[];
  totalSessions: number;
}

interface ProductKpiMeta {
  windowDays: number;
  windowLabel: string;
  totalSessions: number;
  dataSources: {
    reportSections: {
      source: "sample";
      itemCount: number;
      label: string;
    };
    questions: {
      source: "live";
      itemCount: number;
      coveragePct: number;
      label: string;
    };
    chapters: {
      source: "live";
      itemCount: number;
      coveragePct: number;
      label: string;
    };
  };
  warnings: string[];
}

// ─── Route handler ──────────────────────────────────────────

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
    bucket: "admin-product-kpis",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const url = new URL(request.url);
  const days = parseInt(url.searchParams.get("days") || "0", 10);
  const since = days > 0 ? new Date(Date.now() - days * 86_400_000).toISOString() : null;

  try {
    const rpcRes = await supabaseFetch("/rest/v1/rpc/get_product_kpis", {
      method: "POST",
      body: JSON.stringify({ since_ts: since }),
    });

    if (!rpcRes.ok) {
      logger.error("Product KPIs: Supabase RPC failed");
      return NextResponse.json({ error: "Unable to load KPI data." }, { status: 500 });
    }

    const rpcData = (await rpcRes.json()) as RpcResult;
    const { totalSessions } = rpcData;
    const rpcQuestions = rpcData.questions ?? [];

    // ─── Build question KPIs ─────────────────────────────────

    const questions: QuestionKpi[] = rpcQuestions.map((rq) => {
      const reachN = rq.reach_n;
      const dropoffN = rq.dropoff_n;
      const backtrackN = rq.backtrack_n;
      const avgActiveTimeS = rq.avg_active_time_s != null ? round1(rq.avg_active_time_s) : null;

      return {
        qId: rq.q_id,
        cId: questionChapterMap.get(rq.q_id) ?? rq.chapter,
        question: questionTextMap.get(rq.q_id) ?? rq.q_id,
        reachN,
        dropoffN,
        avgActiveTimeS,
        backtrackN,
        guidanceTooltipOpenN: null,
        errorN: null,
        reachPct: totalSessions > 0 ? round1((reachN / totalSessions) * 100) : null,
        dropoffPct: reachN > 0 ? round1((dropoffN / reachN) * 100) : null,
        backtrackPct: reachN > 0 ? round1((backtrackN / reachN) * 100) : null,
        guidanceTooltipOpenPct: null,
        errorPct: null,
        frictionIndex: null, // computed below
      };
    });

    // ─── Compute friction z-scores for questions ─────────────

    const timeValues = questions.map((q) => q.avgActiveTimeS).filter((v): v is number => v != null);
    const dropoffValues = questions.map((q) => q.dropoffPct).filter((v): v is number => v != null);
    const backtrackValues = questions
      .map((q) => q.backtrackPct)
      .filter((v): v is number => v != null);

    const timeMean = mean(timeValues);
    const timeStd = stdDev(timeValues);
    const dropoffMean = mean(dropoffValues);
    const dropoffStd = stdDev(dropoffValues);
    const backtrackMean = mean(backtrackValues);
    const backtrackStd = stdDev(backtrackValues);

    for (const q of questions) {
      if (q.avgActiveTimeS != null && q.dropoffPct != null && q.backtrackPct != null) {
        q.frictionIndex = round2(
          zScore(q.avgActiveTimeS, timeMean, timeStd) +
            zScore(q.dropoffPct, dropoffMean, dropoffStd) +
            zScore(q.backtrackPct, backtrackMean, backtrackStd)
        );
      }
    }

    // ─── Build chapter KPIs ──────────────────────────────────

    // Group questions by chapter
    const byChapter = new Map<string, QuestionKpi[]>();
    for (const q of questions) {
      const arr = byChapter.get(q.cId) ?? [];
      arr.push(q);
      byChapter.set(q.cId, arr);
    }

    // Build chapter rows for ALL known chapters (including those without data)
    const allChapterIds = [...new Set(surveyQuestions.map((q) => String(q.cId)))].sort(
      (a, b) => Number(a) - Number(b)
    );

    const chapters: ChapterKpi[] = allChapterIds.map((cId) => {
      const cQuestions = byChapter.get(cId);
      const numQsTotal = questionsPerChapter.get(cId) ?? 0;
      const numQsIys = cQuestions?.length ?? 0;

      if (!cQuestions || cQuestions.length === 0) {
        return {
          cId,
          chapterName: chapterNameMap.get(cId) ?? `Chapter ${cId}`,
          numQsNonIntro: numQsTotal,
          numQsIys: 0,
          entryN: null,
          lastReachN: null,
          dropoffNSum: null,
          completionPct: null,
          dropoffPct: null,
          timePerEntryS: null,
          backtrackPct: null,
          frictionIndex: null,
        };
      }

      // cQuestions.length > 0 checked in the early-return above.
      const entryN = cQuestions[0]!.reachN;
      const lastReachN = cQuestions[cQuestions.length - 1]!.reachN;
      const dropoffNSum = cQuestions.reduce((s, q) => s + (q.dropoffN ?? 0), 0);
      const totalTime = cQuestions.reduce((s, q) => s + (q.avgActiveTimeS ?? 0), 0);
      const totalBacktrack = cQuestions.reduce((s, q) => s + (q.backtrackN ?? 0), 0);
      const totalReach = cQuestions.reduce((s, q) => s + (q.reachN ?? 0), 0);

      return {
        cId,
        chapterName: chapterNameMap.get(cId) ?? `Chapter ${cId}`,
        numQsNonIntro: numQsTotal,
        numQsIys: numQsIys,
        entryN: entryN,
        lastReachN: lastReachN,
        dropoffNSum,
        completionPct:
          entryN != null && entryN > 0 && lastReachN != null
            ? round2((lastReachN / entryN) * 100)
            : null,
        dropoffPct: entryN != null && entryN > 0 ? round2((dropoffNSum / entryN) * 100) : null,
        timePerEntryS: entryN != null && entryN > 0 ? round1(totalTime) : null,
        backtrackPct: totalReach > 0 ? round2((totalBacktrack / totalReach) * 100) : null,
        frictionIndex: null, // computed below
      };
    });

    // ─── Compute friction z-scores for chapters ──────────────

    const chWithData = chapters.filter((c) => c.entryN != null);
    const cTimeVals = chWithData.map((c) => c.timePerEntryS!);
    const cDropVals = chWithData.map((c) => c.dropoffPct!);
    const cBackVals = chWithData.map((c) => c.backtrackPct!);

    const cTimeMean = mean(cTimeVals);
    const cTimeStd = stdDev(cTimeVals);
    const cDropMean = mean(cDropVals);
    const cDropStd = stdDev(cDropVals);
    const cBackMean = mean(cBackVals);
    const cBackStd = stdDev(cBackVals);

    for (const c of chWithData) {
      c.frictionIndex = round2(
        zScore(c.timePerEntryS!, cTimeMean, cTimeStd) +
          zScore(c.dropoffPct!, cDropMean, cDropStd) +
          zScore(c.backtrackPct!, cBackMean, cBackStd)
      );
    }

    const nonIntroQuestions = surveyQuestions.filter((q) => !q.qId.startsWith("00"));
    const chaptersWithData = chapters.filter((c) => c.entryN != null);
    const questionCoveragePct =
      nonIntroQuestions.length > 0
        ? round1((questions.length / nonIntroQuestions.length) * 100)
        : 0;
    const chapterCoveragePct =
      allChapterIds.length > 0 ? round1((chaptersWithData.length / allChapterIds.length) * 100) : 0;

    const warnings: string[] = [];
    warnings.push(
      "Report section KPIs are currently static sample data, not live production metrics."
    );
    if (totalSessions < 25) {
      warnings.push("Question and chapter metrics are based on a small sample in this window.");
    }
    if (questionCoveragePct < 100) {
      warnings.push(
        `${nonIntroQuestions.length - questions.length} survey questions have no live behavior coverage in this window.`
      );
    }
    if (chapterCoveragePct < 100) {
      warnings.push(
        `${allChapterIds.length - chaptersWithData.length} chapters have no live behavior coverage in this window.`
      );
    }

    const meta: ProductKpiMeta = {
      windowDays: days,
      windowLabel: days > 0 ? `Last ${days} days` : "All time",
      totalSessions,
      dataSources: {
        reportSections: {
          source: "sample",
          itemCount: reportSections.length,
          label: "Static report-section benchmark dataset",
        },
        questions: {
          source: "live",
          itemCount: questions.length,
          coveragePct: questionCoveragePct,
          label: "Live behavior-derived question metrics",
        },
        chapters: {
          source: "live",
          itemCount: chaptersWithData.length,
          coveragePct: chapterCoveragePct,
          label: "Live chapter aggregates from question metrics",
        },
      },
      warnings,
    };

    return NextResponse.json({ reportSections, questions, chapters, meta });
  } catch (err) {
    logger.error({ err }, "Product KPIs error");
    return NextResponse.json({ error: "Unable to load KPI data." }, { status: 500 });
  }
}
