import type { FC, ReactNode } from "react";

/**
 * A run of prose where the spacing BETWEEN each pair is set deliberately.
 *
 * Mark's 2026-08-27 pass asked for this in seven places at once, in three
 * different flavours, always about the same thing: passages that belong together
 * were reading as separate notes because every paragraph got the same generous
 * gap.
 *
 *   - `"para"`  — a new paragraph, full gap. The default.
 *   - `"break"` — a line break: new line, tight gap, still its own paragraph so it
 *                 stays readable and selectable. This is "follow each other with a
 *                 line break, not an empty line".
 *   - `"join"`  — no break at all; the text continues the previous paragraph after
 *                 a space. This is "combine the two so they follow each other
 *                 without a line break".
 *
 * Why a component rather than CSS on each section: the three flavours have to be
 * chosen per PAIR, from the copy, and the same decision recurs in Beliefs,
 * Confidence, Reward, Attachment, Energy and the two fantasy blocks. One place to
 * change the gaps, and the choice sits next to the copy it applies to.
 *
 * `className` is the section's own paragraph class, so type and colour stay the
 * section's; this component only owns the vertical rhythm.
 */

export type ProseSpacing = "para" | "break" | "join";

export interface ProseItem {
  text: string;
  /** How this item follows the one before it. Ignored on the first item. */
  follows?: ProseSpacing;
}

interface Props {
  items: ProseItem[];
  /** The section's paragraph class, e.g. `report-reward__insert`. */
  className: string;
}

/**
 * Fold `"join"` items into the previous paragraph, so what renders is one <p> per
 * visual paragraph rather than one per source string.
 */
function fold(items: ProseItem[]): { text: string; tight: boolean }[] {
  const out: { text: string; tight: boolean }[] = [];
  for (const item of items) {
    if (!item.text) continue;
    const last = out[out.length - 1];
    if (last && item.follows === "join") {
      last.text = `${last.text} ${item.text}`;
      continue;
    }
    out.push({ text: item.text, tight: !!last && item.follows === "break" });
  }
  return out;
}

const ProseGroup: FC<Props> = ({ items, className }) => {
  const paras = fold(items);
  if (paras.length === 0) return null;

  return (
    <>
      {paras.map((p, i) => (
        <p key={i} className={`${className}${p.tight ? " report-prose--tight" : ""}`}>
          {p.text}
        </p>
      ))}
    </>
  );
};

export default ProseGroup;

/** Convenience for the common case: first paragraph, then all the rest tight. */
export function firstThenTight(texts: (string | null | undefined)[]): ProseItem[] {
  return texts
    .filter((t): t is string => !!t)
    .map((text, i) => ({ text, follows: i === 0 ? "para" : ("break" as ProseSpacing) }));
}

/** Convenience: join the first two into one paragraph, then the rest tight. */
export function joinFirstTwo(texts: (string | null | undefined)[]): ProseItem[] {
  const kept = texts.filter((t): t is string => !!t);
  return kept.map((text, i) => ({
    text,
    follows: i === 0 ? "para" : i === 1 ? "join" : ("break" as ProseSpacing),
  }));
}
