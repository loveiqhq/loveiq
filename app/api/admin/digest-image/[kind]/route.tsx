/**
 * Edge-runtime PNG generator for the funnel-digest Slack messages.
 *
 * Slack's image proxy is anonymous (cannot send auth headers), so the URL
 * itself carries both the data and an HMAC signature. The cron handler signs
 * a payload, builds a URL like
 *
 *   /api/admin/digest-image/cvr-visitor-start?d=<base64payload>&s=<base64sig>
 *
 * Slack fetches that URL, this route verifies the signature, parses the
 * payload, and returns a PNG rendered with `next/og` ImageResponse (Satori
 * under the hood). Bad signature -> 403 + warn log (no error log to avoid
 * Slack-loop alerts).
 *
 * Why edge: ImageResponse is fastest there, the route is fully deterministic
 * from URL params (no DB), and Vercel's edge handles Slack's retry storms
 * without cold-start cost.
 *
 * Phase 3 chart set (strategy-lead refocus): all rate / retention line charts
 * plus one stage-conversion bar chart. Raw-count charts were deleted as noise.
 */

import { ImageResponse } from "next/og";
import { verifyImagePayload } from "@shared/url/signed-image-url";

export const runtime = "edge";
// Always re-evaluate on request — the URL is the cache key (Slack proxy
// caches on URL anyway), so disable Next's route cache.
export const dynamic = "force-dynamic";

const WIDTH = 800;
const HEIGHT = 500;
// chartShell uses padding=28 (top+bottom=56), header row ~36px, marginTop 18.
// Net body = HEIGHT - 110.
const BODY_OVERHEAD = 110;

// Chart palette. Hex literals only because `next/og` (Satori) doesn't read the
// global CSS — colors must be inline.
//
// LIGHT SURFACE, not the app's dark one. Asked for on the 2026-09-16 sync: white
// backgrounds instead of black, so a chart pasted into a doc, a deck or a printout
// looks like the rest of the material rather than a hole in the page.
const COLORS = {
  bg: "#ffffff",
  text: "#1f2430",
  textMuted: "#5b6472",
  // The categorical pair, validated against THIS surface with the data-viz checker:
  //   node scripts/validate_palette.js "#2563eb,#e0552f" --mode light --surface "#ffffff"
  //   lightness band PASS (both inside L 0.43-0.77) - chroma PASS -
  //   CVD separation 29.2 protan / 33.4 tritan - normal-vision 37.3 - contrast PASS
  // The brand orange #f26d4f was tried first and WARNed on contrast at 2.97:1
  // against white — the same step that already failed the dark surface's lightness
  // band. #e0552f carries over from the dark palette and passes on both.
  accentBlue: "#2563eb",
  accentOrange: "#e0552f",
  /**
   * The ink for a series that is NOT an experiment arm.
   *
   * Slate, 10.35:1 on white, and deliberately neither categorical hue. Blue and
   * orange now MEAN Landing Page V1 and V2 — that is the whole point of binding
   * colour to the arm — so any other series drawn in them is asserting an
   * identity it does not have. On the 2026-09-16 sync this was raised directly:
   * charts where the colours say the wrong thing.
   *
   * `conversion-digest` passes this same value for the site-wide total, for the
   * same reason. Two copies of one hex, both commented, rather than pulling a
   * server module into an edge route for a string.
   */
  neutral: "#334155",
  // Per-arm assignment lives in armColor() in features/attribution/server/labels.ts
  // and rides in the signed payload. These two are the fallback for charts that
  // have no arm (single-series, price buckets, per-question drop-off).

  // Hairline grid + axis rule, carried over from the dark palette BY CONTRAST RATIO
  // rather than by eye: the dark values were measured at gridline 1.24:1 and
  // baseline 1.44:1 against their surface, and these are the greys that hit the same
  // two ratios against white (1.248 and 1.453). Slack downscales an 800px image to
  // the ~360px message column, which collapses a 1px hairline, so a fainter rule
  // disappears there even though it survives on a monitor.
  gridline: "#e6e6e6",
  baseline: "#d6d6d6",
  // The one status step anything draws: the worst drop-out bars and their labels.
  // 6.47:1 on white. The dark set's #f87171 is 2.5:1 there and unreadable.
  //
  // `warn` and `good` were carried over from the dark palette and re-picked for
  // this surface in the same pass — and then found to have ZERO readers in this
  // file. Removed rather than left as tokens whose contrast someone maintains for
  // nothing; the dataviz rule that status colours are reserved applies to the ones
  // that exist.
  danger: "#b91c1c",
};

// The 6 line/curve kinds share `LongitudinalPayload`; `reactivation-email`
// uses `StageConversionPayload`. Order here documents the digest layout.
const VALID_KINDS = new Set([
  "cvr-visitor-start",
  "cvr-start-completion",
  "cvr-completion-engagement",
  "cvr-completion-paygate",
  "cvr-paygate-purchase",
  "bucket-performance",
  "dropout-funnel",
  "dropout-by-arm",
  "conversion-by-arm",
  "metric-trend",
  "reactivation-email",
]);

/**
 * Generic line/curve payload — parallel `labels[]` + `series[][]`. Each
 * labels[i] pairs with series[i] (a per-point value array). For CVR charts the
 * values are already percentages (0..100) computed Node-side via computeRate;
 * `rate: true` switches the readout to "max X%". For the drop-out retention
 * curve the x-axis is question order, not days (subtitle clarifies).
 */
interface LongitudinalPayload {
  kind:
    | "cvr-visitor-start"
    | "cvr-start-completion"
    | "cvr-completion-paygate"
    | "cvr-paygate-purchase"
    | "bucket-performance";
  windowLabel?: string;
  labels: string[];
  /**
   * `null` is a gap, never a plotted zero. A day with too few people to form a
   * rate is not a 0% day, and drawing it as one is how a chart of four
   * purchases in a month comes to oscillate between 0% and 100%.
   */
  series: Array<Array<number | null>>;
  // When true, values are percentages -> readout shows "now X% · max Y%" and
  // the empty-state copy differs. All Phase-3 line charts set this.
  rate?: boolean;
  // Optional x-axis category labels (one per series point — dates for the
  // time-series charts). Sampled to ~5 evenly-spaced ticks under the plot.
  xAxis?: string[];
}

/**
 * Reactivation-email per-stage conversion. One vertical bar per nurture stage
 * showing CVR% (purchased / sent) with sent + purchased counts beneath.
 */
interface StageConversionPayload {
  kind: "reactivation-email";
  windowLabel?: string;
  stages: Array<{ label: string; sent: number; purchased: number }>;
}

/**
 * Drop-out-by-question histogram: one bar per survey question, height = the
 * drop-off RATE at that question (% of people who saw it and did NOT advance).
 * Tall bar = a question where users quit. `worstLabels` flags the steepest few
 * for red highlight + annotation.
 */
interface DropoutPayload {
  kind: "dropout-funnel";
  windowLabel?: string;
  // Compact on purpose: ~59 questions, so only the fields the renderer draws
  // (label + drop-off %) ride in the signed URL to stay under Slack's
  // ~3000-char image_url cap. `reached` is intentionally omitted.
  bars: Array<{ label: string; dropPct: number }>;
}

/**
 * Per-arm drop-off comparison (email-position A/B). Two drop-off-% curves
 * overlaid on ONE shared y-scale so the email-first vs email-last drop at each
 * question — especially Q1, the hypothesis — is directly comparable. `labels`
 * are aligned question labels; `first`/`last` are drop-off % per index.
 */
