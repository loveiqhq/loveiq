import type { FC } from "react";
import { archetypeContent } from "@/data/report-archetypes";
import { normalizeReportHtml } from "../reportContent";

/**
 * Closing "Summary" — Figma 10392:25297.
 *
 * The last block of the report: a heading, "You score highest on: <archetype>",
 * then the archetype's core prose. V1 retired its `summary` section, so this
 * renders nothing today; V3 brings it back as the report's closing statement.
 *
 * The prose is `archetypeContent.core_archetype`, which is exactly the copy the
 * frame shows ("The Spark Seeker experiences sexuality primarily as a space
 * for…"). It is third person by design here — it reads as a closing profile
 * rather than as advice to the reader, which is how the frame types it.
 */
interface Props {
  archetype: string;
}

const V3EndSummary: FC<Props> = ({ archetype }) => {
  // Build-time prose generated from the source .docx (data/report-archetypes.ts)
  // — never user input. Rendered through the same `normalizeReportHtml` +
  // `report-prose` path DimensionSection uses for the identical content.
  const html = normalizeReportHtml(archetypeContent.core_archetype?.[archetype] ?? null);
  if (!html) return null;

  return (
    <section className="rv3-endsummary" data-node-id="10392:25297">
      <p className="rv3-endsummary__label">Summary</p>
      <p className="rv3-endsummary__lede">
        You score highest on: <span>&ldquo;{archetype}&rdquo;</span>
      </p>
      <div
        className="report-prose rv3-endsummary__body"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </section>
  );
};

export default V3EndSummary;
