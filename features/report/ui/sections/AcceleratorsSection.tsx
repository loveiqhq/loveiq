"use client";

import { useState, type FC } from "react";
import PremiumOverlay, { type PremiumOverlayTier } from "./PremiumOverlay";
import type { ReportPriceQuoteSnapshot } from "@features/pricing/logic/reportPricing";

/**
 * Server-resolved accelerators copy (`getReport2Section(name, "accel")`),
 * threaded as a prop because the 634KB copy module is server-only (see
 * `app/api/report/route.ts` → `accelCopy`).
 *
 * GATING: `gate.hook`, `edu.*` and `learn.*` are universal and always shipped.
 * `takeaway` is the ONLY per-archetype slot — a single verdict sentence
 * ("Removing the thing that shuts you down beats adding three new turn-ons.")
 * whose polarity flips per archetype. It is the premium payload: the server
 * sends it ONLY when the report is unlocked at the essentials tier (or above).
 * For a locked client it arrives `null` and the client renders the `gate.hook`
 * teaser + PremiumOverlay instead. `locked` tells the client which it received.
 *
 * NOTE (Figma vs data): the Figma mock (node 8946:4286) shows ten ranked
 * accelerator/brake rows + a slider "verdict meter". No per-archetype data
 * exists for those — the copy provides only the `takeaway` verdict prose — so
 * they are intentionally NOT rendered (fabricating them would be wrong for all
 * 14 archetypes). The card, learn pill, verdict line, and the collapsible
 * dual-control educational block ARE built to the Figma spec.
 */
export interface AccelCopy {
  "gate.hook"?: string | null;
  "edu.eyebrow"?: string | null;
  "edu.teaser"?: string | null;
  "edu.body.p1"?: string | null;
  "edu.body.p2"?: string | null;
  "edu.body.p3"?: string | null;
  /** Per-archetype verdict sentence — withheld (null) from locked clients. */
  takeaway?: string | null;
  "learn.eyebrow"?: string | null;
  "learn.body"?: string | null;
  /** True when the per-archetype `takeaway` was withheld (unpaid). */
  locked: boolean;
}

interface Props {
  archetype: string;
  copy: AccelCopy | null;
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

const AcceleratorsSection: FC<Props> = ({
  archetype,
  copy,
  offerDeadline,
  onUnlock,
  quote = null,
  sectionTitle,
  tier = "essentials",
}) => {
  const [expanded, setExpanded] = useState(false);
  if (!copy) return null;

  const locked = copy.locked;
  const eduParas = [copy["edu.body.p1"], copy["edu.body.p2"], copy["edu.body.p3"]].filter(
    (p): p is string => !!p
  );
  const hasEdu = !!copy["edu.teaser"] || eduParas.length > 0;

  return (
    <div className="report-accel">
      <h3 className="report-accel__heading">Accelerators &amp; Brakes</h3>

      {copy["learn.body"] ? (
        <div className="report-accel__learn-pill-wrap">
          <span className="report-accel__learn-pill">
            <span className="report-accel__learn-pill-icon" aria-hidden="true">
              <BookIcon />
            </span>
            {copy["learn.eyebrow"] ?? "What you will learn"}
          </span>
          <p className="report-accel__learn-body">{copy["learn.body"]}</p>
        </div>
      ) : null}

      <article className="report-accel__card">
        <div className="report-accel__legend" aria-hidden="true">
          <span className="report-accel__legend-open">&#9650; What opens you</span>
          <span className="report-accel__legend-shut">&#9660; What shuts you down</span>
        </div>

        {locked ? (
          <div className="report-accel__verdict report-accel__verdict--locked">
            {copy["gate.hook"] ? <p className="report-accel__hook">{copy["gate.hook"]}</p> : null}
            <div className="report-accel__preview">
              <div className="report-accel__preview-fade" aria-hidden="true">
                <span className="report-accel__star">&#10037;</span>
                <p className="report-accel__quote">
                  Removing one brake does more than adding three accelerators.
                </p>
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
          </div>
        ) : copy.takeaway ? (
          <div className="report-accel__verdict">
            <span className="report-accel__star" aria-hidden="true">
              &#10037;
            </span>
            <p className="report-accel__quote">{copy.takeaway}</p>
          </div>
        ) : null}

        {hasEdu ? (
          <div className="report-accel__details">
            <button
              type="button"
              className="report-accel__details-summary"
              aria-expanded={expanded}
              onClick={() => setExpanded((v) => !v)}
            >
              <span className="report-accel__details-icon" aria-hidden="true">
                <BookIcon />
              </span>
              <span className="report-accel__details-eyebrow">
                {copy["edu.eyebrow"] ?? "Learn: the dual-control model"}
              </span>
              <span
                className={`report-accel__details-chevron${expanded ? " is-open" : ""}`}
                aria-hidden="true"
              >
                ⌄
              </span>
            </button>

            {copy["edu.teaser"] && !expanded ? (
              <p className="report-accel__details-teaser">{copy["edu.teaser"]}</p>
            ) : null}

            {expanded ? (
              <div className="report-accel__details-body">
                {eduParas.map((para, i) => (
                  <p key={i} className="report-accel__details-para">
                    {para}
                  </p>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </article>
    </div>
  );
};

export default AcceleratorsSection;
