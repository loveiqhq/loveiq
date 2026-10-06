"use client";

import type { FC } from "react";
import type { SurveyQuestion } from "@/data/survey-data";

/**
 * Staging only — Mark, 30.09: "Is there a way that I can jump to specific questions
 * rather than having to go through the entire survey?"
 *
 * A dropdown of every question the engine asks, in the order it asks them, grouped by
 * chapter. Picking one moves the engine there the way Previous and Next do (its goTo);
 * the answers given so far stay. SurveyEngine mounts it only where isNonProdDeploy()
 * holds — staging, Vercel previews and local dev, never the live site.
 *
 * Folded in a <details> until someone opens it, so the survey looks as it does for
 * respondents, and the option list stays out of the page's text for anything reading
 * it (the persona walkers do).
 */

interface SurveyJumpMenuProps {
  /** The questions the engine asks, in its order (SurveyEngine's orderedQuestions). */
  questions: readonly SurveyQuestion[];
  currentIndex: number;
  onJump: (index: number) => void;
}

/** Whole words to this many characters, then an ellipsis. */
const LABEL_CHARS = 64;

const clip = (text: string): string => {
  if (text.length <= LABEL_CHARS) return text;
  const cut = text.slice(0, LABEL_CHARS);
  const lastSpace = cut.lastIndexOf(" ");
  const words = lastSpace > 0 ? cut.slice(0, lastSpace) : cut;
  return `${words.replace(/[\s,;:.–—-]+$/, "")}…`;
};

interface ChapterRun {
  chapter: string;
  items: { question: SurveyQuestion; index: number }[];
}

/** Runs of consecutive questions in one chapter; a chapter the survey returns to opens a new run. */
const chapterRuns = (questions: readonly SurveyQuestion[]): ChapterRun[] =>
  questions.reduce<ChapterRun[]>((runs, question, index) => {
    const last = runs[runs.length - 1];
    if (last && last.chapter === question.chapter) last.items.push({ question, index });
    else runs.push({ chapter: question.chapter, items: [{ question, index }] });
    return runs;
  }, []);

const SurveyJumpMenu: FC<SurveyJumpMenuProps> = ({ questions, currentIndex, onJump }) => (
  <details
    className="rounded-xl border border-dashed border-amber-500/60 bg-amber-50/80 px-3 py-2 text-xs text-amber-900"
    data-staging-tool="survey-jump"
  >
    <summary className="cursor-pointer select-none font-semibold">
      {`Staging · Jump to question (${currentIndex + 1} of ${questions.length})`}
    </summary>
    <select
      aria-label="Jump to question"
      className="mt-2 w-full rounded-lg border border-amber-500/40 bg-white py-2 pl-2 pr-8 text-base text-neutral-900"
      value={currentIndex}
      onChange={(event) => onJump(Number(event.target.value))}
    >
      {chapterRuns(questions).map((run) => (
        <optgroup key={`${run.items[0]!.index}-${run.chapter}`} label={run.chapter}>
          {run.items.map(({ question, index }) => (
            <option key={question.qId} value={index}>
              {`${index + 1}. ${question.qId} · ${clip(question.question)}`}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  </details>
);

export default SurveyJumpMenu;
