"use client";

import { useState, type CSSProperties, type FC } from "react";
import VerdictStar from "./VerdictStar";
import LockedPreviewImage from "./LockedPreviewImage";
import PremiumOverlay, { type PremiumOverlayTier } from "./PremiumOverlay";
import type { ReportPriceQuoteSnapshot } from "@features/pricing/logic/reportPricing";
import { getReportTheme } from "../reportTheme";
import { useRevealOnView } from "../hooks/useRevealOnView";
import { curveEndPoint } from "../curveEnd";

/**
 * Server-resolved insecurities copy (`getReport2Section(name, "insecurities")`),
 * threaded as a prop because the 634KB copy module is server-only (see
 * `app/api/report/route.ts` → `insecuritiesCopy`).
 *
 * GATING (Part II, essentials tier):
 * `practical.label` and `learn.*` are universal and always shipped. The
 * per-archetype payload — `takeaway`, `practical.teaser`, `practical.line1..3`
 * and `body.p1` (plus the cue-curve highlight/axis specifics) — is the premium
 * content: the server sends it ONLY when the report is unlocked at the
 * essentials tier (or above). For a locked client those arrive `null` and the
 * client renders the hook teaser + PremiumOverlay instead. `locked` tells the
 * client which it received. Never send locked per-archetype text to an unpaid
 * client.
 */
export interface InsecuritiesCopy {
  "practical.label"?: string | null;
  "learn.eyebrow"?: string | null;
  "learn.body"?: string | null;
  // Per-archetype — withheld (null) from locked clients.
  takeaway?: string | null;
  "practical.teaser"?: string | null;
  "practical.line1"?: string | null;
  "practical.line2"?: string | null;
  "practical.line3"?: string | null;
  "body.p1"?: string | null;
  /** True when the per-archetype takeaway/practical/body/graph were withheld. */
  locked: boolean;
}

/**
 * Cue-graph geometry from `getReport2Config(name)`:
 *   families.insecurity_cue ∈ the six families below;
 *   insecurity_graph = { highlighted_curve, y_axis, x_axis } (only Spiritual
 *   Lover carries a full one today — the rest derive from the cue family).
 */
export interface InsecurityGraph {
  /** e.g. "early-hot-riser" — selects the highlighted curve shape. Optional. */
  highlighted_curve?: string | null;
  /** Y-axis label; falls back to the family map when absent. */
  y_axis?: string | null;
  /** X-axis label; falls back to the family map when absent. */
  x_axis?: string | null;
}

interface Props {
  archetype: string;
  copy: InsecuritiesCopy | null;
  /**
   * Insecurity cue family from `getReport2Config(name).families.insecurity_cue`
   * — one of {absence, abandonment, evaluation, engulfment, depletion,
   * destabilisation}. Drives the axis labels + which curve is highlighted.
   * `null` falls back to the absence family (the Figma default).
   */
  cueFamily: string | null;
  /** Config `insecurity_graph` (highlighted_curve + axis label overrides). */
  graph: InsecurityGraph | null;
  offerDeadline?: number;
  onUnlock: () => void;
  quote?: ReportPriceQuoteSnapshot | null;
  sectionTitle: string;
  tier?: PremiumOverlayTier;
}

const BookIcon: FC = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v15.5H5.5A1.5 1.5 0 0 1 4 18V5.5Z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    <path
      d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v15.5h5.5A1.5 1.5 0 0 0 20 18V5.5Z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * Per-family axis labels + which highlighted-curve shape to draw (DECISIONS
 * 2026-07-30; Figma 8427:1525 verified for `absence` → the tall early riser).
 * `highlighted_curve` in config wins over `curve` here; `y_axis`/`x_axis` in
 * config win over these labels. Every archetype resolves to exactly one family.
 */
type CueFamily = { yAxis: string; xAxis: string; curve: keyof typeof HIGHLIGHT_CURVES };

/** The absence family — the Figma default + the fallback for an unknown cue. */
const ABSENCE_FAMILY: CueFamily = {
  yAxis: "sensitivity to absence",
  xAxis: "time",
  curve: "early-hot-riser",
};

