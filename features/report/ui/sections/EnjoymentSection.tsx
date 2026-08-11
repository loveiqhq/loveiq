"use client";

import { useState, type FC } from "react";
import PremiumOverlay, { type PremiumOverlayTier } from "./PremiumOverlay";
import type { ReportPriceQuoteSnapshot } from "@features/pricing/logic/reportPricing";

/**
 * Server-resolved enjoyment copy (`getReport2Section(name, "enjoy")`), threaded
 * as a prop because the 634KB copy module is server-only (see
 * `app/api/report/route.ts` → `enjoyCopy`).
 *
 * This is the schema "enjoy" section (Enjoyment). The unlocked-report Figma
 * anchor has NO dedicated frame for it (the flow goes Libido→Partnership), so it
 * is built in the SAME established visual pattern as `ArousalSection` — a result
 * card with a centered result word, three labelled rows, a ✳ insight band, and
 * the collapsible educational block — to stay consistent with the redesign.
 *
 * GATING (Part IV, FULL_REPORT tier — this section is
 * `typical_challenges_to_enjoy_sex_for_the_core_archetype`, section 29,
 * `isPremium` and NOT in `ESSENTIALS_SECTION_IDS`, so it only unlocks at the
 * full_report tier). The framing slots (`eyebrow`, the three `row*.label`,
 * `insight.label`, `edu.*`, `learn.*`) are UNIVERSAL (identical across all 14
 * archetypes) and always shipped. The per-archetype payload — `gate.hook`,
 * `result` (e.g. "Wanting to Want"), the three `row*.value`, and `insight.value`
 * — is the gated content: shipped ONLY when the report is unlocked at the
 * full_report tier. A locked client (`locked: true`) receives those null and
 * renders the hook teaser + PremiumOverlay over a blurred stand-in. All 14
 * archetypes carry full enjoy copy, so nothing is fabricated. Never send locked
 * per-archetype content to an unpaid client.
 */
export interface EnjoyCopy {
  // Universal (always shipped) — these frame the section for locked clients too.
  eyebrow?: string | null;
  "row1.label"?: string | null;
  "row2.label"?: string | null;
  "row3.label"?: string | null;
  "insight.label"?: string | null;
  "edu.eyebrow"?: string | null;
  "edu.teaser"?: string | null;
  "edu.body.p1"?: string | null;
  "edu.body.p2"?: string | null;
  "edu.body.p3"?: string | null;
  "learn.eyebrow"?: string | null;
  "learn.body"?: string | null;
  // Per-archetype — withheld (null) from locked clients.
  "gate.hook"?: string | null;
  result?: string | null;
  "row1.value"?: string | null;
  "row2.value"?: string | null;
  "row3.value"?: string | null;
  "insight.value"?: string | null;
  /** True when the per-archetype hook/result/row-values/insight were withheld. */
  locked: boolean;
}

interface Props {
  archetype: string;
  copy: EnjoyCopy | null;
  offerDeadline?: number;
  onUnlock: () => void;
  quote?: ReportPriceQuoteSnapshot | null;
  sectionTitle: string;
  tier?: PremiumOverlayTier;
}

const BookIcon: FC = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v15.5H5.5A1.5 1.5 0 0 1 4 18V5.5Z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    <path
      d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v15.5h5.5A1.5 1.5 0 0 0 20 18V5.5Z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
  </svg>
);

type Row = { label: string; value: string };

/** One labelled row: small-caps label + serif value (mirrors Libido's rows). */
const ResultRow: FC<{ row: Row }> = ({ row }) => (
  <div className="report-enjoy__row">
    <p className="report-enjoy__row-label">{row.label}</p>
    <p className="report-enjoy__row-value">{row.value}</p>
  </div>
);

