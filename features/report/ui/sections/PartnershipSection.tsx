"use client";

import { useState, type FC } from "react";
import PremiumOverlay, { type PremiumOverlayTier } from "./PremiumOverlay";
import type { ReportPriceQuoteSnapshot } from "@features/pricing/logic/reportPricing";

/**
 * Server-resolved partnership copy (`getReport2Section(name, "partnership")`),
 * threaded as a prop because the 634KB copy module is server-only (see
 * `app/api/report/route.ts` → `partnershipCopy`).
 *
 * GATING (Part IV, FULL_REPORT tier). Partnership is NOT its own row in
 * `report-general.ts` — it renders inline right after Libido (section 28,
 * `libido_challenges_in_relationships`), and shares that section's gate: NOT in
 * `ESSENTIALS_SECTION_IDS`, so it only unlocks at the full_report tier. The
 * framing slots (`gate.hook`, `eyebrow`, `row1..3.label`, `edu.*`, `learn.*`)
 * are UNIVERSAL (verified identical across all 14 archetypes) and always
 * shipped. The per-archetype payload — `result` (the loop name, e.g. "The
 * Resonance Loop") and `row1..3.value` — is the gated content: shipped ONLY when
 * unlocked. A locked client (`locked: true`) receives those null and renders the
 * hook teaser + PremiumOverlay instead. Never send locked per-archetype content
 * to an unpaid client.
 */
export interface PartnershipCopy {
  // Universal (always shipped) — these frame the section for locked clients too.
  "gate.hook"?: string | null;
  eyebrow?: string | null;
  "row1.label"?: string | null;
  "row2.label"?: string | null;
  "row3.label"?: string | null;
  "edu.eyebrow"?: string | null;
  "edu.teaser"?: string | null;
  "edu.body.p1"?: string | null;
  "edu.body.p2"?: string | null;
  "edu.body.p3"?: string | null;
  "learn.eyebrow"?: string | null;
  "learn.body"?: string | null;
  // Per-archetype — withheld (null) from locked clients.
  result?: string | null;
  "row1.value"?: string | null;
  "row2.value"?: string | null;
  "row3.value"?: string | null;
  /** True when the per-archetype result/values were withheld. */
  locked: boolean;
}

interface Props {
  archetype: string;
  copy: PartnershipCopy | null;
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

const PartnershipSection: FC<Props> = ({
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

  // The three labelled rows: labels universal, values per-archetype (withheld
  // when locked). A row renders only when it has a value (never a bare label).
  const rows = [
    { label: copy["row1.label"], value: copy["row1.value"] },
    { label: copy["row2.label"], value: copy["row2.value"] },
    { label: copy["row3.label"], value: copy["row3.value"] },
  ].filter((r): r is { label: string; value: string } => !!r.label && !!r.value);

  // The educational block — all universal (shipped locked too). Peek shows the
  // teaser; expand reveals the 1–3 body paragraphs. Same peek→expand pattern as
  // the sibling sections, but purple-themed per Figma 8762:16051.
  const eduBody = [copy["edu.body.p1"], copy["edu.body.p2"], copy["edu.body.p3"]].filter(
    (p): p is string => !!p
  );
  const hasEdu = !!copy["edu.teaser"] || eduBody.length > 0;

  return (
    <div className="report-partnership">
      <h3 className="report-partnership__heading">Challenges in Partnership</h3>

      {copy["learn.body"] ? (
        <div className="report-partnership__learn-pill-wrap">
          <span className="report-partnership__learn-pill">
            <span className="report-partnership__learn-pill-icon" aria-hidden="true">
              <BookIcon />
            </span>
            {copy["learn.eyebrow"] ?? "What you will learn"}
          </span>
          <p className="report-partnership__learn-body">{copy["learn.body"]}</p>
        </div>
      ) : null}

      <article className="report-partnership__card">
        {locked ? (
          <>
            {copy["gate.hook"] ? (
              <p className="report-partnership__hook">{copy["gate.hook"]}</p>
            ) : null}
            <div className="report-partnership__preview">
              <div className="report-partnership__preview-fade" aria-hidden="true">
                {/* Blurred stand-in — the real per-archetype result/rows are
                    withheld server-side; generic filler under the blur. */}
                <p className="report-partnership__pattern-eyebrow">The Pattern</p>
                <p className="report-partnership__loop-name">The Resonance Loop</p>
                <div className="report-partnership__rows">
                  <div className="report-partnership__row">
                    <p className="report-partnership__row-term">How it Starts</p>
                    <p className="report-partnership__row-detail">
                      Intimacy feels hollow, so you bid for depth
                    </p>
                  </div>
                  <div className="report-partnership__row">
                    <p className="report-partnership__row-term">How it Escalates</p>
                    <p className="report-partnership__row-detail">
                      Your partner hears criticism and pulls back; your bids get louder
                    </p>
                  </div>
                  <div className="report-partnership__row">
                    <p className="report-partnership__row-term">What It Costs</p>
                    <p className="report-partnership__row-detail">
                      Sex becomes collateral, closed rather than withheld
                    </p>
                  </div>
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
            <div className="report-partnership__pattern-head">
              <p className="report-partnership__pattern-eyebrow">{copy.eyebrow ?? "The Pattern"}</p>
              {copy.result ? <p className="report-partnership__loop-name">{copy.result}</p> : null}
            </div>

            {rows.length > 0 ? (
              <div className="report-partnership__rows">
                {rows.map((row, i) => (
                  <div key={i} className="report-partnership__row">
                    <p className="report-partnership__row-term">{row.label}</p>
                    <p className="report-partnership__row-detail">{row.value}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </>
        )}

        {hasEdu ? (
          <div className="report-partnership__details">
            <button
              type="button"
              className="report-partnership__details-summary"
              aria-expanded={expanded}
              onClick={() => setExpanded((v) => !v)}
            >
              <span className="report-partnership__details-icon" aria-hidden="true">
                <BookIcon />
              </span>
              <span className="report-partnership__details-eyebrow">
                {copy["edu.eyebrow"] ?? "Learn: bids and repair"}
              </span>
              <span
                className={`report-partnership__details-chevron${expanded ? " is-open" : ""}`}
                aria-hidden="true"
              >
                ⌄
              </span>
            </button>

            {!expanded ? (
              <div className="report-partnership__details-peek">
                {copy["edu.teaser"] ? (
                  <p className="report-partnership__details-teaser">{copy["edu.teaser"]}</p>
                ) : null}
                {eduBody.length > 0 ? (
                  <button
                    type="button"
                    className="report-partnership__peek-cta"
                    onClick={() => setExpanded(true)}
                  >
                    Read the full explanation
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="report-partnership__details-body">
                {eduBody.map((para, i) => (
                  <p key={i} className="report-partnership__details-para">
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

export default PartnershipSection;
