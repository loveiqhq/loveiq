"use client";

import { useState, type CSSProperties, type FC } from "react";
import LockedPreviewImage from "./LockedPreviewImage";
import PremiumOverlay, { type PremiumOverlayTier } from "./PremiumOverlay";
import type { ReportPriceQuoteSnapshot } from "@features/pricing/logic/reportPricing";
import { useRevealOnView } from "../hooks/useRevealOnView";

/**
 * Server-resolved libido copy (`getReport2Section(name, "libido")`), threaded as
 * a prop because the 634KB copy module is server-only (see
 * `app/api/report/route.ts` → `libidoCopy`).
 *
 * GATING (Part IV, FULL_REPORT tier — this section is
 * `libido_challenges_in_relationships`, section 28, NOT in
 * ESSENTIALS_SECTION_IDS, so it only unlocks at the full_report tier). The
 * framing slots (`eyebrow`, `row1.label`..`row4.label`,
 * `practical.label`, `learn.*`) are UNIVERSAL and always shipped. The
 * per-archetype payload — `result` (the loop name, e.g. "The Waiting Loop"),
 * `row1.value`..`row4.value`, `practical.teaser`, `practical.line1..3` PLUS the
 * loop config (name + steps) — is the gated content: shipped ONLY when unlocked
 * at the full_report tier. A locked client (`locked: true`) receives those
 * null + null loop and renders the hook teaser + PremiumOverlay instead. Never
 * send locked per-archetype content to an unpaid client.
 */
export interface LibidoCopy {
  // Universal (always shipped) — these frame the section for locked clients too.
  eyebrow?: string | null;
  "row1.label"?: string | null;
  "row2.label"?: string | null;
  "row3.label"?: string | null;
  "row4.label"?: string | null;
  "practical.label"?: string | null;
  "learn.eyebrow"?: string | null;
  "learn.body"?: string | null;
  // Per-archetype — withheld (null) from locked clients.
  result?: string | null;
  "row1.value"?: string | null;
  "row2.value"?: string | null;
  "row3.value"?: string | null;
  "row4.value"?: string | null;
  "practical.teaser"?: string | null;
  "practical.line1"?: string | null;
  "practical.line2"?: string | null;
  "practical.line3"?: string | null;
  /** True when the per-archetype result/values/copy/loop were withheld. */
  locked: boolean;
}

/**
 * The loop's three step beats, resolved server-side from
 * `data/report2-libido-loops.ts` (Figma 8427:2593 / 9114:546). Covers all 14 —
 * the frames' footer promises "every archetype has its own named loop, three rows
 * and three steps". Null only when locked, so the chips drop out with the rest of
 * the per-archetype content. The loop's NAME is `copy.result`.
 */
export type LibidoConfig = [string, string, string];

interface Props {
  archetype: string;
  copy: LibidoCopy | null;
  /** Named-loop config (name + steps); null when locked or absent. */
  config: LibidoConfig | null;
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

/** Lightbulb — the gold "practical" block summary icon (Figma 8762:16071). */
const BulbIcon: FC = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.6.45 1 1.16 1 1.95V16h5.2v-.25c0-.79.4-1.5 1-1.95A6 6 0 0 0 12 3Z"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * The named loop rendered as a cycle of connected chips (Figma 8427:2593/2594):
 * `steps` numbered white chips stacked vertically, joined by a dashed connector
 * on the left that loops back to the top — the "circular/connected" visual. The
 * chip prose is the reader's own pattern beats (`row1..N.value`, the same
 * per-archetype content shown expanded in the rows below), so the loop is
 * per-archetype and gated — never fabricated. Renders only when `config.loop`
 * exists AND there are step values to show (absent loop ⇒ no chips).
 */
/**
 * One chip's text, exactly as Figma sets it (8427:2596): the number and the lead
 * clause in Manrope Bold #161021, then everything from the em-dash on in Regular
 * #3f3a4d. The number is INLINE — there is no badge.
 */
const LoopChipText: FC<{ index: number; step: string }> = ({ index, step }) => {
  const dash = step.indexOf(" — ");
  const lead = dash > 0 ? step.slice(0, dash) : step;
  const tail = dash > 0 ? step.slice(dash) : "";
  return (
    <p className="report-libido__loop-text">
      <strong className="report-libido__loop-lead">{`${index} · ${lead}`}</strong>
      {tail}
    </p>
  );
};

/** Generic filler shown blurred behind the paywall — Figma's own base example. */
const LOCKED_PREVIEW_STEPS = [
  "Daily life feels ordinary — not sacred, not inviting",
  "You wait for the right mood — it rarely arrives on its own",
  "Chances pass, doubt grows — and tomorrow looks like today",
];