interface DropoutByArmPayload {
  kind: "dropout-by-arm" | "conversion-by-arm" | "metric-trend";
  windowLabel?: string;
  labels: string[];
  /**
   * `null` means the arm had NO traffic that day — a gap in the line, not a zero.
   * Zero and "not running yet" are different facts, and an arm that launched
   * mid-window otherwise draws a flat 0% line back to the start of the window and
   * claims weeks of zero conversion it was never measured for.
   */
  first: Array<number | null>;
  /**
   * Omit for a SINGLE-series chart. One series is named by the title, so the
   * legend, the end-label sub-name and the two-arm headline all drop out — see
   * the guards below. This exists because the alternative was a second renderer:
   * the sparkline one had no y-axis, no gridlines and a scale pinned to the
   * series' own max, so a 6% rate and a 0.6% rate drew the same picture.
   */
  last?: Array<number | null>;
  /**
   * Optional captions, so the shared-y-scale two-curve renderer can serve any
   * A/B comparison instead of only the email-position one it was written for.
   * All default to the drop-off wording, so the original `dropout-by-arm`
   * payloads render byte-identically.
   *
   * `conversion-by-arm` (the daily conversion digest) supplies its own: arm names
   * come from `armLabel`, so nobody in Slack meets a raw value like `white_prev`.
   */
  title?: string;
  /**
   * What follows every value on the axis, the end labels and the default headline: "%"
   * unless the payload says "" for a count or an amount. `metric-trend` (the brain's
   * show_chart) draws counts and euros on this renderer too. Only those two values are
   * honoured, so the digest's payloads, which never send it, render byte-identically.
   */
  unit?: string;
  legendFirst?: string;
  legendLast?: string;
  headline?: string;
  /** Footnote under the plot; `{peak}` is replaced with the shared y-scale peak. */
  footnote?: string;
  /** Overrides the "not enough per-arm traffic" copy, which is wrong for a site metric. */
  emptyLabel?: string;
  /**
   * The colour each series is drawn in, decided by the PRODUCER from the arm's
   * identity (`armColor()` in features/attribution/server/labels.ts) rather than
   * here from its position in the payload.
   *
   * This is the fix for the 2026-09-16 complaint that V1 and V2 swap colours. The
   * renderer used to paint `first` blue and `last` orange unconditionally, so which
   * arm got which colour depended on the order the caller happened to pass them —
   * and on a day when one arm had no traffic and was dropped, the survivor slid into
   * the `first` slot and changed colour. Sorting the arms by label, which is what
   * conversion-digest did, makes two charts in one message agree but cannot fix the
   * one-arm day, because there is no second arm to sort against.
   *
   * Optional, defaulting to the old positional pair, so `dropout-funnel` and the
   * other armless kinds render byte-identically.
   */
  colorFirst?: string;
  colorLast?: string;
}

type AnyPayload =
  LongitudinalPayload | StageConversionPayload | DropoutPayload | DropoutByArmPayload;

/**
 * Titles in the words the reader uses, not ours.
 *
 * These were the internal step names — "Completion → Report-view CVR (1m / 5m /
 * 10m)", "Paygate → Purchase CVR". Everyone on this chart's distribution list
 * had to decode "CVR", "paygate" and an arrow notation before they could read
 * the line underneath, and the person the digest is written for said plainly
 * that he could not. A chart nobody can read is worse than no chart: it looks
 * like information.
 *
 * Each one now names the PEOPLE it counts and the thing they did, so the title
 * alone answers "what am I looking at".
 */
const LONG_TITLES: Record<LongitudinalPayload["kind"], string> = {
  "cvr-visitor-start": "Visitors who start the survey",
  "cvr-start-completion": "Survey starts that reach the end",
  "cvr-completion-paygate": "Finishers who reach the paywall",
  "cvr-paygate-purchase": "People at the paywall who buy",
  "bucket-performance": "Which price converts best",
};

function chartShell(
  title: string,
  subtitle: string,
  body: React.ReactNode,
  height: number = HEIGHT
): React.ReactElement {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: WIDTH,
        height,
        background: COLORS.bg,
        color: COLORS.text,
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        padding: 28,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          flexShrink: 0,
          // A long title ran straight into the window label with no space at all —
          // "…by landing page21 days to 19 Sep". space-between only separates what
          // is left over, and the production titles leave nothing over.
          gap: 16,
        }}
      >
        <div style={{ fontSize: 26, fontWeight: 700, color: COLORS.text, flexShrink: 1 }}>
          {title}
        </div>
        <div
          style={{
            fontSize: 14,
            color: COLORS.textMuted,
            /**
             * Shrinks and wraps, and is bounded.
             *
             * An earlier version of this fix pinned the subtitle with
             * `flexShrink: 0` + `whiteSpace: nowrap`, which made it win every
             * width dispute — and funnel-digest passes a window label carrying the
             * top revenue bucket, around 77 characters. That squeezed a 26px title
             * into roughly 190px, wrapped it to three lines, and pushed the x-axis
             * tick row off the 500px canvas. The header needed a GAP, which it now
             * has; it did not need the subtitle to be unbreakable.
             */
            maxWidth: 300,
          }}
        >
          {subtitle}
        </div>
      </div>
      <div style={{ marginTop: 18, display: "flex", flexDirection: "column" }}>{body}</div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Line/curve chart (rate CVR series, multi-bucket, retention curve)
// -----------------------------------------------------------------------------

// Few-row charts (1-3 lines — the CVR steps, engagement tiers, retention
// curve) get a tall band so the trend reads as a proper line chart. Many-row
// charts (buckets) stay compact so they fit one image.
const TALL_ROW_H = 110;
const COMPACT_ROW_H = 48;
const FEW_ROW_THRESHOLD = 3;
const ROW_GAP = 8;
const BUFFER = 40;
const MIN_HEIGHT = 220;
const MAX_HEIGHT = 1200;
// Extra height reserved for the shared x-axis tick row when xAxis is present.
const X_AXIS_H = 28;
// Layout columns shared by every line row (and the x-axis tick row, so the
// ticks sit exactly under the plot). label | plot(+gutters) | readout.
const LABEL_W = 150;
/**
 * The y-axis gutter. These charts shipped with NO vertical axis at all — a bare
 * sparkline with a "now x% · max y%" readout beside it — so a reader could see
 * a shape but could not read a value off it, and two stacked rows could not be
 * compared because each was scaled to its own peak. Raised on the 2026-09-19
 * review: "some of the axis are missing, they wouldn't understand".
 */
const Y_AXIS_W = 42;
/**
 * 120 was sized for the `Math.round` readout it used to carry ("now 13% · max
 * 45%"). `computeRate` rounds to ONE DECIMAL and `fmtAxis` prints it, so the
 * common string is now "now 66.7% · max 86.7%" — about 140px. With
 * `justifyContent: flex-end` the overflow is clipped at the START, so the live
 * completion→report-view chart shipped rows reading "ow 66.7% · max 86.7%".
 * Widened to hold the longest producible string, "now 100.0% · max 100.0%".
 */
const READOUT_W = 152;
// 150 + 42 + 398 + 152 = 742, inside the 744 the shell's 28px padding leaves.
const PLOT_W = 398; // svgPoints width == <svg> width == area-close x (clip-safe)

/** Up to 5 evenly-spaced ticks from an x-axis label array (all if <=5). */
/**
 * The INDICES of the ticks to draw, not their labels.
 *
 * It used to return labels, which the caller laid out with
 * `justifyContent: space-between` — spacing five boxes evenly regardless of where
 * their points actually sit. Index 8 of 29 belongs at 27.6% and was drawn at 25%,
 * and the first and last were aligned by box edge rather than by centre. The arm
 * renderer documents this exact bug and fixes it by absolute position; this one
 * was left behind. Same fix, one source of indices.
 */
function sampleTickIdx(n: number): number[] {
  if (n === 0) return [];
  if (n <= 5) return Array.from({ length: n }, (_, i) => i);
  return [
    ...new Set([0, Math.round(n / 4), Math.round(n / 2), Math.round((3 * n) / 4), n - 1]),
  ].map((i) => Math.min(i, n - 1));
}

function rowHeightFor(rowCount: number): number {
  return rowCount <= FEW_ROW_THRESHOLD ? TALL_ROW_H : COMPACT_ROW_H;
}

function longitudinalHeight(rowCount: number, rowH: number): number {
  const bodyNeeded = rowCount * rowH + (rowCount - 1) * ROW_GAP;
  return Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, bodyNeeded + BODY_OVERHEAD + BUFFER));
}

/**
 * SVG `points` string mapping a value series into a chart box. Y inverted
 * (SVG 0 = top) so higher values draw higher. Scales to the row's own peak so
 * a low-magnitude rate (e.g. 5%) still uses the full band height — matches the
 * "each chart its own y-scale" decision.
 */
