import type { FC } from "react";
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
 */

interface Props {
  archetype: string;
  summary: Report3Summary;
}

const V4SummaryChapter: FC<Props> = ({ archetype, summary }) => (
  <section className="rv4-summary" data-node-id="1:736" data-name="Summary Chapter">
    <div className="rv4-summary__inner">
      <h2 className="rv4-summary__heading" data-node-id="1:739">
        Summary of the <span className="rv4-summary__archetype">{archetype}</span>
      </h2>

      <div className="rv4-summary__body" data-node-id="1:740">
        <div className="rv4-summary__copy" data-node-id="1:742">
          {summary.paragraphs.map((runs, i) => (
            <p key={i}>
              <V4Runs runs={runs} />
            </p>
          ))}
        </div>
        <p className="rv4-summary__closer" data-node-id="1:744">
          {summary.closer}
        </p>
      </div>

      {/* 1:745 */}
      <div className="rv4-summary__sep" aria-hidden="true" />

      {/* 1:747 — the 361-wide rating, not the part-level 393 one. */}
      <V4Rating label={`Summary of the ${archetype}`} width={361} />
    </div>
  </section>
);

export default V4SummaryChapter;
