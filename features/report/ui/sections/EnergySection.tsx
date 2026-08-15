"use client";

import { useState, type CSSProperties, type FC } from "react";
import PremiumOverlay, { type PremiumOverlayTier } from "./PremiumOverlay";
import type { ReportPriceQuoteSnapshot } from "@features/pricing/logic/reportPricing";
import { renderEduPara } from "./eduPara";
import { getReportTheme } from "../reportTheme";
import { useRevealOnView } from "../hooks/useRevealOnView";
import { curveEndPoint } from "../curveEnd";
import {
  ENERGY_THIRD_READING,
  getEnergyFamilyProfile,
  type EnergyReading,
} from "@/data/report2-energy";

/**
 * Server-resolved energy copy (`getReport2Section(name, "energy")`), threaded as
 * a prop because the 634KB copy module is server-only (see
 * `app/api/report/route.ts` → `energyCopy`).
 *
 * GATING (Part III, FULL_REPORT tier — this section is `energy_level`, section
 * 13, NOT in `ESSENTIALS_SECTION_IDS`, so it only unlocks at the full_report
 * tier). The educational slots (`edu.*`, `chartnote1`, `learn.*`) are universal
 * (verified identical across all 14 archetypes for `chartnote1`) and always
 * shipped. The per-archetype payload — `gate.hook` (the per-archetype hook here)
 * and `takeaway` (the verdict) plus the energy config (readouts + highlighted
 * curve) — is the gated content: shipped ONLY when the report is unlocked at the
 * full_report tier. A locked client (`locked: true`) receives `gate.hook` (as a
 * teaser) but `takeaway: null` + null config, and renders the hook teaser +
 * PremiumOverlay instead. Never send locked per-archetype content to an unpaid
 * client.
 */
export interface EnergyCopy {
  // gate.hook is per-archetype here — it IS shown (as the locked teaser), but
  // its per-archetype text is the reason it's withheld from a locked client.
  "gate.hook"?: string | null;
  takeaway?: string | null;
  "edu.eyebrow"?: string | null;
  "edu.teaser"?: string | null;
  "edu.body.p1"?: string | null;
  "edu.body.p2"?: string | null;
  "edu.body.p3"?: string | null;
  // Universal chart caption under the wave graph.
  chartnote1?: string | null;
  "learn.eyebrow"?: string | null;
  "learn.body"?: string | null;
  /** True when the per-archetype hook/takeaway + energy config were withheld. */
  locked: boolean;
}

/**
 * Energy config from `getReport2Config(name)` — normalized server-side and only
 * sent when unlocked (null otherwise). `curveFamily` is `families.energy` ∈
 * {wave, spike, steady, conditional} and selects which highlighted curve shape
 * the reader's line takes. `curveId` is `energy_scale_graph.highlighted_curve`
 * (e.g. "wave-slow-build") — a more specific id, kept for parity/future variants
 * but the family owns the shape today. `readouts` are the three small-integer
 * meter levels ({energy, risk, endurance}); only Spiritual Lover carries them,
 * so for the other 13 it is null and the levels fall back to the family profile
 * in `data/report2-energy.ts` (Figma's own per-family readings, not fabricated).
 */
export interface EnergyConfig {
  /** families.energy — selects the highlighted curve shape. */
  curveFamily: string;
  /** energy_scale_graph.highlighted_curve — the specific curve id (optional). */
  curveId?: string | null;
  /** { energy, risk, endurance } small levels (1–3); null when absent. */
  readouts: { energy: number; risk: number; endurance: number } | null;
}

interface Props {
  archetype: string;
  copy: EnergyCopy | null;
  /** Energy config (curve family + readouts); null when locked or absent. */
  config: EnergyConfig | null;
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

const BoltIcon: FC = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
      strokeLinecap="round"
    />
  </svg>
);

/**
 * The three readout rows carry UNIVERSAL labels (Energy / Risk / Endurance);
 * the fill level, the result line ("Moderate · slow-opening") and the sentence
 * under it all come from the reader's `families.energy` profile — see
 * `data/report2-energy.ts`, which holds the four family variants verbatim from
 * Figma. `energy_readouts` config (Spiritual Lover only) still wins on level
 * when present.
 */