/**
 * `null` is a GAP, never a plotted zero — the rule the rest of this file already
 * follows. A day with too few people to form a rate must not be drawn as 0%,
 * because 0% is a measurement and "we cannot say" is not.
 *
 * Returns ONE polyline per unbroken run, so a gap breaks the line instead of
 * bridging across it with a straight segment that no data supports.
 */
function svgPointRuns(
  values: Array<number | null>,
  peak: number,
  width: number,
  chartH: number
): string[] {
  if (values.length === 0) return [];
  const safePeak = peak > 0 ? peak : 1;
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  const yOf = (v: number) => Math.round(chartH - (v / safePeak) * chartH);
  const runs: string[] = [];
  let run: string[] = [];
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (v === null || v === undefined || !Number.isFinite(v)) {
      if (run.length > 1) runs.push(run.join(" "));
      run = [];
      continue;
    }
    run.push(`${Math.round(i * step)},${yOf(v)}`);
  }
  if (run.length > 1) runs.push(run.join(" "));
  // A single readable point still deserves a mark: widen it into a short stub
  // rather than emitting a one-point polyline, which renders nothing.
  if (runs.length === 0) {
    const only = values.findIndex((v) => typeof v === "number" && Number.isFinite(v));
    if (only >= 0) {
      const y = yOf(values[only] as number);
      const x = Math.round(only * step);
      return [`${x},${y} ${Math.min(width, x + 6)},${y}`];
    }
  }
  return runs;
}

function svgPoints(values: number[], peak: number, width: number, chartH: number): string {
  if (values.length === 0) return "";
  /**
   * A LONE POINT gets a short horizontal stub, not a zero step.
   *
   * With `step = 0` every point mapped to x=0: the line was a one-point polyline
   * (which renders nothing) and the area became a triangle spanning the whole
   * plot — a full-width wedge from a single reading. The arm renderer widens a
   * lone point for exactly this reason; this one never got the fix. Reachable
   * whenever the sparkline source returns one day.
   */
  if (values.length === 1) {
    const v = values[0] ?? 0;
    const y = Math.round(chartH - (v / (peak > 0 ? peak : 1)) * chartH);
    return `0,${y} ${Math.min(width, 6)},${y}`;
  }
  const step = width / (values.length - 1);
  // peak<=0 (an all-zero series) draws a flat line along the bottom (y=chartH)
  // instead of nothing — so a genuine 0% rate row still shows a visible
  // baseline rather than a blank band.
  const safePeak = peak > 0 ? peak : 1;
  const pts: string[] = [];
  for (let i = 0; i < values.length; i += 1) {
    const x = Math.round(i * step);
    const v = values[i] ?? 0;
    const y = Math.round(chartH - (v / safePeak) * chartH);
    pts.push(`${x},${y}`);
  }
  return pts.join(" ");
}

/** Exported for the test that no non-arm chart uses an arm colour. */
export function renderLongitudinal(p: LongitudinalPayload): {
  element: React.ReactElement;
  height: number;
} {
  const labels = Array.isArray(p.labels) ? p.labels : [];
  const series = Array.isArray(p.series) ? p.series : [];
  const isRate = p.rate === true;
  const allRows: Array<{ label: string; values: Array<number | null>; peak: number }> = [];
  for (let i = 0; i < labels.length; i += 1) {
    const lbl = labels[i];
    const ser = series[i];
    if (typeof lbl !== "string" || !Array.isArray(ser)) continue;
    // A null stays null; anything else is clamped at zero. `Number(null)` is 0,
    // so mapping first and filtering after would turn every gap into a 0% day.
    const values: Array<number | null> = ser.map((v) =>
      v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Math.max(0, Number(v))
    );
    const peak = values.reduce<number>((a, b) => (b === null ? a : Math.max(a, b)), 0);
    allRows.push({ label: lbl, values, peak });
  }
  // Rate charts: KEEP all-zero rows — a flat 0% line is real signal (e.g. a
  // funnel step that converts nobody). The caller already gated on the
  // denominator, so a row here means "this stage had traffic". Count charts
  // keep the old behaviour: hide all-zero rows (no-data noise).
  const liveRows = isRate ? allRows : allRows.filter((r) => r.peak > 0);
  /**
   * ONE scale for every row, not one per row.
   *
   * Per-row scaling made each row fill its own band, so a row peaking at 3% and
   * a row peaking at 100% drew the same height — and these rows are stacked
   * precisely so they can be compared (price bucket A against B, one arm
   * against another). It also meant a reader had no way to know which was
   * which, because there was no axis to read either.
   *
   * A row with a small range now correctly reads as a small range. `axisMax`
   * gives the flat-zero case a usable axis instead of dividing by zero.
   */
  const sharedPeak = liveRows.reduce((m, r) => Math.max(m, r.peak), 0);
  const axisMax = sharedPeak > 0 ? sharedPeak : 1;
  const emptyCount = isRate ? 0 : allRows.length - liveRows.length;
  const title = LONG_TITLES[p.kind] ?? "Trend";

  if (liveRows.length === 0) {
    return {
      element: chartShell(
        title,
        p.windowLabel ?? "",
        <div style={{ display: "flex", color: COLORS.textMuted, fontSize: 18, padding: 24 }}>
          Awaiting data — no traffic on any tracked series yet.
        </div>
      ),
      height: HEIGHT,
    };
  }

  const rowCount = liveRows.length + (emptyCount > 0 ? 1 : 0);
  const rowH = rowHeightFor(rowCount);
  const xAxisLabels = Array.isArray(p.xAxis) ? p.xAxis : [];
  const xTickIdx = sampleTickIdx(xAxisLabels.length);
  const hasXAxis = xTickIdx.length > 0;
  // +22 for the axis caption row added at the bottom of the body.
  const height = longitudinalHeight(rowCount, rowH) + (hasXAxis ? X_AXIS_H : 0) + 22;
  const chartH = Math.max(4, rowH - 14);
  const chartW = PLOT_W;
  // Readout shows TODAY's value + the window peak, so the reader sees the
  // current rate not just the high-water mark.
  const readout = (peak: number, last: number | null | undefined): string =>
    isRate
      ? // fmtAxis, not Math.round. The axis formatter was rewritten precisely
        // because "a 12.7% rate was published as 13%", and this readout kept the
        // rounding — a 0.4% paygate-to-purchase rate printed "now 0% · max 1%"
        // beside a visibly non-zero line, on the chart that routinely runs
        // sub-1%.
        `${last === null || last === undefined ? "now —" : `now ${fmtAxis(last)}%`} · max ${fmtAxis(peak)}%`
      : `peak ${peak.toLocaleString()}`;

  const element = chartShell(
    title,
    p.windowLabel ?? "",
    <div style={{ display: "flex", flexDirection: "column", gap: ROW_GAP }}>
      {liveRows.map((row, rIdx) => {
        /**
         * ONE ink for every row, not an alternating pair.
         *
         * These rows are small multiples — separate plots, stacked, each with its
         * own label on the left. They never overlap, so colour carries no identity
         * here and alternating it is decoration. Decoration would be harmless if
         * the two colours meant nothing; they mean Landing Page V1 and V2. In one
         * funnel-digest message orange was simultaneously "V2", "5-minute
         * engagement" and "price bucket #2", and rows 1 and 3 of the engagement
         * chart shared a colour INSIDE one chart. That is the "some of them are
         * the wrong colour" Mark raised on the 2026-09-16 sync.
         */
        const color = COLORS.neutral;
        const runs = svgPointRuns(row.values, axisMax, chartW, chartH);
        /**
         * ONE area per run, each closed under its OWN x-span.
         *
         * A single polygon built from the last run and closed at x=0 drew a
         * wedge across every gap before it — on the price chart that was a
         * triangle spanning three weeks of dates with no data in them, which is
         * a stronger visual claim than the line it was shading.
         */
        const areas = runs.map((pts) => {
          const xs = pts.split(" ");
          const x0 = Number(xs[0]?.split(",")[0] ?? 0);
          const x1 = Number(xs[xs.length - 1]?.split(",")[0] ?? 0);
          return `${x0},${chartH} ${pts} ${x1},${chartH}`;
        });
        /**
         * "now" means the LAST SLOT, not the last readable one.
         *
         * Reaching back past a gap for the most recent number printed
         * "now 100%" beside a line that stopped three weeks earlier — a stale
         * reading presented as current. When the final day has no rate, the
         * readout says so.
         */
        const lastSlot = row.values.length > 0 ? row.values[row.values.length - 1] : null;
        return (
          <div
            key={`${row.label}-${rIdx}`}
            style={{ display: "flex", alignItems: "center", height: rowH }}
          >
            <div
              style={{
                width: LABEL_W,
                fontSize: 13,
                color: COLORS.textMuted,
                overflow: "hidden",
                whiteSpace: "nowrap",
              }}
            >
              {row.label}
            </div>
            {/*
              The y axis. Repeated on every row because the rows are separate
              flex children and Satori has no row-spanning element — and because
              the scale is now SHARED, so each row shows the same two numbers and
              stays readable on its own.
            */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                alignItems: "flex-end",
                width: Y_AXIS_W,
                height: chartH,
                paddingRight: 6,
                fontSize: 11,
                color: COLORS.textMuted,
              }}
            >
              <div style={{ display: "flex" }}>
                {isRate ? `${fmtAxis(axisMax)}%` : fmtAxis(axisMax)}
              </div>
              <div style={{ display: "flex" }}>0</div>
            </div>
            <div
              style={{
                display: "flex",
                width: chartW + 20,
                paddingLeft: 10,
                paddingRight: 10,
                alignItems: "center",
                height: rowH,
              }}
            >
              <svg width={chartW} height={chartH}>
                {/* Gridline at the top of the shared scale, so the axis number
                    has a line to belong to rather than floating beside a shape. */}
                <polyline
                  points={`0,1 ${chartW},1`}
                  fill="none"
                  stroke={COLORS.gridline}
                  strokeWidth="1"
                />
                {/* faint 0% baseline (polyline — the proven Satori primitive in
                    this file — instead of <line>) so the floor is visible */}
                <polyline
                  points={`0,${chartH - 1} ${chartW},${chartH - 1}`}
                  fill="none"
                  stroke={COLORS.baseline}
                  strokeWidth="1"
                />
                {/*
                  0.12, not 0.22. The old value was tuned for a saturated accent
                  on a dark surface; under the neutral slate on white the same
                  opacity composites to #d2d5da — a 1.47:1 wash heavy enough to
                  compete with the 2px line that actually carries the data, which
                  made five stacked rows read as grey blocks. 0.12 lands at 1.23:1,
                  just under the gridline step, so the band reads as shading and
                  the line reads as the mark.
                */}
                {areas.map((pts, i) => (
                  <polygon key={`area-${i}`} points={pts} fill={color} fillOpacity="0.12" />
                ))}
                {/* One polyline per unbroken run, so a gap BREAKS the line
                    rather than being bridged by a segment no data supports. */}
                {runs.map((pts, i) => (
                  <polyline
                    key={`run-${i}`}
                    points={pts}
                    fill="none"
                    stroke={color}
                    strokeWidth="2"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                ))}
              </svg>
            </div>
            <div
              style={{
                display: "flex",
                width: READOUT_W,
                fontSize: 12,
                color: COLORS.text,
                justifyContent: "flex-end",
                whiteSpace: "nowrap",
                overflow: "hidden",
              }}
            >
              {readout(row.peak, lastSlot)}
            </div>
          </div>
        );
      })}
      {hasXAxis && (
        <div style={{ display: "flex", alignItems: "center", height: X_AXIS_H }}>
          <div style={{ width: LABEL_W }} />
          <div style={{ width: Y_AXIS_W }} />
          {/* each tick centred on the data point it names, not spaced evenly */}
          <div
            style={{
              display: "flex",
              position: "relative",
              width: chartW + 20,
              height: 14,
              fontSize: 11,
              color: COLORS.textMuted,
            }}
          >
            {xTickIdx.map((idx) => (
              <div
                key={`x-${idx}`}
                style={{
                  display: "flex",
                  position: "absolute",
                  left:
                    10 +
                    (xAxisLabels.length <= 1
                      ? 0
                      : Math.round((idx * chartW) / (xAxisLabels.length - 1))) -
                    26,
                  width: 52,
                  justifyContent: "center",
                }}
              >
                {xAxisLabels[idx] ?? ""}
              </div>
            ))}
          </div>
          <div style={{ width: READOUT_W }} />
        </div>
      )}
      {emptyCount > 0 && (
        <div
          style={{
            display: "flex",
            height: rowH,
            alignItems: "center",
            color: COLORS.textMuted,
            fontSize: 12,
            fontStyle: "italic",
          }}
        >
          {`+ ${emptyCount} ${emptyCount === 1 ? "series" : "series"} awaiting first data`}
        </div>
      )}
      {/* What the axes MEAN, in words — the same courtesy the drop-off chart
          already extends. A reader seeing this for the first time should not
          have to infer that the left edge is a percentage and that every row
          shares it. */}
      <div style={{ display: "flex", marginTop: 6, fontSize: 12, color: COLORS.textMuted }}>
        {isRate
          ? `left: % ${liveRows.length > 1 ? "— one scale for every row, so the rows compare" : "of the group named on the left"}${hasXAxis ? " · bottom: date" : ""}`
          : `left: people${hasXAxis ? " · bottom: date" : ""}`}
      </div>
    </div>,
    height
  );
  return { element, height };
}