/**
 * The loop-back arrow (Figma 8427:2601): a dashed curve running from step 3 up the
 * left side to an arrowhead beside step 1 — the cycle restarting. Figma's own
 * `preserveAspectRatio="none"`, so it stretches with the chip stack.
 *
 * The dashes are the animation: they march up the curve into the arrowhead, forever.
 *
 * They never used to be dashes at all. The path carried `pathLength={1}`, which
 * normalises its length to one unit, so `stroke-dasharray: 3 4.5` asked for a
 * three-unit dash on a one-unit path — one dash covering everything, i.e. a plain
 * hairline (and the CSS then overrode the pattern to a single dash anyway). That is
 * what read as broken, and why nothing appeared to move: the moving part was a
 * separate bright segment that retired after three passes (MO, 2026-08-22).
 * Without `pathLength` the pattern is in user units, and `vectorEffect` keeps both
 * the stroke and the dashes at a constant size however far the curve is stretched.
 */
const LoopArrow: FC = () => (
  <svg
    className="report-libido__loop-arrow"
    viewBox="0 0 22.57 157.84"
    preserveAspectRatio="none"
    fill="none"
    aria-hidden="true"
  >
    <defs>
      {/* Feathered at both ends, so the window's arrival and exit are invisible and
          the climb reads as one continuous pass rather than a block sliding by. */}
      <linearGradient id="libido-loop-window-grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fff" stopOpacity="0" />
        <stop offset="0.3" stopColor="#fff" stopOpacity="0.55" />
        <stop offset="0.5" stopColor="#fff" stopOpacity="1" />
        <stop offset="0.7" stopColor="#fff" stopOpacity="0.55" />
        <stop offset="1" stopColor="#fff" stopOpacity="0" />
      </linearGradient>
      <mask
        id="libido-loop-window"
        maskUnits="userSpaceOnUse"
        x="0"
        y="-60"
        width="22.57"
        height="280"
      >
        <rect
          className="report-libido__loop-window"
          x="0"
          y="157.84"
          width="22.57"
          height="32"
          fill="url(#libido-loop-window-grad)"
        />
      </mask>
    </defs>
    <path
      className="report-libido__loop-curve"
      d="M19.7 135.7 C4.5 127 2.4 92 6.9 71.7 C10.2 56.6 15.5 32 19.6 14.5"
      stroke="#9D8AD7"
      strokeOpacity="0.45"
      strokeWidth="1.5"
      strokeDasharray="3 4.5"
      strokeLinecap="round"
      vectorEffect="non-scaling-stroke"
    />
    {/* The same dashes again, brighter, shown only through a soft window that climbs
        the curve — so a pulse of light travels up the marching dashes and lands at the
        arrowhead. Both copies share the dash animation, so their dashes stay in
        register; the window moves independently, which is what lets the dashes march
        calmly while the pulse sweeps. */}
    <path
      className="report-libido__loop-glow"
      d="M19.7 135.7 C4.5 127 2.4 92 6.9 71.7 C10.2 56.6 15.5 32 19.6 14.5"
      stroke="#6B4FC0"
      strokeWidth="2.5"
      strokeDasharray="3 4.5"
      strokeLinecap="round"
      vectorEffect="non-scaling-stroke"
      mask="url(#libido-loop-window)"
    />
    <path
      className="report-libido__loop-head"
      d="M22.96 7.67 L15.82 10.76 L22.07 15.40 Z"
      fill="#9D8AD7"
      fillOpacity="0.45"
    />
  </svg>
);

const LoopChips: FC<{ steps: string[] }> = ({ steps }) => {
  // The three steps arrive in order, then the loop-back arrow draws itself from
  // step 3 up to step 1 — so the cycle closes only once there is a cycle to close.
  const [loopRef, revealed] = useRevealOnView<HTMLDivElement>();
  return (
    <div
      ref={loopRef}
      className={`report-libido__loop report-chart-reveal${revealed ? " is-revealed" : ""}`}
      role="img"
      aria-label="The repeating loop, step by step"
    >
      <LoopArrow />
      <ol className="report-libido__loop-steps">
        {steps.map((step, i) => (
          <li key={i} className="report-libido__loop-chip" style={{ "--row": i } as CSSProperties}>
            <LoopChipText index={i + 1} step={step} />
          </li>
        ))}
      </ol>
    </div>
  );
};