const READOUT_ROWS = [
  { key: "energy", label: "Energy" },
  { key: "risk", label: "Risk" },
  { key: "endurance", label: "Endurance" },
] as const;

const TOTAL_SEGMENTS = 3;

/** One readout: icon + serif label + 3 segment bars, then result + detail. */
const ReadoutRow: FC<{ label: string; reading: EnergyReading; level?: number }> = ({
  label,
  reading,
  level,
}) => {
  const filled = Math.max(0, Math.min(TOTAL_SEGMENTS, level ?? reading.level));
  return (
    <div className="report-energy__readout">
      <div className="report-energy__readout-head">
        <span className="report-energy__readout-icon" aria-hidden="true">
          <BoltIcon />
        </span>
        <span className="report-energy__readout-label">{label}</span>
        <span className="report-energy__readout-segments" aria-hidden="true">
          {Array.from({ length: TOTAL_SEGMENTS }, (_, i) => (
            <span key={i} className={`report-energy__readout-seg${i < filled ? " is-on" : ""}`} />
          ))}
        </span>
      </div>
      <div className="report-energy__readout-body">
        <span className="report-energy__readout-level">{reading.result}</span>
        <p className="report-energy__readout-detail">{reading.detail}</p>
      </div>
    </div>
  );
};

/**
 * The wave graph is drawn in a normalized 835×256 viewBox (matching the Figma
 * frame 8427:1900). Plot box: x 40→794 (Figma vector x/width), baseline y 213.
 * Thirteen faint "other archetype" curves fan out from a low-left cluster as
 * constant decorative context (Figma group 8427:1902). The reader's OWN curve is
 * one of four shapes keyed by `families.energy` — its right-edge end carries the
 * solid dot + "you — …" label, and a second label names an anonymous line in the
 * pack, positioned per family as the Figma frames place them.
 */
const GX0 = 40;
const GX1 = 794;
const GBASE = 213;

/**
 * Thirteen faint context curves rebased to the plot box (Figma 8427:1903–1915).
 * A mix of slow risers, mid-risers, and two sharp spikes near the left — the
 * fan the reader's bold line sits inside. Purely decorative; identical for all.
 */
const OTHER_CURVES: string[] = [
  "M40 210 C220 206 470 198 660 150 C720 135 760 125 794 118",
  "M40 210 C240 207 480 200 665 165 C725 153 762 146 794 140",
  "M40 210 C260 208 500 203 675 178 C730 170 765 165 794 160",
  "M40 210 C210 205 430 185 600 160 C690 147 745 138 794 132",
  "M40 211 C280 209 520 205 690 190 C735 186 766 183 794 180",
  "M40 210 C200 204 380 150 520 140 C640 132 720 128 794 124",
  "M40 211 C300 210 540 207 700 197 C740 194 768 192 794 190",
  "M40 209 C230 203 460 175 640 152 C710 143 755 137 794 130",
  "M40 211 C260 209 500 202 680 172 C735 163 766 158 794 152",
  "M40 210 C240 206 490 196 670 158 C728 146 763 140 794 135",
  "M40 212 C320 211 560 209 710 202 C745 200 770 199 794 198",
  "M40 210 C250 207 480 199 660 168 C725 157 764 151 794 146",
  // Two sharp spikes near the left — "fast up, fast gone" (the callout points here).
  "M40 210 C95 210 106 96 120 96 C134 96 140 210 158 210 C176 210 200 205 794 200",
];

/**
 * A second, taller spike just right of the first — the one the callout arrow
 * lands on (Figma vector 8427:1918 shape reads as a hot spike then flat).
 */
const SPIKE_CURVE =
  "M40 210 C120 210 132 84 150 84 C168 84 176 210 200 210 C260 208 520 202 794 196";

