import { Fragment, type FC, type ReactNode } from "react";
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
 *
 * A "\n" inside a run is a line break the frame sets mid-paragraph (Part I's 1:184
 * breaks after "wrong."), so it renders as <br> rather than collapsing to a space.
 *
 * A `veiled` run is a paywall ramp's tail, the part that belongs under the full blur
 * (scrambled in decoy mode; lockedBlurCopy.ts). It sits in its own span, the space
 * before it left outside, so the span's first line box is the line where the tail
 * begins — which is what useRampFit measures.
 */

interface Props {
  runs: readonly Report3Run[];
}

const withBreaks = (text: string) =>
  text.includes("\n")
    ? text.split("\n").map((line, i) => (
        <Fragment key={i}>
          {i > 0 ? <br /> : null}
          {line}
        </Fragment>
      ))
    : text;

const styled = (run: Report3Run, text: string): ReactNode => {
  const isBold = Boolean(run.weight && run.weight >= 700);
  const inner = isBold ? (
    <strong style={{ fontWeight: run.weight }}>{withBreaks(text)}</strong>
  ) : (
    withBreaks(text)
  );
  return run.italic ? <em>{inner}</em> : inner;
};

const V4Runs: FC<Props> = ({ runs }) => (
  <>
    {runs.map((run, i) => {
      if (!run.veiled) return <Fragment key={i}>{styled(run, run.text)}</Fragment>;
      const lead = /^\s*/.exec(run.text)?.[0] ?? "";
      return (
        <Fragment key={i}>
          {lead}
          <span className="rv4-prose__veiled">{styled(run, run.text.slice(lead.length))}</span>
        </Fragment>
      );
    })}
  </>
);

export default V4Runs;
