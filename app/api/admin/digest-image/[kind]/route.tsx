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
  accentOrange: "#f26d4f",
  accentPurple: "#9c7dff",
  barTrack: "#1a1424",
  warn: "#fbbf24",
  danger: "#f87171",
  good: "#4ade80",
};

// The 7 line/curve kinds share `LongitudinalPayload`; `reactivation-email`
// uses `StageConversionPayload`. Order here documents the digest layout.
const VALID_KINDS = new Set([
  "cvr-visitor-start",
  "cvr-start-completion",
  "cvr-completion-engagement",
  "cvr-completion-paygate",
  "cvr-paygate-purchase",
  "bucket-performance",
  "dropout-funnel",
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
    | "cvr-completion-engagement"
    | "cvr-completion-paygate"
    | "cvr-paygate-purchase"
    | "bucket-performance"
    | "dropout-funnel";
  windowLabel?: string;
  labels: string[];
  series: number[][];
  // When true, values are percentages -> readout shows "max X%" and the empty
  // state copy differs. All Phase-3 line charts set this.
  rate?: boolean;
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

type AnyPayload = LongitudinalPayload | StageConversionPayload;

const LONG_TITLES: Record<LongitudinalPayload["kind"], string> = {
  "cvr-visitor-start": "Visitor → Survey-start CVR",
  "cvr-start-completion": "Survey-start → Completion CVR",
  "cvr-completion-engagement": "Completion → Report-view CVR (1m / 5m / 10m)",
  "cvr-completion-paygate": "Completion → Paygate CVR",
  "cvr-paygate-purchase": "Paygate → Purchase CVR",
  "bucket-performance": "Price-bucket conversion rate",
  "dropout-funnel": "Survey drop-out — retention by question",
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
  const height = longitudinalHeight(rowCount, rowH);
  const chartH = Math.max(4, rowH - 14);
  // Plot width budget: 800 - 56 (shell padding) - 150 (label) - 96 (readout)
  // = 498; reserve 10px gutter each side -> 470px. This SAME value drives
  // svgPoints, the area-close point, AND the <svg> width so the line never
  // clips (a prior bug used 514 for points but 474 for the svg element).
  const chartW = 470;
  const readout = (peak: number): string =>
    isRate ? `max ${Math.round(peak)}%` : `peak ${peak.toLocaleString()}`;

  const element = chartShell(
    title,
    p.windowLabel ?? "",
    <div style={{ display: "flex", flexDirection: "column", gap: ROW_GAP }}>
      {liveRows.map((row, rIdx) => {
        const color = rIdx % 2 === 0 ? COLORS.accentPurple : COLORS.accentOrange;
        const linePts = svgPoints(row.values, row.peak, chartW, chartH);
        const areaPts = linePts ? `0,${chartH} ${linePts} ${chartW},${chartH}` : "";
        return (
          <div
            key={`${row.label}-${rIdx}`}
            style={{ display: "flex", alignItems: "center", height: rowH }}
          >
            <div
              style={{
                width: 150,
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
                width: 96,
                fontSize: 13,
                color: COLORS.text,
                justifyContent: "flex-end",
              }}
            >
              {readout(row.peak)}
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
    case "dropout-funnel":
      return renderLongitudinal(payload as LongitudinalPayload);
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
