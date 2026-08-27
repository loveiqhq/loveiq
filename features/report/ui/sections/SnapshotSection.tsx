"use client";

import type { CSSProperties, FC } from "react";
import { barrierStatFor } from "@/data/report2-barriers";
import { useRevealOnView } from "../hooks/useRevealOnView";
import { archetypeSlug, getReport2Config, type Report2CopySlug } from "@/data/report2-config";
import { snapshotCards } from "@/data/report2-snapshot-cards";
import {
  AROUSAL_CURVES,
  resolveArousalFamily,
  SNAPSHOT_DOT_R,
  SNAPSHOT_STROKE,
  SNAPSHOT_VB_WIDTH,
  type ArousalFamily,
} from "../arousalCurves";

/**
 * Server-resolved snapshot copy slots (`getReport2Section(name, "snapshot")`).
 * The 634KB copy module is server-only, so these are threaded down as props
 * (see `app/api/report/route.ts` → `snapshotCopy`). Every field is optional so
 * an archetype with a config stub still renders without throwing.
 */
export interface SnapshotCopy {
  "compare1.stat"?: string;
  "compare1.caption"?: string;
  "compare2.stat"?: string;
  "compare2.caption"?: string;
  "compare3.stat"?: string;
  "compare3.caption"?: string;
  /**
   * Card 1's share stat + caption, resolved server-side from `initiation.stat1`
   * ("share choosing I make the first move", RESOLVED in STATS-AUDIT.md and
   * present for all 14 archetypes). Figma mocked this card as "Your Hidden Edge"
   * with `1 in 3`, but that value is a RETRACTED `arousal.stat1` matrix figure the
   * audit replaced with 52%, and no per-archetype hidden-edge copy exists — so the
   * card carries the real, audited, per-archetype share instead.
   */
  "openingMove.stat"?: string | null;
  "openingMove.caption"?: string | null;
  "stage.subline"?: string;
}

interface Props {
  archetype: string;
  copy: SnapshotCopy | null;
  /**
   * The authoritative per-archetype stage string (`stage.result` from the copy
   * matrix, e.g. "Deepening / Balancing"), threaded from `ReportPage` — the SAME
   * value `SexualStageSection` renders, so card 3 and the Sexual Stage section
   * can never disagree. Card 3 used to read `config.stage_default`, which the
   * copy handoff only ever filled for Spiritual Lover, so 13 of 14 archetypes
   * silently dropped the card.
   */
  stageResult?: string | null;
}

