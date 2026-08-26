"use client";

import { useState, type CSSProperties, type Dispatch, type FC, type SetStateAction } from "react";
import LockedPreviewImage from "./LockedPreviewImage";
import PremiumOverlay, { type PremiumOverlayTier } from "./PremiumOverlay";
import type { ReportPriceQuoteSnapshot } from "@features/pricing/logic/reportPricing";
import { renderEduPara } from "./eduPara";
import { getReportTheme } from "../reportTheme";
import { getArousalFamily, type ArousalFamily } from "@/data/report2-arousal";
import { useRevealOnView } from "../hooks/useRevealOnView";
import { rewardStatDots } from "./RewardSection";
import { curveEndPoint } from "../curveEnd";
import LearnPill from "./LearnPill";
import DocStyleBlock from "./DocStyleBlock";
import {
  AROUSAL_STYLES_OUTRO,
  type Report2DocStyle,
  type Report2StyleMatch,
} from "@/data/report2-doc-styles";

/**
 * Server-resolved arousal copy (`getReport2Section(name, "arousal")`), threaded
 * as a prop because the 634KB copy module is server-only (see
 * `app/api/report/route.ts` → `arousalCopy`).
 *
 * GATING (Part III, FULL_REPORT tier — this section is `arousal_style`, section
 * 21, NOT in `ESSENTIALS_SECTION_IDS`, so it only unlocks at the full_report
 * tier). The educational slots (`eyebrow`, `insight.label`, `edu.*`, `learn.*`)
 * are UNIVERSAL (identical across all 14 archetypes) and always shipped. The
 * per-archetype payload — `result` (e.g. "Responsive"),
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
  /** Second Key Concepts paragraph — see data/report2-key-concepts.ts. */
  "learn.body.p2"?: string | null;
  // Per-archetype — withheld (null) from locked clients.
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
  /**
   * The reader's arousal style(s) from chapter 21's eight pre-defined styles,
   * resolved server-side because it is per-archetype content in a full_report
   * chapter. `null` when locked or unmapped.
   *
   * NOTE: chapter 21 names no archetypes against its eight styles, so this
   * mapping is INFERRED from the archetype's own chapter text — see
   * `AROUSAL_STYLE_BY_ARCHETYPE` in `data/report2-doc-styles.ts`. It is the one
   * style list in this pass that is not read off the document's own "(e.g. …)".
   */
  arousalStyles: (Report2DocStyle & Report2StyleMatch)[] | null;
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
/**
 * Clear the cue only if it is still the one this element set.
 *
 * Leave and blur handlers fire in an order that is not the reverse of enter: a tap
 * on a dot sets its cue and THEN blurs whichever chip had focus, and an
 * unconditional `onCue(null)` in that blur wiped the cue the tap had just set — so
 * tapping a dot did nothing at all on a phone. Moving the pointer straight from one
 * dot to the next has the same shape.
 */
const clearOwn = (onCue: Dispatch<SetStateAction<number | null>>, mine: number) => () =>
  onCue((current) => (current === mine ? null : current));