// -----------------------------------------------------------------------------
// Stage-conversion bar chart (reactivation email)
// -----------------------------------------------------------------------------

/** Exported for the test that no non-arm chart uses an arm colour. */
export function renderStageConversion(p: StageConversionPayload): {
  element: React.ReactElement;
  height: number;
} {
  const stages = Array.isArray(p.stages) ? p.stages : [];
  const clean = stages
    .filter((s) => s && typeof s.label === "string")
    .map((s) => ({
      label: s.label,
      sent: Math.max(0, Number(s.sent) || 0),
      purchased: Math.max(0, Number(s.purchased) || 0),
    }));
  if (clean.length === 0 || clean.every((s) => s.sent === 0)) {
    return {
      element: chartShell(
        "Reactivation email performance",
        p.windowLabel ?? "",
        <div style={{ display: "flex", color: COLORS.textMuted, fontSize: 18, padding: 24 }}>
          Awaiting data — no reactivation emails sent in this window yet.
        </div>
      ),
      height: HEIGHT,
    };
  }
  const rates = clean.map((s) => (s.sent > 0 ? (s.purchased / s.sent) * 100 : 0));
  const maxRate = Math.max(...rates, 1);
  return {
    element: chartShell(
      "Reactivation email performance",
      p.windowLabel ?? "",
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          gap: 24,
          alignItems: "flex-end",
          padding: "0 24px 16px",
          height: 360,
        }}
      >
        {clean.map((s, i) => {
          const rate = rates[i] ?? 0;
          const h = maxRate > 0 ? Math.max(4, (rate / maxRate) * 250) : 4;
          return (
            <div
              key={s.label}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}
            >
              <div style={{ display: "flex", fontSize: 18, color: COLORS.text, marginBottom: 8 }}>
                {`${rate.toFixed(1)}%`}
              </div>
              <div
                // Neutral, not V1's blue: these are nurture stages, not arms, and
                // this chart can share a message with the per-arm ones.
                style={{ width: 90, height: h, background: COLORS.neutral, borderRadius: 4 }}
              />
              <div
                style={{
                  display: "flex",
                  fontSize: 13,
                  color: COLORS.textMuted,
                  marginTop: 8,
                  textAlign: "center",
                }}
              >
                {s.label}
              </div>
              <div style={{ display: "flex", fontSize: 12, color: COLORS.textMuted, marginTop: 2 }}>
                {`sent ${s.sent} · paid ${s.purchased}`}
              </div>
            </div>
          );
        })}
      </div>
    ),
    height: HEIGHT,
  };
}

// -----------------------------------------------------------------------------
// Drop-out-by-question histogram (where users quit the survey)
// -----------------------------------------------------------------------------

const DROPOUT_PLOT_H = 300;
const DROPOUT_WORST_N = 3;
/** Width of the y-axis gutter, matching DROPOUT_ARM_AXIS_W's role below. */
const DROPOUT_AXIS_W = 46;
/** Minimum horizontal room an x label needs to render without clipping. */
const DROPOUT_LABEL_W = 34;
/** Room for a value label like "15%" at 13px bold, with margin. */
const DROPOUT_VALUE_W = 46;

