/**
 * The Survey page (Marcus's "Assessment A · Survey" artboard): starts, submissions and
 * completion; who finished (country, gender, age, device) against a benchmark; the intro
 * slides; and every question with its exits, time and drop-out.
 */
import { assessmentScope } from "./assessment";
import { type Facts } from "./facts";
import { bucketCaption, type ApFilters, rangeLabel } from "./filters";
import {
  comparableStarts,
  launched,
  median,
  ratio,
  startsBlocked,
  startsComplete,
  subsIn,
  totals,
  trend,
  type Totals,
} from "./metrics";
import { head, type PageHead, type Tile } from "./overview";
import type { PostHogResult, SurveyIntroClicks } from "./posthog";
import type { SurveyQuestions } from "./survey";

export type Benchmark = "all" | "same" | "prev";

export interface DemoRow {
  label: string;
  share: number;
  /** null when the benchmark has no finished survey (a period before the data). */
  bench: number | null;
}

export interface DemoCard {
  title: string;
  rows: DemoRow[];
  note: string;
}

export type IntroClicks = SurveyIntroClicks;

export interface IntroSlide {
  n: number;
  name: string;
  purpose: string;
  /** Visitors who reached it (cookie-accepting visitors), as a share of slide 1. */
  reached: number | null;
  reachedShare: number | null;
  /** Of those who reached it, went on to the next screen. */
  cont: number | null;
  /** Median ms from reaching it to the next screen; slide 4's runs to question 1, past the consent. */
  medianMs: number | null;
}

export interface SurveyPayload extends PageHead {
  launched: boolean;
  tiles: Tile[];
  demographics: {
    benchmark: Benchmark;
    n: number;
    benchN: number;
    cards: DemoCard[];
    note: string;
  };
  intro: {
    slides: IntroSlide[];
    /** The slide (1 to 3) most visitors skipped from, straight to question 1; null if none did. */
    mostSkipped: number | null;
    clicks: PostHogResult<IntroClicks> | null;
  };
  questions: SurveyQuestions | null;
  questionsError: string | null;
}

const GENDER: Record<string, string> = {
  Woman: "Women",
  Man: "Men",
  Nonbinary: "Non-binary",
  Other: "Other",
};
const AGE_ORDER = ["18–24", "25–34", "35–44", "45–54", "55–64", "65+"];

export function genderLabel(g: string | null): string {
  if (!g) return "Not stated";
  if (/rather not/i.test(g)) return "Prefer not to say";
  return GENDER[g] ?? g;
}

export function deviceLabel(d: string | null): string {
  return d === "iOS"
    ? "iPhone"
    : d === "Android"
      ? "Android"
      : d === "Desktop"
        ? "Computer"
        : "Unknown";
}

/** Relationship answers grouped as the report reads them; the survey's wording changed over time. */
export function relationshipLabel(r: string | null): string {
  if (!r) return "Not stated";
  if (/^single$/i.test(r)) return "Single";
  if (/exclusive|monogam/i.test(r) && !/non-exclusive/i.test(r)) return "Monogamous";
  if (/open|poly|non-exclusive|multiple|solo/i.test(r)) return "Open or polyamorous";
  return "Undefined or other";
}

function shares(values: string[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const v of values) out.set(v, (out.get(v) ?? 0) + 1);
  for (const [k, n] of out) out.set(k, n / values.length);
  return out;
}

/** One card: this range's mix against the benchmark's, in a fixed or a top-N order. */
export function demoCard(
  title: string,
  now: string[],
  bench: string[],
  note: string,
  order?: string[],
  top = 6
): DemoCard {
  const a = shares(now);
  const b = shares(bench);
  let labels = order
    ? order.filter((l) => a.has(l) || b.has(l))
    : [...a.keys()].sort((x, y) => (a.get(y) ?? 0) - (a.get(x) ?? 0));
  const rest = order ? [...a.keys()].filter((k) => !order.includes(k)) : [];
  labels = [...labels, ...rest];
  // An empty benchmark compares with nothing: no tick and no difference, never a false 0%.
  const hasBench = bench.length > 0;
  let rows = labels.map((label) => ({
    label,
    share: a.get(label) ?? 0,
    bench: hasBench ? (b.get(label) ?? 0) : null,
  }));
  if (!order && rows.length > top) {
    const head = rows.slice(0, top - 1);
    const tail = rows.slice(top - 1);
    rows = [
      ...head,
      {
        label: "Other",
        share: tail.reduce((n, r) => n + r.share, 0),
        // The benchmark's other countries: everything not shown by name.
        bench: hasBench ? 1 - head.reduce((n, r) => n + (r.bench ?? 0), 0) : null,
      },
    ];
  }
  return { title, rows, note };
}

const SLIDES = [
  { name: "Slide 1 · Quality In → Magic Out", purpose: "Accurate answers make an accurate report" },
  { name: "Slide 2 · Judgment-Free Zone", purpose: "No good or bad answers; answer what is true" },
  {
    name: "Slide 3 · Your Privacy Matters",
    purpose: "Encryption, alias email, a link to the Trust Zone",
  },
  { name: "Slide 4 · How the Test Works", purpose: "About 15 minutes, one question at a time" },
];

