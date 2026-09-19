import type { FC } from "react";
import type { Report3PartHeading } from "@/data/report3-archetype-page";

/**
 * Part heading — Report V4.
 *
 * Figma: "Part 1 - Welcome" 1:169 (divider only) and "Part + Introduction Text"
 * 1:852 (divider plus a lede), which the frame repeats for Parts III–VI.
 *
 * Deliberately separate from `V3PartDivider`, which is built to the older V3 frame
 * (10392:18805) and is still what `?v3=1` renders. V4 keeps that component's exact
 * glow and 48/80px type positions but scales the type down — eyebrow 13→12px
 * (19.2 line-height), title 22→20px (24 line-height) — so restyling the V3 class in
 * place would silently change the live V3 report.
 *
 * Two shapes, chosen by whether `intro` is supplied:
 * - no intro  → 148px tall, 56px of lead-in above it, accent in near-black (Part I).
 * - intro     → the glow box shortens 226→185px and a lede paragraph follows it.
 */

interface Props {
  heading: Report3PartHeading;
  /**
   * The part's lede. The frame draws `[Part Introductory Text]` for all four parts
   * that have one, so that placeholder is what ships until Mark writes them.
   */
  intro?: string;
  /**
   * Part I's divider sits in a 361x204 wrapper — 148 of heading under a 56px
   * lead-in (1:169). Part II's (1:486) is the bare 148 with no lead, and Parts
   * III-VI use the intro variant, which has none either.
   */
  lead?: boolean;
}

const V4PartHeading: FC<Props> = ({ heading, intro, lead: hasLead = false }) => {
  const { eyebrow, lead, accent, tone } = heading;
  const withIntro = intro !== undefined;

  return (
    <div
      className={`rv4-part${withIntro ? " rv4-part--intro" : ""}${hasLead ? " rv4-part--lead" : ""}`}
      data-node-id={withIntro ? "1:852" : "1:169"}
      data-name="Part heading"
    >
      <div className="rv4-part__stage">
        <div className="rv4-part__glow" aria-hidden="true" />
        {/* 1:173 / 1:856 */}
        <p className="rv4-part__eyebrow">{eyebrow}</p>
        {/* 1:174 / 1:857 — the lead is upright, the accent italic. The split is the
         * designer's and is not simply the last word ("Your " + "Constellation"). */}
        <h2 className={`rv4-part__title${tone === "ink" ? " is-ink" : ""}`}>
          {lead ? <span>{lead}</span> : null}
          <span>{accent}</span>
        </h2>
        {withIntro ? <p className="rv4-part__intro rv3-prose">{intro}</p> : null}
      </div>
    </div>
  );
};

export default V4PartHeading;
