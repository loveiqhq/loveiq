/**
 * The Survey page (Marcus's "Assessment A · Survey" artboard): starts, submissions and
 * completion; who finished (country, gender, age, device) against a benchmark; the cards
 * before question 1; and every question with its exits, time and drop-out.
 */
import { assessmentScope } from "./assessment";
import { deviceClass, type Facts, type IntroFact, type SubFact } from "./facts";
import {
  bucketCaption,
  type ApFilters,
  rangeLabel,
  SURVEY_TRACKING_FROM,
  trendBuckets,
} from "./filters";
import { fmt, lowerFirst } from "./format";
import {
  comparableStarts,
  launched,
  median,
  peopleBlocked,
  ratio,
  startsBlocked,
  startsComplete,
  STARTS_INCOMPLETE,
  STEP_DEVICE_FROM,
  subsIn,
  totals,
  trend,
  type Totals,
} from "./metrics";
import { head, type PageHead, type Tile } from "./common";
import { POSTHOG_FROM, type PostHogResult, type SurveyIntroClicks } from "./posthog";
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
  /**
   * Visitors who reached it (every visitor from SURVEY_TRACKING_FROM, before it only those who
   * accepted cookies), and as a share of the first card. The
   * consent's share leaves out its visitors who saw no intro (they started from the landing
   * page's card), so it never passes the intro's reach.
   */
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
    /** Why the cards are blank under these filters (peopleBlocked), or null. */
    blocked: string | null;
    n: number;
    benchN: number;
    cards: DemoCard[];
    note: string;
  };
  intro: {
    /** The intro, slides 1 to 4 and the consent, in order. */
    cards: IntroCard[];
    clicks: PostHogResult<IntroClicks> | null;
    /** The day Skip, Back, Exit and the intro's and consent's cards start, when the range starts earlier. */
    recordedFrom: string | null;
    /**
     * The design's four boxes as headline tiles (16 Oct 2026): saw the intro, agreed to the
     * consent, skipped slides, left before question 1, each against the period before.
     */
    tiles: Tile[];
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
/** The design's age bands: the survey's 55–64 and 65+ read as one. */
export const AGE_BANDS = ["18–24", "25–34", "35–44", "45–54", "55+"];

export function ageBand(a: string | null): string {
  if (!a) return "Not stated";
  return a === "55–64" || a === "65+" ? "55+" : a;
}

export function genderLabel(g: string | null): string {
  if (!g) return "Not stated";
  if (/rather not/i.test(g)) return "Rather not label";
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
    `Mobile is iPhone and Android${iphone === null ? "" : ` (here ${fmt("pct", iphone, 0)} iPhone, ${fmt("pct", 1 - iphone, 0)} Android)`}, from the reader's price quote, else the survey's own steps (recorded from ${rangeLabel(STEP_DEVICE_FROM, STEP_DEVICE_FROM)}). Tablet from the survey's steps, told apart in ranges from ${launch}; in one starting earlier, tablets count as Mobile or Desktop. Unknown: neither has one.`,
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
      name: "Intro · Let’s prepare you to discover your sexual archetypes",
      purpose: "Short guide; start with Continue or a tap on the silhouette",
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
      purpose: "Encryption, alias email, link to the Trust Zone",
      back: "intro_back_3",
      skip: "intro_skip_3",
    },
    {
      step: "intro_slide_4",
      name: "Slide 4 · How the Test Works",
      purpose: "~15 min, one question at a time, Dynamic Guidance",
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
  /** The period before's, for the intro tiles' change while they come from PostHog. */
  prevIntroClicks?: PostHogResult<IntroClicks> | null;
}): SurveyPayload {
  const { facts, filters: f, today, now } = input;
  const scope = assessmentScope(f);
  // An earlier period the filters can't follow (tablets before they were told apart, sources
  // before they were recorded, new or returning before finishers kept their visit) is not
  // compared.
  const previous =
    input.previous && !peopleBlocked(scope, input.previous.from) ? input.previous : null;
  const t = totals(facts, scope);
  const pRaw = previous ? totals(previous, scope) : null;
  const p: Totals | null = comparableStarts(pRaw, facts.from, previous?.from ?? null, today, scope);
  const caption = bucketCaption(facts.from, facts.to);
  // Starts the filters can't follow, or that read low (before 18 Sep, drafts cleared): blank, as
  // on Assessment A, rather than a low count and a high completion.
  const stB =
    startsBlocked(scope, facts.from, today) ??
    (startsComplete(facts.from, today, scope) ? null : `${STARTS_INCOMPLETE}.`);
  // Why the earlier period's starts can't be compared: its days before the steps recorded the
  // device (under a device filter), else its starts are incomplete.
  const prevWhy = previous ? startsBlocked(scope, previous.from, today) : null;
  const noCmpWhy =
    p && p.starts === null && t.starts !== null
      ? prevWhy
        ? prevWhy.replace(/\.$/, "")
        : "earlier starts incomplete"
      : null;
  const noCmp = noCmpWhy ? `no comparison: ${lowerFirst(noCmpWhy)}` : null;
  // The headline tile says it in grey where the change would stand.
  const noCmpNote = noCmp
    ? { note: `No comparison: ${noCmp.slice("no comparison: ".length)}` }
    : {};
  // The design's Completion (502 ÷ 752): the range's submissions over its starts, as Landing's
  // "Survey complete CVR" and Focus's survey completion read it.
  const prevCompletion = p ? ratio(p.subs, p.starts) : null;
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
      ...noCmpNote,
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
      blocked: peopleBlocked(scope, facts.from),
      trend: caption,
    },
    {
      key: "completion",
      label: "Completion",
      unit: "pct",
      value: ratio(t.subs, t.starts),
      prev: prevCompletion,
      goodWhen: "up",
      spark: trend(facts, scope, (x, from) =>
        startsComplete(from, today, scope) ? ratio(x.subs, x.starts) : null
      ),
      foot:
        noCmp ??
        `submissions per start${prevCompletion === null ? "" : ` · vs ${fmt("pct", prevCompletion)}`}`,
      blocked: stB,
      trend: caption,
      ...noCmpNote,
    },
  ];

  const mine = subsIn(facts, scope);
  const bench = subsIn(input.benchmark, {
    ...scope,
    source: "all",
    device: "all",
    tier: "all",
    visitor: "all",
  });
  const benchNote =
    input.benchmarkKind === "all"
      ? "all completed surveys since launch"
      : input.benchmarkKind === "prev"
        ? `all surveys in the previous period, ${rangeLabel(input.benchmark.from, input.benchmark.to)}`
        : "all surveys in the same period";
  // Under a filter the records can't follow, the cards are blank with the reason, never bars
  // of a filtered-out nobody.
  const demoBlocked = peopleBlocked(scope, facts.from);
  const demographics = {
    benchmark: input.benchmarkKind,
    blocked: demoBlocked,
    n: mine.length,
    benchN: bench.length,
    cards: demoBlocked
      ? []
      : [
          // The design's four countries by name, then Other.
          demoCard(
            "Country",
            mine.map((s) => s.country ?? "Not stated"),
            bench.map((s) => s.country ?? "Not stated"),
            "From the country question (15001).",
            undefined,
            5
          ),
          demoCard(
            "Gender",
            mine.map((s) => genderLabel(s.gender)),
            bench.map((s) => genderLabel(s.gender)),
            "From the gender question (15010).",
            ["Women", "Men", "Non-binary", "Other", "Rather not label", "Not stated"]
          ),
          demoCard(
            "Age",
            mine.map((s) => ageBand(s.age)),
            bench.map((s) => ageBand(s.age)),
            "From the age question (15003); 55+ is its 55–64 and 65+.",
            [...AGE_BANDS, "Not stated"]
          ),
          deviceCard(mine, bench, facts.from, input.benchmark.from),
        ],
    note: `This range: ${mine.length.toLocaleString("en-US")} completed surveys. Benchmark: ${benchNote} (${bench.length.toLocaleString("en-US")}). While only Assessment A is live, "all surveys" is this survey.`,
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
  // The consent's visitors who saw no intro that day: they started from the landing page's card.
  const direct = rowsOf("consent_view").reduce((n, x) => n + x.direct, 0);
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
      reachedShare: known
        ? ratio(c.step === "consent_view" ? reached - direct : reached, first)
        : null,
      cont: of(sum(c.step, (x) => x.wentOn)),
      medianMs: known ? median(rowsOf(c.step).flatMap((x) => x.ms)) : null,
      skip: c.skip ? later(count(c.skip)) : null,
      back: c.back ? later(count(c.back)) : null,
      exit: later(sum(c.step, (x) => x.left)),
    };
  });
  const introTiles = buildIntroTiles(
    facts,
    input.previous,
    input.introClicks,
    input.prevIntroClicks ?? null,
    on
  );

  return {
    ...head(f, today, now),
    launched: on,
    tiles,
    demographics,
    intro: {
      cards,
      // PostHog starts on POSTHOG_FROM: a range reaching back before it gets no partial counts,
      // only the reason, as the intro tiles do.
      clicks:
        input.facts.from < POSTHOG_FROM
          ? {
              ok: false,
              error: `From PostHog, which starts on ${rangeLabel(POSTHOG_FROM, POSTHOG_FROM)}: pick a range from that day on.`,
            }
          : input.introClicks,
      recordedFrom: on && !tracked ? rangeLabel(SURVEY_TRACKING_FROM, SURVEY_TRACKING_FROM) : null,
      tiles: introTiles,
    },
    questions: input.questions,
    questionsError: input.questionsError,
  };
}

