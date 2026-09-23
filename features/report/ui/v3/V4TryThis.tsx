"use client";

import { useId, useState, type FC } from "react";
import type { Report3Block } from "@/data/report3-learn-more";
import type { Report3PracticeView } from "@/data/report3-typical-beliefs";
import { splitEyebrow } from "./V4LearnMore";
import V4PremiumCard from "./V4PremiumCard";
import V4Prose from "./V4Prose";
import { guardedUnlock } from "./v4Unlock";

/**
 * "Try this & see what shifts" — the practice card that closes the Typical
 * Beliefs chapter body, above "Go deeper & learn more".
 *
 * One component, three states, all drawn in Figma:
 *   374:217  closed          teaser clamped to 218px, faded, "Read the full practice" pill
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
 * (clear), `ramp` (the block the blur fades in over — real copy, and also the tail
 * of the teaser) and `rest`, which it has already scrambled: same shape under the
 * blur, no content. This component decides how that looks, never what may be read.
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

/** 374:226 — the lightbulb, from vectors 374:227 and 374:228. */
const Bulb: FC = () => (
  <svg viewBox="0 0 17 17" fill="none">
    <path
      transform="translate(3.72 1.8)"
      d="M5.0696 0C3.9873-.0018 2.9329.3434 2.0611.985 1.1894 1.6266.5463 2.5307.2263 3.5647-.0937 4.5986-.0739 5.708.283 6.7298.6398 7.7516 1.3149 8.6322 2.209 9.2421 2.7591 9.6382 3.0892 10.2323 3.0892 10.8925V11.2226H7.0501V10.8925C7.0501 10.2323 7.3802 9.6382 7.9303 9.2421 8.8244 8.6322 9.4995 7.7516 9.8563 6.7298 10.2132 5.708 10.233 4.5986 9.913 3.5647 9.5929 2.5307 8.9499 1.6266 8.0782.985 7.2064.3434 6.152-.0018 5.0696 0Z"
      stroke="currentColor"
      strokeWidth="1.1333"
      strokeLinejoin="round"
    />
    <path d="M7.2 15.36H10.5008" stroke="currentColor" strokeWidth="1.1333" strokeLinecap="round" />
  </svg>
);

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
}

const V4TryThis: FC<Props> = ({ practice, onUnlock, defaultOpen = false }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const bodyId = useId();
  const [eyebrowLabel, eyebrowValue] = splitEyebrow(practice.eyebrow);
  const { free, ramp, rest } = practice;
  const all = [...free, ...(ramp ? [ramp] : []), ...rest];
  // A ramp only ever arrives for a locked reader; unlocked, everything is `free`.
  const gatedRamp = practice.locked ? ramp : null;

  return (
    <section
      className={`rv4-try${isOpen ? " is-open" : ""}`}
      data-node-id={isOpen ? (gatedRamp ? "374:258" : "374:238") : "374:217"}
      data-name="Try this & see what shifts"
    >
      {/* 374:221 — "Practice time:" in Light, the value in Bold. */}
      <p className="rv4-try__eyebrow">
        {eyebrowValue ? (
          <>
            <span className="rv4-try__eyebrow-label">{eyebrowLabel}</span> {eyebrowValue}
          </>
        ) : (
          eyebrowLabel
        )}
      </p>

      {/* 374:224 */}
      <button
        type="button"
        className="rv4-try__button"
        aria-expanded={isOpen}
        aria-controls={bodyId}
        onClick={() => setIsOpen((v) => !v)}
      >
        <span className="rv4-try__chip" aria-hidden="true">
          <Bulb />
        </span>
        <span className="rv4-try__label">{practice.title}</span>
        {/* 374:232 closed / 374:253 open — "Control / Disc". */}
        <span className="rv4-try__chev" aria-hidden="true">
          <Chevron />
        </span>
      </button>

      {/* 374:235 closed, 374:256 open, 374:276 open & gated */}
      <div className="rv4-try__body" id={bodyId}>
        {!isOpen ? (
          <div className="rv4-try__closed">
            <div className="rv4-try__teaser">
              <V4Prose blocks={teaserOf(all)} />
            </div>
            {/* 452:295 "Show all pill" — Mark's standard 163x32 teaser CTA. */}
            <button type="button" className="rv4-try__open" onClick={() => setIsOpen(true)}>
              Read the full practice
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
                <V4PremiumCard />
              </div>
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