/**
 * Four highlighted-curve shapes keyed by `families.energy`. `wave` is the Figma's
 * own purple curve (8427:1918) rebased to the plot box — a slow S that keeps
 * building to the right edge. The other three read the same axis (rise over the
 * encounter) while telling their family's story: `spike` fires early then
 * plateaus, `steady` climbs a gentle even ramp, `conditional` stays low then
 * lifts sharply once conditions are met. Each ends at ~x794 so the "you" dot +
 * label anchor consistently.
 */
interface EnergyGeometry {
  /** The reader's own curve. */
  curve: string;
  /** y of the curve's right end, where the solid dot sits. */
  /** "you — …" label placement. */
  you: { x: number; y: number; anchor: "start" | "end" };
  /** Contrast callout: label placement. */
  contrast: { x: number; y: number; anchor: "start" | "end" };
}

/** Top-left callout naming the spike cluster (3 of 4 frames). */
const SPIKE_CALLOUT = { x: 138, y: 58, anchor: "start" } as const;

/**
 * Per-family graph geometry, measured off the four Figma frames — base
 * 8427:1900 (835×256) and variants 9107:886 spike / 9107:986 steady /
 * 9107:1086 conditional (740×227, mapped into this viewBox through the shared
 * plot box: x = (vx − 35.8) × 1.1284 + 40.4, y = vy × 1.1285).
 *
 * Each family lights up ONE line — its own shape — with the two labels placed
 * around it. The variant frames also leave the base's wave line lit (a
 * duplicate the designer never un-lit; unlabelled in steady and conditional),
 * but their own footer says each family "lights up its own line", so only the
 * family's line is accented here and the contrast label names a grey line.
 */
export const ENERGY_GEOMETRY: Record<string, EnergyGeometry> = {
  // Slow build that keeps climbing, ending high on the right.
  wave: {
    curve: "M40 205 C210 202 300 190 430 150 C540 116 650 70 794 58",
    you: { x: 794, y: 30, anchor: "end" },
    contrast: SPIKE_CALLOUT,
  },
  // Two sharp peaks that each fall straight back to the floor — fast up, fast
  // gone — then flat along the baseline, so the dot lands low right.
  spike: {
    curve:
      "M40 205 L96 205 C110 205 116 73 124 73 C132 73 142 197 158 197 C210 201 258 203 299 203 C313 203 319 109 327 109 C335 109 347 203 361 203 C480 203 650 203 794 203",
    // Sits above the first peak, on the left, where the frame puts it.
    you: { x: 102, y: 62, anchor: "start" },
    // Spike IS the high-spike line, so its frame contrasts against the wave and
    // moves the callout to the right, pointing at the highest slow riser.
    contrast: { x: 788, y: 52, anchor: "end" },
  },
  // Near-flat across the whole encounter — no ramp to climb.
  steady: {
    curve: "M40 138 C200 135 400 130 600 126 C700 123 750 121 794 120",
    you: { x: 737, y: 102, anchor: "end" },
    contrast: SPIKE_CALLOUT,
  },
  // Low until the threshold, then a long continuous climb to the top right.
  conditional: {
    curve:
      "M40 203 C110 201 150 198 169 197 C240 190 290 180 338 169 C400 152 460 138 508 124 C570 108 640 96 677 90 C720 82 760 74 794 68",
    you: { x: 782, y: 50, anchor: "end" },
    contrast: SPIKE_CALLOUT,
  },
};

