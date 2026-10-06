"use client";

import Image from "next/image";
import { useId, useRef, useState, type CSSProperties, type FC } from "react";
import type { Report3Block, Report3LearnMoreView } from "@/data/report3-learn-more";
import V4BackToTop from "./V4BackToTop";
import V4PremiumCard from "./V4PremiumCard";
import V4Prose from "./V4Prose";
import { useTeaserFade } from "./useTeaserFade";
import { guardedUnlock } from "./v4Unlock";

/**
 * "Learn more & go deeper" — the long-form article inside a chapter (the label
 * read "Go deeper & learn more" until Mark's rehaul of 28.09).
 *
 * One component, three states, all drawn in Figma:
 *   153:2240  closed          teaser clamped to 196px, faded, "Read All" pill
 *   153:2260  expanded        the whole article, no gate
 *   153:2280  expanded+gated  free copy, then a blurred 580px window, a fade,
 *                             "Show All", and the Premium card over it
 *
 * THE CLOSED STATE IS NEVER GATED. 153:2240 draws no paywall, so a locked and an
 * unlocked reader see the same teaser and the same link. The wall appears only on
 * expand, which is what makes it a conversion surface rather than a bounce.
 *
 * ON THE BLUR. The gated window is real text under the blur (--rv4-veil), which
 * is a paint effect and nothing more — LockedPreviewImage.tsx:6-12 says so. What
 * makes that safe is not the blur but `article.gated`: the server hands a locked
 * reader only the few blocks the window can actually show (see
 * splitArticleForReader in contentGating.ts), and `gated: null` renders the same
 * window, fade, link and card at the same height with nothing inside. So the
 * component never decides what may be read; it only decides how it looks.
 *
 * ON THE BACK-TO-TOP CONTROL. Expanded, 153:2260 is 11,624px — about eleven phone
 * screens — and the only way back to the collapse control was to flick upwards for
 * several seconds. V4BackToTop shows from the moment the article opens and returns
 * the reader to the card head (on the phone: from 700px it stays mounted but is not
 * drawn, per Mark's desktop review). It is mounted only while open, because closed the
 * card is 341px and there is nothing to come back from; for a locked reader it sits
 * before the gate, so its sticky range ends with the free copy.
 */

/**
 * How many blocks sit behind the closed state's 196px clamp.
 *
 * Since the rehaul every frame clamps to 196 (A&B's own teaser, 202), whatever
 * falls inside it. Two blocks over-fill the box for any plausible copy, and
 * rendering only those keeps what a screen reader announces in step with what a
 * sighted reader can see.
 */
const TEASER_BLOCKS = 2;

/**
 * 230:282 sets "Reading time:" in Light and the value in Bold, so the eyebrow is
 * split at its first colon. Copy without a colon renders as one run.
 */
export const splitEyebrow = (text: string): [string, string] => {
  const colon = text.indexOf(":");
  return colon < 0 ? [text, ""] : [text.slice(0, colon + 1), text.slice(colon + 1).trim()];
};

/**
 * Mark's rehaul (28.09): "Practice Time:" / "Reading Time:" in title case, which a
 * label of any other kind must not get — the Report 2.0 practices carry their own
 * titles as the eyebrow, set as written.
 */
export const isTimeLabel = (label: string) => /\btime:$/i.test(label.trim());

/**
 * 185:265 / 153:2253 — the title's lead in Bold, the rest in Regular: "Try this" | " &
 * see what shifts", "Learn more" | " & go deeper". Split at the first " & "; a title
 * without one is all lead.
 */