const CUE_FAMILIES: Record<string, CueFamily> = {
  absence: ABSENCE_FAMILY,
  abandonment: { yAxis: "sensitivity to abandonment", xAxis: "time", curve: "early-hot-riser" },
  evaluation: { yAxis: "sensitivity to being judged", xAxis: "time", curve: "mid-riser" },
  engulfment: {
    yAxis: "sensitivity to being engulfed",
    xAxis: "closeness intensifies",
    curve: "climbing",
  },
  depletion: {
    yAxis: "sensitivity to imbalance",
    xAxis: "as giving accumulates",
    curve: "late-accumulator",
  },
  destabilisation: {
    yAxis: "sensitivity to disorder",
    xAxis: "as structure loosens",
    curve: "volatile",
  },
};

/**
 * The graph is drawn in a normalized 800×390 viewBox (matching the Figma frame
 * 8427:1525). Plot box: x 63→778, y 43→353. Four faint "other archetype" curves
 * are constant decorative context (Figma vectors 8427:1530–1533). The reader's
 * OWN curve is one of six shapes keyed by cue family — its end point (right
 * edge) carries the solid dot + "You — the {archetype}" label + dashed
 * connector, exactly as the Figma places them on the highlighted curve.
 */
const PLOT = { x0: 63, x1: 778, yTop: 43, yBot: 353 } as const;

/** Four faint context curves (Figma 8427:1530–1533), rebased to the plot box. */
const OTHER_CURVES: { d: string; stroke: string }[] = [
  {
    // 8427:1533 — near-flat low riser
    d: "M64 351 C231 348 431 342 631 331 C717 327 757 324 778 323",
    stroke: "#C9C3D6",
  },
  {
    // 8427:1530 — gentle low riser
    d: "M64 348 C258 345 458 337 630 311 C682 303 713 297 778 294",
    stroke: "#D7C9B0",
  },
  {
    // 8427:1532 — mid-low riser
    d: "M64 345 C287 342 501 331 673 305 C724 297 756 291 778 288",
    stroke: "#E8C4D2",
  },
  {
    // 8427:1531 — tall late riser with a dip (context)
    d: "M64 342 C230 339 402 214 516 174 C630 137 702 214 778 208",
    stroke: "#BCD3EA",
  },
];

/**
 * Six highlighted-curve shapes (one per cue family). `early-hot-riser` is the
 * Figma's own purple curve (8427:1534) rebased to the plot box; the other five
 * are variants that read the same way visually (rise earliest/steepest = most
 * reactive) while differing enough to match the family's story. Each ends at the
 * right edge (~x778) so the "You" dot/label anchor lands consistently.
 */
export const HIGHLIGHT_CURVES: Record<string, string> = {
  // Rises early and steep — reacts first (absence / abandonment).
  "early-hot-riser": "M64 340 C189 329 254 149 368 106 C482 64 620 49 778 44",
  // Climbs through the middle — reacts once things are underway (evaluation).
  "mid-riser": "M64 344 C214 340 300 320 430 210 C520 135 640 70 778 52",
  // Accelerates toward the right — reacts as closeness intensifies (engulfment).
  climbing: "M64 348 C240 342 420 320 560 250 C650 205 720 110 778 48",
  // Slow ramp that keeps climbing — reacts as giving accumulates (depletion).
  "late-accumulator": "M64 346 C220 335 380 300 520 235 C630 185 710 105 778 58",
  // Dips then rises sharply — reacts as structure loosens (destabilisation).
  volatile: "M64 300 C160 335 250 250 360 235 C500 216 630 95 778 50",
};

/** The reader's cue-curve chart (inline SVG, per Figma 8427:1525). */
/**
 * Figma colours the highlighted curve, its end dot and the "You" label in the
 * ARCHETYPE'S colour, not a fixed purple — verified on node 9107:587/591/592,
 * where the evaluation variant draws all three in #06B6D4 (stroke-width 3.78 vs
 * 2.27 for the faint context curves). Ours had them hardcoded to #795FC8, so the
 * chart looked identical for every archetype.
 */
