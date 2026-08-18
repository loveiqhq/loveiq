"use client";

import { useState, type CSSProperties, type FC } from "react";
import LockedPreviewImage from "./LockedPreviewImage";
import PremiumOverlay, { type PremiumOverlayTier } from "./PremiumOverlay";
import type { ReportPriceQuoteSnapshot } from "@features/pricing/logic/reportPricing";
import { renderEduPara } from "./eduPara";
import { getReportTheme } from "../reportTheme";
import { getArousalFamily, type ArousalFamily } from "@/data/report2-arousal";
import { useRevealOnView } from "../hooks/useRevealOnView";
import { rewardStatDots } from "./RewardSection";
import { curveEndPoint } from "../curveEnd";

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
 * Per-family arc geometry keyed by `families.arousal`. Each arc reads left→right
 * (arousal over the encounter) and every family shows the same three markers the
 * Figma draws: three climbing condition dots through act 1, a hollow "slip"
 * circle where a condition drops, and a solid dot at the high end.
 *   • responsive  (8427:2213) — low build, plateau + slip, dip, strong return
 *   • spontaneous (9107:1150) — fast early ignition, unprompted fade, rekindle
 *   • contextual  (9107:1237) — climbs as context assembles, breaks, reopens
 * Act names and captions live in `data/report2-arousal.ts` (Figma verbatim).
 */
interface ArcGeometry {
  path: string;
  /** y of the arc's right end, where the solid dot sits. */
  /** Three climbing "condition met" dots through act 1. */
  dots: [number, number][];
  /** The hollow circle where a condition slips. */
  slip: [number, number];
}

export const ARC_GEOMETRY: Record<string, ArcGeometry> = {
  responsive: {
    path: "M6 215 C70 213 150 205 205 181 C280 149 330 148 397 160 C440 168 470 190 523 170 C640 126 730 80 829 52",
    dots: [
      [70, 213],
      [140, 202],
      [205, 181],
    ],
    slip: [404, 162],
  },
  spontaneous: {
    path: "M6 214 C22 205 32 186 45 162 C60 132 70 106 90 92 C106 79 130 69 165 64 C250 56 300 150 397 168 C455 179 480 152 540 141 C650 122 740 108 829 96",
    dots: [
      [45, 162],
      [90, 92],
      [150, 66],
    ],
    slip: [400, 168],
  },
  contextual: {
    path: "M6 216 C60 214 120 205 156 196 C200 184 220 172 242 158 C300 128 335 116 372 124 C430 146 476 172 523 178 C630 152 740 122 829 100",
    dots: [
      [62, 212],
      [156, 196],
      [242, 158],
    ],
    slip: [523, 178],
  },
};

