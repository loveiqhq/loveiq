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
  // Validated with the data-viz palette checker against this dark surface
  // (#0b0613): both inside the dark lightness band L 0.48-0.67, CVD separation
  // 25.7 protan / 23.8 tritan, normal-vision 27.8, contrast >= 3:1. The brand
  // steps (#f26d4f / #9c7dff) failed the lightness band -- too light for this
  // surface -- so these are the same hues stepped down for it.
  accentOrange: "#e0552f",
  accentPurple: "#8a63f0",
  barTrack: "#1a1424",
  // Hairline grid: recessive, never dashed.
  gridline: "#171122",
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
  first: number[];
  last: number[];
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
 * Round the axis ceiling up to a human number, so the labels read 0/1/2/3/4/5
 * instead of 0/1.3/2.6/3.9/5.2. Five intervals keeps the ticks dense enough to
 * read a point off without crowding.
 */
function niceAxisMax(rawPeak: number, intervals = 5): number {
  if (!Number.isFinite(rawPeak) || rawPeak <= 0) return 1;
  const steps = [0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100];
  const target = rawPeak / intervals;
  const step = steps.find((c) => c >= target) ?? Math.ceil(target);
  return step * intervals;
}

function fmtAxis(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "0";
  if (value >= 10) return String(Math.round(value));
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
  const toVals = (a: unknown): number[] =>
    (Array.isArray(a) ? a : []).map((v) => Math.max(0, Number(v) || 0));
  const first = toVals(p.first);
  const last = toVals(p.last);
  const title = p.title ?? "Where users quit by arm — email first vs last";
  const n = Math.max(first.length, last.length);

  if (n === 0) {
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

  // Shared y-scale across BOTH arms so the comparison is fair (svgPoints scaled
  // to its own peak would distort one arm against the other). Headroom above the
  // peak keeps the top line off the ceiling.
  const rawPeak = Math.max(...first, ...last, 0);
  const peak = niceAxisMax(rawPeak);
  const w = DROPOUT_ARM_PLOT_W;
  const h = DROPOUT_ARM_PLOT_H;
  const firstPts = svgPoints(first, peak, w, h);
  const lastPts = svgPoints(last, peak, w, h);
  const ticks = sampleTicks(labels);

  // Direct end labels. With two series the legend carries identity, but a label
  // at the line's own end is what makes a flat-at-zero arm legible instead of
  // looking like a catastrophic result.
  const endOf = (vals: number[]) => (vals.length > 0 ? vals[vals.length - 1]! : 0);
  const yFor = (v: number) => Math.round(h - (v / peak) * h);
  const endFirst = endOf(first);
  const endLast = endOf(last);
  let yFirst = yFor(endFirst);
  let yLast = yFor(endLast);
  // Each label is two stacked lines (~30px), so anything closer than that
  // overlaps. Nudge both apart and clamp inside the plot.
  const LABEL_H = 32;
  if (Math.abs(yFirst - yLast) < LABEL_H) {
    const mid = (yFirst + yLast) / 2;
    const half = LABEL_H / 2;
    if (yFirst <= yLast) {
      yFirst = mid - half;
      yLast = mid + half;
    } else {
      yLast = mid - half;
      yFirst = mid + half;
    }
  }
  const clamp = (y: number) => Math.max(0, Math.min(h - LABEL_H, Math.round(y)));
  yFirst = clamp(yFirst);
  yLast = clamp(yLast);

  const legendFirst = p.legendFirst ?? "Email first (control)";
  const legendLast = p.legendLast ?? "Email last";
  // Short names for the end labels: drop the words the two arms SHARE, so the
  // label keeps only what tells them apart. Taking the first word instead gave
  // "Email" for both arms of the email-position chart — two identical labels.
  const [shortFirst, shortLast] = ((): [string, string] => {
    // Drop parentheticals first: "first (control)" truncates to "first (contro…",
    // and the legend above already carries the full wording.
    const bare = (t: string) => t.replace(/\s*\([^)]*\)/g, "").trim();
    const a = bare(legendFirst).split(/\s+/).filter(Boolean);
    const b = bare(legendLast).split(/\s+/).filter(Boolean);
    let lead = 0;
    while (lead < a.length - 1 && lead < b.length - 1 && a[lead] === b[lead]) lead += 1;
    let trail = 0;
    while (
      trail < a.length - lead - 1 &&
      trail < b.length - lead - 1 &&
      a[a.length - 1 - trail] === b[b.length - 1 - trail]
    ) {
      trail += 1;
    }
    const cut = (parts: string[]) => parts.slice(lead, parts.length - trail).join(" ");
    const first = cut(a) || bare(legendFirst);
    const last = cut(b) || bare(legendLast);
    // 14 chars is what fits the label gutter at 11px.
    const trim = (t: string) => (t.length > 14 ? `${t.slice(0, 13)}\u2026` : t);
    return [trim(first), trim(last)];
  })();

  const swatch = (color: string, text: string) => (
    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
      <div style={{ display: "flex", width: 10, height: 10, background: color, borderRadius: 5 }} />
      <div style={{ display: "flex", fontSize: 13, color: COLORS.textMuted }}>{text}</div>
    </div>
  );

  const endLabel = (color: string, name: string, value: number, top: number) => (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        position: "absolute",
        left: w + 10,
        top,
        width: DROPOUT_ARM_LABEL_W - 10,
      }}
    >
      <div style={{ display: "flex", fontSize: 15, fontWeight: 700, color }}>
        {`${fmtAxis(value)}%`}
      </div>
      <div style={{ display: "flex", fontSize: 11, color: COLORS.textMuted, lineHeight: 1.1 }}>
        {name}
      </div>
    </div>
  );

  const element = chartShell(
    title,
    p.windowLabel ?? "",
    <div style={{ display: "flex", flexDirection: "column" }}>
      {/* Legend — always present for two series, so identity is never colour alone. */}
      <div style={{ display: "flex", flexDirection: "row", gap: 20, marginBottom: 14 }}>
        {swatch(COLORS.accentPurple, legendFirst)}
        {swatch(COLORS.accentOrange, legendLast)}
      </div>

      {/* y-axis, then the plot. Without the axis a reader cannot tell whether the
          curve tops out at 2% or 40% — the peak was only ever stated in the
          footnote text. */}
      <div style={{ display: "flex", flexDirection: "row" }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            alignItems: "flex-end",
            width: DROPOUT_ARM_AXIS_W,
            height: h,
            paddingRight: 8,
          }}
        >
          {[1, 0.8, 0.6, 0.4, 0.2, 0].map((f) => (
            <div
              key={`y-${f}`}
              style={{ display: "flex", fontSize: 11, color: COLORS.textMuted, lineHeight: 1 }}
            >
              {`${fmtAxis(peak * f)}%`}
            </div>
          ))}
        </div>

        <div
          style={{
            display: "flex",
            position: "relative",
            width: w + DROPOUT_ARM_LABEL_W,
            height: h,
          }}
        >
          <svg width={w} height={h}>
            {/* Hairline gridlines at the same fractions as the axis labels, so a
                point can actually be read off. polyline only — the proven Satori
                primitive in this file. */}
            {[0.2, 0.4, 0.6, 0.8, 1].map((f) => (
              <polyline
                key={`grid-${f}`}
                points={`0,${Math.round(h - f * h) + 1} ${w},${Math.round(h - f * h) + 1}`}
                fill="none"
                stroke={COLORS.gridline}
                strokeWidth="1"
              />
            ))}
            <polyline
              points={`0,${h - 1} ${w},${h - 1}`}
              fill="none"
              stroke={COLORS.barTrack}
              strokeWidth="1"
            />
            {lastPts && (
              <polyline
                points={lastPts}
                fill="none"
                stroke={COLORS.accentOrange}
                strokeWidth="2.5"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )}
            {firstPts && (
              <polyline
                points={firstPts}
                fill="none"
                stroke={COLORS.accentPurple}
                strokeWidth="2.5"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )}
          </svg>
          {endLabel(COLORS.accentOrange, shortLast, endLast, yLast)}
          {endLabel(COLORS.accentPurple, shortFirst, endFirst, yFirst)}
        </div>
      </div>

      {/* X-axis ticks, offset to line up under the plot rather than the axis labels */}
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          width: w,
          marginLeft: DROPOUT_ARM_AXIS_W,
          justifyContent: "space-between",
          marginTop: 8,
        }}
      >
        {ticks.map((t, i) => (
          <div key={`${t}-${i}`} style={{ display: "flex", fontSize: 11, color: COLORS.textMuted }}>
            {t}
          </div>
        ))}
      </div>

      {/* The sample sizes that explain the shape, then the method. */}
      <div
        style={{
          display: "flex",
          marginTop: 18,
          fontSize: 15,
          color: COLORS.text,
          fontWeight: 700,
        }}
      >
        {p.headline ?? `Latest — ${fmtAxis(endFirst)}% vs ${fmtAxis(endLast)}%`}
      </div>
      <div style={{ display: "flex", marginTop: 5, fontSize: 12, color: COLORS.textMuted }}>
        {(
          p.footnote ??
          "drop-off % per question · shared y-scale (peak {peak}%) · x-axis = question order"
        ).replace("{peak}", fmtAxis(rawPeak))}
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