/** Exported for the test that asserts the steepest bar keeps its number. */
export function renderDropoutBars(p: DropoutPayload): {
  element: React.ReactElement;
  height: number;
} {
  const bars = (Array.isArray(p.bars) ? p.bars : [])
    .filter((b) => b && typeof b.label === "string")
    .map((b) => ({
      label: b.label,
      dropPct: Math.max(0, Number(b.dropPct) || 0),
    }));
  const title = "Where people quit the survey";
  if (bars.length === 0) {
    return {
      element: chartShell(
        title,
        p.windowLabel ?? "",
        <div style={{ display: "flex", color: COLORS.textMuted, fontSize: 18, padding: 24 }}>
          Awaiting data — not enough survey traffic in this window yet.
        </div>
      ),
      height: HEIGHT,
    };
  }

  // Worst-N questions by drop-off rate drive the red highlight + the value
  // labels. Derived here so colouring and labels can never disagree.
  const worstIdx = new Set(
    bars
      .map((b, i) => ({ i, pct: b.dropPct }))
      .sort((a, b) => b.pct - a.pct)
      .slice(0, DROPOUT_WORST_N)
      .filter((x) => x.pct > 0)
      .map((x) => x.i)
  );

  /**
   * A REAL y axis, on the same niceAxis()/fmtAxis() helpers renderDropoutByArm
   * uses. Until 2026-09-15 this chart had none at all: bars were normalised to
   * an undrawn maximum, so a full-height bar could have been 8% or 80% and the
   * picture did not say which. Nobody could read it, which is the only thing a
   * chart has to do.
   */
  const rawPeak = bars.reduce((m, b) => Math.max(m, b.dropPct), 0);
  /**
   * 18% headroom so the tallest bar never touches the ceiling. Without it the
   * worst bar reached the top gridline and its value label had nowhere to go —
   * it was clipped by the plot edge, printing "15%" as "5%". Headroom is the
   * root fix; positioning tricks were treating the symptom.
   */
  const { max: peak, intervals } = niceAxis(rawPeak * 1.18);
  // 28 = chartShell's padding, both sides.
  const plotW = WIDTH - 2 * 28 - DROPOUT_AXIS_W;
  const yFor = (v: number) => DROPOUT_PLOT_H - (v / peak) * DROPOUT_PLOT_H;
  const slot = plotW / bars.length;

  /**
   * X labels: only the ones that can be READ. The previous version drew every
   * 8th label into an ~11.6px flex slot with overflow:hidden, which rendered
   * "Q17" as "217" and "Q57"/"Q58" as "257)58" — clipped into nonsense. Labels
   * are now absolutely positioned with room to breathe, and only as many as fit
   * at DROPOUT_LABEL_W apart.
   */
  const labelEvery = Math.max(1, Math.ceil(DROPOUT_LABEL_W / Math.max(slot, 1)));
  const xTicks = bars
    .map((b, i) => ({ i, label: b.label }))
    .filter(({ i }) => i === 0 || i === bars.length - 1 || i % labelEvery === 0)
    // Drop any tick that would collide with its neighbour OR with the final
    // tick, which is always kept. Without the second test Q55 and Q58 landed
    // on top of each other at the right edge.
    .filter(({ i }, n, arr) => {
      const last = arr[arr.length - 1]!;
      if (i !== last.i && (last.i - i) * slot < DROPOUT_LABEL_W) return false;
      const next = arr[n + 1];
      return !next || (next.i - i) * slot >= DROPOUT_LABEL_W;
    });

  const worstSummary = [...worstIdx]
    .sort((a, b) => bars[b]!.dropPct - bars[a]!.dropPct)
    .map((i) => `${bars[i]!.label} ${Math.round(bars[i]!.dropPct)}%`)
    .join("  ·  ");

  return {
    element: chartShell(
      title,
      p.windowLabel ?? "",
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div
          style={{
            display: "flex",
            position: "relative",
            width: DROPOUT_AXIS_W + plotW,
            height: DROPOUT_PLOT_H + 24,
          }}
        >
          {/* y-axis labels, each centred on its own gridline */}
          {Array.from({ length: intervals + 1 }, (_, i) => {
            const value = (peak * i) / intervals;
            return (
              <div
                key={`y-${i}`}
                style={{
                  display: "flex",
                  position: "absolute",
                  left: 0,
                  top: yFor(value) - 7,
                  width: DROPOUT_AXIS_W - 8,
                  justifyContent: "flex-end",
                  fontSize: 12,
                  color: COLORS.textMuted,
                }}
              >
                {`${fmtAxis(value)}%`}
              </div>
            );
          })}

          {/* gridlines — polyline only, the proven Satori primitive here */}
          <div style={{ display: "flex", position: "absolute", left: DROPOUT_AXIS_W, top: 0 }}>
            <svg width={plotW} height={DROPOUT_PLOT_H}>
              {Array.from({ length: intervals + 1 }, (_, i) => {
                const y = yFor((peak * i) / intervals);
                return (
                  <polyline
                    key={`grid-${i}`}
                    points={`0,${y} ${plotW},${y}`}
                    fill="none"
                    stroke={i === 0 ? COLORS.baseline : COLORS.gridline}
                    strokeWidth="1"
                  />
                );
              })}
            </svg>
          </div>

          {/* bars, positioned against the same scale as the gridlines */}
          {bars.map((b, i) => {
            const h = Math.max(2, Math.round((b.dropPct / peak) * DROPOUT_PLOT_H));
            const isWorst = worstIdx.has(i);
            return (
              <div
                key={`bar-${b.label}-${i}`}
                style={{
                  display: "flex",
                  position: "absolute",
                  left: DROPOUT_AXIS_W + i * slot,
                  top: DROPOUT_PLOT_H - h,
                  width: Math.max(2, slot - 1),
                  height: h,
                  background: isWorst ? COLORS.danger : COLORS.accentOrange,
                  /**
                   * 0.9, not 0.5. The de-emphasis was tuned against the old dark
                   * surface, where half-strength orange still read as orange. Over
                   * white the same 0.5 composites to #f0aa97 — 1.93:1, a hard
                   * contrast failure for a DATA mark, and the bars came out pale
                   * pink. 0.9 is the first step that passes (3.36:1) and the red
                   * still carries the highlight on its own.
                   */
                  opacity: isWorst ? 1 : 0.9,
                  borderRadius: 1,
                }}
              />
            );
          })}

          {/* the number on the bars that matter, so the eye never has to
              estimate the ones being pointed at */}
          {[...worstIdx]
            /**
             * Two adjacent worst bars (Q57 and Q58 are neighbours, both 15%) put two
             * 36px labels on two ~11px slots, which overlapped into an unreadable
             * smudge — so colliding labels are dropped.
             *
             * WHICH one is dropped used to be decided left-to-right: keep the first,
             * drop its neighbour. That silently dropped the steepest bar whenever a
             * shallower worst-bar sat immediately to its left — which is not a corner
             * case, it is what a cliff looks like, with elevated drop-off on the
             * question before it. Rendered on real shape: Q5 at 24% was the headline
             * of the summary line, the tallest bar and the only dark red one, and it
             * was the one with no number on it, because Q4 at 11% came first.
             *
             * Steepest first, then greedily keep whatever still fits.
             */
            .sort((a, b) => bars[b]!.dropPct - bars[a]!.dropPct)
            .reduce<number[]>((keep, i) => {
              if (keep.every((k) => Math.abs(i - k) * slot >= DROPOUT_VALUE_W + 2)) keep.push(i);
              return keep;
            }, [])
            .sort((a, b) => a - b)
            .map((i) => {
              const b = bars[i]!;
              const h = Math.max(2, Math.round((b.dropPct / peak) * DROPOUT_PLOT_H));
              // A bar at the axis ceiling leaves no room above it, and a label
              // placed there is clipped by the plot edge — which is what happened
              // to the two 15% bars on the first render.
              //
              // There WAS a tuck-inside fallback here for a bar tall enough to
              // leave no room above it. It became unreachable when the axis gained
              // 18% headroom (`niceAxis(rawPeak * 1.18)`): peak is then at least
              // 1.18x the tallest bar, so h never exceeds 254 of 300 and `above`
              // never drops below 27 — checked across rawPeak 1, 5, 11, 15, 24, 55
              // and 100. The branch, its white-on-bar colour and the comment
              // describing the render it fixed were all dead, and a dead branch
              // that claims to handle a case is worse than no branch: it reads as
              // cover the code does not have.
              const above = DROPOUT_PLOT_H - h - 19;
              return (
                <div
                  key={`val-${i}`}
                  style={{
                    display: "flex",
                    position: "absolute",
                    // Clamp on the SAME width the box actually is. It was
                    // clamped to -36 while the text needed more, so the last
                    // bar's "15%" rendered as "5%" with the 1 cut off.
                    left: Math.max(
                      DROPOUT_AXIS_W,
                      Math.min(
                        DROPOUT_AXIS_W + i * slot + slot / 2 - DROPOUT_VALUE_W / 2,
                        DROPOUT_AXIS_W + plotW - DROPOUT_VALUE_W
                      )
                    ),
                    top: above,
                    width: DROPOUT_VALUE_W,
                    justifyContent: "center",
                    fontSize: 13,
                    fontWeight: 700,
                    color: COLORS.danger,
                  }}
                >
                  {`${Math.round(b.dropPct)}%`}
                </div>
              );
            })}

          {/* x-axis labels, absolutely positioned and centred on their bar */}
          {xTicks.map(({ i, label }) => (
            <div
              key={`x-${i}`}
              style={{
                display: "flex",
                position: "absolute",
                left: Math.min(
                  Math.max(DROPOUT_AXIS_W + i * slot + slot / 2 - DROPOUT_LABEL_W / 2, 0),
                  DROPOUT_AXIS_W + plotW - DROPOUT_LABEL_W
                ),
                top: DROPOUT_PLOT_H + 6,
                width: DROPOUT_LABEL_W,
                justifyContent: "center",
                fontSize: 12,
                color: COLORS.textMuted,
              }}
            >
              {label}
            </div>
          ))}
        </div>

        {/* What the axes MEAN, in words. A reader who has never seen this chart
            should not have to infer either one. */}
        <div style={{ display: "flex", marginTop: 4, fontSize: 12, color: COLORS.textMuted }}>
          left: % of people who reach a question and do not continue · bottom: question order
        </div>

        <div
          style={{
            display: "flex",
            marginTop: 10,
            fontSize: 15,
            color: COLORS.danger,
            fontWeight: 700,
          }}
        >
          {worstSummary ? `Steepest drop-offs:  ${worstSummary}` : "No notable drop-off spikes"}
        </div>
      </div>
    ),
    height: HEIGHT,
  };
}

