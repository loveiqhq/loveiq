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

// Brand palette mirrored from app/globals.css. Hex literals only because
// `next/og` (Satori) doesn't read the global CSS — colors must be inline.
const COLORS = {
  bg: "#0b0613",
  surface: "#0f0a18",
  text: "#e8e0f0",
  textMuted: "#9ca3af",
  // Validated with the data-viz palette checker against this dark surface:
  //   node scripts/validate_palette.js "#8a63f0,#e0552f" --mode dark --surface "#0b0613"
  //   lightness band PASS (both inside L 0.48-0.67) - chroma PASS -
  //   CVD separation 29.2 protan / 26.3 tritan - normal-vision 30.3 - contrast PASS
  // The brand steps (#f26d4f / #9c7dff) FAILED the lightness band -- too light
  // for this surface -- so these are the same hues stepped down for it. (An
  // earlier version of this comment quoted the rejected pair's numbers.)
  accentOrange: "#e0552f",
  accentPurple: "#8a63f0",
  barTrack: "#1a1424",
  // Hairline grid + axis rule. Measured against this surface with the data-viz
  // reference: the previous values sat at 1.09:1 and 1.11:1 — fainter than the
  // rulebook's own gridline floor, and Slack downscales an 800px image to the
  // message column, which collapses a 1px hairline further. These match the
  // reference (gridline 1.24:1, baseline 1.44:1).
  gridline: "#261d33",
  baseline: "#332742",
  warn: "#fbbf24",
  danger: "#f87171",
  good: "#4ade80",
};

// The 7 line/curve kinds share `LongitudinalPayload`; `reactivation-email`
// uses `StageConversionPayload`. Order here documents the digest layout.
const VALID_KINDS = new Set([
  "cvr-visitor-start",
  "cvr-visitor-start-dark",
  "cvr-start-completion",
  "cvr-completion-engagement",
  "cvr-completion-paygate",
  "cvr-paygate-purchase",
  "bucket-performance",
  "dropout-funnel",
  "dropout-by-arm",
  "conversion-by-arm",
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
    | "cvr-visitor-start-dark"
    | "cvr-start-completion"
    | "cvr-completion-engagement"
    | "cvr-completion-paygate"
    | "cvr-paygate-purchase"
    | "bucket-performance";
  windowLabel?: string;
  labels: string[];
  series: number[][];
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
  kind: "dropout-by-arm" | "conversion-by-arm";
  windowLabel?: string;
  labels: string[];
  /**
   * `null` means the arm had NO traffic that day — a gap in the line, not a zero.
   * Zero and "not running yet" are different facts, and an arm that launched
   * mid-window otherwise draws a flat 0% line back to the start of the window and
   * claims weeks of zero conversion it was never measured for.
   */
  first: Array<number | null>;
  last: Array<number | null>;
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
  legendFirst?: string;
  legendLast?: string;
  headline?: string;
  /** Footnote under the plot; `{peak}` is replaced with the shared y-scale peak. */
  footnote?: string;
}

type AnyPayload =
  | LongitudinalPayload
  | StageConversionPayload
  | DropoutPayload
  | DropoutByArmPayload;

const LONG_TITLES: Record<LongitudinalPayload["kind"], string> = {
  "cvr-visitor-start": "Visitor → Survey-start CVR",
  "cvr-visitor-start-dark": "Dark journey — Visitor → Survey-start CVR",
  "cvr-start-completion": "Survey-start → Completion CVR",
  "cvr-completion-engagement": "Completion → Report-view CVR (1m / 5m / 10m)",
  "cvr-completion-paygate": "Completion → Paygate CVR",
  "cvr-paygate-purchase": "Paygate → Purchase CVR",
  "bucket-performance": "Price-bucket conversion rate",
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
        }}
      >
        <div style={{ fontSize: 26, fontWeight: 700, color: COLORS.text }}>{title}</div>
        <div style={{ fontSize: 14, color: COLORS.textMuted }}>{subtitle}</div>
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
const READOUT_W = 120;
const PLOT_W = 450; // svgPoints width == <svg> width == area-close x (clip-safe)