const ArousalArc: FC<{
  family: string;
  acts: [string, string, string];
  accent: string;
  /** Which cue the reader is pointing at — see `ArousalCard`'s `cue` state. */
  cue: number | null;
  /** The setter itself, so a handler can clear ONLY its own cue — see `clearOwn`. */
  onCue: Dispatch<SetStateAction<number | null>>;
}> = ({ family, acts, accent, cue, onCue }) => {
  const key = ARC_GEOMETRY[family] ? family : "responsive";
  const geo = ARC_GEOMETRY[key]!;
  const fam = getArousalFamily(key);
  const arcEnd = curveEndPoint(geo.path);

  // Panels settle, the arc draws through build → dip → return, each condition dot
  // lights as the stroke reaches it, then the end dot lands and the act labels
  // arrive. The order is the chart's own argument.
  // `threshold: 0` for the same reason as the energy graph — see EnergySection.
  const [arcRef, revealed] = useRevealOnView<HTMLDivElement>({ threshold: 0 });

  return (
    <div
      ref={arcRef}
      className={`report-arousal-arc report-chart-reveal${revealed ? " is-revealed" : ""}${
        cue === null ? "" : " is-cued"
      }`}
      role="img"
      aria-label="How your arousal builds, stalls, and returns"
    >
      <svg
        viewBox={`0 0 ${AX.w} ${AX.h}`}
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
        /* Touch has no "leave": a tap sets the cue and it would stay set. Tapping
           anywhere in the chart that is not a dot clears it, so the chart behaves
           like tap-to-inspect, tap-away-to-release on a phone while hover keeps
           working on a pointer. */
        onPointerDown={(e) => {
          if (!(e.target as Element).closest(".report-arousal-arc__cue-group")) onCue(null);
        }}
      >
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
        <g
          className={`report-arousal-arc__cue-group${cue === 4 ? " is-active" : ""}`}
          onMouseEnter={() => onCue(4)}
          onPointerDown={() => onCue(4)}
          onMouseLeave={clearOwn(onCue, 4)}
        >
          <circle
            className="report-arousal-arc__halo"
            cx={arcEnd.x}
            cy={arcEnd.y}
            r="7"
            fill={accent}
          />
          {/* The end dot's own entrance is an ANIMATION with `forwards`, and an
              animation's filled value outranks a plain declaration — so a hover
              `transform` on the circle itself is ignored, which left this one dot
              flat while every other mark swelled. The swell goes on a wrapper that
              has no animation of its own. `transform-origin` is given in user units
              (the default `transform-box: view-box`) rather than `fill-box`, which
              on a <g> resolves against the group's bounding box. */}
          <g
            className="report-arousal-arc__end-wrap"
            style={{ transformOrigin: `${arcEnd.x}px ${arcEnd.y}px` }}
          >
            <circle className="report-draw-dot" cx={arcEnd.x} cy={arcEnd.y} r="7" fill={accent} />
          </g>
          <circle cx={arcEnd.x} cy={arcEnd.y} r="17" fill="transparent" />
        </g>

        {/* three climbing condition dots, then the hollow "slip" circle — the
            Figma draws both on every family, fading the dots in as they are met */}
        {geo.dots.map(([cx, cy], i) => (
          <g
            key={i}
            className={`report-arousal-arc__cue-group${cue === i ? " is-active" : ""}`}
            onMouseEnter={() => onCue(i)}
            onPointerDown={() => onCue(i)}
            onMouseLeave={clearOwn(onCue, i)}
          >
            {/* Halo. A 6.5px circle cannot carry a pseudo-element, so the ring the
                dot pulses out lives as its own circle, scaled from the dot's centre.
                Painted first so the dot always sits on top of it. */}
            <circle className="report-arousal-arc__halo" cx={cx} cy={cy} r="6.5" fill={accent} />
            <circle
              className="report-arousal-arc__cue"
              style={{ "--row": i } as CSSProperties}
              cx={cx}
              cy={cy}
              r="6.5"
              fill={accent}
              opacity={0.4 + i * 0.3}
            />
            {/* The pointer target: 6.5px of dot is a 13px target, well under the 24px
                minimum, and the reader is aiming at a dot on a curve. Transparent
                rather than sized-up so the artwork stays Figma's. */}
            <circle cx={cx} cy={cy} r="17" fill="transparent" />
          </g>
        ))}
        <g
          className={`report-arousal-arc__cue-group${cue === 3 ? " is-active" : ""}`}
          onMouseEnter={() => onCue(3)}
          onPointerDown={() => onCue(3)}
          onMouseLeave={clearOwn(onCue, 3)}
        >
          <circle
            className="report-arousal-arc__halo"
            cx={geo.slip[0]}
            cy={geo.slip[1]}
            r="7.2"
            fill={accent}
          />
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
          <circle cx={geo.slip[0]} cy={geo.slip[1]} r="17" fill="transparent" />
        </g>

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
  /** Cue the reader is pointing at: 0-2 a condition, 3 the slip, 4 the high end. */
  cue: number | null;
  onCue: Dispatch<SetStateAction<number | null>>;
}> = ({ family, acts, accent, cue, onCue }) => {
  return (
    <div className="report-arousal__acts">
      <div
        className={`report-arousal__act${cue !== null && cue <= 2 ? " is-cued" : ""}`}
        style={{ "--act-accent": accent } as CSSProperties}
      >
        <p className="report-arousal__act-eyebrow">1 &middot; {acts[0]}</p>
        <ul className="report-arousal__conditions">
          {family.conditions.map((c, i) => (
            <li
              key={c.label}
              className={`report-arousal__condition${cue === i ? " is-active" : ""}`}
              /* Focusable so the link works from the keyboard too: the chip is the
                 half a reader can reach, and the dot on the curve answers it. */
              tabIndex={0}
              onMouseEnter={() => onCue(i)}
              onMouseLeave={clearOwn(onCue, i)}
              onFocus={() => onCue(i)}
              onBlur={clearOwn(onCue, i)}
            >
              <span className="report-arousal__condition-dot" aria-hidden="true" />
              <span className="report-arousal__condition-label">{c.label}</span>
              <span className="report-arousal__condition-note">&middot; {c.note}</span>
            </li>
          ))}
        </ul>
        <p className="report-arousal__act-note">{family.conditionsNote}</p>
      </div>

      <div
        className={`report-arousal__act${cue === 3 ? " is-cued" : ""}`}
        style={{ "--act-accent": accent } as CSSProperties}
        onMouseEnter={() => onCue(3)}
        onMouseLeave={clearOwn(onCue, 3)}
      >
        <p className="report-arousal__act-eyebrow">2 &middot; {acts[1]}</p>
        <p className="report-arousal__act-body">{family.act2Body}</p>
      </div>

      <div
        className={`report-arousal__act${cue === 4 ? " is-cued" : ""}`}
        style={{ "--act-accent": accent } as CSSProperties}
        onMouseEnter={() => onCue(4)}
        onMouseLeave={clearOwn(onCue, 4)}
      >
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
  // Its own reveal root: this box sits below the arc, so the arc's root is long
  // revealed by the time the reader reaches it. `threshold: 0` for the reason
  // EnergySection gives — a missed crossing here would leave the graphic blank.
  const [statRef, revealed] = useRevealOnView<HTMLDivElement>({ threshold: 0 });
  return (
    <div
      ref={statRef}
      className={`report-arousal__stat report-chart-reveal${revealed ? " is-revealed" : ""}`}
    >
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
              style={{ "--i": i } as CSSProperties}
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
  arousalStyles,
  copy,
  config,
  offerDeadline,
  onUnlock,
  quote = null,
  sectionTitle,
  tier = "full_report",
}) => {
  const [expanded, setExpanded] = useState(false);
  /** 0-2 a build condition, 3 the slip, 4 the high end; null when nothing is cued. */
  const [cue, setCue] = useState<number | null>(null);
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

      <LearnPill prefix="arousal" copy={copy} />

      <article className="report-arousal__card">
        {locked ? (
          <>
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

            {/* Chapter 21's own eight arousal styles, restored 2026-08-26 — the
                reader's own entry with the document's description, above the arc
                so the named style frames the graph rather than trailing it. */}
            <DocStyleBlock
              eyebrow="Arousal styles across the archetypes"
              styles={arousalStyles ?? []}
              modifier="arousal"
              outro={AROUSAL_STYLES_OUTRO}
            />

            {/* One piece of state links the arc to the columns under it: pointing at
                a dot lights the condition it stands for, and pointing at a
                condition lights its dot. Both halves are siblings, so the state
                lives here rather than in either of them. */}
            <ArousalArc family={family} acts={acts} accent={accent} cue={cue} onCue={setCue} />

            <ActDetail
              family={arousalFamily}
              acts={acts}
              accent={accent}
              cue={cue}
              onCue={setCue}
            />

            {hasStats ? (
              <div className="report-arousal__stats">
                {hasStat1 ? <MiniStat value={stat1!} caption={stat1Cap!} viz="dots" /> : null}
                {hasStat2 ? <MiniStat value={stat2!} caption={stat2Cap!} viz="bar" /> : null}
              </div>
            ) : null}

            {copy["insight.value"] ? (
              <div className="report-arousal__reframe report-purple-block">
                <span className="report-block-label">{copy["insight.label"] ?? "The Reframe"}</span>
                <p className="report-purple-block__body">{copy["insight.value"]}</p>
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
