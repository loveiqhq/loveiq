import type { FC } from "react";
import type { Report3Block } from "@/data/report3-learn-more";
import V4Runs from "./V4Runs";

/**
 * Article body — Report V4, Figma 153:2277.
 *
 * Block level only: paragraphs, the five Lora subheadings, and the one bulleted
 * list. Runs inside a block are V4Runs' job, so bold and italic behave the same
 * here as everywhere else on the page.
 *
 * The margin rhythm is Figma's and lives in CSS, not here: 16px between
 * paragraphs, 26px before a subheading, 14px after one, 8px between list items,
 * nothing after the last block, and nothing under a `tight` paragraph — 244:276
 * stacks three bold questions flush against one another. It is expressed with `:has()` so the rule
 * follows the content rather than needing a flag on each block — the same
 * technique report.css:20521 already uses to find locked sections.
 */

interface Props {
  blocks: readonly Report3Block[];
}

const V4Prose: FC<Props> = ({ blocks }) => (
  <>
    {blocks.map((block, i) => {
      if (block.kind === "heading") {
        return (
          <h4 key={i} className="rv4-prose__h">
            {block.text}
          </h4>
        );
      }
      if (block.kind === "list") {
        // A&B's "five questions" is list-decimal in 235:272; FvR's reality test
        // is list-disc in 244:276. Same geometry, different marker.
        const List = block.ordered ? "ol" : "ul";
        return (
          <List key={i} className={`rv4-prose__list${block.ordered ? " is-ordered" : ""}`}>
            {block.items.map((runs, j) => (
              <li key={j}>
                <V4Runs runs={runs} />
              </li>
            ))}
          </List>
        );
      }
      return (
        <p key={i} className={`rv4-prose__p${block.tight ? " is-tight" : ""}`}>
          <V4Runs runs={block.runs} />
        </p>
      );
    })}
  </>
);

export default V4Prose;
