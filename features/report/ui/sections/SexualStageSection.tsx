"use client";

import { type FC } from "react";
import SexualStageExplorer from "./SexualStageExplorer";
import { resolveStageId, STAGES } from "@/data/report2-stages";

/**
 * Server-resolved Stage copy slots (`getReport2Section(name, "stage")`). The
 * 634KB copy module is server-only, so these are threaded down as props (see
 * `app/api/report/route.ts` → `stageCopy`). Labels are universal; `result` +
 * the row/practical values are per-archetype. Every field is optional so an
 * archetype with a stub still renders.
 */
export interface StageCopy {
  eyebrow?: string;
  result?: string;
  "row1.label"?: string;
  "row1.value"?: string;
  "row2.label"?: string;
  "row2.value"?: string;
  "row3.label"?: string;
  "row3.value"?: string;
  "practical.label"?: string;
  "practical.body"?: string;
}

interface Props {
  userStageLabel: string | null;
  copy: StageCopy | null;
}

/**
 * Split the practical body into a lead sentence + a short trailing phrase. The
 * Figma "Main Need Right Now" tile renders the last sentence as an italic Lora
 * accent (`#795fc8`) beside the plain lead. The copy is one string; we split on
 * the last sentence boundary. Falls back to (body, null) when there's no split.
 */
function splitPracticalBody(body: string): [string, string | null] {
  const trimmed = body.trim();
  // Find the boundary between the penultimate and final sentence.
  const match = trimmed.match(/^(.*[.!?])\s+([^.!?]+[.!?]?)$/);
  if (match && match[1] && match[2]) {
    return [match[1].trim(), match[2].trim()];
  }
  return [trimmed, null];
}

const SexualStageSection: FC<Props> = ({ userStageLabel, copy }) => {
  /**
   * The season the reader picked themselves — survey Q16005 ("Which of these best
   * describes where your sexuality feels right now?") → `OVL_PHASE_NOW` →
   * `userStageLabel`. Its six options ARE the six stages, so this resolves
   * whenever the answer is present.
   *
   * It drives BOTH the card and the wheel (Eman, 2026-08-19). Before, the card
   * showed the per-archetype phrase from the copy matrix ("Deepening / Balancing",
   * the same for every Relational Nurturer) and the wheel tried to match that
   * phrase against the six stages — which works for four archetypes and falls back
   * to "Awakening / Exploring" for the other ten. A reader who had answered
   * "Pausing — I need a break from sex right now" was shown neither.
   *
   * The card keeps its Figma shape either way (8427:1327: eyebrow → title → three
   * rows → "Main Need Right Now" tile). Figma's own sample is the matrix copy for
   * Spiritual Lover, whose rows are byte-identical to this table's `evolving`
   * entry — the matrix rows were written from this same six-stage model.
   */
  const answered = resolveStageId(userStageLabel);
  const stage = answered ? (STAGES.find((s) => s.id === answered) ?? null) : null;
  // Fallback for a reader with no answer on file: the per-archetype phrase, as before.
  const result = stage?.label ?? copy?.result ?? userStageLabel;
  const explorerStage = userStageLabel ?? copy?.result ?? null;
  const rows: [string, string][] = stage
    ? [
        [copy?.["row1.label"] ?? "How it Feels", stage.feels],
        [copy?.["row2.label"] ?? "What You're Focused On", stage.focus],
        [copy?.["row3.label"] ?? "Common Thought", `\u201c${stage.thought}\u201d`],
      ]
    : copy
      ? ([
          [copy["row1.label"], copy["row1.value"]],
          [copy["row2.label"], copy["row2.value"]],
          [copy["row3.label"], copy["row3.value"]],
        ].filter(([label, value]) => label && value) as [string, string][])
      : [];
  // Figma's tile is a lead sentence plus an italic purple tail (8462:804). That
  // tail lives in the matrix's `practical.body`, which is written for the
  // ARCHETYPE's stage — so it is only true of this reader when their season is
  // that same stage, which is exactly when Figma's sample was drawn. Otherwise the
  // tile carries the season's own need, a single phrase in the register of that
  // tail, as the lead with no tail.
  const archetypeStageId = resolveStageId(copy?.result ?? null);
  const matrixBody = copy?.["practical.body"];
  const [practicalLead, practicalAccent] =
    stage && archetypeStageId === stage.id && matrixBody
      ? splitPracticalBody(matrixBody)
      : stage
        ? [stage.need, null]
        : matrixBody
          ? splitPracticalBody(matrixBody)
          : [null, null];

  const needLabel = copy?.["practical.label"] ?? (stage ? "Main Need Right Now" : null);
  const eyebrow = copy?.eyebrow ?? (stage ? "Your Likely Stage" : null);

  return (
    <div className="report-flow report-flow--gap-xl">
      {result ? (
        <article className="report-stage2-card">
          <span className="report-stage2-card__glow" aria-hidden="true" />

          <header className="report-stage2-card__header">
            {eyebrow ? <p className="report-stage2-card__eyebrow">{eyebrow}</p> : null}
            <h3 className="report-stage2-card__title">{result}</h3>
          </header>

          {rows.length > 0 ? (
            <dl className="report-stage2-card__rows">
              {rows.map(([label, value]) => (
                <div key={label} className="report-stage2-card__row">
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          {needLabel || practicalLead ? (
            <div className="report-stage2-card__need report-purple-block">
              {needLabel ? <p className="report-block-label">{needLabel}</p> : null}
              {practicalLead ? (
                <p className="report-stage2-card__need-body report-purple-block__body">
                  <span className="report-stage2-card__need-lead">{practicalLead}</span>
                  {practicalAccent ? (
                    <span className="report-stage2-card__need-accent"> {practicalAccent}</span>
                  ) : null}
                </p>
              ) : null}
            </div>
          ) : null}
        </article>
      ) : null}

      {/* No pre-2.0 intro prose here: Figma 8427:1324 goes heading → card →
          explorer, with no paragraph block between them. */}
      <SexualStageExplorer userStageLabel={explorerStage} />
    </div>
  );
};

export default SexualStageSection;
