"use client";

import { useId, useRef, useState, type CSSProperties, type FC } from "react";
import type { Report3Block } from "@/data/report3-learn-more";
import type { Report3PracticeView } from "@features/report/server/gatedCopy";
import { isTimeLabel, splitEyebrow, splitTitle } from "./V4LearnMore";
import V4PremiumCard from "./V4PremiumCard";
import V4Prose from "./V4Prose";
import { useTeaserFade } from "./useTeaserFade";
import { guardedUnlock } from "./v4Unlock";

/**
 * "Try this & see what shifts" — the practice card that closes a chapter body,
 * above "Go deeper & learn more": Typical Beliefs' (374:217 / 374:238 / 374:258)
 * and Accelerator & Brakes' (377:221 / 374:304 / 375:221).
 *
 * One component, three states, all drawn in Figma:
 *   374:217  closed          teaser clamped to 196px, faded, the "Read All" pill
 *   374:238  open            the whole practice, no gate
 *   374:258  open & gated    two clear paragraphs, the third under a ramping blur,
 *                            the rest under the full blur at full length, and the
 *                            Premium content card 88px into it
 *
 * It is the "how to improve" section the team placed after the paywall blur, a
 * practice component "with its own gating and cliffhanger" (decisions 2026-09-16,
 * 2026-09-21). It deliberately mirrors V4LearnMore: the closed state is NEVER
 * gated, so a locked and an unlocked reader see the same teaser and pill, and the
 * wall only appears on open.
 *
 * WHAT A LOCKED READER RECEIVES. The server splits the practice into `free`
 * (clear), `ramp` (the block the blur fades in over, and also the tail of the
 * teaser) and `rest`, which sits under the full blur: the real copy since review
 * 26.09, in decoy mode scrambled to the same shape with no content
 * (lockedBlurCopy.ts). This component decides how that looks, never what may be
 * read.
 *
 * PER CHAPTER. The frames differ in a handful of numbers — the node ids, the closed
 * teaser's box (218 vs 224), how far the blur fades in over the ramp, and where the
 * Premium card floats — so those arrive as props and become custom properties whose
 * CSS fallbacks are Typical Beliefs' values. A chapter whose frame re-breaks its
 * teaser sends that teaser in `practice.teaser`.
 */

/**
 * 375:270 — the teaser sets the second and third paragraphs as ONE paragraph with a
 * line break between them: no 16px gap, which is what fits the 218px box. The open
 * state keeps them apart, as 374:257 does. V4Runs turns the line break into a <br>.
 * No copy is quoted here on purpose: production serves browser source maps
 * (productionBrowserSourceMaps), so a client component's comments are public.
 */
const teaserOf = (blocks: readonly Report3Block[]): Report3Block[] => {
  const [first, second, third] = blocks;
  if (!first) return [];
  if (second?.kind === "para" && third?.kind === "para") {
    return [first, { kind: "para", runs: [...second.runs, { text: "\n" }, ...third.runs] }];
  }
  return blocks.slice(0, 2);
};

