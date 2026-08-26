"use client";

import { useEffect, useRef, useState, type CSSProperties, type FC, type ReactNode } from "react";
import LockedPreviewImage from "./LockedPreviewImage";
import PremiumOverlay, { type PremiumOverlayTier } from "./PremiumOverlay";
import type { ReportPriceQuoteSnapshot } from "@features/pricing/logic/reportPricing";
import { renderEduPara } from "./eduPara";
import type { FantasyMapDot } from "@features/report/server/fantasyMap";
import { useRevealOnView } from "../hooks/useRevealOnView";
import LearnPill from "./LearnPill";
import FantasyLearnings from "./FantasyLearnings";

/**
 * Server-resolved fantasy copy (`getReport2Section(name, "fantasy")`), threaded
 * as a prop because the 634KB copy module is server-only (see
 * `app/api/report/route.ts` → `fantasyCopy`).
 *
 * GATING (Part III, FULL_REPORT tier — this is section 27,
 * `typical_sexual_fantasy_amp_practice_tendencies`, NOT in
 * `ESSENTIALS_SECTION_IDS`, so it only unlocks at the full_report tier). UNLIKE
 * the sibling sections, EVERY fantasy copy slot is universal (verified in
 * `data/report2-sections-schema.json` — all 12 slots `universal: true`), so
 * there is no per-archetype copy to withhold: all slots are always shipped and
 * frame the section for locked clients too. The only gated thing is the map's
 * per-user dot layout — and there is NO per-user/per-archetype dot data today
 * (`getReport2Config(name).fantasy_map` is `null` for all 14, carrying only meta
 * for one). So the map is drawn from the Figma's representative layout (a fixed
 * universal set of 16 dots / 8 labels, per node 8427:2479) for everyone; the
 * `chartnote` copy states plainly that placements are illustrative. When
 * `locked`, the map is shown blurred behind a PremiumOverlay; when unlocked it
 * renders live. No per-user fantasy scores are ever fabricated.
 */
export interface FantasyCopy {
  "edu.eyebrow"?: string | null;
  "edu.teaser"?: string | null;
  "edu.body.p1"?: string | null;
  "edu.body.p2"?: string | null;
  "edu.body.p3"?: string | null;
  "edu.body.p4"?: string | null;
  chartnote1?: string | null;
  chartnote2?: string | null;
  "learn.eyebrow"?: string | null;
  "learn.body"?: string | null;
  /** Second Key Concepts paragraph — see data/report2-key-concepts.ts. */
  "learn.body.p2"?: string | null;
  /** True when the section isn't unlocked (blurs the map behind the overlay). */
  locked: boolean;
}

interface Props {
  archetype: string;
  copy: FantasyCopy | null;
  offerDeadline?: number;
  onUnlock: () => void;
  quote?: ReportPriceQuoteSnapshot | null;
  sectionTitle: string;
  /**
   * The per-user Fantasy-Pull / Actual-Pleasure category tables
   * (`PracticeTendenciesSection`). Figma 8427:2466 puts them INSIDE this card —
   * between the chart note and the "Learn" block — not in a sibling block after
   * it, so they are injected here as a slot rather than mounted separately.
   */
  tables?: ReactNode;
  tier?: PremiumOverlayTier;
  /**
   * Per-archetype map dots derived server-side from the practice-tendency
   * scores. Null when locked (or for an unknown archetype) ⇒ the universal
   * illustrative layout is used instead.
   */
  dots?: FantasyMapDot[] | null;
}

type Quadrant = "lean" | "keep" | "hidden" | "not";

/** "all" plus one entry per quadrant — drives the filter tab row. */
type MapFilter = "all" | Quadrant;

// The 5 filter tabs above the map (Figma 8427:2467 — buttons 8427:2468/2470/
// 2472/2474/2476), in the Figma's left-to-right order. Selecting one dims every
// dot outside that quadrant rather than removing it, so the plot keeps its shape
// and the eye can still read the filtered group in context.
const MAP_FILTERS: { id: MapFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "lean", label: "Lean in" },
  { id: "hidden", label: "Hidden gems" },
  { id: "keep", label: "Keep in imagination" },
  { id: "not", label: "Not your thing" },
];

