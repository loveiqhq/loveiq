"use client";

import type { FC } from "react";
import type { Report3PartHeading } from "@/data/report3-archetype-page";
import useV4Reveal from "./useV4Reveal";

/**
 * Part heading — Report V4.
 *
 * Figma: "Part 1 - Welcome" 1:169 (divider only) and "Part + Introduction Text"
 * 1:852, which the frame repeats for Parts III–VI. Despite its name, 1:852 holds no
 * lede since the 01.10 sync dropped part introductions; it is the heading in a
 * 185px box.
 *
 * Deliberately separate from `V3PartDivider`, which is built to the older V3 frame
 * (10392:18805) and is still what `?v3=1` renders. V4 keeps that component's exact
 * glow and 48/80px type positions but scales the type down — eyebrow 13→12px
 * (19.2 line-height), title 22→20px (24 line-height) — so restyling the V3 class in
 * place would silently change the live V3 report.
 *
 * Two shapes, chosen by the part's `tall`:
 * - Parts I–II → the 148px stage under a 226px glow (Part I adds a 56px lead-in).
 * - Parts III–VI (`tall`) → a 185px box, the glow shortened to fill it.
 *
 * THE BLOOM (review 27.09, our own, one of two Fatih approved in answer to Mark's
 * "maybe you also have some good ideas"): the glow holds back (`is-pending`) until
 * the heading reaches the screen, then opens on Report 2.0's own part-divider
 * timings. Only the glow moves; the words are there from the start.
 *
 * THE REWORK (Mark, 29.09, 1945090190: "We reworked how we show the Part. Fonts have
 * increased and the font and color of the number has changed. Can you please
 * standardise the padding to the headline and space between "Part" and the number").
 * "Part" in 14px SemiBold, its number beside it in Lora Bold in the brand gradient, the
 * headline in Lora 28. The frames space them six ways; the CSS spaces all six as Part
 * 3's (1:852, where the comment is pinned) does.
 */

interface Props {
  heading: Report3PartHeading;
  /**
   * Part I's divider sits in a 361x204 wrapper — 148 of heading under a 56px
   * lead-in (1:169). Part II's (1:486) is the bare 148 with no lead, and Parts
   * III-VI's 185 box has none either.
   */
  lead?: boolean;
}

const V4PartHeading: FC<Props> = ({ heading, lead: hasLead = false }) => {
  const { number, lead, accent, tone, upright, leadItalic, tall } = heading;
  const [ref, inView] = useV4Reveal<HTMLDivElement>();

  return (
    <div
      ref={ref}
      className={`rv4-part${tall ? " rv4-part--tall" : ""}${hasLead ? " rv4-part--lead" : ""}${
        inView ? "" : " is-pending"
      }`}
      data-node-id={tall ? "1:852" : "1:169"}
      data-name="Part heading"
    >
      <div className="rv4-part__stage">
        <div className="rv4-part__glow" aria-hidden="true" />
        {/* 855:7071 / 855:7072 — "Part", then its number. The space is for assistive
         * tech: the flex row sets the gap. */}
        <p className="rv4-part__eyebrow">
          <span className="rv4-part__word">Part</span>{" "}
          <span className="rv4-part__num">{number}</span>
        </p>
        {/* 1:174 / 1:857 — the lead is upright, the accent italic. The split is the
         * designer's and is not simply the last word ("Your " + "Constellation").
         * Part 2 (1:486) sets its lead italic too; Part 1 (1:174) sets "Welcome"
         * upright. */}
        <h2
          className={`rv4-part__title${tone === "ink" ? " is-ink" : ""}${
            upright ? " is-upright" : ""
          }`}
        >
          {lead ? <span className={leadItalic ? "is-italic" : undefined}>{lead}</span> : null}
          <span>{accent}</span>
        </h2>
      </div>
    </div>
  );
};

export default V4PartHeading;