/** The reader's wave chart (inline SVG, per Figma 8427:1900). */
const WaveGraph: FC<{
  curveFamily: string;
  youLabel: string;
  contrastLabel: string;
  accent: string;
  note?: string | null;
}> = ({ curveFamily, youLabel, contrastLabel, accent, note }) => {
  const geo = ENERGY_GEOMETRY[curveFamily] ?? ENERGY_GEOMETRY.wave!;
  const curveEnd = curveEndPoint(geo.curve);

  // The pack fades in first, then the reader's own line draws itself over it, then
  // the end dot lands and the labels arrive — the order the chart is read in.
  const [graphRef, revealed] = useRevealOnView<HTMLDivElement>();

  return (
    <div
      ref={graphRef}
      className={`report-energy-graph report-chart-reveal${revealed ? " is-revealed" : ""}`}
      role="img"
      aria-label="How your sexual energy builds"
    >
      <svg viewBox="0 0 835 256" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        {/* baseline */}
        <line
          x1={GX0}
          y1={GBASE}
          x2={GX1}
          y2={GBASE}
          stroke="#161021"
          strokeOpacity="0.1"
          strokeWidth="1.4"
        />

        {/* faint context curves — the pack of 14 archetypes */}
        {OTHER_CURVES.map((d, i) => (
          <path
            key={i}
            className="report-chart-fade"
            style={{ "--row": i } as CSSProperties}
            d={d}
            fill="none"
            stroke="#d8d3e2"
            strokeWidth="1.7"
            strokeLinecap="round"
            opacity="0.85"
          />
        ))}
        {/* the spike the callout points at */}
        <path
          className="report-chart-fade"
          d={SPIKE_CURVE}
          fill="none"
          stroke="#cfc8dd"
          strokeWidth="1.7"
          strokeLinecap="round"
        />

        {/* the reader's highlighted curve — the archetype accent, per Figma.
            `pathLength={1}` makes the dash units path-relative, so one dasharray
            draws every family's curve correctly regardless of its real length. */}
        <path
          className="report-draw-line"
          d={geo.curve}
          pathLength={1}
          fill="none"
          stroke={accent}
          strokeWidth="3.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* solid dot at the curve's right end — lands once the stroke reaches it */}
        {/* Position read off the curve itself, so the dot cannot drift from the
            line it belongs to (see `curveEndPoint`). */}
        <circle className="report-draw-dot" cx={curveEnd.x} cy={curveEnd.y} r="8" fill={accent} />

        {/* contrast callout naming an anonymous line in the pack */}
        <text
          className="report-energy-graph__spike report-chart-late"
          x={geo.contrast.x}
          y={geo.contrast.y}
          textAnchor={geo.contrast.anchor}
          fill="#6b6678"
        >
          {contrastLabel}
        </text>

        {/* "you" label anchored to the reader's own line */}
        <text
          className="report-energy-graph__you report-chart-late"
          x={geo.you.x}
          y={geo.you.y}
          textAnchor={geo.you.anchor}
          fill="#161021"
        >
          {youLabel}
        </text>

        {/* x-axis caption */}
        <text
          className="report-energy-graph__axis"
          x={(GX0 + GX1) / 2}
          y={248}
          textAnchor="middle"
          fill="#8d84a6"
        >
          time, with the right conditions &#8594;
        </text>
      </svg>
      {note ? <p className="report-energy-graph__note">{note}</p> : null}
    </div>
  );
};