// The four quadrant frames (Figma 8427:2480–2488). Each carries its tint accent
// (background wash + label colour) and grid placement. Axes: x = lived pleasure
// (left low → right high); y = fantasy pull (bottom low → top high).
const QUADRANTS: {
  id: Quadrant;
  label: string;
  ink: string;
  bg: string;
  col: 1 | 2;
  row: 1 | 2;
}[] = [
  {
    id: "keep",
    label: "KEEP IN IMAGINATION",
    ink: "#c2542f",
    bg: "rgba(194,84,47,0.05)",
    col: 1,
    row: 1,
  },
  { id: "lean", label: "LEAN IN", ink: "#2e7d5b", bg: "rgba(46,125,91,0.05)", col: 2, row: 1 },
  {
    id: "not",
    label: "NOT YOUR THING",
    ink: "#b3aac0",
    bg: "rgba(179,170,192,0.07)",
    col: 1,
    row: 2,
  },
  {
    id: "hidden",
    label: "HIDDEN GEMS",
    ink: "#795fc8",
    bg: "rgba(121,95,200,0.05)",
    col: 2,
    row: 2,
  },
];

const QUADRANT_DOT: Record<Quadrant, string> = {
  lean: "#2e7d5b",
  keep: "#c2542f",
  hidden: "#795fc8",
  not: "#b3aac0",
};

// Fallback dots: positions extracted + normalized from the Figma vectors (node
// 8427:2479) to the plot box (0..1). x = lived pleasure, y = fantasy pull (0 top
// → 1 bottom, matching CSS top%). Used only when the server sends no `dots` —
// i.e. a LOCKED reader, where the real per-archetype placements are withheld and
// this universal layout sits blurred behind the overlay. Unlocked readers get
// dots derived from their archetype's practice-tendency scores
// (`features/report/server/fantasyMap.ts`), which is what the chartnote
// promises. Only 8 dots are labelled, per the Figma; `q` drives dot colour.
/** Quadrant id -> its display name, for the hover label on unnamed dots. */
const QUADRANT_LABEL: Record<Quadrant, string> = QUADRANTS.reduce(
  (acc, quad) => ({ ...acc, [quad.id]: quad.label }),
  {} as Record<Quadrant, string>
);

type MapDot = {
  /** Printed under the dot. */
  label: string | null;
  /** What the dot IS — null only for the illustrative fallback set. */
  name?: string | null;
  q: Quadrant;
  x: number;
  y: number;
  /** 1-10 scores behind the position; absent on the fallback set. */
  pull?: number | null;
  pleasure?: number | null;
};

const MAP_DOTS: MapDot[] = [
  { label: "Mutual surrender", q: "lean", x: 0.92, y: 0.12 },
  { label: "Sacred kink", q: "lean", x: 0.8, y: 0.17 },
  { label: "Tantra", q: "lean", x: 0.89, y: 0.22 },
  { label: "Slow builds", q: "lean", x: 0.88, y: 0.34 },
  { label: "Emotional release", q: "lean", x: 0.82, y: 0.42 },
  { label: null, q: "lean", x: 0.72, y: 0.38 },
  { label: "Voice & sound", q: "hidden", x: 0.64, y: 0.58 },
  { label: null, q: "hidden", x: 0.62, y: 0.7 },
  { label: null, q: "hidden", x: 0.68, y: 0.78 },
  { label: "Public play", q: "keep", x: 0.18, y: 0.3 },
  { label: null, q: "keep", x: 0.1, y: 0.4 },
  { label: null, q: "keep", x: 0.08, y: 0.52 },
  { label: null, q: "not", x: 0.12, y: 0.62 },
  { label: "Quickies", q: "not", x: 0.28, y: 0.76 },
  { label: null, q: "not", x: 0.26, y: 0.92 },
  { label: null, q: "not", x: 0.12, y: 0.88 },
];

