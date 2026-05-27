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

const VALID_KINDS = new Set(["funnel", "wizard", "sparklines", "engagement", "leaks"]);

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

type AnyPayload =
  | WizardPayload
  | SparklinesPayload
  | FunnelPayload
  | EngagementPayload
  | LeaksPayload;

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

function chartShell(title: string, subtitle: string, body: React.ReactNode): React.ReactElement {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: WIDTH,
        height: HEIGHT,
        background: COLORS.bg,
        color: COLORS.text,
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        padding: 28,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div style={{ fontSize: 28, fontWeight: 700, color: COLORS.text }}>{title}</div>
        <div style={{ fontSize: 14, color: COLORS.textMuted }}>{subtitle}</div>
      </div>
      <div
        style={{
          marginTop: 18,
          flex: 1,
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

function renderForKind(kind: string, payload: AnyPayload): React.ReactElement {
  switch (kind) {
    case "wizard":
      return renderWizard(payload as WizardPayload);
    case "funnel":
      return renderFunnel(payload as FunnelPayload);
    case "sparklines":
      return renderSparklines(payload as SparklinesPayload);
    case "engagement":
      return renderEngagement(payload as EngagementPayload);
    case "leaks":
      return renderLeaks(payload as LeaksPayload);
    default:
      return chartShell("Unknown chart kind", kind, <div>—</div>);
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
    return new ImageResponse(renderForKind(kind, payload), {
      width: WIDTH,
      height: HEIGHT,
      // Slack image proxy caches aggressively; URL acts as the cache key so
      // a long max-age is safe and reduces re-render load.
      headers: {
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  } catch {
    return new Response("render_failed", { status: 500 });
  }
}