const LibidoSection: FC<Props> = ({
  archetype,
  copy,
  config,
  onUnlock,
  quote = null,
  sectionTitle,
  tier = "full_report",
}) => {
  const [expanded, setExpanded] = useState(false);
  if (!copy) return null;

  const locked = copy.locked;

  // The four labelled rows: labels universal, values per-archetype (withheld
  // when locked). A row renders only when it has a value (never a bare label).
  const rows = [
    { label: copy["row1.label"], value: copy["row1.value"] },
    { label: copy["row2.label"], value: copy["row2.value"] },
    { label: copy["row3.label"], value: copy["row3.value"] },
    { label: copy["row4.label"], value: copy["row4.value"] },
  ].filter((r): r is { label: string; value: string } => !!r.label && !!r.value);

  /*
   * Loop chips — the named cycle's three beats. These used to re-print row values
   * 1–3, so the chips repeated verbatim the text shown directly beneath them, and
   * only the 3 archetypes with a `loop` config got them at all. They are now the
   * distinct three-beat arc Figma draws, for all 14.
   */
  const loopSteps = config ?? [];
  const hasLoop = loopSteps.length > 0;

  // Practical ("The Exit") block — per-archetype but the label is universal;
  // teaser/lines withheld (null) for a locked client. Same peek→expand pattern.
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
    <div className="report-libido">
      <h3 className="report-libido__heading">Libido Challenges</h3>

      {copy["learn.body"] ? (
        <div className="report-libido__learn-pill-wrap">
          <span className="report-libido__learn-pill">
            <span className="report-libido__learn-pill-icon" aria-hidden="true">
              <BookIcon />
            </span>
            {copy["learn.eyebrow"] ?? "What you will learn"}
          </span>
          <p className="report-libido__learn-body">{copy["learn.body"]}</p>
        </div>
      ) : null}

      <article className="report-libido__card">
        {locked ? (
          <>
            <div className="report-libido__preview">
              {/* A pre-blurred render of the REAL chapter. Blurring the PIXELS at
                  build time means the paid copy is not in the file that ships, so
                  it cannot be read back out of the DOM. See LockedPreviewImage. */}
              <div
                className="report-libido__preview-fade report-preview-fade--image"
                aria-hidden="true"
              >
                <LockedPreviewImage name="libido" />
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
            <div className="report-libido__pattern-head">
              <p className="report-libido__pattern-eyebrow">{copy.eyebrow ?? "The Pattern"}</p>
              {copy.result ? <p className="report-libido__loop-name">{copy.result}</p> : null}
            </div>

            {hasLoop ? <LoopChips steps={loopSteps} /> : null}

            {rows.length > 0 ? (
              <div className="report-libido__rows">
                {rows.map((row, i) => (
                  <div key={i} className="report-libido__row">
                    <p className="report-libido__row-term">{row.label}</p>
                    <p className="report-libido__row-detail">{row.value}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </>
        )}

        {/* Locked renders this too, exactly as the eleven purple "Learn" expanders do:
            the label is universal and the block is already locked-aware (closed, with
            an unlock CTA). `hasPractical` is false on a locked report — the teaser and
            the moves are the reader's own and withheld — so gating on it alone dropped
            the block entirely, and putting it in the raster instead made it read at the
            raster's 62% wash while every other chapter's expander sat live beside it. */}
        {locked || hasPractical ? (
          <div className="report-libido__details">
            <button
              type="button"
              className="report-libido__details-summary"
              aria-expanded={locked ? false : expanded}
              onClick={locked ? onUnlock : () => setExpanded((v) => !v)}
            >
              <span className="report-libido__details-icon" aria-hidden="true">
                <BulbIcon />
              </span>
              <span className="report-libido__details-eyebrow">
                {copy["practical.label"] ?? "The Exit"}
              </span>
              <span
                className={`report-libido__details-chevron${expanded ? " is-open" : ""}`}
                aria-hidden="true"
              >
                ⌄
              </span>
            </button>

            {locked || !expanded ? (
              <div className="report-libido__details-peek report-learn-peek">
                {/* The teaser is per-archetype and withheld from a locked client, so it
                    arrives as pixels — a build-time capture of the real line, in the
                    slot the eleven universal expanders fill with live text. Without it
                    the block read as label + button while every other chapter's showed
                    a sentence. */}
                {locked ? (
                  <LockedPreviewImage name="practical-libido" />
                ) : copy["practical.teaser"] ? (
                  <p className="report-libido__details-teaser report-learn-teaser">
                    {practicalTease}
                  </p>
                ) : null}
                {locked || practicalLines.length > 0 ? (
                  <button
                    type="button"
                    className="report-libido__peek-cta report-learn-cta"
                    onClick={locked ? onUnlock : () => setExpanded(true)}
                  >
                    {locked ? "Unlock to read the full practice" : "Read the full practice"}
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="report-libido__details-body">
                {copy["practical.teaser"] ? (
                  <p className="report-libido__details-teaser report-learn-teaser-full">
                    {copy["practical.teaser"]}
                  </p>
                ) : null}
                {practicalLines.map((para, i) => (
                  <p key={i} className="report-libido__details-para">
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

export default LibidoSection;
