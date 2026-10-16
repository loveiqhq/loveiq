import { NextResponse } from "next/server";

import { assessmentScope } from "@features/admin/server/ap/assessment";
import { fetchFacts, fetchFactsFor } from "@features/admin/server/ap/facts";
import {
  DATA_START,
  beforeData,
  comparisonRange,
  parseFilters,
  previousRange,
} from "@features/admin/server/ap/filters";
import { fetchSurveyIntroClicks, postHogFailed } from "@features/admin/server/ap/posthog";
import { apGuard, NO_STORE } from "@features/admin/server/ap/route-guard";
import { fetchSurveyQuestions } from "@features/admin/server/ap/survey";
import { buildSurveyPage, type Benchmark } from "@features/admin/server/ap/survey-page";
import { addDays } from "@features/admin/server/dropoff-weekly";
import { reportingDay } from "@shared/time/reporting-day";
import logger from "@shared/observability/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** AP-Analytics, the survey page: tiles, demographics, the intro and every question. */
export async function GET(request: Request) {
  const admin = await apGuard(request, { bucket: "admin-ap-survey" });
  if (admin instanceof NextResponse) return admin;

  const now = new Date();
  const today = reportingDay(now);
  const params = new URL(request.url).searchParams;
  const filters = parseFilters(params, today);
  const cmp = comparisonRange(filters);
  const bm = params.get("benchmark");
  const benchmarkKind: Benchmark = bm === "prev" || bm === "same" ? bm : "all";
  const scope = assessmentScope(filters);

  try {
    const [facts, previous, questions, introClicks] = await Promise.all([
      fetchFactsFor(filters.from, filters.to, filters),
      cmp && !beforeData(cmp) ? fetchFactsFor(cmp.from, cmp.to, filters) : Promise.resolve(null),
      fetchSurveyQuestions(filters.from, filters.to, scope).then(
        (q) => ({ q, error: null as string | null }),
        (err: unknown) => {
          logger.warn({ err }, "AP survey: questions unavailable");
          return { q: null, error: "The questions could not be read." };
        }
      ),
      fetchSurveyIntroClicks(filters.from, filters.to).catch(postHogFailed),
    ]);
    // The previous period as the benchmark (the comparison's own facts when it has them).
    const prevRange = previousRange(filters);
    const benchmark =
      benchmarkKind === "prev"
        ? previous
          ? previous
          : beforeData(prevRange)
            ? { ...facts, from: prevRange.from, to: prevRange.to, subs: [] }
            : await fetchFacts(prevRange.from, prevRange.to)
        : benchmarkKind === "same"
          ? facts
          : await fetchFacts(DATA_START, addDays(today, -1));
    return NextResponse.json(
      buildSurveyPage({
        facts,
        previous,
        benchmark,
        benchmarkKind,
        filters,
        today,
        now,
        questions: questions.q,
        questionsError: questions.error,
        introClicks,
      }),
      { headers: NO_STORE }
    );
  } catch (err) {
    logger.error({ err }, "AP survey page failed");
    return NextResponse.json({ error: "Unable to load the survey page." }, { status: 500 });
  }
}