function capitalizeWord(value: string): string {
  return value.length ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

/**
 * The share of the ring the accent arc should sweep, from the value printed
 * directly above it. Returns null when the value carries no number.
 *
 * Figma's frame mocks a HALF ring, which is only right for the value that frame
 * happened to show. Hardcoding it meant "1 in 3" drew a 50% arc — a graphic
 * contradicting the figure sitting on top of it, the same defect the compare
 * dots and bar already had.
 */
function hiddenEdgeFraction(value: string | null | undefined): number | null {
  const raw = value?.trim() ?? "";

  const ratio = raw.match(/\b(\d+)\s+in\s+(\d+)/i);
  if (ratio) {
    const numerator = Number(ratio[1]);
    const denominator = Number(ratio[2]);
    if (denominator > 0 && numerator > 0 && numerator <= denominator) {
      return numerator / denominator;
    }
  }

  const percent = raw.match(/(\d+(?:\.\d+)?)\s*%/);
  if (percent) {
    const pct = Number(percent[1]);
    if (pct > 0 && pct <= 100) return pct / 100;
  }

  return null;
}

/**
 * Card 1 donut — geometry taken from Figma `8719:8893/8894`: a 46px ring,
 * 5.06px stroke, faint #9D8AD7 track at 18%, accent arc starting at 12 o'clock.
 * r = (46 − 5.06) / 2 = 20.47.
 *
 * `pathLength={1}` puts the dash units in 0–1 so the sweep IS the fraction, and
 * the draw-in is a plain dashoffset — the same primitive every other chart in the
 * report uses.
 *
 * Two of the fourteen audited values are qualitative ("Rarely first"), so they
 * get the track and no accent arc. Figma's mocked half sweep would say the
 * opposite of the word above it, and picking any other size would be inventing a
 * statistic the audit deliberately did not give.
 */
const HiddenEdgeArc: FC<{ value?: string | null }> = ({ value }) => {
  const fraction = hiddenEdgeFraction(value);
  return (
    <svg viewBox="0 0 46 46" fill="none" className="report-snapshot-card__viz" aria-hidden="true">
      <circle cx="23" cy="23" r="20.47" stroke="#9d8ad7" strokeOpacity="0.18" strokeWidth="5.06" />
      {fraction === null ? null : (
        <circle
          className="report-snapshot-card__arc"
          cx="23"
          cy="23"
          r="20.47"
          stroke="#9d8ad7"
          strokeWidth="5.06"
          pathLength={1}
          strokeDasharray="1"
          style={{ "--arc-offset": 1 - fraction } as CSSProperties}
          transform="rotate(-90 23 23)"
        />
      )}
    </svg>
  );
};

/**
 * Card 2 arousal curve — the path, stroke and gradient are verbatim from Figma
 * `8719:8914` (vector) and `8719:8915` (dot). The previous version was a
 * hand-drawn S with no gradient and the dot floating off the line; here the dot
 * sits exactly on the curve's inflection (73.25, 18.25), which is where Figma
 * places it.
 */
const ArousalWave: FC<{ family: ArousalFamily }> = ({ family }) => {
  const curve = AROUSAL_CURVES[family];
  const gradientId = `snapshotArousal-${family}`;

  return (
    <svg
      // Each family's arc has its own height in Figma (33.5 / 30.71 / 26.68),
      // so the viewBox travels with the path — a shared height would squash or
      // letterbox two of the three.
      viewBox={`0 0 ${SNAPSHOT_VB_WIDTH} ${curve.snapshot.vbHeight}`}
      fill="none"
      className="report-snapshot-card__viz report-snapshot-card__viz--curve"
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id={gradientId}
          x1="1.25"
          y1={curve.snapshot.vbHeight / 2}
          x2="113.25"
          y2={curve.snapshot.vbHeight / 2}
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor={curve.from} />
          <stop offset="1" stopColor={curve.to} />
        </linearGradient>
      </defs>
      <path
        className="report-draw-line"
        pathLength={1}
        d={curve.snapshot.path}
        stroke={`url(#${gradientId})`}
        strokeWidth={SNAPSHOT_STROKE}
        strokeLinecap="round"
      />
      <circle
        className="report-draw-dot"
        cx={curve.snapshot.dot.x}
        cy={curve.snapshot.dot.y}
        r={SNAPSHOT_DOT_R}
        fill={curve.dotColor}
      />
    </svg>
  );
};

/**
 * Pull the N out of a "1 in 7 men" stat so the dot row can VISUALISE the ratio,
 * which is the whole point of it in Figma (`8719:8941` shows 7 dots beside
 * "1 in 7 men", `8719:8955` shows 5 beside "1 in 5 women"). This was previously
 * a fixed 7 dots, so a "1 in 8" reader still saw 7 and the graphic contradicted
 * the number next to it. Clamped to a sane row length.
 */
function dotsFromStat(stat: string | undefined): { filled: number; total: number } {
  const raw = stat?.trim() ?? "";
  // "N in M" — the general form. Only "1 in N" parsed before, so any other
  // ratio silently fell back to a 7-dot row.
  // "N in M" or "N of M" — the general form. "of" was added on 2026-08-27 for the
  // endpoint stat ("8 of 20"); without it that stat drew the 1-of-7 fallback, a
  // graphic claiming ~14% under a label saying 40%.
  const ratio = raw.match(/\b(\d+)\s+(?:in|of)\s+(\d+)/i);
  if (ratio) {
    const filled = Number(ratio[1]);
    const total = Number(ratio[2]);
    if (total >= 2 && total <= 12 && filled >= 1 && filled <= total) return { filled, total };
    // Rows longer than the strip can show stay readable as one-in-many.
    if (total > 12 && filled === 1) return { filled: 1, total: 12 };
    /*
     * A wide ratio (the endpoint stat is out of 20) scales to a ten-dot row at the
     * SAME proportion, so the graphic still says what the label says. Rounded, and
     * clamped to at least one filled dot so a real count never draws as zero.
     */
    if (total > 12 && filled > 1 && filled <= total) {
      return { filled: Math.max(1, Math.round((filled / total) * 10)), total: 10 };
    }
  }
  if (/nearly all/i.test(raw)) return { filled: 7, total: 8 };
  return { filled: 1, total: 7 };
}

/**
 * Row of `total` dots with the first `filled` painted accent.
 *
 * `--dot-i` carries the position so the reveal can stagger them, the same way
 * the growth ladder uses `--rung-i`. It has to be a custom property rather than
 * `:nth-child` delays: the reveal rule sets the `animation` SHORTHAND, which
 * outranks a lower-specificity `animation-delay` and silently resets every
 * delay to 0 — all twelve dots then landed at once.
 */
const CompareDots: FC<{ filled: number; total: number }> = ({ filled, total }) => (
  <div className="report-snapshot-compare__dots" aria-hidden="true">
    {Array.from({ length: total }, (_, i) => (
      <span
        key={i}
        className={i < filled ? "is-filled" : ""}
        style={{ "--dot-i": i } as CSSProperties}
      />
    ))}
  </div>
);

/**
 * Short gradient bar — used for the third compare column. The fill tracks the
 * stat printed under it ("55%" → 55%); it used to be a fixed 62% in CSS, so the
 * bar contradicted its own caption for every archetype whose number wasn't 62.
 * Falls back to Figma's own 66% when the stat carries no percentage.
 */
const CompareBar: FC<{ stat?: string }> = ({ stat }) => {
  const pct = Number.parseInt(stat?.match(/(\d{1,3})\s*%/)?.[1] ?? "", 10);
  const fill = Number.isFinite(pct) ? Math.min(Math.max(pct, 4), 100) : 66;
  return (
    <div className="report-snapshot-compare__bar" aria-hidden="true">
      <span style={{ width: `${fill}%` }} />
    </div>
  );
};

/**
 * The three mini-stat cards (Hidden Edge / Arousal Type / Likely Current Sexual
 * Stage). Pulled from the live report on 2026-08-19 — "remove this for now, just
 * hide it, maybe we will reuse it" — so it is parked behind
 * `SHOW_SNAPSHOT_CARDS` rather than deleted: still exported, still type-checked
 * against the section's props, still covered by
 * `SnapshotSection.hiddenEdgeArc.test.tsx` + `arousalCurves.test.tsx`. Flip the
 * flag to `true` to put the row back exactly as it shipped.
 */
const SHOW_SNAPSHOT_CARDS: boolean = false;

export const SnapshotCards: FC<Props> = ({ archetype, copy, stageResult = null }) => {
  const slug = archetypeSlug(archetype) as Report2CopySlug;
  const config = getReport2Config(archetype);
  const cards = snapshotCards[slug];

  // Card 2 value from config (families.arousal "responsive" → "Responsive").
  // The SAME value drives the arc shape, so the word and the curve can never
  // disagree — which is exactly what Figma's variant note requires.
  const arousalRaw = config?.families?.arousal ?? null;
  const arousalValue = arousalRaw ? capitalizeWord(arousalRaw) : null;
  const arousalFamily = resolveArousalFamily(arousalRaw);

  // Card 3 stage string ("Evolving / Transcending"). Big value is the LAST word
  // ("Transcending"); the purple line is the full string. Prefer the copy
  // matrix's `stage.result` (present for all 14 archetypes) over the config's
  // `stage_default` (only ever filled for Spiritual Lover, in both the repo and
  // Mark's handoff) so the card renders for every archetype.
  const stageFull =
    stageResult ?? (typeof config?.stage_default === "string" ? config.stage_default : null);
  const stageWord = stageFull ? (stageFull.split("/").pop()?.trim() ?? stageFull) : null;
  const stageSubline = copy?.["stage.subline"] ?? null;

  // Card 1 — audited per-archetype share (see `openingMove.*` on SnapshotCopy).
  const openingStat = copy?.["openingMove.stat"] ?? null;
  const openingCaption = copy?.["openingMove.caption"] ?? null;
  // Numeric values ("1 in 4") are unaffected; this only lifts the word-form ones
  // so a lowercase "rarely first" doesn't render as a lowercase headline figure.
  const displayStat = openingStat
    ? openingStat.charAt(0).toUpperCase() + openingStat.slice(1)
    : null;

  return (
    <div className="report-snapshot__cards">
      {/* Card 1 — Figma's "Your Hidden Edge" composition (eyebrow → value → 46px
          ring → subtext, node 8719:8895) with the label kept verbatim per
          Eman's call. The NUMBER is not Figma's `1 in 3`: STATS-AUDIT.md
          retracted that value, so the card carries the audited per-archetype
          first-move share instead, which reads as an edge (being one of the few
          who open). Renders for all 14 archetypes.
          `displayStat` only fixes capitalisation — Mark's matrix has
          "Rarely first" for loyal-ritualist but "rarely first" for
          minimalist-companion, and this value renders as a large serif figure. */}
      {openingStat && openingCaption ? (
        <article className="report-snapshot-card">
          <p className="report-snapshot-card__eyebrow">Your Hidden Edge</p>
          <span className="report-snapshot-card__value">{displayStat}</span>
          <HiddenEdgeArc value={displayStat} />
          <p className="report-snapshot-card__subtext">{openingCaption}</p>
        </article>
      ) : cards?.hiddenEdge ? (
        <article className="report-snapshot-card">
          <p className="report-snapshot-card__eyebrow">Your Hidden Edge</p>
          {/* Figma 8719:8895 puts the value ABOVE the ring (y≈82) and the 46px
              ring below it (y≈142) — it is not a value-inside-donut. Same
              stack order as card 2: eyebrow → value → viz → subtext. */}
          <span className="report-snapshot-card__value">{cards.hiddenEdge.value}</span>
          <HiddenEdgeArc value={cards.hiddenEdge.value} />
          <p className="report-snapshot-card__subtext">{cards.hiddenEdge.subtext}</p>
        </article>
      ) : null}

      {/* Card 2 — Your arousal type */}
      {arousalValue ? (
        <article className="report-snapshot-card">
          <p className="report-snapshot-card__eyebrow">Your Arousal Type</p>
          <span className="report-snapshot-card__value">{arousalValue}</span>
          <ArousalWave family={arousalFamily} />
          {/* The body line is per FAMILY, not per archetype ("only the family
              word, the body line and the arc change"). `snapshotCards` only
              ever carried a Spiritual Lover entry, so the other 13 rendered no
              line at all — fall back to the family text from Figma. */}
          <p className="report-snapshot-card__subtext">
            {cards?.arousalSubtext ?? AROUSAL_CURVES[arousalFamily].snapshotSubtext}
          </p>
        </article>
      ) : null}

      {/* Card 3 — Likely current / sexual stage */}
      {stageWord ? (
        <article className="report-snapshot-card report-snapshot-card--stage">
          {/* Figma 8719:8921 breaks the line with no separator — the "/" was
              rendering as a literal slash in the eyebrow. */}
          <p className="report-snapshot-card__eyebrow">
            Likely Current
            <br />
            Sexual Stage
          </p>
          <div className="report-snapshot-card__stage-value-wrap">
            <span className="report-snapshot-card__stage-glow" aria-hidden="true" />
            <span className="report-snapshot-card__stage-value">{stageWord}</span>
          </div>
          {stageFull ? <p className="report-snapshot-card__stage-full">{stageFull}</p> : null}
          {stageSubline ? <p className="report-snapshot-card__subtext">{stageSubline}</p> : null}
        </article>
      ) : null}
    </div>
  );
};

/**
 * "How you compare" — split out of the section body because it now renders AFTER
 * the findings list ("Five things this report found"), which is the order Eman
 * asked for: snapshot heading -> five findings -> this box.
 */
export const SnapshotCompare: FC<{
  copy: SnapshotCopy | null;
  /**
   * The reader's own barrier answers (`OVL_BARRIER_TAGS`). The third column
   * shows how many other readers named the same thing; where they are absent or
   * unrecognised it falls back to the matrix's `compare3`, so the row is never
   * short a column.
   */
  barrierTags?: readonly string[] | null;
  /**
   * The endpoint stat, resolved server-side (`data/report2-endpoint-stat.ts`).
   * Takes the third column when present — it is about the reader, where the
   * matrix's `compare3` was about a different archetype. Falls through to the
   * barrier stat and then to the matrix, so the row is never short a column.
   */
  endpointStat?: { stat: string; caption: string } | null;
}> = ({ copy, barrierTags, endpointStat = null }) => {
  // Its own reveal root, like the three mini-stat boxes. This box rides
  // `.report-section.is-visible` as a fallback, and that fires when the SECTION's
  // top crosses the fold — which for a box further down the section means the dots
  // have finished landing before the reader gets there.
  const [compareRef, compareRevealed] = useRevealOnView<HTMLElement>({ threshold: 0 });
  // "1 in 4 — Shame and self-judgment, like you". Replaces the archetype
  // percentage that used to sit here, which restated the primer's ranking, and
  // then the want-versus-getting bars, which were not a comparison to anyone.
  const barrier = barrierStatFor(barrierTags);
  const compares = [
    {
      stat: copy?.["compare1.stat"],
      caption: copy?.["compare1.caption"],
      viz: "dots" as const,
      // Both count derived from the stat. `filled` used to be hardcoded to 1
      // and the total only understood "1 in N", so a stat like "87%" drew a
      // 7-dot row with one filled — a graphic claiming ~14% under a label
      // saying 87%.
      ...dotsFromStat(copy?.["compare1.stat"]),
    },
    {
      stat: copy?.["compare2.stat"],
      caption: copy?.["compare2.caption"],
      viz: "dots" as const,
      ...dotsFromStat(copy?.["compare2.stat"]),
    },
    endpointStat
      ? {
          stat: endpointStat.stat,
          caption: endpointStat.caption,
          viz: "dots" as const,
          ...dotsFromStat(endpointStat.stat),
        }
      : barrier
        ? {
            stat: barrier.stat,
            caption: barrier.caption,
            viz: "dots" as const,
            ...dotsFromStat(barrier.stat),
          }
        : {
            stat: copy?.["compare3.stat"],
            caption: copy?.["compare3.caption"],
            viz: "bar" as const,
            filled: 0,
            total: 0,
          },
  ].filter((c) => c.stat || c.caption);

  if (compares.length === 0) return null;

  return (
    <article
      ref={compareRef}
      className={`report-snapshot-compare report-chart-reveal${
        compareRevealed ? " is-revealed" : ""
      }`}
    >
      <p className="report-snapshot-compare__eyebrow">How you compare</p>
      <div className="report-snapshot-compare__cols">
        {compares.map((c, i) => (
          <div key={i} className="report-snapshot-compare__col">
            {c.viz === "bar" ? (
              <CompareBar stat={c.stat} />
            ) : (
              <CompareDots filled={c.filled} total={c.total} />
            )}
            {c.stat ? <p className="report-snapshot-compare__stat">{c.stat}</p> : null}
            {c.caption ? <p className="report-snapshot-compare__caption">{c.caption}</p> : null}
          </div>
        ))}
      </div>
    </article>
  );
};

const SnapshotSection: FC<Props> = ({ archetype, copy, stageResult = null }) => (
  <div className="report-snapshot">
    <h3 className="report-snapshot__heading">Your snapshot</h3>

    {SHOW_SNAPSHOT_CARDS ? (
      <SnapshotCards archetype={archetype} copy={copy} stageResult={stageResult} />
    ) : null}
  </div>
);

export default SnapshotSection;
