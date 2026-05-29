/**
 * Edge-runtime PNG generator for the funnel-digest Slack messages.
 *
 * Slack's image proxy is anonymous (cannot send auth headers), so the URL
 * itself carries both the data and an HMAC signature. The cron handler signs
 * a payload, builds a URL like
 *
 *   /api/admin/digest-image/wizard?d=<base64payload>&s=<base64sig>
 *
 * Slack fetches that URL, this route verifies the signature, parses the
 * payload, and returns a PNG rendered with `next/og` ImageResponse (Satori
 * under the hood). Bad signature → 403 + warn log (no error log to avoid
 * Slack-loop alerts).
 *
 * Why edge: ImageResponse is fastest there, the route is fully deterministic
 * from URL params (no DB), and Vercel's edge handles Slack's retry storms
 * without cold-start cost.
 *
 * The 5 chart kinds share a single Header + brand palette; each branch builds
 * its own body. Sizes are 800×500 px — wide enough that Slack doesn't shrink
 * to a thumbnail, small enough to render in <1s.
 */

import { ImageResponse } from "next/og";
import { verifyImagePayload } from "@shared/url/signed-image-url";

export const runtime = "edge";
// Always re-evaluate on request — the URL is the cache key (Slack proxy
// caches on URL anyway), so disable Next's route cache.
export const dynamic = "force-dynamic";

const WIDTH = 800;
const HEIGHT = 500;
// Tighter body-height estimate: chartShell uses padding=28 (top + bottom = 56),
// header row ~36px (title 28px font), marginTop: 18 between header and body.
// Net body = HEIGHT - 56 - 36 - 18 = HEIGHT - 110.
const BODY_OVERHEAD = 110;

// Brand palette mirrored from app/globals.css. Hex literals only because
// `next/og` (Satori) doesn't read the global CSS — colors must be inline.
const COLORS = {
  bg: "#0b0613",
  surface: "#0f0a18",
  text: "#e8e0f0",
  textMuted: "#9ca3af",
  accentOrange: "#f26d4f",
  accentPurple: "#9c7dff",
  barTrack: "#1a1424",
  warn: "#fbbf24",
  danger: "#f87171",
  good: "#4ade80",
};

const VALID_KINDS = new Set([
  "funnel",
  "wizard",
  "sparklines",
  "engagement",
  "leaks",
  // Phase 1 longitudinal kinds (2026-05-29).
  "sparklines-intro",
  "sparklines-survey",
  "sparklines-wizard",
  "sparklines-monetize",
  // Phase 2 longitudinal kinds (2026-05-29 — perfecting the funnel).
  "sparklines-channels",
  "sparklines-archetypes",
  "sparklines-pricing",
  "sparklines-velocity",
  "sparklines-ux",
  "sparklines-payment",
  "sparklines-invite",
  "sparklines-questions",
]);

interface WizardPayload {
  kind: "wizard";
  weekLabel?: string;
  slide1: number;
  slide2: number;
  slide3: number;
  slide4: number;
  slide5: number;
  reportViewed: number;
}

/**
 * Sparkline payload uses parallel number arrays (one per metric) instead of
 * an object-per-day shape — keeps the signed URL under Slack's 3000-char
 * image_url limit. Order of `series` matches `SPARKLINE_LABELS` below.
 */
interface SparklinesPayload {
  kind: "sparklines";
  windowLabel?: string;
  // 6 series × N days. Order: visitors, starts, completions, report_views,
  // paywall_init, purchases. Each inner array MUST be the same length.
  series: number[][];
}

const SPARKLINE_LABELS = [
  "Visitors",
  "Survey starts",
  "Completions",
  "Report views",
  "Paywall init",
  "Purchases",
];

interface FunnelPayload {
  kind: "funnel";
  weekLabel?: string;
  stages: Array<{ name: string; count: number }>;
}

interface EngagementPayload {
  kind: "engagement";
  weekLabel?: string;
  buckets: Array<{ bucket: "0-1m" | "1-5m" | "5-10m" | "10m+"; n: number; paid: number }>;
}