/**
 * The intro's four figures for a period: from our own records once the period starts on
 * SURVEY_TRACKING_FROM (every visitor), else from PostHog's clicks (a share of its survey
 * sessions). Null where neither can say.
 */
function introFigures(
  x: Facts,
  clicks: PostHogResult<IntroClicks> | null
): { saw: number | null; agreed: number | null; skipped: number | null; left: number | null } {
  if (x.from >= SURVEY_TRACKING_FROM) {
    const rows = (step: string) => x.intro.filter((r) => r.step === step);
    const count = (step: string) => rows(step).reduce((n, r) => n + r.n, 0);
    const saw = count("intro_view");
    const direct = rows("consent_view").reduce((n, r) => n + r.direct, 0);
    const began = saw + direct;
    const wentOn = rows("consent_view").map((r) => r.wentOn);
    const agreed = wentOn.every((n): n is number => typeof n === "number")
      ? ratio(
          wentOn.reduce((a, n) => a + n, 0),
          began
        )
      : null;
    const skipped = ratio(
      [1, 2, 3, 4].reduce((n, i) => n + count(`intro_skip_${i}`), 0),
      saw
    );
    // Everyone who began and never reached question 1 left on one of the cards.
    const left = [
      "intro_view",
      "intro_slide_1",
      "intro_slide_2",
      "intro_slide_3",
      "intro_slide_4",
      "consent_view",
    ]
      .flatMap((step) => rows(step).map((r) => r.left))
      .reduce<number | null>((a, n) => (a === null || n === null ? null : a + n), 0);
    return { saw, agreed, skipped, left: left === null ? null : ratio(left, began) };
  }
  const c = clicks && clicks.ok ? clicks.value : null;
  if (!c || !c.opened) return { saw: c ? c.opened : null, agreed: null, skipped: null, left: null };
  // Left before question 1: the sessions that never reached the questions (the engine never
  // started and nothing was answered), not those that only answered nothing.
  return {
    saw: c.opened,
    agreed: c.agreed / c.opened,
    skipped: c.skipped / c.opened,
    left: 1 - c.reachedQ1 / c.opened,
  };
}

