"use client";

import Image from "next/image";
import { useId, useRef, useState, type CSSProperties, type FC } from "react";
import type { Report3LearnMoreView } from "@/data/report3-learn-more";
import V4BackToTop from "./V4BackToTop";
import V4PremiumCard from "./V4PremiumCard";
import V4Prose from "./V4Prose";

/**
 * "Go deeper & learn more" — the long-form article inside a chapter.
 *
 * One component, three states, all drawn in Figma:
 *   153:2240  closed          teaser clamped to 240px, faded, "Read the full article" pill
 *   153:2260  expanded        the whole article, no gate
 *   153:2280  expanded+gated  free copy, then a blurred 580px window, a fade,
 *                             "Show More", and the Premium content card over it
 *
 * THE CLOSED STATE IS NEVER GATED. 153:2240 draws no paywall, so a locked and an
 * unlocked reader see the same teaser and the same link. The wall appears only on
 * expand, which is what makes it a conversion surface rather than a bounce.
 *
 * ON THE BLUR. The gated window is real text under `filter: blur(2.5px)`, which
 * is a paint effect and nothing more — LockedPreviewImage.tsx:6-12 says so. What
 * makes that safe is not the blur but `article.gated`: the server hands a locked
 * reader only the few blocks the window can actually show (see
 * splitArticleForReader in contentGating.ts), and `gated: null` renders the same
 * window, fade, link and card at the same height with nothing inside. So the
 * component never decides what may be read; it only decides how it looks.
 *
 * ON THE BACK-TO-TOP CONTROL. Expanded, 153:2260 is 11,624px — about eleven phone
 * screens — and the only way back to the collapse control was to flick upwards for
 * several seconds. V4BackToTop appears once the card head has passed a screen above
 * the fold and returns the reader to it. It is mounted only while open, because
 * closed the card is 341px and there is nothing to come back from.
 */

/**
 * How many blocks sit behind the closed state's 240px clamp.
 *
 * Every frame draws ten lines of copy. Whether that measures 240px (153:2240,
 * 244:238 — ten lines plus one 16px paragraph gap) or 224px (235:234 — ten lines,
 * no gap) depends only on where the paragraph boundary falls, which is why the
 * clamp is per-article. Two blocks over-fill the box for any plausible copy, and
 * rendering only those keeps what a screen reader announces in step with what a
 * sighted reader can see.
 */
const TEASER_BLOCKS = 2;

/**
 * 230:282 sets "Reading time:" in Light and the value in Bold, so the eyebrow is
 * split at its first colon. Copy without a colon renders as one run.
 */
const splitEyebrow = (text: string): [string, string] => {
  const colon = text.indexOf(":");
  return colon < 0 ? [text, ""] : [text.slice(0, colon + 1), text.slice(colon + 1).trim()];
};

interface Props {
  article: Report3LearnMoreView;
  /**
   * Computed by the host from `isLearnMoreArticleLocked`, never in the V4 tree —
   * the same division `app/api/report/route.ts` already uses for every section.
   */
  locked?: boolean;
  /** Opens the paywall. Omitted in the standalone preview, where it is inert. */
  onUnlock?: () => void;
  defaultOpen?: boolean;
}

const V4LearnMore: FC<Props> = ({ article, locked = false, onUnlock, defaultOpen = false }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const bodyId = useId();
  const sectionRef = useRef<HTMLElement>(null);
  const [eyebrowLabel, eyebrowValue] = splitEyebrow(article.eyebrow);

  const openPaywall = () => {
    // `.rv4-doc` runs on copyable non-prod deploys, so a drag that ends inside
    // the card must not open the paywall. Same guard as PremiumOverlay.tsx:146.
    if (typeof window !== "undefined" && window.getSelection()?.toString()) return;
    onUnlock?.();
  };

  return (
    <section
      ref={sectionRef}
      className={`rv4-learn${isOpen ? " is-open" : ""}`}
      data-node-id={isOpen ? (locked ? "153:2280" : "153:2260") : "153:2240"}
      data-name="Go deeper & learn more"
    >
      {/* 230:282 — the layer is named "Adding the right new input genuinely works
       * for you"; the text is the reading time. Names in this file are stale. */}
      <p className="rv4-learn__eyebrow">
        {eyebrowValue ? (
          <>
            <span className="rv4-learn__eyebrow-label">{eyebrowLabel}</span> {eyebrowValue}
          </>
        ) : (
          eyebrowLabel
        )}
      </p>

      {/* 153:2247 */}
      <button
        type="button"
        className="rv4-learn__button"
        aria-expanded={isOpen}
        aria-controls={bodyId}
        onClick={() => setIsOpen((v) => !v)}
      >
        <span className="rv4-learn__chip" aria-hidden="true">
          <Image src="/report/v3/learn/chip-book.svg" alt="" width={17} height={17} unoptimized />
        </span>
        <span className="rv4-learn__label">{article.label}</span>
        {/* 299:242 "Control / Disc" — the chevron in a 34px lavender disc. */}
        <span className="rv4-learn__chev" aria-hidden="true">
          <Image src="/report/v3/learn/chevron.svg" alt="" width={15} height={15} unoptimized />
        </span>
      </button>

      {/* 153:2257 when closed, 153:2277 when open */}
      <div className="rv4-learn__body" id={bodyId}>
        {!isOpen ? (
          <>
            <div
              className="rv4-learn__teaser"
              style={
                article.teaserHeightPx
                  ? ({ "--rv4-teaser-h": `${article.teaserHeightPx}px` } as CSSProperties)
                  : undefined
              }
            >
              <V4Prose blocks={article.free.slice(0, TEASER_BLOCKS)} />
            </div>
            {/* 456:261 "Show all pill — article" — Mark's standardised CTA for every
             * Go deeper teaser: a 163x32 outlined pill over the fade. */}
            <button type="button" className="rv4-learn__open" onClick={() => setIsOpen(true)}>
              Read the full article
            </button>
          </>
        ) : (
          <>
            <V4Prose blocks={article.free} />

            {locked ? (
              /* 173:230. The band owns the click so a tap anywhere on the blurred
               * block opens the paywall, which is why neither the card's CTA nor
               * "Show More" carries its own handler. */
              <div className="rv4-learn__gate" onClick={openPaywall}>
                <div className="rv4-learn__gated" aria-hidden="true" inert>
                  {article.gated ? <V4Prose blocks={article.gated} /> : null}
                </div>
                {/* 411:5694 + 170:231 — the progressive blur, laid over the copy. */}
                <span className="rv4-learn__blur" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
                <span className="rv4-learn__fade" aria-hidden="true" />
                {/* 230:238 — cannot reveal anything, so it opens the paywall too. */}
                <button type="button" className="rv4-learn__showmore">
                  Show More
                </button>
                <V4PremiumCard />
              </div>
            ) : article.gated ? (
              <V4Prose blocks={article.gated} />
            ) : null}
          </>
        )}
      </div>

      {isOpen ? <V4BackToTop targetRef={sectionRef} /> : null}
    </section>
  );
};

export default V4LearnMore;
