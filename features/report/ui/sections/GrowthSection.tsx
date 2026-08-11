"use client";

import type { FC } from "react";
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
 * framing slots (`gate.hook`, `learn.eyebrow`, `learn.body`) are UNIVERSAL and
 * always shipped. The per-archetype payload — `takeaway`, `ladder.headline`,
 * `rung1..5.{from,to,move}` (the ladder rungs; counts vary per archetype) and
 * `ladder.close` — is the gated content: shipped ONLY when unlocked at the
 * full_report tier. A locked client (`locked: true`) receives those null and
 * renders the hook teaser + PremiumOverlay instead. Never send locked
 * per-archetype content to an unpaid client.
 */
export interface GrowthCopy {
  // Universal (always shipped) — these frame the section for locked clients too.
  "gate.hook"?: string | null;
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

type Rung = { from: string; to: string; move: string | null };

/**
 * The rising "elevation profile" above the ladder (Figma 8427:2685): a stepped
 * line climbing left→right with one dot per rung, the first labelled START HERE.
 * Universal decorative framing — it visualises "each rung is a step up" and
 * scales to `n` rungs (min 2). Purely presentational; the real per-archetype
 * content is the ladder rungs below.
 */
const ElevationProfile: FC<{ n: number }> = ({ n }) => {
  const steps = Math.max(n, 2);
  const W = 800;
  const H = 104;
  const padX = 18;
  const dotR = 7;
  // Evenly space dots; each is one riser higher (smaller y) than the last.
  const pts = Array.from({ length: steps }, (_, i) => ({
    x: padX + (i * (W - padX * 2)) / (steps - 1),
    y: H - dotR - (i * (H - dotR * 2)) / (steps - 1),
  }));
  const first = pts[0] ?? { x: padX, y: H - dotR };
  // Stepped path: horizontal to each dot's x, then vertical up to its y.
  const d = pts.reduce((acc, p, i) => {
    if (i === 0) return `M ${p.x} ${p.y}`;
    const prev = pts[i - 1]!;
    return `${acc} L ${p.x} ${prev.y} L ${p.x} ${p.y}`;
  }, "");
  return (
    <svg
      className="report-growth__profile"
      viewBox={`0 0 ${W} ${H + 16}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="Each shift is a step up from the one before"
    >
      <path d={d} fill="none" stroke="#9d8ad7" strokeWidth="2.5" strokeLinejoin="round" />
      {pts.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={i === 0 ? dotR + 1.5 : dotR}
          fill={i === 0 ? "#fe6839" : "#9d8ad7"}
        />
      ))}
      <text x={first.x} y={first.y + 22} className="report-growth__profile-start">
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
const RungItem: FC<{ rung: Rung; index: number; isFirst: boolean }> = ({
  rung,
  index,
  isFirst,
}) => (
  <li
    className={`report-growth__rung${isFirst ? " is-first" : ""}`}
    style={{ marginLeft: `${index * 22.5}px` }}
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
  offerDeadline,
  onUnlock,
  quote = null,
  sectionTitle,
  tier = "full_report",
}) => {
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
    <div className="report-growth">
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
            {copy["gate.hook"] ? <p className="report-growth__hook">{copy["gate.hook"]}</p> : null}
            <div className="report-growth__preview">
              <div className="report-growth__preview-fade" aria-hidden="true">
                {/* Blurred stand-in — the real per-archetype ladder is withheld
                    server-side; the universal elevation profile frames it. */}
                <ElevationProfile n={profileSteps} />
                <ol className="report-growth__ladder">
                  {Array.from({ length: profileSteps }, (_, i) => (
                    <li
                      key={i}
                      className={`report-growth__rung${i === 0 ? " is-first" : ""}`}
                      style={{ marginLeft: `${i * 22.5}px` }}
                    >
                      <span className="report-growth__rung-dot" />
                      <div className="report-growth__rung-body">
                        <p className="report-growth__rung-line">
                          <span className="report-growth__rung-from">waiting for the moment</span>
                          <span className="report-growth__rung-arrow">{"→"}</span>
                          <span className="report-growth__rung-to">creating it</span>
                        </p>
                        <p className="report-growth__rung-move">First move · one small shift.</p>
                      </div>
                    </li>
                  ))}
                </ol>
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
            {copy["ladder.headline"] ? (
              <p className="report-growth__ladder-headline">{copy["ladder.headline"]}</p>
            ) : null}

            {hasLadder ? <ElevationProfile n={profileSteps} /> : null}

            {hasLadder ? (
              <ol className="report-growth__ladder">
                {rungs.map((rung, i) => (
                  <RungItem key={i} rung={rung} index={i} isFirst={i === 0} />
                ))}
              </ol>
            ) : null}

            {copy["ladder.close"] ? (
              <div className="report-growth__close">
                <span className="report-growth__star" aria-hidden="true">
                  &#10037;
                </span>
                <p className="report-growth__close-line">{copy["ladder.close"]}</p>
              </div>
            ) : null}
          </>
        )}
      </article>
    </div>
  );
};

export default GrowthSection;