// -----------------------------------------------------------------------------
// Per-arm drop-off comparison (email-position A/B) — two overlaid curves
// -----------------------------------------------------------------------------

// 744px of content (800 canvas - 28 padding each side) split three ways:
// axis labels | plot | direct end labels.
const DROPOUT_ARM_AXIS_W = 44;
const DROPOUT_ARM_LABEL_W = 98;
const DROPOUT_ARM_PLOT_W = 744 - DROPOUT_ARM_AXIS_W - DROPOUT_ARM_LABEL_W;
const DROPOUT_ARM_PLOT_H = 260;
const DROPOUT_ARM_HEIGHT = 520;

/**
 * Axis tick text. A 0-8% range labelled to whole numbers collapses to
 * 8/6/4/2/0 which is fine, but a 0-1.2% range would collapse to 1/1/1/0/0 — so
 * narrow ranges keep a decimal.
 */
/**
 * Axis ceiling + tick count: a round step, as close above the peak as possible.
 *
 * A fixed 5 intervals over a step list that jumps 1 -> 2 put a 5.9% peak on a
 * 10% axis and a 34% peak on a 50% axis, throwing away 40% of the plot height
 * and squashing the series. Searching 4-6 intervals across the standard
 * 1/2/2.5/5 decades keeps the ticks round AND the ceiling tight: 5.9 -> 6,
 * 34 -> 40, 4.5 -> 5.
 */
function niceAxis(rawPeak: number): { max: number; intervals: number } {
  if (!Number.isFinite(rawPeak) || rawPeak <= 0) return { max: 1, intervals: 5 };
  let best: { max: number; intervals: number } | null = null;
  for (const mult of [0.01, 0.1, 1, 10, 100]) {
    for (const base of [1, 2, 2.5, 5]) {
      const step = base * mult;
      for (const intervals of [5, 4, 6]) {
        const max = step * intervals;
        if (max < rawPeak) continue;
        if (!best || max < best.max) best = { max, intervals };
      }
    }
  }
  return best ?? { max: Math.ceil(rawPeak), intervals: 5 };
}