interface LeaksPayload {
  kind: "leaks";
  weekLabel?: string;
  currency: string;
  leaks: Array<{
    fromStage: string;
    toStage: string;
    dropCount: number;
    estLostRevenue: number;
  }>;
}

/**
 * Generic longitudinal sparkline payload — parallel `labels[]` + `series[][]`.
 * Each labels[i] pairs with series[i]: a per-day count array (typically 30
 * entries). Compact array shape keeps the signed-URL payload under Slack's
 * ~3000-char image_url cap even at 15 lines × 30 days (~survey chapters).
 *
 * Four kinds share this shape (intro, survey, wizard, monetize) — the kind
 * picks the title + color scheme inside `renderLongitudinal`. Keeping ONE
 * payload type vs four separate interfaces lets the verifier do a single
 * cheap shape check after `verifyImagePayload` rather than four branches.
 */
interface LongitudinalPayload {
  kind:
    | "sparklines-intro"
    | "sparklines-survey"
    | "sparklines-wizard"
    | "sparklines-monetize"
    // Phase 2 — all share the same labels[]/series[][] shape so renderLongitudinal
    // handles them uniformly. The kind only drives the chart title via
    // LONG_TITLES below.
    | "sparklines-channels"
    | "sparklines-archetypes"
    | "sparklines-pricing"
    | "sparklines-velocity"
    | "sparklines-ux"
    | "sparklines-payment"
    | "sparklines-invite"
    | "sparklines-questions";
  windowLabel?: string;
  labels: string[];
  // One row per label. Each inner array MUST be the same length.
  series: number[][];
}

type AnyPayload =
  | WizardPayload
  | SparklinesPayload
  | FunnelPayload
  | EngagementPayload
  | LeaksPayload
  | LongitudinalPayload;

/** Stage label lookup mirrored from the route formatter so the PNG reads identically. */
const STAGE_LABELS: Record<string, string> = {
  unique_visitors: "Unique visitors",
  saw_q1: "Saw Q1",
  survey_started: "Survey started",
  q1_answered: "Q1 answered",
  completed_all_questions: "All Qs answered",
  survey_submitted: "Survey submitted",
  wizard_slide_1: "Wizard slide 1",
  wizard_slide_5: "Wizard slide 5",
  report_viewed: "Report viewed",
  engagement_1min: "Engagement 1m+",
  engagement_5min: "Engagement 5m+",
  engagement_10min: "Engagement 10m+",
  paywall_initiated: "Paywall initiated",
  begin_checkout: "Begin checkout",
  purchased: "Purchased",
};

function labelFor(name: string): string {
  return STAGE_LABELS[name] ?? name;
}

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
        <div style={{ fontSize: 28, fontWeight: 700, color: COLORS.text }}>{title}</div>
        <div style={{ fontSize: 14, color: COLORS.textMuted }}>{subtitle}</div>
      </div>
      <div
        style={{
          marginTop: 18,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {body}
      </div>
    </div>
  );
}

function bar({
  label,
  count,
  width,
  color,
  trailing,
}: {
  label: string;
  count: number;
  width: number; // 0..1
  color: string;
  trailing?: string;
}) {
  const clamped = Math.max(0, Math.min(1, width));
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        marginBottom: 8,
        width: "100%",
      }}
    >
      <div
        style={{
          width: 180,
          fontSize: 14,
          color: COLORS.textMuted,
          overflow: "hidden",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </div>
      <div
        style={{
          display: "flex",
          flex: 1,
          height: 22,
          background: COLORS.barTrack,
          borderRadius: 4,
          overflow: "hidden",
          marginRight: 8,
        }}
      >
        <div
          style={{
            width: `${clamped * 100}%`,
            height: "100%",
            background: color,
            borderRadius: 4,
          }}
        />
      </div>
      <div
        style={{
          display: "flex",
          width: 110,
          fontSize: 14,
          color: COLORS.text,
          justifyContent: "flex-end",
        }}
      >
        {`${count.toLocaleString()}${trailing ? ` ${trailing}` : ""}`}
      </div>
    </div>
  );
}

