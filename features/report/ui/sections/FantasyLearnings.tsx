import type { FC } from "react";

import { FANTASY_LEARNINGS } from "@/data/report2-fantasy-context";

/**
 * The three learnings above the Fantasy vs. Reality map.
 *
 * Mark's document comment asked the top of that chapter to carry three learnings
 * before the graph: the relational container, why a fantasy can feel safer with a
 * stranger, and living vs not living one. Every paragraph is a green-highlighted
 * paragraph from chapters 25 and 26, verbatim and in document order — see
 * `data/report2-fantasy-context.ts`.
 *
 * Its own component rather than markup inside `FantasySection` because it is
 * entirely universal — it says nothing about this reader, which the map below it
 * does — so it can be rendered and reviewed on its own.
 */
const FantasyLearnings: FC = () => (
  <div className="report-fantasy__learnings">
    {FANTASY_LEARNINGS.map((learning, i) => (
      <section key={learning.title} className="report-fantasy__learning">
        <p className="report-fantasy__learning-eyebrow">
          <span className="report-fantasy__learning-num" aria-hidden="true">
            {i + 1}
          </span>
          {learning.title}
        </p>
        {learning.paras.map((para, j) => (
          <p key={j} className="report-fantasy__learning-para">
            {para}
          </p>
        ))}
        {/* Chapter 26 closes on four questions. A list, not four more paragraphs
            — they are things to ask yourself, and they read as a wall otherwise. */}
        {learning.questions ? (
          <>
            {learning.questionsLead ? (
              <p className="report-fantasy__learning-para">{learning.questionsLead}</p>
            ) : null}
            <ul className="report-fantasy__learning-questions">
              {learning.questions.map((q, j) => (
                <li key={j} className="report-fantasy__learning-question">
                  {q}
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </section>
    ))}
  </div>
);

export default FantasyLearnings;