const EnjoymentSection: FC<Props> = ({
  archetype,
  copy,
  offerDeadline,
  onUnlock,
  quote = null,
  sectionTitle,
  tier = "full_report",
}) => {
  const [expanded, setExpanded] = useState(false);
  if (!copy) return null;

  const locked = copy.locked;

  // Rows — labels are universal, values per-archetype. Render only rows whose
  // value exists (never fabricate a row); the value is null for a locked client.
  const rows: Row[] = ([1, 2, 3] as const)
    .map((i) => ({
      label: copy[`row${i}.label`]?.trim() ?? "",
      value: copy[`row${i}.value`]?.trim() ?? "",
    }))
    .filter((r): r is Row => r.value.length > 0 && r.label.length > 0);

  // Educational block is universal — always safe to show.
  const eduParas = [copy["edu.body.p1"], copy["edu.body.p2"], copy["edu.body.p3"]].filter(
    (p): p is string => !!p
  );
  const hasEdu = !!copy["edu.teaser"] || eduParas.length > 0;

  return (
    <div className="report-enjoy">
      <h3 className="report-enjoy__heading">Challenges to Enjoy Sex</h3>

      {copy["learn.body"] ? (
        <div className="report-enjoy__learn-pill-wrap">
          <span className="report-enjoy__learn-pill">
            <span className="report-enjoy__learn-pill-icon" aria-hidden="true">
              <BookIcon />
            </span>
            {copy["learn.eyebrow"] ?? "What you will learn"}
          </span>
          <p className="report-enjoy__learn-body">{copy["learn.body"]}</p>
        </div>
      ) : null}

      <article className="report-enjoy__card">
        {locked ? (
          <>
            {copy["gate.hook"] ? <p className="report-enjoy__hook">{copy["gate.hook"]}</p> : null}
            <div className="report-enjoy__preview">
              <div className="report-enjoy__preview-fade" aria-hidden="true">
                {/* Blurred stand-in — the real per-archetype result/rows/insight
                    are withheld server-side; generic filler under the blur. */}
                <p className="report-enjoy__result-eyebrow">The Pattern</p>
                <p className="report-enjoy__result">Wanting to Want</p>
                <div className="report-enjoy__rows">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="report-enjoy__row">
                      <p className="report-enjoy__row-label">How it feels</p>
                      <p className="report-enjoy__row-value">
                        A pattern matched to how your body opens to pleasure.
                      </p>
                    </div>
                  ))}
                </div>
              </div>
              <PremiumOverlay
                archetype={archetype}
                sectionTitle={sectionTitle}
                tier={tier}
                quote={quote}
                offerDeadline={offerDeadline}
                onUnlock={onUnlock}
              />
            </div>
          </>
        ) : (
          <>
            <div className="report-enjoy__result-head">
              <p className="report-enjoy__result-eyebrow">{copy.eyebrow ?? "The Pattern"}</p>
              {copy.result ? <p className="report-enjoy__result">{copy.result}</p> : null}
            </div>

            {rows.length > 0 ? (
              <div className="report-enjoy__rows">
                {rows.map((row, i) => (
                  <ResultRow key={i} row={row} />
                ))}
              </div>
            ) : null}

            {copy["insight.value"] ? (
              <div className="report-enjoy__insight">
                <span className="report-enjoy__insight-label">
                  {copy["insight.label"] ?? "✳ The Insight"}
                </span>
                <p className="report-enjoy__insight-value">{copy["insight.value"]}</p>
              </div>
            ) : null}

            <div className="report-enjoy__rule" aria-hidden="true" />
          </>
        )}

        {hasEdu ? (
          <div className="report-enjoy__details">
            <button
              type="button"
              className="report-enjoy__details-summary"
              aria-expanded={expanded}
              onClick={() => setExpanded((v) => !v)}
            >
              <span className="report-enjoy__details-icon" aria-hidden="true">
                <BookIcon />
              </span>
              <span className="report-enjoy__details-eyebrow">
                {copy["edu.eyebrow"] ?? "Learn: pleasure's preconditions"}
              </span>
              <span
                className={`report-enjoy__details-chevron${expanded ? " is-open" : ""}`}
                aria-hidden="true"
              >
                ⌄
              </span>
            </button>

            {!expanded ? (
              <div className="report-enjoy__details-peek">
                {copy["edu.teaser"] ? (
                  <p className="report-enjoy__details-teaser">{copy["edu.teaser"]}</p>
                ) : null}
                {eduParas.length > 0 ? (
                  <button
                    type="button"
                    className="report-enjoy__peek-cta"
                    onClick={() => setExpanded(true)}
                  >
                    Read the full explanation
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="report-enjoy__details-body">
                {eduParas.map((para, i) => (
                  <p key={i} className="report-enjoy__details-para">
                    {para}
                  </p>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </article>
    </div>
  );
};

export default EnjoymentSection;