/** Up to 5 evenly-spaced ticks from an x-axis label array (all if <=5). */
function sampleTicks(xAxis: string[]): string[] {
  const n = xAxis.length;
  if (n === 0) return [];
  if (n <= 5) return xAxis.slice();
  const idxs = [0, Math.round(n / 4), Math.round(n / 2), Math.round((3 * n) / 4), n - 1];
  return idxs.map((i) => xAxis[Math.min(i, n - 1)] ?? "");
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
function svgPoints(values: number[], peak: number, width: number, chartH: number): string {
  if (values.length === 0) return "";
  const step = values.length > 1 ? width / (values.length - 1) : 0;
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

function renderLongitudinal(p: LongitudinalPayload): {
  element: React.ReactElement;
  height: number;
} {
  const labels = Array.isArray(p.labels) ? p.labels : [];
  const series = Array.isArray(p.series) ? p.series : [];
  const isRate = p.rate === true;
  const allRows: Array<{ label: string; values: number[]; peak: number }> = [];
  for (let i = 0; i < labels.length; i += 1) {
    const lbl = labels[i];
    const ser = series[i];
    if (typeof lbl !== "string" || !Array.isArray(ser)) continue;
    const values = ser.map((v) => Math.max(0, Number(v) || 0));
    const peak = values.reduce((a, b) => Math.max(a, b), 0);
    allRows.push({ label: lbl, values, peak });
  }
  // Rate charts: KEEP all-zero rows — a flat 0% line is real signal (e.g. a
  // funnel step that converts nobody). The caller already gated on the
  // denominator, so a row here means "this stage had traffic". Count charts
  // keep the old behaviour: hide all-zero rows (no-data noise).
  const liveRows = isRate ? allRows : allRows.filter((r) => r.peak > 0);
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
  const xTicks = Array.isArray(p.xAxis) ? sampleTicks(p.xAxis) : [];
  const hasXAxis = xTicks.length > 0;
  const height = longitudinalHeight(rowCount, rowH) + (hasXAxis ? X_AXIS_H : 0);
  const chartH = Math.max(4, rowH - 14);
  const chartW = PLOT_W;
  // Readout shows TODAY's value + the window peak, so the reader sees the
  // current rate not just the high-water mark.
  const readout = (peak: number, last: number): string =>
    isRate
      ? `now ${Math.round(last)}% · max ${Math.round(peak)}%`
      : `peak ${peak.toLocaleString()}`;

  const element = chartShell(
    title,
    p.windowLabel ?? "",
    <div style={{ display: "flex", flexDirection: "column", gap: ROW_GAP }}>
      {liveRows.map((row, rIdx) => {
        const color = rIdx % 2 === 0 ? COLORS.accentPurple : COLORS.accentOrange;
        const linePts = svgPoints(row.values, row.peak, chartW, chartH);
        const areaPts = linePts ? `0,${chartH} ${linePts} ${chartW},${chartH}` : "";
        const last = row.values.length > 0 ? row.values[row.values.length - 1]! : 0;
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
                {/* faint 0% baseline (polyline — the proven Satori primitive in
                    this file — instead of <line>) so the floor is visible */}
                <polyline
                  points={`0,${chartH - 1} ${chartW},${chartH - 1}`}
                  fill="none"
                  stroke={COLORS.barTrack}
                  strokeWidth="1"
                />
                {areaPts && <polygon points={areaPts} fill={color} fillOpacity="0.22" />}
                {linePts && (
                  <polyline
                    points={linePts}
                    fill="none"
                    stroke={color}
                    strokeWidth="2"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                )}
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
              {readout(row.peak, last)}
            </div>
          </div>
        );
      })}
      {hasXAxis && (
        <div style={{ display: "flex", alignItems: "center", height: X_AXIS_H }}>
          <div style={{ width: LABEL_W }} />
          <div
            style={{
              display: "flex",
              width: chartW + 20,
              paddingLeft: 10,
              paddingRight: 10,
              justifyContent: "space-between",
              fontSize: 11,
              color: COLORS.textMuted,
            }}
          >
            {xTicks.map((t, i) => (
              <div key={`${t}-${i}`} style={{ display: "flex" }}>
                {t}
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
    </div>,
    height
  );
  return { element, height };
}

// -----------------------------------------------------------------------------
// Stage-conversion bar chart (reactivation email)
// -----------------------------------------------------------------------------

function renderStageConversion(p: StageConversionPayload): {
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
                style={{ width: 90, height: h, background: COLORS.accentPurple, borderRadius: 4 }}
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

const DROPOUT_PLOT_H = 320;
const DROPOUT_WORST_N = 3;

function renderDropoutBars(p: DropoutPayload): {
  element: React.ReactElement;
  height: number;
} {
  const bars = (Array.isArray(p.bars) ? p.bars : [])
    .filter((b) => b && typeof b.label === "string")
    .map((b) => ({
      label: b.label,
      dropPct: Math.max(0, Number(b.dropPct) || 0),
    }));
  const title = "Where users quit — drop-off % by question";
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

  // Worst-N questions by drop-off rate drive the red highlight + the summary
  // line. Derived here so coloring + summary can never disagree.
  const worstIdx = new Set(
    bars
      .map((b, i) => ({ i, pct: b.dropPct }))
      .sort((a, b) => b.pct - a.pct)
      .slice(0, DROPOUT_WORST_N)
      .filter((x) => x.pct > 0)
      .map((x) => x.i)
  );
  const maxPct = bars.reduce((m, b) => Math.max(m, b.dropPct), 0) || 1;

  // Sparse x-axis ticks: first, last, and a few evenly spaced between.
  const tickEvery = Math.max(1, Math.ceil(bars.length / 8));
  const ticks: Array<{ label: string; flex: number }> = bars.map((b, i) => ({
    label: i === 0 || i === bars.length - 1 || i % tickEvery === 0 ? b.label : "",
    flex: 1,
  }));

  const worstSummary = [...worstIdx]
    .sort((a, b) => bars[b]!.dropPct - bars[a]!.dropPct)
    .map((i) => `${bars[i]!.label} ${Math.round(bars[i]!.dropPct)}%`)
    .join("  ·  ");

  return {
    element: chartShell(
      title,
      p.windowLabel ?? "",
      <div style={{ display: "flex", flexDirection: "column" }}>
        {/* Bar row */}
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "flex-end",
            height: DROPOUT_PLOT_H,
            gap: 1,
          }}
        >
          {bars.map((b, i) => {
            const h = Math.max(2, Math.round((b.dropPct / maxPct) * (DROPOUT_PLOT_H - 4)));
            const isWorst = worstIdx.has(i);
            return (
              <div
                key={`${b.label}-${i}`}
                style={{
                  display: "flex",
                  flex: 1,
                  height: h,
                  background: isWorst ? COLORS.danger : COLORS.accentOrange,
                  opacity: isWorst ? 1 : 0.55,
                  borderRadius: 1,
                }}
              />
            );
          })}
        </div>
        {/* X-axis question ticks */}
        <div style={{ display: "flex", flexDirection: "row", gap: 1, marginTop: 6 }}>
          {ticks.map((t, i) => (
            <div
              key={`tick-${i}`}
              style={{
                display: "flex",
                flex: t.flex,
                fontSize: 10,
                color: COLORS.textMuted,
                justifyContent: "center",
                overflow: "hidden",
                whiteSpace: "nowrap",
              }}
            >
              {t.label}
            </div>
          ))}
        </div>
        {/* Worst-offenders summary */}
        <div
          style={{
            display: "flex",
            marginTop: 16,
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

function renderDropoutByArm(p: DropoutByArmPayload): {
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
  const title = p.title ?? "Where users quit by arm — email first vs last";
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
          Awaiting data — not enough per-arm traffic in this window yet.
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
        {`${fmtAxis(value)}%`}
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
  if (hasFirst && !showFirstLabel) carried.push(`${shortFirst} ${fmtAxis(endFirst)}%`);
  if (hasLast && !showLastLabel) carried.push(`${shortLast} ${fmtAxis(endLast)}%`);
  const footnote = carried.length > 0 ? `${carried.join(" · ")} — ${footnoteBase}` : footnoteBase;

  const element = chartShell(
    title,
    p.windowLabel ?? "",
    <div style={{ display: "flex", flexDirection: "column", flexShrink: 0 }}>
      {/* Legend — always present for two series, so identity is never colour alone. */}
      <div style={{ display: "flex", flexDirection: "row", gap: 22, marginBottom: 14 }}>
        {/* An arm with no readings says so in the legend, so a missing line is
            never mistaken for a line hidden behind the other one. */}
        {swatch(COLORS.accentPurple, hasFirst ? legendFirst : `${legendFirst} — no data yet`)}
        {swatch(COLORS.accentOrange, hasLast ? legendLast : `${legendLast} — no data yet`)}
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
              {`${fmtAxis(value)}%`}
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
                stroke={COLORS.accentOrange}
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
                stroke={COLORS.accentPurple}
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}
          </svg>
        </div>

        {hasLast && endDot(COLORS.accentOrange, yEndLast, xEndLast)}
        {hasFirst && endDot(COLORS.accentPurple, yEndFirst, xEndFirst)}
        {showLastLabel && endLabel(COLORS.accentOrange, shortLast, endLast, yEndLast)}
        {showFirstLabel && endLabel(COLORS.accentPurple, shortFirst, endFirst, yEndFirst)}

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
          (hasFirst && hasLast
            ? `Latest — ${fmtAxis(endFirst)}% vs ${fmtAxis(endLast)}%`
            : hasFirst
              ? `Latest — ${fmtAxis(endFirst)}% (${shortLast}: no data yet)`
              : `Latest — ${fmtAxis(endLast)}% (${shortFirst}: no data yet)`)}
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
    case "cvr-visitor-start-dark":
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
