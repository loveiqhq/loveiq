"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type FC,
  type SetStateAction,
} from "react";
import VerdictStar from "./VerdictStar";
import LockedPreviewImage from "./LockedPreviewImage";
import PremiumOverlay, { type PremiumOverlayTier } from "./PremiumOverlay";
import type { ReportPriceQuoteSnapshot } from "@features/pricing/logic/reportPricing";

/**
 * Server-resolved growth copy (`getReport2Section(name, "growth")`), threaded as
 * a prop because the 634KB copy module is server-only (see
 * `app/api/report/route.ts` → `growthCopy`).
 *
 * GATING (Part IV, FULL_REPORT tier — this section is
 * `typical_growth_potentials_for_the_core_archetype`, section 31, NOT in
 * `ESSENTIALS_SECTION_IDS`, so it only unlocks at the full_report tier). The
 * framing slots (`learn.eyebrow`, `learn.body`) are UNIVERSAL and
 * always shipped. The per-archetype payload — `takeaway`, `ladder.headline`,
 * `rung1..5.{from,to,move}` (the ladder rungs; counts vary per archetype) and
 * `ladder.close` — is the gated content: shipped ONLY when unlocked at the
 * full_report tier. A locked client (`locked: true`) receives those null and
 * renders the hook teaser + PremiumOverlay instead. Never send locked
 * per-archetype content to an unpaid client.
 */
export interface GrowthCopy {
  // Universal (always shipped) — these frame the section for locked clients too.
  "learn.eyebrow"?: string | null;
  "learn.body"?: string | null;
  // Per-archetype — withheld (null) from locked clients.
  takeaway?: string | null;
  "ladder.headline"?: string | null;
  "rung1.from"?: string | null;
  "rung1.to"?: string | null;
  "rung1.move"?: string | null;
  "rung2.from"?: string | null;
  "rung2.to"?: string | null;
  "rung2.move"?: string | null;
  "rung3.from"?: string | null;
  "rung3.to"?: string | null;
  "rung3.move"?: string | null;
  "rung4.from"?: string | null;
  "rung4.to"?: string | null;
  "rung4.move"?: string | null;
  "rung5.from"?: string | null;
  "rung5.to"?: string | null;
  "rung5.move"?: string | null;
  "ladder.close"?: string | null;
  /** True when the per-archetype takeaway/headline/rungs/close were withheld. */
  locked: boolean;
}