export function buildSurveyPage(input: {
  facts: Facts;
  previous: Facts | null;
  benchmark: Facts;
  benchmarkKind: Benchmark;
  filters: ApFilters;
  today: string;
  now: Date;
  questions: SurveyQuestions | null;
  questionsError: string | null;
  introClicks: PostHogResult<IntroClicks> | null;
}): SurveyPayload {
  const { facts, previous, filters: f, today, now } = input;
  const scope = assessmentScope(f);
  const t = totals(facts, scope);
  const pRaw = previous ? totals(previous, scope) : null;
  const p: Totals | null = comparableStarts(pRaw, facts.from, previous?.from ?? null, today, scope);
  const caption = bucketCaption(facts.from, facts.to);
  const stB = startsBlocked(scope, facts.from, today);
  const noCmp =
    p && p.starts === null && t.starts !== null ? "no comparison: earlier starts incomplete" : null;
  const tiles: Tile[] = [
    {
      key: "starts",
      label: "Survey starts",
      unit: "count",
      value: t.starts,
      prev: p?.starts ?? null,
      goodWhen: "up",
      spark: trend(facts, scope, (x, from) =>
        startsComplete(from, today, scope) ? x.starts : null
      ),
      foot:
        noCmp ??
        (p?.starts != null
          ? `vs ${p.starts.toLocaleString("en-US")}`
          : "answered at least the first question"),
      blocked: stB,
      trend: caption,
    },
    {
      key: "subs",
      label: "Submissions",
      unit: "count",
      value: t.subs,
      prev: p?.subs ?? null,
      goodWhen: "up",
      spark: trend(facts, scope, (x) => x.subs),
      foot: p ? `vs ${p.subs.toLocaleString("en-US")}` : "finished surveys",
      blocked: null,
      trend: caption,
    },
    {
      key: "completion",
      label: "Completion",
      unit: "pct",
      value: ratio(t.startsFinished, t.starts),
      prev: p ? ratio(p.startsFinished, p.starts) : null,
      goodWhen: "up",
      spark: trend(facts, scope, (x, from) =>
        startsComplete(from, today, scope) ? ratio(x.startsFinished, x.starts) : null
      ),
      foot: noCmp ?? "of the starts, finished (so far)",
      blocked: stB,
      trend: caption,
    },
  ];

  const mine = subsIn(facts, scope);
  const bench = subsIn(input.benchmark, { ...scope, source: "all", device: "all", tier: "all" });
  const benchNote =
    input.benchmarkKind === "all"
      ? "all finished surveys since launch"
      : input.benchmarkKind === "prev"
        ? `all surveys in the previous period, ${rangeLabel(input.benchmark.from, input.benchmark.to)}`
        : "all surveys in the same period";
  const demographics = {
    benchmark: input.benchmarkKind,
    n: mine.length,
    benchN: bench.length,
    cards: [
      demoCard(
        "Country",
        mine.map((s) => s.country ?? "Not stated"),
        bench.map((s) => s.country ?? "Not stated"),
        "From the country question (15001)."
      ),
      demoCard(
        "Gender",
        mine.map((s) => genderLabel(s.gender)),
        bench.map((s) => genderLabel(s.gender)),
        "From the gender question (15010).",
        ["Women", "Men", "Non-binary", "Other", "Prefer not to say", "Not stated"]
      ),
      demoCard(
        "Age",
        mine.map((s) => s.age ?? "Not stated"),
        bench.map((s) => s.age ?? "Not stated"),
        "From the age question (15003).",
        [...AGE_ORDER, "Not stated"]
      ),
      demoCard(
        "Device",
        mine.map((s) => deviceLabel(s.device)),
        bench.map((s) => deviceLabel(s.device)),
        "From the reader's price quote, else the survey's own steps (recorded from 12 Oct 2026); Unknown: neither has one.",
        ["iPhone", "Android", "Computer", "Unknown"]
      ),
    ],
    note: `This range: ${mine.length.toLocaleString("en-US")} finished surveys. Benchmark: ${benchNote} (${bench.length.toLocaleString("en-US")}). While only Assessment A is live, "all surveys" is this survey.`,
  };

  const on = launched(scope);
  const slide = (i: number) => (on ? facts.intro.filter((x) => x.step === `intro_slide_${i}`) : []);
  const reach = [1, 2, 3, 4].map((i) => slide(i).reduce((n, x) => n + x.n, 0));
  const slides: IntroSlide[] = SLIDES.map((s, i) => ({
    n: i + 1,
    name: s.name,
    purpose: s.purpose,
    reached: on ? reach[i]! : null,
    reachedShare: on ? ratio(reach[i]!, reach[0]!) : null,
    cont: on && i < 3 ? ratio(reach[i + 1]!, reach[i]!) : null,
    medianMs: median(slide(i + 1).flatMap((x) => x.ms)),
  }));
  const skips = [1, 2, 3].map((i) => slide(i).reduce((n, x) => n + x.skipped, 0));
  const most = Math.max(...skips);

  return {
    ...head(f, today, now),
    launched: on,
    tiles,
    demographics,
    intro: {
      slides,
      mostSkipped: most > 0 ? skips.indexOf(most) + 1 : null,
      clicks: input.introClicks,
    },
    questions: input.questions,
    questionsError: input.questionsError,
  };
}