function renderWizard(p: WizardPayload) {
  const slides = [
    { label: "Slide 1 entered", n: p.slide1, prev: p.slide1 },
    { label: "Slide 2", n: p.slide2, prev: p.slide1 },
    { label: "Slide 3", n: p.slide3, prev: p.slide2 },
    { label: "Slide 4", n: p.slide4, prev: p.slide3 },
    { label: "Slide 5", n: p.slide5, prev: p.slide4 },
    { label: "Report viewed", n: p.reportViewed, prev: p.slide5 },
  ];
  const max = Math.max(...slides.map((s) => s.n), 1);
  return chartShell(
    "Wizard funnel",
    p.weekLabel ?? "",
    <div style={{ display: "flex", flexDirection: "column" }}>
      {slides.map((s, i) => {
        const kept = s.prev > 0 ? Math.round((s.n / s.prev) * 100) : 0;
        const trailing = i === 0 ? "" : `(${kept}% kept)`;
        return bar({
          label: s.label,
          count: s.n,
          width: s.n / max,
          color: COLORS.accentPurple,
          trailing,
        });
      })}
    </div>
  );
}

function renderFunnel(p: FunnelPayload) {
  const stages = (p.stages || []).filter((s) => s && typeof s.count === "number");
  if (stages.length === 0) {
    return chartShell("Drop-off funnel", p.weekLabel ?? "", <div>No data</div>);
  }
  const max = Math.max(...stages.map((s) => s.count), 1);
  // Identify biggest absolute drop (skip first row).
  let leakIdx = -1;
  let leakDrop = 0;
  for (let i = 1; i < stages.length; i += 1) {
    const drop = Math.max(0, stages[i - 1]!.count - stages[i]!.count);
    if (drop > leakDrop) {
      leakDrop = drop;
      leakIdx = i;
    }
  }
  return chartShell(
    "Drop-off funnel",
    p.weekLabel ?? "",
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {stages.map((s, i) => {
        const prev = i === 0 ? s.count : stages[i - 1]!.count;
        const drop = i === 0 ? 0 : Math.max(0, prev - s.count);
        const dropPct = prev > 0 ? Math.round((drop / prev) * 100) : 0;
        const isLeak = i === leakIdx && leakDrop > 0;
        const trailing = i === 0 ? "" : `−${drop} (${dropPct}%)`;
        return bar({
          label: labelFor(s.name),
          count: s.count,
          width: s.count / max,
          color: isLeak ? COLORS.danger : COLORS.accentOrange,
          trailing,
        });
      })}
    </div>
  );
}

