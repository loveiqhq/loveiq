"use client";

import { useState, type FC } from "react";
import PremiumOverlay, { type PremiumOverlayTier } from "./PremiumOverlay";
import type { ReportPriceQuoteSnapshot } from "@features/pricing/logic/reportPricing";

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
 * meter levels ({energy, risk, endurance}); only Spiritual Lover carries them
 * today, so for the other 13 archetypes it is null and the readout meters are
 * omitted (framing without the reader's specifics) rather than fabricated.
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
 * The three readout rows are UNIVERSAL labels (Energy / Risk / Endurance); only
 * the fill LEVEL varies per reader (config `readouts`). The Figma tints all
 * three meters with the same purple ladder; the per-archetype descriptor line
 * ("Moderate · slow-opening", etc.) is NOT in copy or config for any archetype,
 * so we render the universal level word derived from the fill (a faithful label
 * of the meter, never fabricated archetype prose) and omit the descriptor.
 */
const READOUT_ROWS = [
  { key: "energy", label: "Energy" },
  { key: "risk", label: "Risk" },
  { key: "endurance", label: "Endurance" },
] as const;

/** Universal level word for a 1–3 fill (labels the meter, not the archetype). */
const LEVEL_WORDS = ["", "Low", "Moderate", "High"] as const;

const TOTAL_SEGMENTS = 3;

/** One readout: icon + serif label + 3 segment bars, and the level word. */
const ReadoutRow: FC<{ label: string; level: number }> = ({ label, level }) => {
  const filled = Math.max(0, Math.min(TOTAL_SEGMENTS, level));
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
      <span className="report-energy__readout-level">{LEVEL_WORDS[filled] ?? ""}</span>
    </div>
  );
};

/**
 * The wave graph is drawn in a normalized 835×256 viewBox (matching the Figma
 * frame 8427:1900). Plot box: x 40→794 (Figma vector x/width), baseline y 213.
 * Thirteen faint "other archetype" curves fan out from a low-left cluster as
 * constant decorative context (Figma group 8427:1902). The reader's OWN curve is
 * one of four shapes keyed by `families.energy` — its right-edge end carries the
 * solid dot + "you — …" label, and a "high-spike pattern" callout points at a
 * spike in the pack, exactly as the Figma places them.
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
const HIGHLIGHT_CURVES: Record<string, string> = {
  // Slow build that keeps climbing — the Figma default (Spiritual Lover).
  wave: "M40 205 C210 202 300 190 430 150 C540 116 650 70 794 58",
  // Fast ignition, early peak, then a high plateau — fast up, stays up.
  spike: "M40 208 C90 205 120 70 190 62 C300 52 520 66 794 70",
  // Even gentle ramp across the whole encounter — steady, built to last.
  steady: "M40 206 C180 196 340 160 500 122 C620 96 710 76 794 66",
  // Stays low, then lifts sharply once the right conditions arrive.
  conditional: "M40 208 C260 206 430 200 560 168 C650 144 700 82 794 60",
};

/** End-point y of each highlighted curve (for the "you" dot + label anchor). */
const HIGHLIGHT_END_Y: Record<string, number> = {
  wave: 58,
  spike: 70,
  steady: 66,
  conditional: 60,
};

/** The reader's wave chart (inline SVG, per Figma 8427:1900). */
const WaveGraph: FC<{ curveFamily: string; youLabel: string; note?: string | null }> = ({
  curveFamily,
  youLabel,
  note,
}) => {
  const key = HIGHLIGHT_CURVES[curveFamily] ? curveFamily : "wave";
  const highlight = HIGHLIGHT_CURVES[key]!;
  const youY = HIGHLIGHT_END_Y[key] ?? 58;

  return (
    <div className="report-energy-graph" role="img" aria-label="How your sexual energy builds">
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
          d={SPIKE_CURVE}
          fill="none"
          stroke="#cfc8dd"
          strokeWidth="1.7"
          strokeLinecap="round"
        />

        {/* the reader's highlighted curve */}
        <path
          d={highlight}
          fill="none"
          stroke="#795FC8"
          strokeWidth="3.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* solid dot at the curve's high end */}
        <circle cx={GX1} cy={youY} r="8" fill="#795FC8" />

        {/* spike callout — arrow to the tall spike + label */}
        <path d="M128 74 L118 68" stroke="#a09aac" strokeWidth="1.4" strokeLinecap="round" />
        <path
          d="M118 68 l6 0 M118 68 l0 6"
          stroke="#a09aac"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
        <text className="report-energy-graph__spike" x={138} y={58} fill="#6b6678">
          a high-spike pattern — fast up, fast gone
        </text>

        {/* "you" label anchored above the end dot */}
        <text className="report-energy-graph__you" x={GX1} y={30} textAnchor="end" fill="#161021">
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

  // Readout meters: only when config carries real `readouts` (never fabricated —
  // only Spiritual Lover has them today; the other 13 render the framing without
  // the reader's specific levels). Only shown when unlocked (config is null when
  // locked).
  const readouts = config?.readouts ?? null;

  // Highlighted curve family — universal fallback to `wave` (the Figma default)
  // when config is absent (locked). The curve is decorative framing, so it's
  // safe to draw even locked, but we key it off config when present.
  const curveFamily = config?.curveFamily ?? "wave";

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
                  {READOUT_ROWS.map((r, i) => (
                    <ReadoutRow key={r.key} label={r.label} level={[2, 1, 3][i]!} />
                  ))}
                </div>
                <WaveGraph
                  curveFamily={curveFamily}
                  youLabel="you — the wave keeps building"
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
            {readouts ? (
              <div className="report-energy__readouts">
                <ReadoutRow label="Energy" level={readouts.energy} />
                <ReadoutRow label="Risk" level={readouts.risk} />
                <ReadoutRow label="Endurance" level={readouts.endurance} />
              </div>
            ) : null}

            <div className="report-energy__graph-wrap">
              <p className="report-energy__eyebrow">
                How your sexual energy builds over an encounter
              </p>
              <WaveGraph
                curveFamily={curveFamily}
                youLabel="you — the wave keeps building"
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
              aria-expanded={expanded}
              onClick={() => setExpanded((v) => !v)}
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

            {!expanded ? (
              <div className="report-energy__details-peek">
                {copy["edu.teaser"] ? (
                  <p className="report-energy__details-teaser">{copy["edu.teaser"]}</p>
                ) : null}
                {eduParas.length > 0 ? (
                  <button
                    type="button"
                    className="report-energy__peek-cta"
                    onClick={() => setExpanded(true)}
                  >
                    Read the full explanation
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="report-energy__details-body">
                {eduParas.map((para, i) => (
                  <p key={i} className="report-energy__details-para">
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

export default EnergySection;