export const splitTitle = (title: string): [string, string] => {
  const at = title.indexOf(" & ");
  return at < 0 ? [title, ""] : [title.slice(0, at), title.slice(at)];
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

/**
 * The paragraph a mid-paragraph wall divides, whole again. The server hands the
 * halves over apart for everyone, so the free copy is identical either side of
 * the wall; the tail arrives without the space it opened on.
 */
const rejoin = (free: readonly Report3Block[], gated: readonly Report3Block[]): Report3Block[] => {
  const head = free.at(-1);
  const tail = gated[0];
  if (head?.kind !== "para" || tail?.kind !== "para") return [...free, ...gated];
  return [
    ...free.slice(0, -1),
    { kind: "para", runs: [...head.runs, { text: " " }, ...tail.runs] },
    ...gated.slice(1),
  ];
};

const V4LearnMore: FC<Props> = ({ article, locked = false, onUnlock, defaultOpen = false }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const bodyId = useId();
  const sectionRef = useRef<HTMLElement>(null);
  // The closed teaser greys its last three lines, wherever they fall.
  const teaserRef = useRef<HTMLDivElement>(null);
  useTeaserFade(teaserRef, !isOpen);
  const [eyebrowLabel, eyebrowValue] = splitEyebrow(article.eyebrow);
  const [titleLead, titleRest] = splitTitle(article.label);

  // `.rv4-doc` runs on copyable non-prod deploys, so a drag that ends inside the
  // card must not open the paywall — see v4Unlock.ts.
  const openPaywall = guardedUnlock(onUnlock);
  // 482:6479 — an article's own gate. The other articles keep 173:230's in CSS, so
  // their cards carry no inline style — but for 235:317's Premium card, 88 into it.
  const closedGeometry: Record<string, string> = article.gate
    ? {
        "--rv4-learn-band": `${article.gate.bandPx}px`,
        "--rv4-learn-window": `${article.gate.windowPx}px`,
        "--rv4-learn-premium-top": `${article.gate.premiumTopPx}px`,
        "--rv4-learn-pill-bottom": `${article.gate.pillBottomPx}px`,
        ...(article.gate.footPx !== undefined
          ? { "--rv4-learn-foot": `${article.gate.footPx}px` }
          : {}),
      }
    : article.premiumTopPx !== undefined
      ? { "--rv4-learn-premium-top": `${article.premiumTopPx}px` }
      : {};
  const nodes = article.nodeIds ?? { closed: "153:2240", open: "153:2260", gated: "153:2280" };
  const marks = [
    ...(article.gate ? ["has-own-gate"] : []),
    ...(article.gate && !article.gate.fade ? ["no-fade"] : []),
    ...(article.continued ? ["is-continued"] : []),
  ];

  return (
    <section
      ref={sectionRef}
      className={["rv4-learn", ...(isOpen ? ["is-open"] : []), ...marks].join(" ")}
      data-node-id={isOpen ? (locked ? nodes.gated : nodes.open) : nodes.closed}
      data-name="Learn more & go deeper"
      style={Object.keys(closedGeometry).length ? (closedGeometry as CSSProperties) : undefined}
    >
      {/* 230:284 — "Reading Time:" Light in title case, the value Bold in capitals. */}
      <p className="rv4-learn__eyebrow">
        <span className={`rv4-learn__eyebrow-label${isTimeLabel(eyebrowLabel) ? " is-time" : ""}`}>
          {eyebrowLabel}
        </span>
        {eyebrowValue ? (
          <>
            {" "}
            <span className="rv4-learn__eyebrow-value">{eyebrowValue}</span>
          </>
        ) : null}
      </p>

      {/* 153:2247 */}
      <button
        type="button"
        className="rv4-learn__button"
        aria-expanded={isOpen}
        aria-controls={bodyId}
        onClick={() => setIsOpen((v) => !v)}
      >
        {/* 153:2272 — no chip since the rehaul; the title is centred on the disc. */}
        <span className="rv4-learn__label">
          <strong className="rv4-learn__lead">{titleLead}</strong>
          {titleRest}
        </span>
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
              ref={teaserRef}
              style={
                article.teaserHeightPx
                  ? ({ "--rv4-teaser-h": `${article.teaserHeightPx}px` } as CSSProperties)
                  : undefined
              }
            >
              <V4Prose blocks={article.teaser ?? article.free.slice(0, TEASER_BLOCKS)} />
            </div>
            {/* 907:7664's "Read All" — 126x32, outlined, at 292 of the card on the phone;
             * from 700px it follows the copy. The name says what it opens; the visible
             * words lead it. */}
            <button
              type="button"
              className="rv4-learn__open"
              aria-label="Read all of the article"
              onClick={() => setIsOpen(true)}
            >
              Read all
            </button>
          </>
        ) : (
          <>
            {/* A wall inside a paragraph runs the window straight on from the free
             * copy, so the free copy's last line carries no paragraph gap; and a
             * reader past the wall reads the paragraph whole, as 244:258 sets it. */}
            {!locked ? (
              <V4Prose
                blocks={
                  article.continued && article.gated
                    ? rejoin(article.free, article.gated)
                    : [...article.free, ...(article.gated ?? [])]
                }
              />
            ) : article.continued ? (
              <div className="rv4-learn__free">
                <V4Prose blocks={article.free} />
              </div>
            ) : (
              <V4Prose blocks={article.free} />
            )}

            {/* A locked article's Back to top rides only the readable copy: it
             * sits before the gate, so it docks where the free text ends and never
             * lands on the gate's CTA (review 24.09: "they are covering each other"). */}
            {locked ? <V4BackToTop targetRef={sectionRef} /> : null}
            {locked ? (
              /* 173:230. The band owns the click so a tap anywhere on the blurred
               * block opens the paywall, which is why neither the card's CTA nor
               * the pill under the fade carries its own handler. */
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
                {/* 931:8110 "Show All" — cannot reveal anything, so it opens the paywall
                 * too: it bubbles to the band. */}
                <button
                  type="button"
                  className="rv4-learn__showmore"
                  aria-label="Show all of the article"
                >
                  <span className="rv4-learn__showmore-label">Show all</span>
                </button>
                <V4PremiumCard />
              </div>
            ) : null}
          </>
        )}
      </div>

      {isOpen && !locked ? <V4BackToTop targetRef={sectionRef} /> : null}
    </section>
  );
};

export default V4LearnMore;