/** #RRGGBB → "r g b" for rgb() with slash-alpha. */
function hexToRgbTriplet(hex: string): string {
  const c = hex.replace("#", "");
  const n = Number.parseInt(c, 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
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
 * The 2-axis fantasy map (per Figma 8427:2479). Four tinted quadrants, the 8
 * labelled + 8 anonymous representative dots, axis captions. A fixed universal
 * layout — the same for every viewer (no per-user scores exist). The dots stagger
 * in when the map itself reaches the viewport; this used to fire off a mount-time
 * requestAnimationFrame, so the cascade was over before the reader arrived.
 */
/** Ten pips, filled to `value` — the same readout the mini-stat boxes use. */
const DotMeter: FC<{ label: string; value: number }> = ({ label, value }) => (
  <span className="report-fantasy-map__meter">
    <span className="report-fantasy-map__meter-head">
      <span className="report-fantasy-map__meter-label">{label}</span>
      <span className="report-fantasy-map__meter-value">{value}</span>
    </span>
    <span className="report-fantasy-map__meter-pips" aria-hidden="true">
      {Array.from({ length: 10 }, (_, i) => (
        <span key={i} className={i < value ? "is-on" : ""} />
      ))}
    </span>
  </span>
);

const FantasyMap: FC<{ filter: MapFilter; dots?: FantasyMapDot[] | null }> = ({ filter, dots }) => {
  const [mapRef, animated] = useRevealOnView<HTMLDivElement>();
  /** Which dot is open. Hover, focus and tap all drive this one value. */
  const [openDot, setOpenDot] = useState<number | null>(null);
  /*
   * Touch needs a second tap to CLOSE, and that has to be told apart from a mouse
   * click. On a tap the sequence is pointerdown → focus (which opens the card) →
   * click; an unconditional toggle in that click therefore closed the card the
   * focus had just opened, so the first tap did nothing and the second one opened
   * it. These two remember what the pointer was and whether the dot was already
   * open when it went down, so the toggle only runs for touch.
   */
  const wasTouch = useRef(false);
  const wasOpen = useRef(false);
  return (
    <div
      ref={mapRef}
      className={`report-fantasy-map${animated ? " is-animated" : ""}${
        openDot === null ? "" : " is-inspecting"
      }`}
    >
      <div className="report-fantasy-map__frame">
        {QUADRANTS.map((quad) => (
          <div
            key={quad.id}
            className="report-fantasy-map__quad"
            style={
              {
                gridColumn: quad.col,
                gridRow: quad.row,
                background: quad.bg,
              } as CSSProperties
            }
          >
            <span className="report-fantasy-map__quad-label" style={{ color: quad.ink }}>
              {quad.label}
            </span>
          </div>
        ))}

        {/*
          Dots layer sits over the quadrant grid. Each dot is a real button: only
          eight of the sixteen can PRINT their name (the rest would collide with a
          neighbour's label or a quadrant title), so the other eight were mute —
          the reader could see a dot and never learn what it was. Every dot now
          opens a readout with its practice and the two scores that put it there,
          which is also what makes the chart legible to a screen reader.
        */}
        <div className="report-fantasy-map__dots">
          {(dots?.length ? dots : MAP_DOTS).map((dot, i) => {
            const style = {
              "--dot-x": `${dot.x * 100}%`,
              "--dot-y": `${dot.y * 100}%`,
              "--dot-accent-rgb": hexToRgbTriplet(QUADRANT_DOT[dot.q]),
              "--dot-order": i,
            } as CSSProperties;
            const dimmed = filter !== "all" && dot.q !== filter;
            const open = openDot === i;
            const name = (dot as MapDot).name ?? dot.label ?? null;
            const pull = (dot as MapDot).pull ?? null;
            const pleasure = (dot as MapDot).pleasure ?? null;
            const zone = QUADRANT_LABEL[dot.q];
            /* The readout is anchored to a 12px dot, so near an edge it would hang
               outside the plot. It opens toward the middle instead: left of the dot
               past 62% across, below it inside the top quarter. */
            /* 0.55/0.45 rather than 0.62/0.38: a centred card is ~70px wide either
               side of the dot, and at x = 0.62 that still ran 9px past the plot's
               right edge at every width tested. Only the narrow middle band centres
               now; everything else anchors an edge to the dot. */
            const flip = `${
              dot.x > 0.55 ? " is-flip-x" : dot.x < 0.45 ? " is-flip-start" : ""
            }${dot.y < 0.26 ? " is-flip-y" : ""}`;
            const readout = [
              name ?? zone,
              pull === null ? null : `fantasy pull ${pull} of 10`,
              pleasure === null ? null : `lived pleasure ${pleasure} of 10`,
              `zone: ${zone}`,
            ]
              .filter(Boolean)
              .join(", ");
            return (
              <button
                key={i}
                type="button"
                aria-label={readout}
                aria-expanded={open}
                className={`report-fantasy-map__dot${dimmed ? " is-dim" : ""}${
                  open ? " is-open" : ""
                }${flip}`}
                style={style}
                onMouseEnter={() => setOpenDot(i)}
                onMouseLeave={() => setOpenDot((c) => (c === i ? null : c))}
                onFocus={() => setOpenDot(i)}
                onBlur={() => setOpenDot((c) => (c === i ? null : c))}
                onPointerDown={(event) => {
                  wasTouch.current = event.pointerType === "touch";
                  wasOpen.current = openDot === i;
                }}
                onClick={() => {
                  // Mouse: hover already governs, and closing under the cursor would
                  // fight it. Touch: toggle.
                  if (!wasTouch.current) return;
                  setOpenDot(wasOpen.current ? null : i);
                }}
              >
                <span className="report-fantasy-map__halo" aria-hidden="true" />
                {dot.label ? (
                  <span className="report-fantasy-map__dot-label">{dot.label}</span>
                ) : null}
                <span className="report-fantasy-map__card" aria-hidden="true">
                  <span
                    className="report-fantasy-map__card-zone"
                    style={{ color: QUADRANT_DOT[dot.q] }}
                  >
                    {zone}
                  </span>
                  {name ? <span className="report-fantasy-map__card-name">{name}</span> : null}
                  {pull !== null && pleasure !== null ? (
                    <span className="report-fantasy-map__meters">
                      <DotMeter label="fantasy pull" value={pull} />
                      <DotMeter label="lived pleasure" value={pleasure} />
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Axis captions around the frame. */}
      <span className="report-fantasy-map__cap report-fantasy-map__cap--x" aria-hidden="true">
        lived pleasure &rarr;
      </span>
      <span className="report-fantasy-map__cap report-fantasy-map__cap--y" aria-hidden="true">
        fantasy pull &rarr;
      </span>
    </div>
  );
};

const FantasySection: FC<Props> = ({
  archetype,
  copy,
  offerDeadline,
  onUnlock,
  quote = null,
  sectionTitle,
  tables,
  tier = "full_report",
  dots,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [mapFilter, setMapFilter] = useState<MapFilter>("all");

  // Only the PRIMARY archetype has a fantasy copy block. When browsing another
  // archetype there is no map/education to show — but the category tables are
  // per-archetype and must still render, so pass them straight through (they are
  // a slot now, not a sibling mount).
  if (!copy) return <>{tables}</>;
  const locked = copy.locked;

  // Educational block is universal — always safe to show (all slots universal).
  const eduParas = [
    copy["edu.body.p1"],
    copy["edu.body.p2"],
    copy["edu.body.p3"],
    copy["edu.body.p4"],
  ].filter((p): p is string => !!p);
  const hasEdu = !!copy["edu.teaser"] || eduParas.length > 0;

  return (
    <div className="report-fantasy">
      <h3 className="report-fantasy__heading">Fantasy vs. Reality</h3>

      <LearnPill prefix="fantasy" copy={copy} />

      <article className="report-fantasy__card">
        {locked ? (
          <>
            <div className="report-fantasy__preview">
              {/* A pre-blurred render of the REAL chapter. Blurring the PIXELS at
                  build time means the paid copy is not in the file that ships, so
                  it cannot be read back out of the DOM. See LockedPreviewImage. */}
              <div
                className="report-fantasy__preview-fade report-preview-fade--image"
                aria-hidden="true"
              >
                <LockedPreviewImage name="fantasy" />
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
            {/* ── Three learnings, above the map ────────────────────────────────
                Mark's document comment asked the top of this chapter to carry
                three learnings before the graph: the relational container, why a
                fantasy can feel safer with a stranger, and living vs not living
                one. Every paragraph is a green-highlighted paragraph from
                chapters 25 and 26 of the source document, verbatim and in
                document order — see `data/report2-fantasy-context.ts`.

                Universal copy, so it renders for anyone who has unlocked the
                chapter; it says nothing about this particular reader, which the
                map below it does. */}
            <FantasyLearnings />

            {/* Quadrant filter tabs (Figma 8427:2467) — the first element of the
                unlocked card, above the map. The hook eyebrow that used to sit
                here is not in the Figma Article and was removed; the locked
                preview's copy of it went the same way (see route.ts). */}
            <div className="report-fantasy__filters" role="group" aria-label="Filter map by group">
              {MAP_FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={`report-fantasy__filter${mapFilter === f.id ? " is-active" : ""}`}
                  aria-pressed={mapFilter === f.id}
                  onClick={() => setMapFilter(f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <FantasyMap filter={mapFilter} dots={dots} />

            {copy.chartnote1 ? (
              <p className="report-fantasy__chartnote">{copy.chartnote1}</p>
            ) : null}
            {/* chartnote2 is NOT rendered. Its copy is an internal handoff note to
                whoever built this section — "Each report ships its own 8-label set
                (one per quadrant minimum)" — describing how the chart is authored,
                not anything a reader needs. It was shipping verbatim under the map
                for all 14 archetypes. Left in the copy data rather than deleted,
                since that file is the copy owner's, but it must not render. */}
          </>
        )}

        {/* Category tables sit inside the card, after the chart note and before
            the Learn block (Figma 8427:2466 child order).

            Locked does NOT render them: the raster above is a capture of this card
            from the filters down to the tables, so a second, blurred stand-in set
            underneath it showed the same block twice and added 771px of height. */}
        {tables && !locked ? <div className="report-fantasy__tables">{tables}</div> : null}

        {hasEdu ? (
          <div className="report-fantasy__details">
            <button
              type="button"
              className="report-fantasy__details-summary"
              aria-expanded={locked ? false : expanded}
              onClick={locked ? onUnlock : () => setExpanded((v) => !v)}
            >
              <span className="report-fantasy__details-icon" aria-hidden="true">
                <BookIcon />
              </span>
              <span className="report-fantasy__details-eyebrow">
                {copy["edu.eyebrow"] ?? "Learn: what fantasies are for"}
              </span>
              <span
                className={`report-fantasy__details-chevron${expanded ? " is-open" : ""}`}
                aria-hidden="true"
              >
                ⌄
              </span>
            </button>

            {locked || !expanded ? (
              <div className="report-fantasy__details-peek report-learn-peek">
                {copy["edu.teaser"] ? (
                  <p className="report-fantasy__details-teaser report-learn-teaser">
                    {copy["edu.teaser"]}
                    {copy["edu.body.p1"] ? ` ${copy["edu.body.p1"]}` : null}
                  </p>
                ) : null}
                {locked || eduParas.length > 0 ? (
                  <button
                    type="button"
                    className="report-fantasy__peek-cta report-learn-cta"
                    onClick={locked ? onUnlock : () => setExpanded(true)}
                  >
                    {locked ? "Unlock to read the full explanation" : "Read the full explanation"}
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="report-fantasy__details-body">
                {copy["edu.teaser"] ? (
                  <p className="report-fantasy__details-teaser report-learn-teaser-full">
                    {copy["edu.teaser"]}
                  </p>
                ) : null}
                {eduParas.map((para, i) => (
                  <p key={i} className="report-fantasy__details-para">
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

export default FantasySection;
