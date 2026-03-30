import { parseUtmSource } from "@/lib/admin/metric-library";
import { supabaseFetch } from "@/lib/admin/supabase";
import logger from "@/lib/logger";

type Confidence = "high" | "medium" | "low";
type Trend = "up" | "down" | "stable";
type ForecastUnit = "count" | "percent" | "currency";

interface SubmissionRow {
  id: number;
  status: string;
  created_date_time: string;
  duration_ms: number | null;
  utm_tracker: string | null;
}

interface ReportRow {
  id: number;
  created_date_time: string;
}

interface ReportSessionRow {
  id: number;
  personal_report_id: number;
  started_at: string;
}

interface PaymentRow {
  id: number;
  amount: number | null;
  status: string;
  payment_date_time: string | null;
}

interface ScoringRow {
  primary_archetype: string | null;
  survey_submission: { created_date_time: string | null } | null;
}

export interface PredictiveInsight {
  type: string;
  title: string;
  description: string;
  confidence: Confidence;
  metric_value: number | null;
  comparison_value: number | null;
  trend: Trend;
  priority: number;
}

export interface ForecastModule {
  key: string;
  label: string;
  description: string;
  unit: ForecastUnit;
  currentValue: number;
  previousValue: number;
  forecastValue: number;
  lowerBound: number;
  upperBound: number;
  deltaPct: number;
  actualVsForecastPct: number | null;
  confidence: Confidence;
  trend: Trend;
  href: string;
  series: Array<{ date: string; actual: number }>;
  drilldowns: Array<{ label: string; value: string; href: string }>;
}

export interface ForecastArchetypeMix {
  archetype: string;
  currentShare: number;
  previousShare: number;
  projectedShare: number;
  deltaShare: number;
  confidence: Confidence;
  href: string;
}

export interface ForecastSnapshot {
  days: number;
  forecastHorizonDays: number;
  generatedAt: string;
  modules: ForecastModule[];
  mixForecasts: ForecastArchetypeMix[];
  insights: PredictiveInsight[];
}

const round1 = (value: number) => Math.round(value * 10) / 10;
const round2 = (value: number) => Math.round(value * 100) / 100;
const clampDays = (days: number) => Math.min(Math.max(Number.isNaN(days) ? 30 : days, 14), 90);

