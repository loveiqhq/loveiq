import { Fragment, type FC } from "react";
import type { Report3Run } from "@/data/report3-archetype-page";

/**
 * Weighted text runs — Report V4.
 *
 * The frame mixes Regular, Bold and ExtraBold inside single paragraphs (1:742,
 * 1:580), so emphasis cannot be modelled as "the first sentence is bold". Each run
 * carries its own weight and renders as a `<strong>` only when it is actually
 * emphasised, which keeps the semantics honest for a screen reader.
 *
 * The learn-more article (153:2277) adds italic: it sets every quoted belief in
 * Plus Jakarta Sans Italic at the same size and leading, which weight cannot
 * express. A run may carry both, so the two wrappers nest rather than exclude.
 */

interface Props {
  runs: readonly Report3Run[];
}

const V4Runs: FC<Props> = ({ runs }) => (
  <>
    {runs.map((run, i) => {
      const isBold = Boolean(run.weight && run.weight >= 700);
      if (!isBold && !run.italic) return <Fragment key={i}>{run.text}</Fragment>;
      const inner = isBold ? (
        <strong style={{ fontWeight: run.weight }}>{run.text}</strong>
      ) : (
        run.text
      );
      return run.italic ? <em key={i}>{inner}</em> : <Fragment key={i}>{inner}</Fragment>;
    })}
  </>
);

export default V4Runs;