/** The reader's arousal arc (inline SVG, per Figma 8427:2204). */
const ArousalArc: FC<{ family: string; acts: [string, string, string]; accent: string }> = ({
  family,
  acts,
  accent,
}) => {
  const key = ARC_GEOMETRY[family] ? family : "responsive";
  const geo = ARC_GEOMETRY[key]!;
  const fam = getArousalFamily(key);
  const arcEnd = curveEndPoint(geo.path);

  // Panels settle, the arc draws through build → dip → return, each condition dot
  // lights as the stroke reaches it, then the end dot lands and the act labels
  // arrive. The order is the chart's own argument.
  const [arcRef, revealed] = useRevealOnView<HTMLDivElement>();

  return (
    <div
      ref={arcRef}
      className={`report-arousal-arc report-chart-reveal${revealed ? " is-revealed" : ""}`}
      role="img"
      aria-label="How your arousal builds, stalls, and returns"
    >
      <svg viewBox={`0 0 ${AX.w} ${AX.h}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        {/* phase panels */}
        {PANELS.map((p, i) => (
          <rect
            key={i}
            className="report-chart-fade"
            style={{ "--row": i } as CSSProperties}
            x={p.x}
            y={0}
            width={p.w}
            height={252}
            rx={11}
            fill={p.tint}
          />
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

        {/* the reader's arc. `pathLength={1}` makes the dash units path-relative,
            so one dasharray draws every family's arc whatever its real length. */}
        <path
          className="report-draw-line"
          d={geo.path}
          pathLength={1}
          fill="none"
          stroke={accent}
          strokeWidth="4.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* solid dot at the arc's high end — lands once the stroke reaches it */}
        {/* Position read off the arc itself, so the dot cannot drift from the
            line it belongs to (see `curveEndPoint`). */}
        <circle className="report-draw-dot" cx={arcEnd.x} cy={arcEnd.y} r="7" fill={accent} />

        {/* three climbing condition dots, then the hollow "slip" circle — the
            Figma draws both on every family, fading the dots in as they are met */}
        {geo.dots.map(([cx, cy], i) => (
          <circle
            key={i}
            className="report-arousal-arc__cue"
            style={{ "--row": i } as CSSProperties}
            cx={cx}
            cy={cy}
            r="6.5"
            fill={accent}
            opacity={0.4 + i * 0.3}
          />
        ))}
        <circle
          className="report-arousal-arc__cue"
          style={{ "--row": 3 } as CSSProperties}
          cx={geo.slip[0]}
          cy={geo.slip[1]}
          r="7.2"
          fill="#ffffff"
          stroke={accent}
          strokeWidth="2.4"
        />

        {/* phase labels (top of each panel) */}
        {PANELS.map((p, i) => (
          <text
            key={i}
            className="report-arousal-arc__act report-chart-late"
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
            className="report-arousal-arc__note report-chart-late"
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

/**
 * The three act columns under the arc (Figma 8427:2222 / 9107:1159 / 9107:1246):
 * act 1 lists the three conditions as chips plus a note, acts 2 and 3 carry a
 * paragraph each. All of it comes off the reader's own arousal family — a
 * Spontaneous reader used to be shown the responsive build's conditions
 * ("Repair · nothing unresolved") because the three frames share one duplicated
 * copy block. See `data/report2-arousal.ts`.
 */
const ActDetail: FC<{
  family: ArousalFamily;
  /** Act NAMES, which the copy matrix may override — not `family.acts`. */
  acts: [string, string, string];
  accent: string;
}> = ({ family, acts, accent }) => {
  return (
    <div className="report-arousal__acts">
      <div className="report-arousal__act" style={{ "--act-accent": accent } as CSSProperties}>
        <p className="report-arousal__act-eyebrow">1 &middot; {acts[0]}</p>
        <ul className="report-arousal__conditions">
          {family.conditions.map((c) => (
            <li key={c.label} className="report-arousal__condition">
              <span className="report-arousal__condition-dot" aria-hidden="true" />
              <span className="report-arousal__condition-label">{c.label}</span>
              <span className="report-arousal__condition-note">&middot; {c.note}</span>
            </li>
          ))}
        </ul>
        <p className="report-arousal__act-note">{family.conditionsNote}</p>
      </div>

      <div className="report-arousal__act" style={{ "--act-accent": accent } as CSSProperties}>
        <p className="report-arousal__act-eyebrow">2 &middot; {acts[1]}</p>
        <p className="report-arousal__act-body">{family.act2Body}</p>
      </div>

      <div className="report-arousal__act" style={{ "--act-accent": accent } as CSSProperties}>
        <p className="report-arousal__act-eyebrow is-live">3 &middot; {acts[2]}</p>
        <p className="report-arousal__act-body">{family.act3Body}</p>
      </div>
    </div>
  );
};

/**
 * One mini-stat: a graphic, the value, then the caption (Figma 8502:684/698).
 *
 * Both halves were text only — the frame puts a dot row above the left stat and
 * a gradient bar above the right one, and neither was built, so the box read as
 * two bare labels where the design has two small charts. The dot row is derived
 * from the stat rather than fixed, the same rule the Reward box uses, so the
 * graphic can never contradict the number printed under it.
 */
const MiniStat: FC<{ value: string; caption: string; viz: "dots" | "bar" }> = ({
  value,
  caption,
  viz,
}) => {
  const { filled, total } = rewardStatDots(value);
  const width = (total - 1) * 16.3 + 11.41;
  return (
    <div className="report-arousal__stat">
      {viz === "dots" ? (
        <svg
          className="report-arousal__stat-dots"
          viewBox={`0 0 ${width.toFixed(3)} 11.41`}
          fill="none"
          aria-hidden="true"
        >
          <defs>
            <linearGradient
              id="report-arousal-stat-dot"
              x1="0"
              y1="0"
              x2="11.41"
              y2="11.41"
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor="#B7A6E3" />
              <stop offset="1" stopColor="#795FC8" />
            </linearGradient>
          </defs>
          {Array.from({ length: total }, (_, i) => (
            <circle
              key={i}
              cx={5.705 + i * 16.3}
              cy={5.705}
              r={5.705}
              fill={i < filled ? "url(#report-arousal-stat-dot)" : "#9D8AD7"}
              fillOpacity={i < filled ? 1 : 0.16}
            />
          ))}
        </svg>
      ) : (
        <span className="report-arousal__stat-bar" aria-hidden="true">
          <span />
        </span>
      )}
      <span className="report-arousal__stat-value">{value}</span>
      <span className="report-arousal__stat-caption">{caption}</span>
    </div>
  );
};

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
  const accent = getReportTheme(archetype).accent;

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
  const arousalFamily = getArousalFamily(family);
  // Act labels: config `arousal_acts` wins; else the family default (Figma).
  const acts: [string, string, string] =
    config?.acts && config.acts.length === 3
      ? [config.acts[0]!, config.acts[1]!, config.acts[2]!]
      : arousalFamily.acts;

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
              {/* A pre-blurred render of the REAL chapter. Blurring the PIXELS at
                  build time means the paid copy is not in the file that ships, so
                  it cannot be read back out of the DOM. See LockedPreviewImage. */}
              <div
                className="report-arousal__preview-fade report-preview-fade--image"
                aria-hidden="true"
              >
                <LockedPreviewImage name="arousal" />
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
              {/*
               * The family word alone, exactly as every Figma frame heads the
               * card ("Responsive" / "Spontaneous" / "Contextual"). The copy
               * matrix's `result` carries a bracketed qualifier ("Spontaneous
               * (clarity-led)") that appears in no frame — and for Authority
               * Conductor it names a DIFFERENT family than its own config, so
               * the heading used to contradict the arc drawn under it.
               */}
              <p className="report-arousal__result">{arousalFamily.name}</p>
              {/* Centred line under the heading (Figma 8427:2203) — per family. */}
              <p className="report-arousal__intro">{arousalFamily.intro}</p>
            </div>

            <ArousalArc family={family} acts={acts} accent={accent} />

            <ActDetail family={arousalFamily} acts={acts} accent={accent} />

            {hasStats ? (
              <div className="report-arousal__stats">
                {hasStat1 ? <MiniStat value={stat1!} caption={stat1Cap!} viz="dots" /> : null}
                {hasStat2 ? <MiniStat value={stat2!} caption={stat2Cap!} viz="bar" /> : null}
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
          </>
        )}

        {hasEdu ? (
          <div className="report-arousal__details">
            <button
              type="button"
              className="report-arousal__details-summary"
              aria-expanded={locked ? false : expanded}
              onClick={locked ? onUnlock : () => setExpanded((v) => !v)}
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

            {locked || !expanded ? (
              <div className="report-arousal__details-peek report-learn-peek">
                {copy["edu.teaser"] ? (
                  <p className="report-arousal__details-teaser report-learn-teaser">
                    {copy["edu.teaser"]}
                    {copy["edu.body.p1"] ? ` ${copy["edu.body.p1"]}` : null}
                  </p>
                ) : null}
                {locked || eduParas.length > 0 ? (
                  <button
                    type="button"
                    className="report-arousal__peek-cta report-learn-cta"
                    onClick={locked ? onUnlock : () => setExpanded(true)}
                  >
                    {locked ? "Unlock to read the full explanation" : "Read the full explanation"}
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="report-arousal__details-body">
                {copy["edu.teaser"] ? (
                  <p className="report-arousal__details-teaser report-learn-teaser-full">
                    {copy["edu.teaser"]}
                  </p>
                ) : null}
                {eduParas.map((para, i) => (
                  <p key={i} className="report-arousal__details-para">
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

export default ArousalSection;