function shiftDays(base: Date, days: number) {
  const copy = new Date(base);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function bucketDaily(
  timestamps: string[],
  values?: number[]
): Array<{ date: string; value: number }> {
  const counts = new Map<string, number>();
  timestamps.forEach((timestamp, index) => {
    const date = timestamp.slice(0, 10);
    counts.set(date, (counts.get(date) ?? 0) + (values?.[index] ?? 1));
  });
  return [...counts.entries()]
    .map(([date, value]) => ({ date, value: round2(value) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function fillMissingDays(
  series: Array<{ date: string; value: number }>,
  start: string,
  days: number
): Array<{ date: string; value: number }> {
  const map = new Map(series.map((item) => [item.date, item.value]));
  const startDate = new Date(`${start}T00:00:00.000Z`);
  return Array.from({ length: days }, (_, index) => {
    const date = shiftDays(startDate, index).toISOString().slice(0, 10);
    return { date, value: map.get(date) ?? 0 };
  });
}

function average(values: number[]) {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stdDev(values: number[]) {
  if (values.length <= 1) return 0;
  const mean = average(values);
  return Math.sqrt(
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1)
  );
}

function confidenceFromSeries(values: number[], sampleSize: number): Confidence {
  if (sampleSize >= 50 && values.length >= 14) {
    const mean = average(values);
    const variability = mean === 0 ? 0 : stdDev(values) / Math.max(mean, 1);
    if (variability <= 0.35) return "high";
    if (variability <= 0.65) return "medium";
  }
  if (sampleSize >= 20 && values.length >= 7) return "medium";
  return "low";
}

function deltaPct(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : 100;
  return round1(((current - previous) / previous) * 100);
}

function trendFromDelta(delta: number): Trend {
  if (delta > 2) return "up";
  if (delta < -2) return "down";
  return "stable";
}

function buildCountForecast(
  key: string,
  label: string,
  description: string,
  unit: ForecastUnit,
  href: string,
  currentSeries: Array<{ date: string; value: number }>,
  previousSeries: Array<{ date: string; value: number }>,
  drilldowns: Array<{ label: string; value: string; href: string }>
): ForecastModule {
  const currentValues = currentSeries.map((item) => item.value);
  const previousValues = previousSeries.map((item) => item.value);
  const recentWindow = currentValues.slice(-7);
  const priorWindow = currentValues.slice(-14, -7);
  const projectedDaily = round2(
    Math.max(
      0,
      average(recentWindow) *
        (priorWindow.length === 0
          ? 1
          : 1 +
            Math.max(
              -0.3,
              Math.min(
                0.3,
                ((average(recentWindow) - average(priorWindow)) /
                  Math.max(average(priorWindow), 1)) *
                  0.5
              )
            ))
    )
  );

  const currentTotal = round2(currentValues.reduce((sum, value) => sum + value, 0));
  const previousTotal = round2(previousValues.reduce((sum, value) => sum + value, 0));
  const forecastValue = round2(projectedDaily * currentSeries.length);

  let actualVsForecastPct: number | null = null;
  if (previousValues.length >= 14) {
    const holdoutHistory = previousValues.slice(0, Math.floor(previousValues.length / 2));
    const holdoutTarget = previousValues.slice(Math.floor(previousValues.length / 2));
    const holdoutPrediction = average(holdoutHistory) * holdoutTarget.length;
    const holdoutActual = holdoutTarget.reduce((sum, value) => sum + value, 0);
    actualVsForecastPct =
      holdoutPrediction === 0
        ? null
        : round1(((holdoutActual - holdoutPrediction) / holdoutPrediction) * 100);
  }

  const confidence = confidenceFromSeries(currentValues, currentTotal);
  const band = confidence === "high" ? 0.12 : confidence === "medium" ? 0.2 : 0.32;
  return {
    key,
    label,
    description,
    unit,
    currentValue: currentTotal,
    previousValue: previousTotal,
    forecastValue,
    lowerBound: round2(forecastValue * (1 - band)),
    upperBound: round2(forecastValue * (1 + band)),
    deltaPct: deltaPct(currentTotal, previousTotal),
    actualVsForecastPct,
    confidence,
    trend: trendFromDelta(deltaPct(currentTotal, previousTotal)),
    href,
    series: currentSeries.map((item) => ({ date: item.date, actual: item.value })),
    drilldowns,
  };
}

function buildRateForecast(
  key: string,
  label: string,
  description: string,
  href: string,
  currentNumerator: number,
  currentDenominator: number,
  previousNumerator: number,
  previousDenominator: number,
  currentDailyRates: number[],
  drilldowns: Array<{ label: string; value: string; href: string }>
): ForecastModule {
  const currentValue =
    currentDenominator === 0 ? 0 : round1((currentNumerator / currentDenominator) * 100);
  const previousValue =
    previousDenominator === 0 ? 0 : round1((previousNumerator / previousDenominator) * 100);
  const recentWindow = currentDailyRates.slice(-7);
  const priorWindow = currentDailyRates.slice(-14, -7);
  const forecastValue = round1(
    Math.max(
      0,
      Math.min(
        100,
        average(recentWindow) +
          (priorWindow.length === 0
            ? 0
            : Math.max(-5, Math.min(5, average(recentWindow) - average(priorWindow))) * 0.5)
      )
    )
  );
  const confidence = confidenceFromSeries(currentDailyRates, currentDenominator);
  const band = confidence === "high" ? 3 : confidence === "medium" ? 5 : 8;
  return {
    key,
    label,
    description,
    unit: "percent",
    currentValue,
    previousValue,
    forecastValue,
    lowerBound: round1(Math.max(0, forecastValue - band)),
    upperBound: round1(Math.min(100, forecastValue + band)),
    deltaPct: round1(currentValue - previousValue),
    actualVsForecastPct: null,
    confidence,
    trend: trendFromDelta(currentValue - previousValue),
    href,
    series: currentDailyRates.map((value, index) => ({
      date: String(index + 1),
      actual: round1(value),
    })),
    drilldowns,
  };
}

function topSourceLabel(submissions: SubmissionRow[]) {
  const counts = new Map<string, number>();
  for (const row of submissions) {
    const source = parseUtmSource(row.utm_tracker);
    counts.set(source, (counts.get(source) ?? 0) + 1);
  }
  const winner = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return winner ? `${winner[0]} (${winner[1]})` : "No source split";
}

function averageDurationMinutes(submissions: SubmissionRow[]) {
  const durations = submissions
    .map((row) => row.duration_ms)
    .filter((value): value is number => value != null && value > 0);
  if (durations.length === 0) return "0.0";
  return round1(average(durations) / 60_000).toFixed(1);
}

function buildArchetypeMixForecasts(
  current: ScoringRow[],
  previous: ScoringRow[]
): ForecastArchetypeMix[] {
  const currentMap = new Map<string, number>();
  const previousMap = new Map<string, number>();
  for (const row of current) {
    const key = row.primary_archetype ?? "Unknown";
    currentMap.set(key, (currentMap.get(key) ?? 0) + 1);
  }
  for (const row of previous) {
    const key = row.primary_archetype ?? "Unknown";
    previousMap.set(key, (previousMap.get(key) ?? 0) + 1);
  }
  const currentTotal = [...currentMap.values()].reduce((sum, value) => sum + value, 0);
  const previousTotal = [...previousMap.values()].reduce((sum, value) => sum + value, 0);

  return [...currentMap.entries()]
    .map(([archetype, count]) => {
      const previousCount = previousMap.get(archetype) ?? 0;
      const currentShare = currentTotal === 0 ? 0 : round1((count / currentTotal) * 100);
      const previousShare = previousTotal === 0 ? 0 : round1((previousCount / previousTotal) * 100);
      const deltaShare = round1(currentShare - previousShare);
      return {
        archetype,
        currentShare,
        previousShare,
        projectedShare: round1(Math.max(0, Math.min(100, currentShare + deltaShare * 0.45))),
        deltaShare,
        confidence: currentTotal >= 40 ? "high" : currentTotal >= 20 ? "medium" : "low",
        href: "/admin/archetypes",
      } satisfies ForecastArchetypeMix;
    })
    .sort((a, b) => Math.abs(b.deltaShare) - Math.abs(a.deltaShare))
    .slice(0, 8);
}

export async function buildForecastSnapshot(inputDays: number): Promise<ForecastSnapshot> {
  const days = clampDays(inputDays);
  const now = new Date();
  const currentSince = shiftDays(now, -days).toISOString();
  const previousSince = shiftDays(now, -(days * 2)).toISOString();
  const currentStartDay = shiftDays(now, -days).toISOString().slice(0, 10);
  const previousStartDay = shiftDays(now, -(days * 2))
    .toISOString()
    .slice(0, 10);

  const responses = await Promise.all([
    supabaseFetch(
      `/rest/v1/survey_submission?select=id,status,created_date_time,duration_ms,utm_tracker&created_date_time=gte.${previousSince}&order=created_date_time.asc`,
      { headers: { Range: "0-49999" } }
    ),
    supabaseFetch(
      `/rest/v1/personal_report?select=id,created_date_time&created_date_time=gte.${previousSince}&order=created_date_time.asc`,
      { headers: { Range: "0-49999" } }
    ),
    supabaseFetch(
      `/rest/v1/report_session?select=id,personal_report_id,started_at&started_at=gte.${previousSince}&order=started_at.asc`,
      { headers: { Range: "0-49999" } }
    ),
    supabaseFetch(
      `/rest/v1/payment?select=id,amount,status,payment_date_time&payment_date_time=gte.${previousSince}&order=payment_date_time.asc`,
      { headers: { Range: "0-49999" } }
    ),
    supabaseFetch(
      `/rest/v1/scoring_result?select=primary_archetype,survey_submission!inner(created_date_time)&survey_submission.created_date_time=gte.${previousSince}`,
      { headers: { Range: "0-49999" } }
    ),
    supabaseFetch("/rest/v1/rpc/get_predictive_insights", {
      method: "POST",
      body: JSON.stringify({ p_days: days }),
    }),
  ]);

  if (responses.some((response) => !response.ok)) {
    logger.error(
      { statuses: responses.map((response) => response.status) },
      "Forecast snapshot query failed"
    );
    throw new Error("forecast_snapshot_failed");
  }

  const [submissions, reports, reportSessions, payments, scoringRows, insights] =
    (await Promise.all(responses.map((response) => response.json()))) as [
      SubmissionRow[],
      ReportRow[],
      ReportSessionRow[],
      PaymentRow[],
      ScoringRow[],
      PredictiveInsight[],
    ];

  const submissionsPrevious = submissions.filter((row) => row.created_date_time < currentSince);
  const submissionsCurrent = submissions.filter((row) => row.created_date_time >= currentSince);
  const reportsPrevious = reports.filter((row) => row.created_date_time < currentSince);
  const reportsCurrent = reports.filter((row) => row.created_date_time >= currentSince);
  const sessionsPrevious = reportSessions.filter((row) => row.started_at < currentSince);
  const sessionsCurrent = reportSessions.filter((row) => row.started_at >= currentSince);
  const paymentsPrevious = payments.filter(
    (row) =>
      row.payment_date_time && row.payment_date_time < currentSince && row.status === "succeeded"
  );
  const paymentsCurrent = payments.filter(
    (row) =>
      row.payment_date_time && row.payment_date_time >= currentSince && row.status === "succeeded"
  );
  const scoringCurrent = scoringRows.filter(
    (row) => (row.survey_submission?.created_date_time ?? "") >= currentSince
  );
  const scoringPrevious = scoringRows.filter(
    (row) =>
      (row.survey_submission?.created_date_time ?? "") >= previousSince &&
      (row.survey_submission?.created_date_time ?? "") < currentSince
  );

  const submissionsCurrentSeries = fillMissingDays(
    bucketDaily(submissionsCurrent.map((row) => row.created_date_time)),
    currentStartDay,
    days
  );
  const submissionsPreviousSeries = fillMissingDays(
    bucketDaily(submissionsPrevious.map((row) => row.created_date_time)),
    previousStartDay,
    days
  );
  const reportViewsCurrentSeries = fillMissingDays(
    bucketDaily(sessionsCurrent.map((row) => row.started_at)),
    currentStartDay,
    days
  );
  const reportViewsPreviousSeries = fillMissingDays(
    bucketDaily(sessionsPrevious.map((row) => row.started_at)),
    previousStartDay,
    days
  );
  const revenueCurrentSeries = fillMissingDays(
    bucketDaily(
      paymentsCurrent.map((row) => row.payment_date_time as string),
      paymentsCurrent.map((row) => Number(row.amount ?? 0))
    ),
    currentStartDay,
    days
  );
  const revenuePreviousSeries = fillMissingDays(
    bucketDaily(
      paymentsPrevious.map((row) => row.payment_date_time as string),
      paymentsPrevious.map((row) => Number(row.amount ?? 0))
    ),
    previousStartDay,
    days
  );

  const completedCurrent = submissionsCurrent.filter((row) => row.status === "completed");
  const completedPrevious = submissionsPrevious.filter((row) => row.status === "completed");
  const completionDailyRates = submissionsCurrentSeries.map((item) => {
    const completedCount = completedCurrent.filter(
      (row) => row.created_date_time.slice(0, 10) === item.date
    ).length;
    return item.value === 0 ? 0 : round1((completedCount / item.value) * 100);
  });

  const modules: ForecastModule[] = [
    buildCountForecast(
      "submissions",
      "Submission Volume",
      "Projected starts for the next window based on recent daily pace and trend direction.",
      "count",
      "/admin/submissions",
      submissionsCurrentSeries,
      submissionsPreviousSeries,
      [
        { label: "Top source", value: topSourceLabel(submissionsCurrent), href: "/admin/growth" },
        {
          label: "Completions in window",
          value: `${completedCurrent.length}/${submissionsCurrent.length}`,
          href: "/admin/abandonment",
        },
      ]
    ),
    buildRateForecast(
      "completion_rate",
      "Completion Rate",
      "Projected completion quality for the next window using recent daily completion behavior.",
      "/admin/product-kpis",
      completedCurrent.length,
      submissionsCurrent.length,
      completedPrevious.length,
      submissionsPrevious.length,
      completionDailyRates,
      [
        {
          label: "Daily average",
          value: `${round1(average(completionDailyRates))}%`,
          href: "/admin/abandonment",
        },
        {
          label: "Avg duration",
          value: `${averageDurationMinutes(submissionsCurrent)}m`,
          href: "/admin/submissions",
        },
      ]
    ),
    buildCountForecast(
      "report_views",
      "Report Engagement",
      "Projected report sessions for the next window based on current viewing pace.",
      "count",
      "/admin/reports",
      reportViewsCurrentSeries,
      reportViewsPreviousSeries,
      [
        {
          label: "Reports generated",
          value: `${reportsCurrent.length} in window`,
          href: "/admin/reports",
        },
        {
          label: "Sessions logged",
          value: `${sessionsCurrent.length}`,
          href: "/admin/reports",
        },
      ]
    ),
    buildCountForecast(
      "revenue",
      "Revenue",
      "Projected succeeded payment volume for the next window from recent payment pace.",
      "currency",
      "/admin/revenue",
      revenueCurrentSeries,
      revenuePreviousSeries,
      [
        {
          label: "Succeeded payments",
          value: `${paymentsCurrent.length}`,
          href: "/admin/revenue",
        },
        {
          label: "Avg payment",
          value: `$${average(paymentsCurrent.map((row) => Number(row.amount ?? 0))).toFixed(2)}`,
          href: "/admin/revenue",
        },
      ]
    ),
  ];

  return {
    days,
    forecastHorizonDays: days,
    generatedAt: new Date().toISOString(),
    modules,
    mixForecasts: buildArchetypeMixForecasts(scoringCurrent, scoringPrevious),
    insights: Array.isArray(insights) ? insights : [],
  };
}
