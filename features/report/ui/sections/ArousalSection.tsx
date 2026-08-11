"use client";

import { useState, type FC } from "react";
import PremiumOverlay, { type PremiumOverlayTier } from "./PremiumOverlay";
import type { ReportPriceQuoteSnapshot } from "@features/pricing/logic/reportPricing";

/**
 * Server-resolved arousal copy (`getReport2Section(name, "arousal")`), threaded
 * as a prop because the 634KB copy module is server-only (see
 * `app/api/report/route.ts` → `arousalCopy`).
 *
 * GATING (Part III, FULL_REPORT tier — this section is `arousal_style`, section
 * 21, NOT in `ESSENTIALS_SECTION_IDS`, so it only unlocks at the full_report
 * tier). The educational slots (`eyebrow`, `insight.label`, `edu.*`, `learn.*`)
 * are UNIVERSAL (identical across all 14 archetypes) and always shipped. The
 * per-archetype payload — `gate.hook`, `result` (e.g. "Responsive"),
 * `insight.value`, and the two mini-stats (`stat1`/`stat1.caption`,
 * `stat2`/`stat2.caption`) plus the arc config (family + act labels) — is the
 * gated content: shipped ONLY when the report is unlocked at the full_report
 * tier. A locked client (`locked: true`) receives those `null` + null config and
 * renders the hook teaser + PremiumOverlay instead. Never send locked
 * per-archetype content to an unpaid client.
 */
export interface ArousalCopy {
  // Universal (always shipped) — these frame the section for locked clients too.
  eyebrow?: string | null;
  "insight.label"?: string | null;
  "edu.eyebrow"?: string | null;
  "edu.teaser"?: string | null;
  "edu.body.p1"?: string | null;
  "edu.body.p2"?: string | null;
  "edu.body.p3"?: string | null;
  "edu.body.p4"?: string | null;
  "learn.eyebrow"?: string | null;
  "learn.body"?: string | null;
  // Per-archetype — withheld (null) from locked clients.
  "gate.hook"?: string | null;
  result?: string | null;
  "insight.value"?: string | null;
  stat1?: string | null;
  "stat1.caption"?: string | null;
  stat2?: string | null;
  "stat2.caption"?: string | null;
  /** True when the per-archetype hook/result/insight/stats + arc config were withheld. */
  locked: boolean;
}

/**
 * Arc config from `getReport2Config(name)` — normalized server-side and only
 * sent when unlocked (null otherwise). `family` is `families.arousal` ∈
 * {responsive, spontaneous, contextual} and selects the arc SHAPE. `acts` is the
 * 3-part `arousal_acts` array labelling the arc phases (e.g. ["The build","The
 * dip","The return"]); when absent it falls back to the Figma default acts for
 * the family.
 */
export interface ArousalConfig {
  /** families.arousal — selects the arc shape. */
  family: string;
  /** arousal_acts — 3 phase labels; may be null (→ family default). */
  acts: string[] | null;
}