interface Props {
  archetype: string;
  copy: GrowthCopy | null;
  /** `getReport2Config(name).growth_rungs` — how many rungs to expect; may be null. */
  rungCount?: number | null;
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

type Rung = { from: string; to: string; move: string | null };

/**
 * The rising "elevation profile" above the ladder (Figma 8427:2685): a stepped
 * line climbing left→right with one dot per rung, the first labelled START HERE.
 * Universal decorative framing — it visualises "each rung is a step up" and
 * scales to `n` rungs (min 2). Purely presentational; the real per-archetype
 * content is the ladder rungs below.
 */
/**
 * Elevation profile (Figma 9114:680): a flat plateau under each rung joined by
 * diagonal ramps with ROUNDED corners — not the sharp vertical risers this used to
 * draw. Dot 1 is the orange "start here" marker and larger; the rest are purple
 * and deepen as the reader climbs, matching the Figma dot fills.
 *
 * When `animated`, the line draws itself in left→right and each dot pops in
 * behind it (see `.report-growth__profile` in globals.css).
 */
const PROFILE_W = 835;
const PROFILE_H = 143;
/** Figma dot centres, x/y in the 835×143 frame. */
/**
 * Clear the cue only if it is still MINE. Two elements answer for each step (the dot
 * and its row), so a plain `onCue(null)` on leave would wipe the cue the other one just
 * set as the pointer travels between them.
 */
const clearOwnCue = (onCue: Dispatch<SetStateAction<number | null>>, mine: number) => () =>
  onCue((current) => (current === mine ? null : current));

const PROFILE_DOTS: { x: number; y: number; r: number; fill: string }[] = [
  { x: 77.5, y: 128.2, r: 8.9, fill: "#fe6839" },
  { x: 256.5, y: 101.4, r: 7.5, fill: "#c4b5fd" },
  { x: 435.5, y: 74.6, r: 7.5, fill: "#a78bfa" },
  { x: 614.5, y: 49.2, r: 7.5, fill: "#8b6fe0" },
  { x: 775.5, y: 23.9, r: 7.5, fill: "#795fc8" },
];
/** Half-width of each flat plateau, and the corner radius on every turn. */
const PLATEAU = 56;
const CORNER = 11;

/** Polyline → path with every interior corner cut to a `r` quadratic. */
function roundedPolyline(points: { x: number; y: number }[], r: number): string {
  if (points.length < 2) return "";
  let d = `M ${points[0]!.x} ${points[0]!.y}`;
  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = points[i - 1]!;
    const cur = points[i]!;
    const next = points[i + 1]!;
    const inLen = Math.hypot(cur.x - prev.x, cur.y - prev.y) || 1;
    const outLen = Math.hypot(next.x - cur.x, next.y - cur.y) || 1;
    const rIn = Math.min(r, inLen / 2);
    const rOut = Math.min(r, outLen / 2);
    const a = {
      x: cur.x - ((cur.x - prev.x) / inLen) * rIn,
      y: cur.y - ((cur.y - prev.y) / inLen) * rIn,
    };
    const b = {
      x: cur.x + ((next.x - cur.x) / outLen) * rOut,
      y: cur.y + ((next.y - cur.y) / outLen) * rOut,
    };
    d += ` L ${a.x.toFixed(1)} ${a.y.toFixed(1)} Q ${cur.x} ${cur.y} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
  }
  const last = points[points.length - 1]!;
  return `${d} L ${last.x} ${last.y}`;
}

const ElevationProfile: FC<{
  n: number;
  animated: boolean;
  svgRef?: React.Ref<SVGSVGElement>;
  /** Which step the reader is pointing at — shared with the ladder below. */
  cue: number | null;
  /** The setter itself, so a leave clears ONLY its own step (see `clearOwnCue`). */
  onCue: Dispatch<SetStateAction<number | null>>;
}> = ({ n, animated, svgRef, cue, onCue }) => {
  const dots = PROFILE_DOTS.slice(0, Math.max(2, Math.min(n, PROFILE_DOTS.length)));
  const pts: { x: number; y: number }[] = [{ x: 0, y: dots[0]!.y }];
  dots.forEach((dot, i) => {
    if (i > 0) pts.push({ x: dot.x - PLATEAU, y: dot.y });
    pts.push({ x: dot.x + PLATEAU, y: dot.y });
  });
  pts.push({ x: PROFILE_W, y: dots[dots.length - 1]!.y });

  return (
    <svg
      ref={svgRef}
      className={`report-growth__profile${animated ? " is-animated" : ""}${
        cue === null ? "" : " is-cued"
      }`}
      viewBox={`0 0 ${PROFILE_W} ${PROFILE_H}`}
      role="img"
      aria-label="Each shift is a step up from the one before"
      /* Touch has no "leave", so a tap would stick. Tapping the chart anywhere but a
         step releases it — tap-to-inspect, tap-away-to-release, the same contract the
         arousal arc uses. */
      onPointerDown={(e) => {
        if (!(e.target as Element).closest(".report-growth__profile-cue")) onCue(null);
      }}
    >
      {/* `pathLength={1}` normalises the dash units, so one dasharray draws this
          curve correctly whatever its real length — the same thing the arousal arc
          and the energy curve do. It used to carry a flat `stroke-dasharray: 2000`
          against a path of roughly 700, so the visible stroke finished about a
          third of the way into the animation and the rest of the duration moved
          nothing: the line looked done with two steps still to land. */}
      <path
        className="report-growth__profile-line"
        d={roundedPolyline(pts, CORNER)}
        pathLength={1}
        fill="none"
        stroke="#b7a6e3"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {dots.map((dot, i) => (
        <g
          key={i}
          className={`report-growth__profile-cue${cue === i ? " is-active" : ""}`}
          /* The swell goes on this wrapper, not on the circle: the dot's entrance is an
             animation with `forwards`, and an animation's filled value outranks a plain
             declaration, so a `transform` on the circle itself is ignored — the same
             trap the arousal arc's end dot hit. Origin in user units (the default
             `transform-box: view-box`), because `fill-box` on a <g> resolves against the
             group's bounding box, which here includes the invisible hit circle. */
          style={{ transformOrigin: `${dot.x}px ${dot.y}px` }}
          onMouseEnter={() => onCue(i)}
          onMouseLeave={clearOwnCue(onCue, i)}
        >
          {/* A dot is 7.5-8.9 units across, which is a hard target on a phone. This
              invisible circle is the thing you actually hit; the visible dot rides
              inside it. r=38 measures ~30px on a phone and ~38px on a desktop, and the
              steps are 179 units apart, so neighbouring targets never overlap. */}
          <circle className="report-growth__profile-hit" cx={dot.x} cy={dot.y} r={38} />
          <circle
            className="report-growth__profile-dot"
            style={{ "--dot-i": i } as CSSProperties}
            cx={dot.x}
            cy={dot.y}
            r={dot.r}
            fill={dot.fill}
          />
        </g>
      ))}
      <text className="report-growth__profile-start" x={dots[0]!.x - 36} y={dots[0]!.y - 18}>
        START HERE
      </text>
    </svg>
  );
};

/**
 * One ladder rung (Figma 8427:2694…2765): a colored dot, the struck-through FROM
 * state → bold TO state, and a "First move · MOVE" line below. Rungs indent
 * progressively (the climb) — the first rung is highlighted (orange, START HERE
 * pill) and the rest are purple, deepening down the ladder.
 */
const RungItem: FC<{
  rung: Rung;
  index: number;
  isFirst: boolean;
  cue: number | null;
  onCue: Dispatch<SetStateAction<number | null>>;
}> = ({ rung, index, isFirst, cue, onCue }) => (
  <li
    className={`report-growth__rung${isFirst ? " is-first" : ""}${
      cue === index ? " is-active" : ""
    }`}
    style={{ marginLeft: `${index * 22.5}px`, "--rung-i": index } as CSSProperties}
    /* Both halves cue each other: point at the step on the graph and this row lights,
       point at the row and the step lights. Focusable so it works from the keyboard,
       which is also the only way to reach the dots without a pointer. */
    tabIndex={0}
    onMouseEnter={() => onCue(index)}
    onMouseLeave={clearOwnCue(onCue, index)}
    onFocus={() => onCue(index)}
    onBlur={clearOwnCue(onCue, index)}
  >
    <span className="report-growth__rung-dot" aria-hidden="true" />
    <div className="report-growth__rung-body">
      <p className="report-growth__rung-line">
        <span className="report-growth__rung-from">{rung.from}</span>
        <span className="report-growth__rung-arrow" aria-hidden="true">
          {"→"}
        </span>
        <span className="report-growth__rung-to">{rung.to}</span>
        {isFirst ? <span className="report-growth__rung-pill">Start here</span> : null}
      </p>
      {rung.move ? <p className="report-growth__rung-move">First move · {rung.move}</p> : null}
    </div>
  </li>
);

const GrowthSection: FC<Props> = ({
  archetype,
  copy,
  rungCount = null,
  onUnlock,
  quote = null,
  sectionTitle,
  tier = "full_report",
}) => {
  /*
   * The climb animates when the reader ARRIVES at the chart — not when the
   * section's top edge appears. Observing the section root fired while the chart
   * was still a few hundred pixels below the fold, so the draw and the rung
   * stagger had already finished by the time it was on screen.
   *
   * So: observe the chart itself, and shrink the viewport by 30% at the bottom
   * (`rootMargin`) so it must be properly in view, not just peeking in. Starts
   * "already animated" where IntersectionObserver is unavailable, so content is
   * never left hidden.
   */
  const chartRef = useRef<SVGSVGElement>(null);
  const [isAnimated, setIsAnimated] = useState(() => typeof IntersectionObserver === "undefined");

  useEffect(() => {
    const el = chartRef.current;
    if (!el || isAnimated) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setIsAnimated(true);
          observer.disconnect();
        }
      },
      { threshold: 0.25, rootMargin: "0px 0px -30% 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [isAnimated]);

  /* Which step of the climb the reader is pointing at — the graph and the ladder share
     it, so hovering either half lights both (MO, 2026-08-22, asking for the arousal
     chart's behaviour here). `null` is nothing cued. Declared with the other hooks,
     above the early return: hooks must run in the same order on every render. */
  const [cue, setCue] = useState<number | null>(null);

  if (!copy) return null;

  const locked = copy.locked;

  // Collect the rungs that actually have copy — render only rungs whose
  // from+to slots exist (counts vary per archetype; `rungCount` is a hint, the
  // real gate is the presence of the slots). Never fabricate a rung. `move` is
  // optional per rung.
  const rungs: Rung[] = ([1, 2, 3, 4, 5] as const)
    .map((i) => ({
      from: copy[`rung${i}.from`]?.trim(),
      to: copy[`rung${i}.to`]?.trim(),
      move: copy[`rung${i}.move`]?.trim() || null,
    }))
    .filter((r): r is Rung => !!r.from && !!r.to);

  const hasLadder = rungs.length > 0;
  // rungCount only informs the elevation profile's step count when the real
  // rungs are withheld (locked); otherwise the profile matches the rungs shown.
  const profileSteps = hasLadder ? rungs.length : Math.max(rungCount ?? 5, 2);

  return (
    <div className={`report-growth${isAnimated ? " is-animated" : ""}`}>
      <h3 className="report-growth__heading">Growth Potentials</h3>

      {copy["learn.body"] ? (
        <div className="report-growth__learn-pill-wrap">
          <span className="report-growth__learn-pill">
            <span className="report-growth__learn-pill-icon" aria-hidden="true">
              <BookIcon />
            </span>
            {copy["learn.eyebrow"] ?? "What you will learn"}
          </span>
          <p className="report-growth__learn-body">{copy["learn.body"]}</p>
        </div>
      ) : null}

      <article className="report-growth__card">
        {locked ? (
          <>
            <div className="report-growth__preview">
              {/* A pre-blurred render of the REAL chapter. Blurring the PIXELS at
                  build time means the paid copy is not in the file that ships, so
                  it cannot be read back out of the DOM. See LockedPreviewImage. */}
              <div
                className="report-growth__preview-fade report-preview-fade--image"
                aria-hidden="true"
              >
                <LockedPreviewImage name="growth" />
              </div>
              <PremiumOverlay
                archetype={archetype}
                sectionTitle={sectionTitle}
                tier={tier}
                quote={quote}
                onUnlock={onUnlock}
              />
            </div>
          </>
        ) : (
          <>
            {copy["ladder.headline"] ? (
              <p className="report-growth__ladder-headline">{copy["ladder.headline"]}</p>
            ) : null}

            {hasLadder ? (
              <ElevationProfile
                n={profileSteps}
                animated={isAnimated}
                svgRef={chartRef}
                cue={cue}
                onCue={setCue}
              />
            ) : null}

            {hasLadder ? (
              <ol className={`report-growth__ladder${cue === null ? "" : " is-cued"}`}>
                {rungs.map((rung, i) => (
                  <RungItem
                    key={i}
                    rung={rung}
                    index={i}
                    isFirst={i === 0}
                    cue={cue}
                    onCue={setCue}
                  />
                ))}
              </ol>
            ) : null}

            {copy["ladder.close"] ? (
              <div className="report-growth__close report-verdict">
                <VerdictStar />
                <p className="report-growth__close-line">{copy["ladder.close"]}</p>
                <span className="report-verdict-rule" aria-hidden="true" />
              </div>
            ) : null}
          </>
        )}
      </article>
    </div>
  );
};

export default GrowthSection;