function fmtAxis(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "0";
  // Never round a real value away. This used to be Math.round above 10, which
  // labelled a gridline sitting at 12.5 as "13" — the tick disagreed with the
  // line it named, and the same formatter prints the end labels and the footnote
  // peak, so a 12.7% rate was published as 13%.
  if (value >= 10) return Number.isInteger(value) ? String(value) : value.toFixed(1);
  if (value >= 1) return value.toFixed(1).replace(/\.0$/, "");
  // Narrow ranges keep a decimal: a 0-1.2% axis rounded to whole numbers would
  // label its ticks 1/1/1/0/0.
  return value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

/**
 * Exported for the test that asserts the payload's colours actually reach the
 * marks. Everything else here is internal; this one is the path that decides
 * which arm is which colour on screen, and a producer that sends the right
 * colour to a renderer that ignores it looks identical from outside.
 */
export function renderDropoutByArm(p: DropoutByArmPayload): {
  element: React.ReactElement;
  height: number;
} {
  const labels = Array.isArray(p.labels)
    ? p.labels.map((l) => (typeof l === "string" ? l : ""))
    : [];
  const toVals = (a: unknown): Array<number | null> =>
    (Array.isArray(a) ? a : []).map((v) =>
      v == null || v === "" ? null : Math.max(0, Number(v) || 0)
    );
  const first = toVals(p.first);
  const last = toVals(p.last);
  /**
   * Single-series mode: no `last` key at all. Distinct from an all-null `last`,
   * which is a real second arm that has no data yet and must still be named.
   */
  const solo = p.last === undefined;
  /**
   * Hex only, 3 or 6 digits. The payload is signed, so a value here cannot be
   * forged — but it is still interpolated straight into an SVG `stroke`, and a
   * renderer that will paint whatever string it is handed is one signing-key
   * mistake away from being an injection point. Anything else falls back.
   */
  const asHex = (v: unknown, fallback: string): string =>
    typeof v === "string" && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v) ? v : fallback;
  const colFirst = asHex(p.colorFirst, COLORS.accentBlue);
  const colLast = asHex(p.colorLast, COLORS.accentOrange);
  const title = p.title ?? "Where users quit by arm — email first vs last";
  const unit = p.unit === "" ? "" : "%";
  const withUnit = (v: number) => `${fmtAxis(v)}${unit}`;
  const n = Math.max(first.length, last.length);

  // Full-length arrays of nulls are "no data" just as much as empty arrays are.
  // Without this the chart invented a 0-1% axis and asserted "0% - 0% - peak 0%"
  // in prose for two arms that had never reported anything.
  const anyReal =
    first.some((v) => typeof v === "number") || last.some((v) => typeof v === "number");

  if (n === 0 || !anyReal) {
    return {
      element: chartShell(
        title,
        p.windowLabel ?? "",
        <div style={{ display: "flex", color: COLORS.textMuted, fontSize: 18, padding: 24 }}>
          {p.emptyLabel ?? "Awaiting data — not enough per-arm traffic in this window yet."}
        </div>
      ),
      height: HEIGHT,
    };
  }

  // Shared y-scale across BOTH arms so the comparison is fair (a per-arm peak
  // would distort one against the other).
  const real = (vals: Array<number | null>): number[] => vals.filter((v): v is number => v != null);
  const rawPeak = Math.max(...real(first), ...real(last), 0);
  const { max: peak, intervals } = niceAxis(rawPeak);
  const w = DROPOUT_ARM_PLOT_W;
  const h = DROPOUT_ARM_PLOT_H;

  // Inset the drawn band so a value at 0 or at the ceiling is not half-clipped
  // by the SVG frame. A 2.5px stroke at y=h put half the zero line outside the
  // viewport, which is exactly how an all-zero arm came to look absent rather
  // than flat.
  const INSET = 4;
  const yFor = (v: number) => Math.round(INSET + (h - 2 * INSET) * (1 - v / (peak > 0 ? peak : 1)));
  /**
   * One polyline per contiguous run of real values, so a gap is drawn as a gap.
   * A single isolated point becomes a short flat stub — a one-point polyline has
   * no geometry and renders nothing at all.
   */
  const segmentsFor = (vals: Array<number | null>): string[] => {
    if (vals.length === 0) return [];
    const step = vals.length > 1 ? w / (vals.length - 1) : 0;
    const x = (i: number) => Math.round(i * step);
    const out: string[] = [];
    let run: string[] = [];
    let runStart = 0;
    const flush = (endIdx: number) => {
      if (run.length === 0) return;
      if (run.length === 1) {
        // Widen a lone point so it is visible, without letting it leave the plot.
        const left = Math.max(0, x(runStart) - 3);
        const right = Math.min(w, x(endIdx) + 3);
        const y = run[0]!.split(",")[1]!;
        out.push(`${left},${y} ${right},${y}`);
      } else {
        out.push(run.join(" "));
      }
      run = [];
    };
    vals.forEach((v, i) => {
      if (v == null) {
        flush(i - 1);
        return;
      }
      if (run.length === 0) runStart = i;
      run.push(`${x(i)},${yFor(v)}`);
    });
    flush(vals.length - 1);
    return out;
  };
  const firstSegments = segmentsFor(first);
  const lastSegments = segmentsFor(last);

  // The last day the arm actually had traffic, not the last day on the axis.
  const endOf = (vals: Array<number | null>) => {
    for (let i = vals.length - 1; i >= 0; i -= 1) {
      const v = vals[i];
      if (v != null) return v;
    }
    return 0;
  };
  const lastRealIdx = (vals: Array<number | null>) => {
    for (let i = vals.length - 1; i >= 0; i -= 1) if (vals[i] != null) return i;
    return -1;
  };
  // Absence must PROPAGATE. endOf() returning 0 for an all-null arm is how an arm
  // with no data at all came to publish "0%" at the right edge while the caption
  // beside it said "no finishers yet" — the chart contradicted its own headline.
  const idxFirst = lastRealIdx(first);
  const idxLast = lastRealIdx(last);
  const hasFirst = idxFirst >= 0;
  const hasLast = idxLast >= 0;
  const endFirst = endOf(first);
  const endLast = endOf(last);
  const yEndFirst = yFor(endFirst);
  const yEndLast = yFor(endLast);
  // x of the arm's LAST REAL day. Pinning the marker to the right edge would put
  // it three days past where an arm that stopped reporting actually ends, so the
  // dot would float in empty space claiming a value it never had there.
  const xEnd = (vals: Array<number | null>) => {
    const idx = lastRealIdx(vals);
    if (idx < 0 || n <= 1) return w;
    return Math.round((idx * w) / (n - 1));
  };
  const xEndFirst = xEnd(first);
  const xEndLast = xEnd(last);

  // Direct end labels ONLY when the two lines separate at the right edge.
  //
  // The previous version nudged colliding labels apart and clamped each one
  // independently, which the data-viz rulebook names explicitly ("nudging labels
  // apart detaches them from their lines and reads as noise") and which was also
  // simply broken: two labels pushed past the same boundary clamped to the same
  // pixel and overprinted into unreadable glyph soup. That fired for any pair
  // ending within a label-height of the floor — the normal state of a 1-3%
  // conversion chart. So when they would collide, the labels are dropped and the
  // two values go into the footnote instead, where they cannot overlap.
  const LABEL_H = 32;
  // A direct end label only makes sense when the arm's last real day is the last
  // day on the axis. Otherwise the label sits in the right gutter while its dot
  // is hundreds of pixels away, and two such labels stack into what looks like a
  // matched pair of current values when they are from different days.
  const firstAtEnd = hasFirst && idxFirst === n - 1;
  const lastAtEnd = hasLast && idxLast === n - 1;
  const bothWantLabels = firstAtEnd && lastAtEnd;
  const collide = bothWantLabels && Math.abs(yEndFirst - yEndLast) < LABEL_H;
  const showFirstLabel = firstAtEnd && !collide;
  const showLastLabel = lastAtEnd && !collide;

  // Ticks: sample five x positions and keep their INDEX, so each label can sit
  // over the point it actually names. `space-between` on sampled strings put them
  // at the wrong fractions (index 8 of 29 laid out at the 25% slot) and aligned
  // box edges rather than centres.
  const tickCount = Math.min(5, n);
  const tickIdx = Array.from(
    new Set(
      Array.from({ length: tickCount }, (_, i) =>
        tickCount <= 1 ? 0 : Math.round((i * (n - 1)) / (tickCount - 1))
      )
    )
  );

  const legendFirstRaw = p.legendFirst ?? "Email first (control)";
  const legendLastRaw = p.legendLast ?? "Email last";
  // Long arm names ran straight off the 800px canvas, hard-cut mid-word.
  const clip = (t: string, max: number) => (t.length > max ? `${t.slice(0, max - 1)}\u2026` : t);
  const legendFirst = clip(legendFirstRaw, 34);
  const legendLast = clip(legendLastRaw, 34);

  // Short names for the end labels: keep only the words that DIFFER between the
  // arms, so "Current homepage" / "Previous homepage" become "Current" /
  // "Previous". Taking the first word gave "Email" for both arms of the
  // email-position chart. Parentheticals are dropped only when doing so still
  // tells the arms apart — for "White (current)" / "White (previous)" the
  // distinction lives inside the parens, and stripping them collapses both to
  // one word.
  const [shortFirst, shortLast] = ((): [string, string] => {
    const diff = (a: string, b: string): [string, string] => {
      const av = a.split(/\s+/).filter(Boolean);
      const bv = b.split(/\s+/).filter(Boolean);
      let lead = 0;
      while (lead < av.length - 1 && lead < bv.length - 1 && av[lead] === bv[lead]) lead += 1;
      let trail = 0;
      while (
        trail < av.length - lead - 1 &&
        trail < bv.length - lead - 1 &&
        av[av.length - 1 - trail] === bv[bv.length - 1 - trail]
      ) {
        trail += 1;
      }
      const cut = (parts: string[]) => parts.slice(lead, parts.length - trail).join(" ");
      return [cut(av) || a, cut(bv) || b];
    };
    const bare = (t: string) => t.replace(/\s*\([^)]*\)/g, "").trim();
    const stripped = diff(bare(legendFirstRaw), bare(legendLastRaw));
    if (stripped[0] !== stripped[1]) return [clip(stripped[0], 14), clip(stripped[1], 14)];
    const kept = diff(legendFirstRaw, legendLastRaw);
    return [clip(kept[0], 14), clip(kept[1], 14)];
  })();

  const swatch = (color: string, text: string) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {/* A line chart's legend key is a line, not a dot. */}
      <div style={{ display: "flex", width: 16, height: 2, background: color, borderRadius: 1 }} />
      <div style={{ display: "flex", fontSize: 13, color: COLORS.textMuted }}>{text}</div>
    </div>
  );

  // The value wears a TEXT token; the coloured end-dot beside it carries
  // identity. Colouring the number itself is what the rulebook forbids.
  const endLabel = (color: string, name: string, value: number, yEnd: number) => (
    <div
      key={name}
      style={{
        display: "flex",
        flexDirection: "column",
        position: "absolute",
        left: DROPOUT_ARM_AXIS_W + w + 14,
        top: yEnd - 15,
        width: DROPOUT_ARM_LABEL_W - 14,
      }}
    >
      <div style={{ display: "flex", fontSize: 15, fontWeight: 700, color: COLORS.text }}>
        {`${withUnit(value)}`}
      </div>
      <div style={{ display: "flex", fontSize: 11, color: COLORS.textMuted, lineHeight: 1.1 }}>
        {name}
      </div>
    </div>
  );

  // End-dot: 12px with a 2px surface ring so it stays legible where the two arms
  // cross. An all-zero arm now has a visible mark of its own instead of a
  // half-clipped hairline hiding under the axis rule.
  const endDot = (color: string, yEnd: number, xPos: number) => (
    <div
      style={{
        display: "flex",
        position: "absolute",
        left: DROPOUT_ARM_AXIS_W + xPos - 6,
        top: yEnd - 6,
        width: 12,
        height: 12,
        borderRadius: 6,
        background: color,
        border: `2px solid ${COLORS.bg}`,
      }}
    />
  );

  const footnoteBase = (
    p.footnote ??
    "drop-off % per question · shared y-scale (peak {peak}%) · x-axis = question order"
  ).replace("{peak}", fmtAxis(rawPeak));
  // Any value whose label is not on the plot still has to be readable somewhere —
  // but only for arms that HAVE a value. An arm with no data contributes nothing.
  const carried: string[] = [];
  if (hasFirst && !showFirstLabel) carried.push(`${shortFirst} ${withUnit(endFirst)}`);
  if (hasLast && !showLastLabel) carried.push(`${shortLast} ${withUnit(endLast)}`);
  const footnote = carried.length > 0 ? `${carried.join(" · ")} — ${footnoteBase}` : footnoteBase;

  const element = chartShell(
    title,
    p.windowLabel ?? "",
    <div style={{ display: "flex", flexDirection: "column", flexShrink: 0 }}>
      {/* Legend — always present for two series, so identity is never colour alone. */}
      <div style={{ display: "flex", flexDirection: "row", gap: 22, marginBottom: 14 }}>
        {/* An arm with no readings says so in the legend, so a missing line is
            never mistaken for a line hidden behind the other one. */}
        {/* A single series is named by the title, so it gets no legend at all —
            two swatches for one line is the "(unused) — no data yet" row this
            renderer produced the first time it was handed one series. */}
        {!solo && swatch(colFirst, hasFirst ? legendFirst : `${legendFirst} — no data yet`)}
        {!solo && swatch(colLast, hasLast ? legendLast : `${legendLast} — no data yet`)}
      </div>

      {/* ONE coordinate system for the whole plot: axis labels, gridlines, lines,
          end marks and x ticks are all positioned against the same origin, so a
          tick sits over the point it names and a y label sits on its gridline.
          Two flex rows with space-between drifted both by up to 4.5px. */}
      <div
        style={{
          display: "flex",
          position: "relative",
          width: DROPOUT_ARM_AXIS_W + w + DROPOUT_ARM_LABEL_W,
          height: h + 26,
        }}
      >
        {/* y-axis labels, each centred on its own gridline */}
        {Array.from({ length: intervals + 1 }, (_, i) => {
          const value = (peak * i) / intervals;
          return (
            <div
              key={`y-${i}`}
              style={{
                display: "flex",
                position: "absolute",
                left: 0,
                top: yFor(value) - 6,
                width: DROPOUT_ARM_AXIS_W - 8,
                justifyContent: "flex-end",
                fontSize: 11,
                color: COLORS.textMuted,
              }}
            >
              {`${withUnit(value)}`}
            </div>
          );
        })}

        <div style={{ display: "flex", position: "absolute", left: DROPOUT_ARM_AXIS_W, top: 0 }}>
          <svg width={w} height={h}>
            {/* Hairline gridlines on the same values as the labels. polyline only
                — the proven Satori primitive in this file. */}
            {Array.from({ length: intervals + 1 }, (_, i) => {
              const y = yFor((peak * i) / intervals);
              return (
                <polyline
                  key={`grid-${i}`}
                  points={`0,${y} ${w},${y}`}
                  fill="none"
                  stroke={i === 0 ? COLORS.baseline : COLORS.gridline}
                  strokeWidth="1"
                />
              );
            })}
            {lastSegments.map((seg, i) => (
              <polyline
                key={`last-${i}`}
                points={seg}
                fill="none"
                stroke={colLast}
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}
            {firstSegments.map((seg, i) => (
              <polyline
                key={`first-${i}`}
                points={seg}
                fill="none"
                stroke={colFirst}
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}
          </svg>
        </div>

        {hasLast && endDot(colLast, yEndLast, xEndLast)}
        {hasFirst && endDot(colFirst, yEndFirst, xEndFirst)}
        {showLastLabel && endLabel(colLast, shortLast, endLast, yEndLast)}
        {/* Solo: no sub-name under the value. `shortFirst` is a word-diff of the
            two legend strings, which with one series clipped to "Visitor → sur…". */}
        {showFirstLabel && endLabel(colFirst, solo ? "" : shortFirst, endFirst, yEndFirst)}

        {/* x ticks, each centred on the data point it names */}
        {tickIdx.map((idx) => (
          <div
            key={`x-${idx}`}
            style={{
              display: "flex",
              position: "absolute",
              left: DROPOUT_ARM_AXIS_W + (n <= 1 ? 0 : Math.round((idx * w) / (n - 1))) - 26,
              top: h + 8,
              width: 52,
              justifyContent: "center",
              fontSize: 11,
              color: COLORS.textMuted,
            }}
          >
            {labels[idx] ?? ""}
          </div>
        ))}
      </div>

      {/* The sample sizes that explain the shape, then the method. */}
      <div
        style={{
          display: "flex",
          marginTop: 12,
          fontSize: 15,
          color: COLORS.text,
          fontWeight: 700,
        }}
      >
        {p.headline ??
          (solo
            ? `Latest — ${withUnit(endFirst)}`
            : hasFirst && hasLast
              ? `Latest — ${withUnit(endFirst)} vs ${withUnit(endLast)}`
              : hasFirst
                ? `Latest — ${withUnit(endFirst)} (${shortLast}: no data yet)`
                : `Latest — ${withUnit(endLast)} (${shortFirst}: no data yet)`)}
      </div>
      <div style={{ display: "flex", marginTop: 5, fontSize: 12, color: COLORS.textMuted }}>
        {footnote}
      </div>
    </div>,
    DROPOUT_ARM_HEIGHT
  );
  return { element, height: DROPOUT_ARM_HEIGHT };
}

function renderForKind(
  kind: string,
  payload: AnyPayload
): { element: React.ReactElement; height: number } {
  switch (kind) {
    case "cvr-visitor-start":
    case "cvr-start-completion":
    case "cvr-completion-engagement":
    case "cvr-completion-paygate":
    case "cvr-paygate-purchase":
    case "bucket-performance":
      return renderLongitudinal(payload as LongitudinalPayload);
    case "dropout-funnel":
      return renderDropoutBars(payload as DropoutPayload);
    case "dropout-by-arm":
    case "conversion-by-arm":
    case "metric-trend":
      return renderDropoutByArm(payload as DropoutByArmPayload);
    case "reactivation-email":
      return renderStageConversion(payload as StageConversionPayload);
    default:
      return {
        element: chartShell("Unknown chart kind", kind, <div>—</div>),
        height: HEIGHT,
      };
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (!VALID_KINDS.has(kind)) {
    return new Response("unknown_kind", { status: 400 });
  }

  const url = new URL(request.url);
  const d = url.searchParams.get("d");
  const s = url.searchParams.get("s");
  if (!d || !s) {
    return new Response("missing_params", { status: 400 });
  }

  const payload = await verifyImagePayload<AnyPayload>(d, s);
  if (!payload) {
    // 403 — not 500 — so an attacker probing for the route doesn't trip ops
    // error alerts. Bad signatures are expected from the open internet.
    return new Response("invalid_signature", { status: 403 });
  }

  // Defense in depth: even with a valid signature, the payload `kind` field
  // must match the URL path.
  if (payload.kind !== kind) {
    return new Response("kind_mismatch", { status: 400 });
  }

  try {
    const { element, height } = renderForKind(kind, payload);
    return new ImageResponse(element, {
      width: WIDTH,
      height,
      // Short cache window (1h) so a visual iteration isn't stuck behind Slack's
      // image-proxy cache; the signed URL also carries a deploy-stamp `v` field
      // that busts the cache on every deploy.
      headers: { "Cache-Control": "public, max-age=3600" },
    });
  } catch {
    return new Response("render_failed", { status: 500 });
  }
}