function renderSparklines(p: SparklinesPayload) {
  const series = Array.isArray(p.series) ? p.series : [];
  if (series.length === 0 || !Array.isArray(series[0]) || series[0]!.length === 0) {
    return chartShell("30-day trends", p.windowLabel ?? "", <div>No data</div>);
  }
  return chartShell(
    "30-day trends",
    p.windowLabel ?? "",
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {SPARKLINE_LABELS.map((label, sIdx) => {
        const s = Array.isArray(series[sIdx]) ? series[sIdx]!.map((v) => Number(v) || 0) : [];
        const peak = s.length > 0 ? Math.max(...s, 0) : 0;
        return (
          <div key={label} style={{ display: "flex", alignItems: "center", height: 48 }}>
            <div
              style={{
                width: 130,
                fontSize: 13,
                color: COLORS.textMuted,
                overflow: "hidden",
                whiteSpace: "nowrap",
              }}
            >
              {label}
            </div>
            <div
              style={{
                display: "flex",
                flex: 1,
                alignItems: "flex-end",
                height: 44,
                gap: 2,
              }}
            >
              {s.map((v, i) => {
                const h = peak > 0 ? Math.max(2, Math.round((v / peak) * 40)) : 2;
                return (
                  <div
                    key={i}
                    style={{
                      width: 16,
                      height: h,
                      background: COLORS.accentPurple,
                      borderRadius: 1,
                    }}
                  />
                );
              })}
            </div>
            <div
              style={{
                display: "flex",
                width: 72,
                fontSize: 13,
                color: COLORS.text,
                justifyContent: "flex-end",
              }}
            >
              {`peak ${peak.toLocaleString()}`}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function renderEngagement(p: EngagementPayload) {
  const order: Array<EngagementPayload["buckets"][number]["bucket"]> = [
    "0-1m",
    "1-5m",
    "5-10m",
    "10m+",
  ];
  const byBucket = new Map((p.buckets || []).map((b) => [b.bucket, b]));
  const buckets = order
    .map((k) => byBucket.get(k))
    .filter((b): b is EngagementPayload["buckets"][number] => Boolean(b));
  if (buckets.length === 0) {
    return chartShell("Engagement → purchase", p.weekLabel ?? "", <div>No data</div>);
  }
  const maxRate = Math.max(...buckets.map((b) => (b.n > 0 ? (b.paid / b.n) * 100 : 0)), 1);
  return chartShell(
    "Engagement → purchase",
    p.weekLabel ?? "",
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        gap: 24,
        alignItems: "flex-end",
        flex: 1,
        padding: "0 32px 24px",
      }}
    >
      {buckets.map((b) => {
        const rate = b.n > 0 ? (b.paid / b.n) * 100 : 0;
        const h = maxRate > 0 ? Math.max(4, (rate / maxRate) * 280) : 4;
        return (
          <div
            key={b.bucket}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}
          >
            <div style={{ fontSize: 18, color: COLORS.text, marginBottom: 8 }}>
              {`${rate.toFixed(1)}%`}
            </div>
            <div
              style={{
                width: 80,
                height: h,
                background: COLORS.accentOrange,
                borderRadius: 4,
              }}
            />
            <div style={{ fontSize: 14, color: COLORS.textMuted, marginTop: 8 }}>{b.bucket}</div>
            <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 2 }}>
              {`n=${b.n}, paid=${b.paid}`}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function renderLeaks(p: LeaksPayload) {
  const leaks = (p.leaks || []).slice(0, 3);
  if (leaks.length === 0) {
    return chartShell("Top funnel leaks by revenue impact", p.weekLabel ?? "", <div>No data</div>);
  }
  const maxLost = Math.max(...leaks.map((l) => l.estLostRevenue), 1);
  return chartShell(
    "Top funnel leaks by revenue impact",
    p.weekLabel ?? "",
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {leaks.map((l, i) => {
        const w = l.estLostRevenue / maxLost;
        const lostLabel = `~${p.currency} ${Math.round(l.estLostRevenue).toLocaleString()}`;
        return (
          <div
            key={`${l.fromStage}-${l.toStage}-${i}`}
            style={{ display: "flex", flexDirection: "column" }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 16,
                marginBottom: 4,
              }}
            >
              <span style={{ color: COLORS.text }}>
                {`${i + 1}. ${labelFor(l.fromStage)} → ${labelFor(l.toStage)}`}
              </span>
              <span style={{ color: COLORS.danger, fontWeight: 700 }}>{lostLabel}</span>
            </div>
            <div
              style={{ display: "flex", height: 18, background: COLORS.barTrack, borderRadius: 4 }}
            >
              <div
                style={{
                  width: `${Math.max(0, Math.min(1, w)) * 100}%`,
                  height: "100%",
                  background: COLORS.danger,
                  borderRadius: 4,
                }}
              />
            </div>
            <div style={{ fontSize: 13, color: COLORS.textMuted, marginTop: 4 }}>
              {`${l.dropCount.toLocaleString()} users dropped at this edge`}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Generic longitudinal renderer for the four phase-bucketed sparkline kinds.
 * Sizes per-row height to fit the row count: 4 lines (intro) get fat rows,
 * 15 lines (survey chapters) get thin rows. Each row mirrors the existing
 * `renderSparklines` row layout — label | per-day bars | peak count — so the
 * Slack-side visual style stays consistent.
 *
 * Color cycle: alternates between accent purple and accent orange so adjacent
 * rows stay distinguishable without needing a 15-color palette. For the survey
 * chart that's 15 rows, the alternation reads as a chapter-by-chapter gradient.
 */
const LONG_TITLES: Record<LongitudinalPayload["kind"], string> = {
  "sparklines-intro": "Pre-survey intro retention",
  "sparklines-survey": "Survey chapter completion",
  "sparklines-wizard": "Pre-report wizard retention",
  "sparklines-monetize": "Monetization ladder",
  // Phase 2 titles.
  "sparklines-channels": "Acquisition channels",
  "sparklines-archetypes": "Per-archetype conversion",
  "sparklines-pricing": "Pricing-modal funnel",
  "sparklines-velocity": "Paywall → purchase velocity (hours)",
  "sparklines-ux": "UX friction signals",
  "sparklines-payment": "Payment health",
  "sparklines-invite": "Viral loop (email-match)",
  "sparklines-questions": "Top abandoned questions",
};

/**
 * Per-row pixel target. Picked so labels (13px font) + ~40-50px chart band sit
 * comfortably without cramping. The image height grows with row count instead
 * of compressing rows when N is large (e.g. 16+ survey chapters).
 *
 * BUFFER pads the total beyond the strict content sum to absorb Satori subpixel
 * rounding + give visible bottom margin. Without it, 11+ row charts clip the
 * last row inside Slack.
 */
const TARGET_ROW_H = 48;
const ROW_GAP = 8;
const BUFFER = 40;
const MIN_HEIGHT = 480;
const MAX_HEIGHT = 1200;

function longitudinalHeight(rowCount: number): number {
  const bodyNeeded = rowCount * TARGET_ROW_H + (rowCount - 1) * ROW_GAP;
  return Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, bodyNeeded + BODY_OVERHEAD + BUFFER));
}

/**
 * Build an SVG `points="x1,y1 x2,y2 ..."` string mapping values to a chart
 * area. Y axis is inverted (SVG 0 = top) so higher values draw higher.
 * `extraStart`/`extraEnd` close a polygon to baseline when set.
 */
function svgPoints(values: number[], peak: number, width: number, chartH: number): string {
  if (values.length === 0 || peak <= 0) return "";
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  const pts: string[] = [];
  for (let i = 0; i < values.length; i += 1) {
    const x = Math.round(i * step);
    const v = values[i] ?? 0;
    const y = Math.round(chartH - (v / peak) * chartH);
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
  // Defensive: pair up labels with series of equal length. Mismatch = skip
  // that row rather than throw.
  const allRows: Array<{ label: string; values: number[]; peak: number }> = [];
  for (let i = 0; i < labels.length; i += 1) {
    const lbl = labels[i];
    const ser = series[i];
    if (typeof lbl !== "string" || !Array.isArray(ser)) continue;
    const values = ser.map((v) => Math.max(0, Number(v) || 0));
    const peak = values.reduce((a, b) => Math.max(a, b), 0);
    allRows.push({ label: lbl, values, peak });
  }
  // Hide rows where every day is zero — they previously rendered as ugly
  // broken dashed lines. Keep them visible in the row-count header below
  // so the viewer still knows the stage exists (Awaiting data).
  const liveRows = allRows.filter((r) => r.peak > 0);
  const emptyCount = allRows.length - liveRows.length;
  const title = LONG_TITLES[p.kind] ?? "Longitudinal trend";

  if (liveRows.length === 0) {
    return {
      element: chartShell(
        title,
        p.windowLabel ?? "",
        <div
          style={{
            display: "flex",
            color: COLORS.textMuted,
            fontSize: 18,
            padding: 24,
          }}
        >
          Awaiting data — no traffic on any tracked stage yet.
        </div>
      ),
      height: HEIGHT,
    };
  }

  // Grow image height with the LIVE row count + reserve a row for the
  // "Awaiting data" footnote when some stages are hidden.
  const rowCount = liveRows.length + (emptyCount > 0 ? 1 : 0);
  const height = longitudinalHeight(rowCount);
  const rowH = TARGET_ROW_H;
  // Chart band height stops 14px short of the row so labels + sparkline don't
  // visually collide with the rows above/below.
  const chartH = Math.max(4, rowH - 14);
  // Body width budget: 800 - 56 (chart padding) - 130 (label) - 80 (peak readout)
  //                  = 534. Leave 10px gutter on each side of chart.
  const chartW = 514;
  const element = chartShell(
    title,
    p.windowLabel ?? "",
    <div style={{ display: "flex", flexDirection: "column", gap: ROW_GAP }}>
      {liveRows.map((row, rIdx) => {
        const color = rIdx % 2 === 0 ? COLORS.accentPurple : COLORS.accentOrange;
        const linePts = svgPoints(row.values, row.peak, chartW, chartH);
        // Build a closed polygon for the area fill: line points then bottom-right
        // and bottom-left corners back to (0, chartH).
        const areaPts = linePts ? `0,${chartH} ${linePts} ${chartW},${chartH}` : "";
        return (
          <div
            key={`${row.label}-${rIdx}`}
            style={{ display: "flex", alignItems: "center", height: rowH }}
          >
            <div
              style={{
                width: 130,
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
                width: 80,
                fontSize: 13,
                color: COLORS.text,
                justifyContent: "flex-end",
              }}
            >
              {`peak ${row.peak.toLocaleString()}`}
            </div>
          </div>
        );
      })}
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
          {`+ ${emptyCount} ${emptyCount === 1 ? "stage" : "stages"} awaiting first data`}
        </div>
      )}
    </div>,
    height
  );
  return { element, height };
}

/**
 * Single dispatch for all chart kinds. Returns both the rendered element AND
 * the image height — fixed at HEIGHT for non-longitudinal kinds, grown to fit
 * row count for the longitudinal ones.
 */
function renderForKind(
  kind: string,
  payload: AnyPayload
): { element: React.ReactElement; height: number } {
  switch (kind) {
    case "wizard":
      return { element: renderWizard(payload as WizardPayload), height: HEIGHT };
    case "funnel":
      return { element: renderFunnel(payload as FunnelPayload), height: HEIGHT };
    case "sparklines":
      return { element: renderSparklines(payload as SparklinesPayload), height: HEIGHT };
    case "engagement":
      return { element: renderEngagement(payload as EngagementPayload), height: HEIGHT };
    case "leaks":
      return { element: renderLeaks(payload as LeaksPayload), height: HEIGHT };
    case "sparklines-intro":
    case "sparklines-survey":
    case "sparklines-wizard":
    case "sparklines-monetize":
    case "sparklines-channels":
    case "sparklines-archetypes":
    case "sparklines-pricing":
    case "sparklines-velocity":
    case "sparklines-ux":
    case "sparklines-payment":
    case "sparklines-invite":
    case "sparklines-questions":
      return renderLongitudinal(payload as LongitudinalPayload);
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
    // 403 — not 500 — so an attacker probing for the route doesn't trip
    // ops error alerts. Bad signatures are expected from the open internet.
    return new Response("invalid_signature", { status: 403 });
  }

  // Defense in depth: even with a valid signature, the payload `kind` field
  // must match the URL path. Prevents a wizard-signed URL from rendering as a
  // funnel chart (low risk, but cheap to enforce).
  if (payload.kind !== kind) {
    return new Response("kind_mismatch", { status: 400 });
  }

  // ImageResponse can throw at render time (Satori limitations on edge —
  // unsupported CSS, font loading failures, etc). A throw would surface as
  // an unhandled 500 to Slack's image proxy, which then renders a broken
  // image icon. Catching here lets us return a 500 with a short body so an
  // operator can grep the logs for the kind and diagnose.
  try {
    const { element, height } = renderForKind(kind, payload);
    return new ImageResponse(element, {
      width: WIDTH,
      height,
      // Short cache window (1h instead of 24h) so a fix-the-visual iteration
      // doesn't get stuck behind Slack's image proxy cache. The signed URL
      // already includes a deploy-stamp `v` field so each deploy busts the
      // cache regardless; this is belt-and-suspenders.
      headers: {
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return new Response("render_failed", { status: 500 });
  }
}