function buildIntroTiles(
  facts: Facts,
  previous: Facts | null,
  clicks: PostHogResult<IntroClicks> | null,
  prevClicks: PostHogResult<IntroClicks> | null,
  on: boolean
): Tile[] {
  const now = introFigures(facts, clicks);
  const own = facts.from >= SURVEY_TRACKING_FROM;
  // PostHog's clicks are whole only from POSTHOG_FROM: a period starting earlier is partial.
  const complete = (x: Facts) => x.from >= POSTHOG_FROM;
  // Compared only like with like: both periods from our records, or both from PostHog.
  const prev =
    previous !== null &&
    previous.from >= SURVEY_TRACKING_FROM === own &&
    complete(previous) &&
    complete(facts)
      ? introFigures(previous, prevClicks)
      : null;
  // Our own records give a line per week; PostHog's clicks are read for the whole range only.
  const points = trendBuckets(facts.from, facts.to);
  const spark = (pick: (f: ReturnType<typeof introFigures>) => number | null) =>
    own
      ? points.map((b) =>
          pick(
            introFigures(
              {
                ...facts,
                from: b.from,
                to: b.to,
                intro: facts.intro.filter((r) => r.day >= b.from && r.day <= b.to),
              },
              null
            )
          )
        )
      : [];
  const why = !on
    ? "Not launched."
    : !complete(facts)
      ? `From PostHog, which starts on ${rangeLabel(POSTHOG_FROM, POSTHOG_FROM)}: pick a range from that day on.`
      : now.saw === null
        ? clicks && !clicks.ok
          ? clicks.error
          : "PostHog could not be read just now."
        : null;
  const tile = (
    key: string,
    label: string,
    unit: Tile["unit"],
    pick: (f: ReturnType<typeof introFigures>) => number | null,
    goodWhen: Tile["goodWhen"]
  ): Tile => ({
    key,
    label,
    unit,
    value: pick(now),
    prev: prev ? pick(prev) : null,
    goodWhen,
    spark: spark(pick),
    foot: "",
    blocked: why,
    trend: "",
  });
  return [
    tile("intro-saw", "Saw the intro", "count", (x) => x.saw, "up"),
    tile("intro-agreed", "Agreed to consent", "pct", (x) => x.agreed, "up"),
    tile("intro-skipped", "Skipped slides", "pct", (x) => x.skipped, "down"),
    tile("intro-left", "Left before Q1", "pct", (x) => x.left, "down"),
  ];
}
