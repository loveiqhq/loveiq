"use client";

import { useEffect, useId, useRef, useState, type FC, type ReactNode } from "react";
import type { Report3Summary } from "@/data/report3-archetype-page";
import V4Rating from "./V4Rating";
import V4Runs from "./V4Runs";

/**
 * "Summary of the <Archetype>" — Report V4, Figma 1:736, 393x1486.
 *
 * Deliberately NOT `V3EndSummary`. That component takes only an archetype name and
 * renders whatever `data/report-archetypes.ts` holds for it, so it cannot show the
 * frame's copy — and it runtime-imports that 1 MB premium module without a
 * "use client" boundary of its own, which is a separate problem raised with Eman.
 *
 * Structure: heading 1:738 (Lora 18/21.6, archetype name in --rv3-name-ink) ·
 * body 1:742 · closing line 1:744 · a 20px separator 1:745 · the rating 1:747,
 * which is the 361-wide variant here rather than the part-level 393 one.
 *
 * THE FOLD (Mark, 29.09, 1945263585: "Lets have the Summary text fade + CTA please" —
 * his own 28.09 idea, 1944189426, with Marcus's grey label). 882:7539 opens on 24
 * lines of the copy, the last of them fading to white, and the 86x31 "Show All" pill
 * the A&B cards and the fantasy table use. One tap opens it for good, as theirs do,
 * and focus moves to the copy, since the pill leaves with the fold. The copy is free
 * and all of it is on the page from the start: the fold is a way to read it, not a
 * gate. The frame is a phone's, so from 700 up the CSS leaves the copy unfolded.
 */

interface Props {
  archetype: string;
  summary: Report3Summary;
  /**
   * Replaces the rating row. The live report passes its own "Does this resonate?"
   * widget, which posts to /api/report-feedback; `V4Rating` only records locally.
   */
  feedback?: ReactNode;
}

const V4SummaryChapter: FC<Props> = ({ archetype, summary, feedback }) => {
  const [open, setOpen] = useState(false);
  const copyRef = useRef<HTMLDivElement>(null);
  /** Set by the pill: once the fold has gone, focus goes to the copy. */
  const opened = useRef(false);
  const copyId = useId();

  useEffect(() => {
    if (!open || !opened.current) return;
    opened.current = false;
    copyRef.current?.focus();
  }, [open]);

  return (
    <section
      className={`rv4-summary${open ? "" : " is-collapsed"}`}
      data-node-id="1:736"
      data-name="Summary Chapter"
    >
      <div className="rv4-summary__inner">
        <h2 className="rv4-summary__heading" data-node-id="1:739">
          Summary of the <span className="rv4-summary__archetype">{archetype}</span>
        </h2>

        <div className="rv4-summary__body" data-node-id="1:740">
          {/* 882:7544 — the copy, and while folded its fade (882:7535) and pill (961:303). */}
          <div className="rv4-summary__fold">
            <div
              className="rv4-summary__copy"
              data-node-id="1:742"
              id={copyId}
              ref={copyRef}
              tabIndex={-1}
            >
              {summary.paragraphs.map((runs, i) => (
                <p key={i}>
                  <V4Runs runs={runs} />
                </p>
              ))}
            </div>
            {open ? null : (
              <>
                <span className="rv4-summary__fade" aria-hidden="true" />
                <button
                  type="button"
                  className="rv4-summary__pill"
                  aria-controls={copyId}
                  aria-label="Show all of the summary"
                  onClick={() => {
                    opened.current = true;
                    setOpen(true);
                  }}
                >
                  <span className="rv4-summary__pill-label">Show all</span>
                </button>
              </>
            )}
          </div>
          {/* On the page folded or not; the CSS keeps it below a phone's fold. */}
          {summary.closer ? (
            <p className="rv4-summary__closer" data-node-id="1:744">
              {summary.closer}
            </p>
          ) : null}
        </div>

        {/* 1:745 */}
        <div className="rv4-summary__sep" aria-hidden="true" />

        {/* 1:747 — the 361-wide rating, not the part-level 393 one. A live widget
         * takes the same geometry: right-aligned row, then the frame's 44px tail. */}
        {feedback ? (
          <div className="rv4-rating">
            <div className="rv4-rating__live">{feedback}</div>
            <div className="rv4-rating__tail" aria-hidden="true" />
          </div>
        ) : (
          <V4Rating label={`Summary of the ${archetype}`} width={361} />
        )}
      </div>
    </section>
  );
};

export default V4SummaryChapter;