const CueGraph: FC<{
  yAxis: string;
  xAxis: string;
  curveKey: string;
  youLabel: string;
  accent: string;
}> = ({ yAxis, xAxis, curveKey, youLabel, accent }) => {
  const highlight = HIGHLIGHT_CURVES[curveKey] ?? HIGHLIGHT_CURVES["early-hot-riser"]!;
  // Pack fades in, then the reader's own curve draws over it, then the dot lands
  // and the labels arrive — the order the chart is read in.
  // `threshold: 0` for the same reason as the energy graph — see EnergySection.
  const [graphRef, revealed] = useRevealOnView<HTMLDivElement>({ threshold: 0 });
  // End point of the highlighted curve (right edge) — anchor for dot/label.
  // Read off the curve, never maintained beside it: this was a three-branch
  // lookup over five curves, which put the depletion family's dot 12px above its
  // own line and both risers 2px off. See `curveEndPoint`.
  const { x: youX, y: youY } = curveEndPoint(highlight);

  return (
    <div
      ref={graphRef}
      className={`report-insecurity-graph report-chart-reveal${revealed ? " is-revealed" : ""}`}
      role="img"
      aria-label="Where your sensitivity sits"
    >
      <svg viewBox="0 0 800 390" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        {/* axes */}
        <line
          x1={PLOT.x0}
          y1={PLOT.yTop - 17}
          x2={PLOT.x0}
          y2={PLOT.yBot}
          stroke="#161021"
          strokeOpacity="0.14"
          strokeWidth="1.7"
        />
        <line
          x1={PLOT.x0}
          y1={PLOT.yBot}
          x2={789}
          y2={PLOT.yBot}
          stroke="#161021"
          strokeOpacity="0.14"
          strokeWidth="1.7"
        />

        {/* faint context curves */}
        {OTHER_CURVES.map((c, i) => (
          <path
            key={i}
            className="report-chart-fade"
            style={{ "--row": i } as CSSProperties}
            d={c.d}
            fill="none"
            stroke={c.stroke}
            strokeWidth="2.56"
            strokeLinecap="round"
          />
        ))}

        {/* dashed connector from the "Other archetypes" label to the pack */}
        <line x1={751} y1={280} x2={702} y2={260} stroke="#C4BED0" strokeWidth="1.42" />

        {/* the reader's highlighted curve. `pathLength={1}` makes the dash units
            path-relative, so one dasharray draws any archetype's curve. */}
        <path
          className="report-draw-line"
          d={highlight}
          pathLength={1}
          fill="none"
          stroke={accent}
          strokeWidth="3.78"
          strokeLinecap="round"
        />
        {/* solid dot at the curve's high end — lands once the stroke reaches it */}
        <circle className="report-draw-dot" cx={youX} cy={youY} r="7.1" fill={accent} />

        {/* y-axis label (rotated) */}
        <text
          className="report-insecurity-graph__axis"
          x={-((PLOT.yTop + PLOT.yBot) / 2)}
          y={40}
          transform="rotate(-90)"
          textAnchor="middle"
          fill="#a09aac"
        >
          {yAxis} &#8593;
        </text>
        {/* x-axis label */}
        <text
          className="report-insecurity-graph__axis"
          x={789}
          y={378}
          textAnchor="end"
          fill="#b0aabd"
        >
          {xAxis} &#8594;
        </text>

        {/* series labels */}
        <text
          className="report-insecurity-graph__you report-chart-late"
          x={youX - 10}
          y={30}
          textAnchor="end"
          fill={accent}
        >
          {youLabel}
        </text>
        <text
          className="report-insecurity-graph__other report-chart-late"
          x={686}
          y={247}
          textAnchor="end"
          fill="#9c96a8"
        >
          Other archetypes
        </text>
      </svg>
    </div>
  );
};