/** 374:234 — the gold chevron, drawn pointing down; CSS turns it up when open. */
const Chevron: FC = () => (
  <svg viewBox="0 0 15 15" fill="none">
    <path
      d="M3.28125 5.625L7.5 9.84375L11.7188 5.625"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

interface Props {
  practice: Report3PracticeView;
  /** Opens the paywall. Omitted in contexts where it would be inert. */
  onUnlock?: () => void;
  defaultOpen?: boolean;
  /** The frame's node for each state; Typical Beliefs' when omitted. */
  nodeIds?: { closed: string; open: string; gated: string };
  /** The closed teaser's box (377:242: 224). CSS falls back to 218. */
  teaserHeightPx?: number;
  /** How far the blur fades in over the ramp (375:221: four lines). CSS: 100%. */
  rampBandPx?: number;
  /**
   * The open copy's drop below the button — 374:304 / 375:221 set it 8px down where
   * the closed teaser, and every Typical Beliefs state, sets it 4px. CSS: 4.
   */
  openPaddingTopPx?: number;
  /**
   * The gated copy's drop, where a frame sets it apart from the open one —
   * 441:6188 sets it 8px down where its open state, 441:6168, sets 4. CSS: the
   * open value.
   */
  gatedPaddingTopPx?: number;
  /**
   * The Premium card's top, measured from the gate — for a ramp whose tail runs on
   * under the full blur in the same paragraph, where the rest starts too late to
   * measure from. Omitted, the card sits in the rest, 48.5px in (Typical Beliefs'
   * 1015:980, 29.09).
   */
  premiumTopPx?: number;
}

const TYPICAL_BELIEFS_NODES = { closed: "374:217", open: "374:238", gated: "374:258" };

const V4TryThis: FC<Props> = ({
  practice,
  onUnlock,
  defaultOpen = false,
  nodeIds = TYPICAL_BELIEFS_NODES,
  teaserHeightPx,
  rampBandPx,
  openPaddingTopPx,
  gatedPaddingTopPx,
  premiumTopPx,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const bodyId = useId();
  // The closed teaser greys its last three lines, wherever they fall.
  const teaserRef = useRef<HTMLDivElement>(null);
  useTeaserFade(teaserRef, !isOpen);
  const [eyebrowLabel, eyebrowValue] = splitEyebrow(practice.eyebrow);
  const [titleLead, titleRest] = splitTitle(practice.title);
  const { free, ramp, rest } = practice;
  const all = [...free, ...(ramp ? [ramp] : []), ...rest];
  // A ramp only ever arrives for a locked reader; unlocked, everything is `free`.
  const gatedRamp = practice.locked ? ramp : null;
  const cardInGate = premiumTopPx !== undefined;
  const geometry: Record<string, string> = {
    ...(teaserHeightPx !== undefined ? { "--rv4-try-teaser-h": `${teaserHeightPx}px` } : {}),
    ...(rampBandPx !== undefined ? { "--rv4-try-band": `${rampBandPx}px` } : {}),
    ...(openPaddingTopPx !== undefined ? { "--rv4-try-open-pt": `${openPaddingTopPx}px` } : {}),
    ...(gatedPaddingTopPx !== undefined ? { "--rv4-try-gated-pt": `${gatedPaddingTopPx}px` } : {}),
    ...(cardInGate ? { "--rv4-try-premium-top": `${premiumTopPx}px` } : {}),
  };

  return (
    <section
      className={`rv4-try${isOpen ? " is-open" : ""}${isOpen && gatedRamp ? " is-gated" : ""}`}
      data-node-id={isOpen ? (gatedRamp ? nodeIds.gated : nodeIds.open) : nodeIds.closed}
      data-name={practice.title}
      style={Object.keys(geometry).length ? (geometry as CSSProperties) : undefined}
    >
      {/* 185:256 — "Practice Time:" in Light, title case; the value in Bold capitals. */}
      <p className="rv4-try__eyebrow">
        <span className={`rv4-try__eyebrow-label${isTimeLabel(eyebrowLabel) ? " is-time" : ""}`}>
          {eyebrowLabel}
        </span>
        {eyebrowValue ? (
          <>
            {" "}
            <span className="rv4-try__eyebrow-value">{eyebrowValue}</span>
          </>
        ) : null}
      </p>

      {/* 374:224 */}
      <button
        type="button"
        className="rv4-try__button"
        aria-expanded={isOpen}
        aria-controls={bodyId}
        onClick={() => setIsOpen((v) => !v)}
      >
        {/* 185:265 — Mark's rehaul (28.09) drops the lightbulb chip. */}
        <span className="rv4-try__label">
          <strong className="rv4-try__lead">{titleLead}</strong>
          {titleRest}
        </span>
        {/* 374:232 closed / 374:253 open — "Control / Disc". */}
        <span className="rv4-try__chev" aria-hidden="true">
          <Chevron />
        </span>
      </button>

      {/* 374:235 closed, 374:256 open, 374:276 open & gated */}
      <div className="rv4-try__body" id={bodyId}>
        {!isOpen ? (
          <div className="rv4-try__closed">
            <div className="rv4-try__teaser" ref={teaserRef}>
              <V4Prose blocks={practice.teaser ?? teaserOf(all)} />
            </div>
            {/* 894:7594 "Show all pill" — "Read All", 126x32, at 298 of the card. The
             * accessible name keeps what it opens; it contains the visible words. */}
            <button
              type="button"
              className="rv4-try__open"
              aria-label="Read all of the practice"
              onClick={() => setIsOpen(true)}
            >
              Read all
            </button>
          </div>
        ) : gatedRamp ? (
          <>
            <V4Prose blocks={free} />
            {/* 374:263 onwards. The band owns the click, so a tap anywhere on the
             * blurred practice opens the paywall; the card's CTA only bubbles. */}
            <div className="rv4-try__gate" onClick={guardedUnlock(onUnlock)}>
              {/* 411:5690 — the ramp paragraph, blur fading in over its height. */}
              <div className="rv4-try__ramp" aria-hidden="true" inert>
                <V4Prose blocks={[gatedRamp]} />
                <span className="rv4-pblur" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
              </div>
              {/* 375:220 — the rest, under the full blur, with the card on it. */}
              <div className="rv4-try__rest">
                <div className="rv4-try__blurred" aria-hidden="true" inert>
                  <V4Prose blocks={rest} />
                </div>
                {/* 374:280 */}
                {cardInGate ? null : <V4PremiumCard />}
              </div>
              {/* 375:243 — measured from the gate; see `premiumTopPx`. */}
              {cardInGate ? <V4PremiumCard /> : null}
            </div>
          </>
        ) : (
          <V4Prose blocks={all} />
        )}
      </div>
    </section>
  );
};

export default V4TryThis;
