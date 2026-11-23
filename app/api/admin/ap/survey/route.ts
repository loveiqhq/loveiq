import { NextResponse } from "next/server";

import { assessmentScope } from "@features/admin/server/ap/assessment";
import { fetchFacts, fetchFactsFor } from "@features/admin/server/ap/facts";
import { fetchGuideFacts } from "@features/admin/server/ap/guide";
import {
  DATA_START,
  beforeData,
  comparisonRange,
  parseFilters,
  previousRange,
  SURVEY_TRACKING_FROM,
} from "@features/admin/server/ap/filters";
import {
  fetchSurveyIntroClicks,
  fetchSurveySheets,
  POSTHOG_FROM,
  postHogFailed,
  SHEETS_FROM,
} from "@features/admin/server/ap/posthog";
import { apGuard, NO_STORE } from "@features/admin/server/ap/route-guard";
import { fetchSurveyQuestions } from "@features/admin/server/ap/survey";
import { buildSurveyPage, type Benchmark } from "@features/admin/server/ap/survey-page";
import { addDays } from "@features/admin/server/dropoff-weekly";
import { enabledSurveySheets } from "@features/survey/server/sheetSwitches";
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
    const [
      facts,
      previous,
      questions,
      introClicks,
      prevIntroClicks,
      sheetsSeen,
      sheetsOn,
      guide,
      prevGuide,
    ] = await Promise.all([
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
      // The intro tiles' change while they come from PostHog: the same clicks a period earlier,
      // when PostHog saw all of it.
      cmp && !beforeData(cmp) && filters.from < SURVEY_TRACKING_FROM && cmp.from >= POSTHOG_FROM
        ? fetchSurveyIntroClicks(cmp.from, cmp.to).catch(postHogFailed)
        : Promise.resolve(null),
      // The sheets between the questions, from their first day (17 Nov 2026).
      filters.to >= SHEETS_FROM
        ? fetchSurveySheets(filters.from, filters.to).catch(postHogFailed)
        : Promise.resolve(null),
      enabledSurveySheets().catch((err: unknown) => {
        logger.warn({ err }, "AP survey: the sheets' switches could not be read");
        return null;
      }),
      // Survey 2.0's short guide (null when unreadable: the page leaves it out).
      fetchGuideFacts(filters.from, filters.to),
      cmp && !beforeData(cmp) ? fetchGuideFacts(cmp.from, cmp.to) : Promise.resolve(null),
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
        prevIntroClicks,
        sheetsOn,
        sheetsSeen,
        guide,
        prevGuide,
      }),
      { headers: NO_STORE }
    );
  } catch (err) {
    logger.error({ err }, "AP survey page failed");
    return NextResponse.json({ error: "Unable to load the survey page." }, { status: 500 });
  }
}
