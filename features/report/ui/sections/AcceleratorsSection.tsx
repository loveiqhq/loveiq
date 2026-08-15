"use client";

import { useState, type CSSProperties, type FC } from "react";
import PremiumOverlay, { type PremiumOverlayTier } from "./PremiumOverlay";
import { useRevealOnView } from "../hooks/useRevealOnView";
import type { ReportPriceQuoteSnapshot } from "@features/pricing/logic/reportPricing";
import { archetypeSlug } from "@/data/report2-config";
import { getAccelRows, type AccelRow, type AccelVerdict } from "@/data/report2-accel-rows";
import { renderEduPara } from "./eduPara";

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
 * ROWS + METER (Figma 8946:4286): the ten ranked accelerator/brake rows and the
 * accelerator↔brake verdict meter ARE rendered now. They are not in Mark's copy
 * matrix, so they come from `data/report2-accel-rows.ts` — hardcoding this section
 * was approved 2026-08-12. Each archetype gets its OWN rows, derived from its own
 * `turn_ons` / `turn_offs` prose in `data/report-archetypes.ts`; only Spiritual
 * Lover uses the Figma set verbatim (it is the archetype Figma mocks). Rows are
 * premium payload, so a locked client still sees only the legend + blurred
 * stand-in. The card, learn pill and verdict line follow the Figma spec.
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

/**
 * One ranked trigger row: label, subtext, then the track whose bar width IS the
 * rank (Figma 8946:4308 — a 403.99px divider with a shorter filled bar and a
 * 6.77px marker at its end). The marker is positioned at the fill percentage so
 * bar and dot can never disagree.
 */
const AccelTriggerRow: FC<{ row: AccelRow; kind: "open" | "shut"; index: number }> = ({
  row,
  kind,
  index,
}) => (
  // `--row` staggers this row's bar behind the one above it (.report-chart-reveal).
  <li className="report-accel__row" style={{ "--row": index } as CSSProperties}>
    <p className="report-accel__row-label">{row.label}</p>
    <p className="report-accel__row-subtext">{row.subtext}</p>
    <div
      className={`report-accel__track report-accel__track--${kind}`}
      role="img"
      aria-label={`${row.label}: ${row.fill}% of the strongest`}
    >
      <span className="report-accel__track-fill" style={{ width: `${row.fill}%` }} />
      <span className="report-accel__track-dot" style={{ left: `${row.fill}%` }} />
    </div>
  </li>
);

/** Splits the verdict caption so the leaning side renders bold, as in Figma. */
function verdictCaptionParts(v: AccelVerdict): [string, string, string] {
  const i = v.caption.toLowerCase().indexOf(v.side.toLowerCase());
  if (i < 0) return [v.caption, "", ""];
  return [
    v.caption.slice(0, i),
    v.caption.slice(i, i + v.side.length),
    v.caption.slice(i + v.side.length),
  ];
}

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
  // Two reveals, not one: the verdict meter sits below the columns and would
  // otherwise slide its marker while still off-screen. Hooks before the early
  // return — a hook may not be conditional.
  const [chartRef, revealed] = useRevealOnView<HTMLDivElement>();
  const [verdictRef, verdictRevealed] = useRevealOnView<HTMLDivElement>();
  if (!copy) return null;

  const locked = copy.locked;
  // Rows + meter are hardcoded from Figma 8946:4286 (approved 2026-08-12) because
  // the copy handoff carries no row data — see `data/report2-accel-rows.ts`.
  const rows = getAccelRows(archetypeSlug(archetype));
  const [capBefore, capSide, capAfter] = verdictCaptionParts(rows.verdict);
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
        {/* Unlocked: the ten ranked rows + verdict meter from Figma 8946:4286.
            Locked: the rows ARE the premium payload, so only the legend teaser and
            the blurred stand-in show, exactly as before. */}
        {!locked ? (
          <>
            <div
              ref={chartRef}
              className={`report-accel__columns report-chart-reveal${revealed ? " is-revealed" : ""}`}
            >
              <section className="report-accel__col">
                <h4 className="report-accel__col-heading report-accel__col-heading--open">
                  <span aria-hidden="true">&#9650;</span> What opens you
                </h4>
                <ul className="report-accel__rows">
                  {rows.opens.map((row, i) => (
                    <AccelTriggerRow key={row.label} row={row} kind="open" index={i} />
                  ))}
                </ul>
              </section>
              <section className="report-accel__col">
                <h4 className="report-accel__col-heading report-accel__col-heading--shut">
                  <span aria-hidden="true">&#9660;</span> What shuts you down
                </h4>
                <ul className="report-accel__rows">
                  {rows.shuts.map((row, i) => (
                    <AccelTriggerRow key={row.label} row={row} kind="shut" index={i} />
                  ))}
                </ul>
              </section>
            </div>

            <div
              ref={verdictRef}
              className={`report-accel__meter report-chart-reveal${verdictRevealed ? " is-revealed" : ""}`}
            >
              <div className="report-accel__meter-labels" aria-hidden="true">
                <span className="report-accel__meter-label--open">accelerator-led</span>
                <span className="report-accel__meter-label--shut">brake-led</span>
              </div>
              <div
                className="report-accel__meter-track"
                role="img"
                aria-label={rows.verdict.caption}
              >
                {/* `--dot`, not `left`: the marker travels here from centre, and the
                    real reading stays the resting value. See .report-accel__meter-dot. */}
                <span
                  className="report-accel__meter-dot"
                  style={{ "--dot": `${rows.verdict.dot}%` } as CSSProperties}
                />
              </div>
              <p className="report-accel__meter-caption">
                {capBefore}
                {capSide ? <strong>{capSide}</strong> : null}
                {capAfter}
              </p>
            </div>
          </>
        ) : (
          <div className="report-accel__legend" aria-hidden="true">
            <span className="report-accel__legend-open">&#9650; What opens you</span>
            <span className="report-accel__legend-shut">&#9660; What shuts you down</span>
          </div>
        )}

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
              aria-expanded={locked ? false : expanded}
              onClick={locked ? onUnlock : () => setExpanded((v) => !v)}
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

            {/* Figma's "peek CTA" (node 8762:15996 on the twin attachment block,
                and the pill visible in the accel mock 8946:4286). 13 of the 16
                collapsibles already shipped it; this was one of three missing. */}
            {locked || !expanded ? (
              <div className="report-accel__details-peek report-learn-peek">
                {copy["edu.teaser"] ? (
                  <p className="report-accel__details-teaser report-learn-teaser">
                    {copy["edu.teaser"]}
                  </p>
                ) : null}
                {locked || eduParas.length > 0 ? (
                  <button
                    type="button"
                    className="report-accel__peek-cta report-learn-cta"
                    onClick={locked ? onUnlock : () => setExpanded(true)}
                  >
                    {locked ? "Unlock to read the full explanation" : "Read the full explanation"}
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="report-accel__details-body">
                {copy["edu.teaser"] ? (
                  <p className="report-accel__details-teaser report-learn-teaser-full">
                    {copy["edu.teaser"]}
                  </p>
                ) : null}
                {eduParas.map((para, i) => (
                  <p key={i} className="report-accel__details-para">
                    {renderEduPara(para)}
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

export default AcceleratorsSection;
