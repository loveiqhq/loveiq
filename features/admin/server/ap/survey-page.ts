/**
 * The Survey page (Marcus's "Assessment A · Survey" artboard): starts, submissions and
 * completion; who finished (country, gender, age, device) against a benchmark; the cards
 * before question 1; and every question with its exits, time and drop-out.
 */
import { assessmentScope } from "./assessment";
import { deviceClass, type Facts, type IntroFact, type SubFact } from "./facts";
import { bucketCaption, type ApFilters, rangeLabel, SURVEY_TRACKING_FROM } from "./filters";
import { fmt } from "./format";
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
  /** Shown instead of the figures when the range starts before the row was recorded. */
  pending?: string;
}

export interface DemoCard {
  title: string;
  rows: DemoRow[];
  note: string;
}

export type IntroClicks = SurveyIntroClicks;

/** One card before question 1. Every figure is null where it was not recorded. */
export interface IntroCard {
  /** Its funnel_event step: intro_view, intro_slide_1 to intro_slide_4 or consent_view. */
  step: string;
  name: string;
  purpose: string;
  /** Visitors who reached it (cookie-accepting visitors), and as a share of the first card. */
  reached: number | null;
  reachedShare: number | null;
  /** Of those who reached it, went on to the next card that day. */
  cont: number | null;
  /** Median ms from reaching it to the next card; before SURVEY_TRACKING_FROM slide 4's ran to question 1. */
  medianMs: number | null;
  /** Of those who reached it: pressed Skip Intro there (slides only), went back, left there. */
  skip: number | null;
  back: number | null;
  exit: number | null;
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
    /** The intro, slides 1 to 4 and the consent, in order. */
    cards: IntroCard[];
    /** The slide (1 to 3) most visitors skipped from, straight to question 1; null if none did. */
    mostSkipped: number | null;
    clicks: PostHogResult<IntroClicks> | null;
    /** The day Skip, Back, Exit and the intro's and consent's cards start, when the range starts earlier. */
    recordedFrom: string | null;
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
  const c = deviceClass(d);
  return c === "phone"
    ? "Mobile"
    : c === "computer"
      ? "Desktop"
      : c === "tablet"
        ? "Tablet"
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

/**
 * The device card: Mobile, Desktop and Tablet always, Unknown when any. Tablets are told apart
 * from SURVEY_TRACKING_FROM, so a range starting earlier shows when, and a benchmark starting
 * earlier has no tablet figure. The iPhone and Android split of Mobile is in the note.
 */
function deviceCard(mine: SubFact[], bench: SubFact[], from: string, benchFrom: string): DemoCard {
  const launch = rangeLabel(SURVEY_TRACKING_FROM, SURVEY_TRACKING_FROM);
  const phones = mine.filter((s) => deviceClass(s.device) === "phone");
  const iphone = ratio(phones.filter((s) => s.device === "iOS").length, phones.length);
  const card = demoCard(
    "Device",
    mine.map((s) => deviceLabel(s.device)),
    bench.map((s) => deviceLabel(s.device)),
    `Mobile is iPhone and Android${iphone === null ? "" : ` (here ${fmt("pct", iphone, 0)} iPhone, ${fmt("pct", 1 - iphone, 0)} Android)`}, from the reader's price quote, else the survey's own steps (recorded from 12 Oct 2026). Tablet from the survey's steps, recorded from ${launch}; before, tablets count as Mobile or Desktop. Unknown: neither has one.`,
    ["Mobile", "Desktop", "Tablet", "Unknown"]
  );
  const rows = ["Mobile", "Desktop", "Tablet"].map(
    (label) =>
      card.rows.find((r) => r.label === label) ?? {
        label,
        share: 0,
        bench: bench.length ? 0 : null,
      }
  );
  const tablet = rows[2]!;
  if (from < SURVEY_TRACKING_FROM)
    rows[2] = { ...tablet, share: 0, bench: null, pending: `Recorded from ${launch}` };
  else if (benchFrom < SURVEY_TRACKING_FROM) rows[2] = { ...tablet, bench: null };
  return { ...card, rows: [...rows, ...card.rows.filter((r) => r.label === "Unknown")] };
}

/** The cards before question 1, by their funnel_event steps and how each is gone back from or skipped. */
const CARDS: Array<{ step: string; name: string; purpose: string; back?: string; skip?: string }> =
  [
    {
      step: "intro_view",
      name: "Intro · Let’s prepare you",
      purpose: "Start with Continue or a tap on the silhouette",
    },
    {
      step: "intro_slide_1",
      name: "Slide 1 · Quality In → Magic Out",
      purpose: "Accurate answers make an accurate report",
      back: "intro_back_1",
      skip: "intro_skip_1",
    },
    {
      step: "intro_slide_2",
      name: "Slide 2 · Judgment-Free Zone",
      purpose: "No good or bad answers; answer what is true",
      back: "intro_back_2",
      skip: "intro_skip_2",
    },
    {
      step: "intro_slide_3",
      name: "Slide 3 · Your Privacy Matters",
      purpose: "Encryption, alias email, a link to the Trust Zone",
      back: "intro_back_3",
      skip: "intro_skip_3",
    },
    {
      step: "intro_slide_4",
      name: "Slide 4 · How the Test Works",
      purpose: "About 15 minutes, one question at a time",
      back: "intro_back_4",
      skip: "intro_skip_4",
    },
    {
      step: "consent_view",
      name: "Consent · Before we begin",
      purpose: "18+ confirmation and terms; I agree or Return to site",
      back: "consent_back",
    },
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
      deviceCard(mine, bench, facts.from, input.benchmark.from),
    ],
    note: `This range: ${mine.length.toLocaleString("en-US")} finished surveys. Benchmark: ${benchNote} (${bench.length.toLocaleString("en-US")}). While only Assessment A is live, "all surveys" is this survey.`,
  };

  const on = launched(scope);
  // Skip, Back, Exit and the intro's and consent's own rows start on SURVEY_TRACKING_FROM: a
  // range starting earlier would read them low, so the page says when they start instead.
  const tracked = facts.from >= SURVEY_TRACKING_FROM;
  const rowsOf = (step: string) => (on ? facts.intro.filter((x) => x.step === step) : []);
  const count = (step: string) => rowsOf(step).reduce((n, x) => n + x.n, 0);
  /** Over the days; null when a day lacks the figure (a reader older than it). */
  const sum = (step: string, pick: (x: IntroFact) => number | null): number | null => {
    const v = rowsOf(step).map(pick);
    return v.every((n): n is number => typeof n === "number") ? v.reduce((a, n) => a + n, 0) : null;
  };
  const first = count(tracked ? "intro_view" : "intro_slide_1");
  const cards: IntroCard[] = CARDS.map((c) => {
    const known = on && (tracked || c.step.startsWith("intro_slide_"));
    const reached = count(c.step);
    const of = (n: number | null) => (known ? ratio(n, reached) : null);
    const later = (n: number | null) => (tracked ? of(n) : null);
    return {
      step: c.step,
      name: c.name,
      purpose: c.purpose,
      reached: known ? reached : null,
      reachedShare: known ? ratio(reached, first) : null,
      cont: of(sum(c.step, (x) => x.wentOn)),
      medianMs: known ? median(rowsOf(c.step).flatMap((x) => x.ms)) : null,
      skip: c.skip ? later(count(c.skip)) : null,
      back: c.back ? later(count(c.back)) : null,
      exit: later(sum(c.step, (x) => x.left)),
    };
  });
  const skips = [1, 2, 3].map((i) => rowsOf(`intro_slide_${i}`).reduce((n, x) => n + x.skipped, 0));
  const most = Math.max(...skips);

  return {
    ...head(f, today, now),
    launched: on,
    tiles,
    demographics,
    intro: {
      cards,
      mostSkipped: most > 0 ? skips.indexOf(most) + 1 : null,
      clicks: input.introClicks,
      recordedFrom: on && !tracked ? rangeLabel(SURVEY_TRACKING_FROM, SURVEY_TRACKING_FROM) : null,
    },
    questions: input.questions,
    questionsError: input.questionsError,
  };
}