const InsecuritiesSection: FC<Props> = ({
  archetype,
  copy,
  cueFamily,
  graph,
  offerDeadline,
  onUnlock,
  quote = null,
  sectionTitle,
  tier = "essentials",
}) => {
  const [expanded, setExpanded] = useState(false);
  if (!copy) return null;

  const locked = copy.locked;

  // Resolve the cue family (config wins; absence is the Figma default). Axis
  // labels prefer the config's `insecurity_graph.y_axis`/`x_axis`, else the
  // family map. The highlighted curve prefers config `highlighted_curve`.
  const fam: CueFamily = (cueFamily && CUE_FAMILIES[cueFamily]) || ABSENCE_FAMILY;
  const yAxis = graph?.y_axis || fam.yAxis;
  const xAxis = graph?.x_axis || fam.xAxis;
  const curveKey =
    (graph?.highlighted_curve && HIGHLIGHT_CURVES[graph.highlighted_curve]
      ? graph.highlighted_curve
      : fam.curve) ?? "early-hot-riser";

  const practicalLines = [
    copy["practical.line1"],
    copy["practical.line2"],
    copy["practical.line3"],
  ].filter((p): p is string => !!p);

  /**
   * The collapsed peek is three lines of flowing prose that break mid-sentence
   * (Figma 8762:15709). The teaser alone runs ~2.7 lines at desktop width, so the
   * tease continues into the numbered steps — with their "1." / "2." markers
   * dropped, since inside a paragraph they read as stray digits rather than a list.
   */
  const practicalTease = [
    copy["practical.teaser"],
    copy["practical.line1"],
    copy["practical.line2"],
  ]
    .filter((part): part is string => !!part)
    .map((part, i) => (i === 0 ? part : part.replace(/^\s*\d+\.\s*/, "")))
    .join(" ");
  const hasPractical = !!copy["practical.teaser"] || practicalLines.length > 0;

  return (
    <div className="report-insecurities">
      <h3 className="report-insecurities__heading">Core Insecurities</h3>

      {copy["learn.body"] ? (
        <div className="report-insecurities__learn-pill-wrap">
          <span className="report-insecurities__learn-pill">
            <span className="report-insecurities__learn-pill-icon" aria-hidden="true">
              <BookIcon />
            </span>
            {copy["learn.eyebrow"] ?? "What you will learn"}
          </span>
          <p className="report-insecurities__learn-body">{copy["learn.body"]}</p>
        </div>
      ) : null}

      <article className="report-insecurities__card">
        <p className="report-insecurities__eyebrow">Where your sensitivity sits</p>

        <div
          className={`report-insecurities__graph-wrap${
            locked ? " report-insecurities__graph-wrap--locked" : ""
          }`}
        >
          <CueGraph
            yAxis={yAxis}
            xAxis={xAxis}
            curveKey={curveKey}
            youLabel={`You — the ${archetype}`}
            accent={getReportTheme(archetype).accent}
          />
        </div>

        {locked ? (
          <div className="report-insecurities__locked">
            <div className="report-insecurities__preview">
              {/* A pre-blurred render of the REAL chapter. Blurring the PIXELS at
                  build time means the paid copy is not in the file that ships, so
                  it cannot be read back out of the DOM. See LockedPreviewImage. */}
              <div
                className="report-insecurities__preview-fade report-preview-fade--image"
                aria-hidden="true"
              >
                <LockedPreviewImage name="insecurities" />
              </div>
              <PremiumOverlay
                archetype={archetype}
                sectionTitle={sectionTitle}
                tier={tier}
                quote={quote}
                offerDeadline={offerDeadline}
                onUnlock={onUnlock}
              />
            </div>
          </div>
        ) : (
          <>
            {copy["body.p1"] ? (
              <p className="report-insecurities__body">{copy["body.p1"]}</p>
            ) : null}

            {copy.takeaway ? (
              <div className="report-insecurities__verdict">
                <VerdictStar />
                <p className="report-insecurities__takeaway">{copy.takeaway}</p>
                <span className="report-verdict-rule" aria-hidden="true" />
              </div>
            ) : null}
          </>
        )}

        {hasPractical ? (
          <div className="report-insecurities__details">
            <button
              type="button"
              className="report-insecurities__details-summary"
              aria-expanded={locked ? false : expanded}
              onClick={locked ? onUnlock : () => setExpanded((v) => !v)}
            >
              <span className="report-insecurities__details-icon" aria-hidden="true">
                <BookIcon />
              </span>
              <span className="report-insecurities__details-eyebrow">
                {copy["practical.label"] ?? "Working with your sensitivity: three moves"}
              </span>
              <span
                className={`report-insecurities__details-chevron${expanded ? " is-open" : ""}`}
                aria-hidden="true"
              >
                ⌄
              </span>
            </button>

            {locked || !expanded ? (
              <div className="report-insecurities__details-peek report-learn-peek">
                {copy["practical.teaser"] ? (
                  <p className="report-insecurities__details-teaser report-learn-teaser">
                    {practicalTease}
                  </p>
                ) : null}
                {locked || practicalLines.length > 0 ? (
                  <button
                    type="button"
                    className="report-insecurities__peek-cta report-learn-cta"
                    onClick={locked ? onUnlock : () => setExpanded(true)}
                  >
                    {locked ? "Unlock to read the full practice" : "Read the full practice"}
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="report-insecurities__details-body">
                {copy["practical.teaser"] ? (
                  <p className="report-insecurities__details-teaser report-learn-teaser-full">
                    {copy["practical.teaser"]}
                  </p>
                ) : null}
                {practicalLines.map((para, i) => (
                  <p key={i} className="report-insecurities__details-para">
                    {para}
                  </p>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </article>
    </div>
  );
};

export default InsecuritiesSection;
