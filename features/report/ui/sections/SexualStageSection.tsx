"use client";

import { type FC } from "react";
import SexualStageExplorer from "./SexualStageExplorer";

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
  // The static "Your Likely Stage" card is driven entirely by the server copy.
  // `result` is the authoritative per-archetype stage word — pass it to the
  // orbit as the user's stage so the anchor pill matches the card exactly.
  const result = copy?.result ?? userStageLabel;
  const rows = copy
    ? ([
        [copy["row1.label"], copy["row1.value"]],
        [copy["row2.label"], copy["row2.value"]],
        [copy["row3.label"], copy["row3.value"]],
      ].filter(([label, value]) => label && value) as [string, string][])
    : [];
  const [practicalLead, practicalAccent] = copy?.["practical.body"]
    ? splitPracticalBody(copy["practical.body"])
    : [null, null];

  return (
    <div className="report-flow report-flow--gap-xl">
      {result ? (
        <article className="report-stage2-card">
          <span className="report-stage2-card__glow" aria-hidden="true" />

          <header className="report-stage2-card__header">
            {copy?.eyebrow ? <p className="report-stage2-card__eyebrow">{copy.eyebrow}</p> : null}
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

          {copy?.["practical.label"] || practicalLead ? (
            <div className="report-stage2-card__need">
              <span className="report-stage2-card__need-glow" aria-hidden="true" />
              {copy?.["practical.label"] ? (
                <p className="report-stage2-card__need-label">{copy["practical.label"]}</p>
              ) : null}
              {practicalLead ? (
                <p className="report-stage2-card__need-body">
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
      <SexualStageExplorer userStageLabel={result} />
    </div>
  );
};

export default SexualStageSection;