const EnergySection: FC<Props> = ({
  archetype,
  copy,
  config,
  offerDeadline,
  onUnlock,
  quote = null,
  sectionTitle,
  tier = "full_report",
}) => {
  const [expanded, setExpanded] = useState(false);
  if (!copy) return null;

  const locked = copy.locked;

  // Educational block is universal — always safe to show.
  const eduParas = [copy["edu.body.p1"], copy["edu.body.p2"], copy["edu.body.p3"]].filter(
    (p): p is string => !!p
  );
  const hasEdu = !!copy["edu.teaser"] || eduParas.length > 0;

  // Highlighted curve family — universal fallback to `wave` (the Figma default)
  // when config is absent (locked). The curve is decorative framing, so it's
  // safe to draw even locked, but we key it off config when present.
  const curveFamily = config?.curveFamily ?? "wave";

  // Every reader's readings come from their `families.energy` profile, which
  // covers all 14. `energy_readouts` config (Spiritual Lover only) still wins on
  // the meter fill when it is present, so the one real config is never overridden.
  const profile = getEnergyFamilyProfile(curveFamily);
  const accent = getReportTheme(archetype).accent;
  const readouts = config?.readouts ?? null;

  return (
    <div className="report-energy">
      <h3 className="report-energy__heading">Energy &amp; Risk</h3>

      {copy["learn.body"] ? (
        <div className="report-energy__learn-pill-wrap">
          <span className="report-energy__learn-pill">
            <span className="report-energy__learn-pill-icon" aria-hidden="true">
              <BookIcon />
            </span>
            {copy["learn.eyebrow"] ?? "What you will learn"}
          </span>
          <p className="report-energy__learn-body">{copy["learn.body"]}</p>
        </div>
      ) : null}

      <article className="report-energy__card">
        {locked ? (
          <>
            {copy["gate.hook"] ? <p className="report-energy__hook">{copy["gate.hook"]}</p> : null}
            <div className="report-energy__preview">
              <div className="report-energy__preview-fade" aria-hidden="true">
                {/* Blurred stand-in — the real per-archetype readouts/takeaway are
                    withheld server-side; generic filler under the blur. */}
                <div className="report-energy__readouts">
                  {READOUT_ROWS.map((r) => (
                    <ReadoutRow key={r.key} label={r.label} reading={profile[r.key]} />
                  ))}
                </div>
                <WaveGraph
                  curveFamily={curveFamily}
                  youLabel={profile.youLabel}
                  contrastLabel={profile.contrastLabel}
                  accent={accent}
                  note={copy.chartnote1}
                />
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
          </>
        ) : (
          <>
            <div className="report-energy__readouts">
              {READOUT_ROWS.map((r) => (
                <ReadoutRow
                  key={r.key}
                  label={r.label}
                  reading={profile[r.key]}
                  level={readouts?.[r.key]}
                />
              ))}
            </div>

            {/* Tinted callout under the readings (Figma 8427:1894) — universal. */}
            <p className="report-energy__note">
              {ENERGY_THIRD_READING.body}{" "}
              <em className="report-energy__note-em">{ENERGY_THIRD_READING.emphasis}</em>
            </p>

            {/* Wide rule between the callout and the graph (Figma 8427:1897). */}
            <div className="report-energy__rule report-energy__rule--wide" aria-hidden="true" />

            <div className="report-energy__graph-wrap">
              <p className="report-energy__eyebrow">
                How your sexual energy builds over an encounter
              </p>
              <WaveGraph
                curveFamily={curveFamily}
                youLabel={profile.youLabel}
                contrastLabel={profile.contrastLabel}
                accent={accent}
                note={copy.chartnote1}
              />
            </div>

            {copy.takeaway ? (
              <div className="report-energy__verdict">
                <span className="report-energy__star" aria-hidden="true">
                  &#10037;
                </span>
                <p className="report-energy__takeaway">{copy.takeaway}</p>
              </div>
            ) : null}

            <div className="report-energy__rule" aria-hidden="true" />
          </>
        )}

        {hasEdu ? (
          <div className="report-energy__details">
            <button
              type="button"
              className="report-energy__details-summary"
              aria-expanded={locked ? false : expanded}
              onClick={locked ? onUnlock : () => setExpanded((v) => !v)}
            >
              <span className="report-energy__details-icon" aria-hidden="true">
                <BookIcon />
              </span>
              <span className="report-energy__details-eyebrow">
                {copy["edu.eyebrow"] ?? "Learn: pattern and level"}
              </span>
              <span
                className={`report-energy__details-chevron${expanded ? " is-open" : ""}`}
                aria-hidden="true"
              >
                ⌄
              </span>
            </button>

            {locked || !expanded ? (
              <div className="report-energy__details-peek report-learn-peek">
                {copy["edu.teaser"] ? (
                  <p className="report-energy__details-teaser report-learn-teaser">
                    {copy["edu.teaser"]}
                  </p>
                ) : null}
                {locked || eduParas.length > 0 ? (
                  <button
                    type="button"
                    className="report-energy__peek-cta report-learn-cta"
                    onClick={locked ? onUnlock : () => setExpanded(true)}
                  >
                    {locked ? "Unlock to read the full explanation" : "Read the full explanation"}
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="report-energy__details-body">
                {copy["edu.teaser"] ? (
                  <p className="report-energy__details-teaser report-learn-teaser-full">
                    {copy["edu.teaser"]}
                  </p>
                ) : null}
                {eduParas.map((para, i) => (
                  <p key={i} className="report-energy__details-para">
                    {renderEduPara(para)}
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

export default EnergySection;