interface Props {
  archetype: string;
  copy: ArousalCopy | null;
  /** Arc config (family + act labels); null when locked or absent. */
  config: ArousalConfig | null;
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
 * The arc is drawn in a normalized 835×321 viewBox (matching Figma frame
 * 8427:2204). Three phase panels tile the width; the baseline sits at y≈225 and
 * the wave rides above it. The reader's curve is one of three family shapes
 * (Figma 8427:2213 is the `responsive` default). Each family also names its
 * phases + the three "condition" annotations under the panels, per the Figma.
 */
const AX = { w: 835, h: 321, base: 225 } as const;

// Panel boundaries (Figma 8427:2205/2206/2207 vector insets).
const PANELS = [
  { x: 0, w: 298.7, tint: "#f8f6fc" }, // build
  { x: 314.8, w: 192.7, tint: "#f6f4fb" }, // dip
  { x: 523.5, w: 311.5, tint: "#f4f1fa" }, // return
] as const;

/**
 * Three arc shapes keyed by `families.arousal`. Each is a stall/recovery curve
 * that reads left→right (arousal over the encounter):
 *   • responsive — the Figma default (8427:2213): low build with three climbing
 *     condition-dots, a plateau + slip (hollow circle), a small dip, then a
 *     strong return that keeps climbing.
 *   • spontaneous — fast early ignition to a high peak, an unprompted fade, then
 *     a partial rekindle (what lights unprompted also fades unprompted).
 *   • contextual — stays low/flat while conditions are unmet, then lifts sharply
 *     once they arrive and holds.
 * All share the same baseline and end high-right so the arc fills the panels.
 */
const ARC_SHAPES: Record<string, string> = {
  responsive:
    "M6 215 C70 213 150 205 205 181 C280 149 330 148 397 160 C440 168 470 190 523 170 C640 126 730 80 829 52",
  spontaneous:
    "M6 214 C60 210 96 70 165 62 C250 53 300 150 397 168 C455 179 480 150 540 140 C650 122 740 108 829 96",
  contextual: "M6 216 C120 214 300 210 430 205 C500 202 515 200 560 172 C640 124 740 74 829 52",
};

/** End-point y of each arc (anchor for the trailing rise). */
const ARC_END_Y: Record<string, number> = {
  responsive: 52,
  spontaneous: 96,
  contextual: 52,
};

/**
 * Per-family default phase labels + the three condition annotations shown under
 * the panels (Figma 8427:2219/2220/2221 for `responsive`). Config `acts` (from
 * `arousal_acts`) overrides the phase labels when present; the annotations are
 * universal-per-family framing (never per-archetype prose), so they stay fixed.
 */
type ArcFamily = {
  acts: [string, string, string];
  /** captions under panels 1/2/3. */
  notes: [string, string, string];
};

const ARC_FAMILIES: Record<string, ArcFamily> = {
  responsive: {
    acts: ["The build", "The dip", "The return"],
    notes: [
      "three conditions met, one by one",
      "a condition slips",
      "named — the wave resumes, higher",
    ],
  },
  spontaneous: {
    acts: ["The ignition", "The fade", "The rekindle"],
    notes: [
      "lights fast, unprompted",
      "fades just as unprompted",
      "rebuilt on purpose, not chance",
    ],
  },
  contextual: {
    acts: ["The wait", "The threshold", "The lift"],
    notes: ["low while conditions are unmet", "the threshold is crossed", "it lifts, and holds"],
  },
};

const RESPONSIVE = ARC_FAMILIES.responsive!;

/** Three ascending "condition met" dots on the build phase (responsive only). */
const BUILD_DOTS = [
  { cx: 70, cy: 213, fill: "#c4b5fd" },
  { cx: 140, cy: 202, fill: "#a78bfa" },
  { cx: 205, cy: 181, fill: "#795fc8" },
] as const;

/** The reader's arousal arc (inline SVG, per Figma 8427:2204). */
const ArousalArc: FC<{ family: string; acts: [string, string, string] }> = ({ family, acts }) => {
  const key = ARC_SHAPES[family] ? family : "responsive";
  const fam = ARC_FAMILIES[key] ?? RESPONSIVE;
  const path = ARC_SHAPES[key]!;
  const endY = ARC_END_Y[key] ?? 52;
  const isResponsive = key === "responsive";

  return (
    <div
      className="report-arousal-arc"
      role="img"
      aria-label="How your arousal builds, stalls, and returns"
    >
      <svg viewBox={`0 0 ${AX.w} ${AX.h}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        {/* phase panels */}
        {PANELS.map((p, i) => (
          <rect key={i} x={p.x} y={0} width={p.w} height={252} rx={11} fill={p.tint} />
        ))}

        {/* dashed baseline */}
        <line
          x1={0}
          y1={AX.base}
          x2={AX.w}
          y2={AX.base}
          stroke="#161021"
          strokeOpacity="0.12"
          strokeWidth="1.4"
          strokeDasharray="2 6"
        />

        {/* the reader's arc */}
        <path
          d={path}
          fill="none"
          stroke="#795fc8"
          strokeWidth="4.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* solid dot at the arc's high end */}
        <circle cx={829} cy={endY} r="7" fill="#795fc8" />

        {/* responsive: three climbing condition dots + the hollow "slip" circle */}
        {isResponsive ? (
          <>
            {BUILD_DOTS.map((d, i) => (
              <circle key={i} cx={d.cx} cy={d.cy} r="6.5" fill={d.fill} />
            ))}
            {/* the plateau slip point (Figma 8427:2214) */}
            <circle cx={404} cy={162} r="7.2" fill="#ffffff" stroke="#795fc8" strokeWidth="2.4" />
          </>
        ) : null}

        {/* phase labels (top of each panel) */}
        {PANELS.map((p, i) => (
          <text
            key={i}
            className="report-arousal-arc__act"
            x={p.x + p.w / 2}
            y={54}
            textAnchor="middle"
            fill="#161021"
          >
            {`${i + 1} · ${acts[i] ?? fam.acts[i]}`}
          </text>
        ))}

        {/* condition annotations (below each panel) */}
        {fam.notes.map((note, i) => (
          <text
            key={i}
            className="report-arousal-arc__note"
            x={PANELS[i]!.x + PANELS[i]!.w / 2}
            y={288}
            textAnchor="middle"
            fill="#8d84a6"
          >
            {note}
          </text>
        ))}
      </svg>
    </div>
  );
};

/** One mini-stat: big value + caption (Figma 8502:684/698). */
const MiniStat: FC<{ value: string; caption: string }> = ({ value, caption }) => (
  <div className="report-arousal__stat">
    <span className="report-arousal__stat-value">{value}</span>
    <span className="report-arousal__stat-caption">{caption}</span>
  </div>
);

const ArousalSection: FC<Props> = ({
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
  const eduParas = [
    copy["edu.body.p1"],
    copy["edu.body.p2"],
    copy["edu.body.p3"],
    copy["edu.body.p4"],
  ].filter((p): p is string => !!p);
  const hasEdu = !!copy["edu.teaser"] || eduParas.length > 0;

  // Arc family — universal fallback to `responsive` (the Figma default) when
  // config is absent (locked). The arc is framing, so it's safe to draw even
  // locked (under the blur), keyed off config when present.
  const family = config?.family ?? "responsive";
  const famDefault = ARC_FAMILIES[ARC_SHAPES[family] ? family : "responsive"] ?? RESPONSIVE;
  // Act labels: config `arousal_acts` wins; else the family default (Figma).
  const acts: [string, string, string] =
    config?.acts && config.acts.length === 3
      ? [config.acts[0]!, config.acts[1]!, config.acts[2]!]
      : famDefault.acts;

  // Mini-stats — per-archetype but render only when both value + caption present
  // (never fabricate a stat). Withheld (null) for a locked client.
  const stat1 = copy.stat1?.trim();
  const stat1Cap = copy["stat1.caption"]?.trim();
  const stat2 = copy.stat2?.trim();
  const stat2Cap = copy["stat2.caption"]?.trim();
  const hasStat1 = !!stat1 && !!stat1Cap;
  const hasStat2 = !!stat2 && !!stat2Cap;
  const hasStats = hasStat1 || hasStat2;

  return (
    <div className="report-arousal">
      <h3 className="report-arousal__heading">Arousal Style</h3>

      {copy["learn.body"] ? (
        <div className="report-arousal__learn-pill-wrap">
          <span className="report-arousal__learn-pill">
            <span className="report-arousal__learn-pill-icon" aria-hidden="true">
              <BookIcon />
            </span>
            {copy["learn.eyebrow"] ?? "What you will learn"}
          </span>
          <p className="report-arousal__learn-body">{copy["learn.body"]}</p>
        </div>
      ) : null}

      <article className="report-arousal__card">
        {locked ? (
          <>
            {copy["gate.hook"] ? <p className="report-arousal__hook">{copy["gate.hook"]}</p> : null}
            <div className="report-arousal__preview">
              <div className="report-arousal__preview-fade" aria-hidden="true">
                {/* Blurred stand-in — the real per-archetype result/arc/stats are
                    withheld server-side; generic filler under the blur. */}
                <p className="report-arousal__result-eyebrow">Your Arousal Style</p>
                <p className="report-arousal__result">Responsive</p>
                <ArousalArc family={family} acts={acts} />
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
            <div className="report-arousal__result-head">
              <p className="report-arousal__result-eyebrow">
                {copy.eyebrow ?? "Your Arousal Style"}
              </p>
              {copy.result ? <p className="report-arousal__result">{copy.result}</p> : null}
            </div>

            <ArousalArc family={family} acts={acts} />

            {hasStats ? (
              <div className="report-arousal__stats">
                {hasStat1 ? <MiniStat value={stat1!} caption={stat1Cap!} /> : null}
                {hasStat2 ? <MiniStat value={stat2!} caption={stat2Cap!} /> : null}
              </div>
            ) : null}

            {copy["insight.value"] ? (
              <div className="report-arousal__reframe">
                <span className="report-arousal__reframe-label">
                  {copy["insight.label"] ?? "The Reframe"}
                </span>
                <p className="report-arousal__reframe-value">{copy["insight.value"]}</p>
              </div>
            ) : null}

            <div className="report-arousal__rule" aria-hidden="true" />
          </>
        )}

        {hasEdu ? (
          <div className="report-arousal__details">
            <button
              type="button"
              className="report-arousal__details-summary"
              aria-expanded={expanded}
              onClick={() => setExpanded((v) => !v)}
            >
              <span className="report-arousal__details-icon" aria-hidden="true">
                <BookIcon />
              </span>
              <span className="report-arousal__details-eyebrow">
                {copy["edu.eyebrow"] ?? "Learn: arousal, desire, and pleasure"}
              </span>
              <span
                className={`report-arousal__details-chevron${expanded ? " is-open" : ""}`}
                aria-hidden="true"
              >
                ⌄
              </span>
            </button>

            {!expanded ? (
              <div className="report-arousal__details-peek">
                {copy["edu.teaser"] ? (
                  <p className="report-arousal__details-teaser">{copy["edu.teaser"]}</p>
                ) : null}
                {eduParas.length > 0 ? (
                  <button
                    type="button"
                    className="report-arousal__peek-cta"
                    onClick={() => setExpanded(true)}
                  >
                    Read the full explanation
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="report-arousal__details-body">
                {eduParas.map((para, i) => (
                  <p key={i} className="report-arousal__details-para">
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

export default ArousalSection;
