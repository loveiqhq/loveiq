"use client";

import { useState, type CSSProperties, type FC } from "react";
import VerdictStar from "./VerdictStar";
import LockedPreviewImage from "./LockedPreviewImage";
import PremiumOverlay, { type PremiumOverlayTier } from "./PremiumOverlay";
import { useRevealOnView } from "../hooks/useRevealOnView";
import type { ReportPriceQuoteSnapshot } from "@features/pricing/logic/reportPricing";
import { archetypeSlug } from "@/data/report2-config";
import { getAccelRows, type AccelRow, type AccelVerdict } from "@/data/report2-accel-rows";
import { renderEduPara } from "./eduPara";
import LearnPill from "./LearnPill";
import { chapterHeading } from "./chapterHeading";

/**
 * Server-resolved accelerators copy (`getReport2Section(name, "accel")`),
 * threaded as a prop because the 634KB copy module is server-only (see
 * `app/api/report/route.ts` → `accelCopy`).
 *
 * GATING: `edu.*` and `learn.*` are universal and always shipped.
 * `takeaway` is the ONLY per-archetype slot — a single verdict sentence
 * ("Removing the thing that shuts you down beats adding three new turn-ons.")
 * whose polarity flips per archetype. It is the premium payload: the server
 * sends it ONLY when the report is unlocked at the essentials tier (or above).
 * For a locked client it arrives `null` and the client renders the
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
  "edu.eyebrow"?: string | null;
  "edu.teaser"?: string | null;
  "edu.body.p1"?: string | null;
  "edu.body.p2"?: string | null;
  "edu.body.p3"?: string | null;
  /** Per-archetype verdict sentence — withheld (null) from locked clients. */
  takeaway?: string | null;
  "learn.eyebrow"?: string | null;
  /** Chapter-opening definition, rendered in front of `learn.body`. */
  "learn.lead"?: string | null;
  "learn.body"?: string | null;
  /** Second Key Concepts paragraph — see data/report2-key-concepts.ts. */
  "learn.body.p2"?: string | null;
  /** What a `learn.lead` ending in a colon introduces. */
  "learn.questions"?: string[] | null;
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
/**
 * Triggers shown as live text on a locked report. Three: the first two read sharp
 * and the third carries a light blur, so the softness ramps before the raster takes
 * over at row four — a fully blurred image starting under sharp text reads as a
 * pasted block. Must match `keepRows` in the accel entries of COLUMN_CAPTURES
 * (scripts/generate-locked-previews.mjs), or the live rows and the image will double
 * up or skip one.
 */
const ACCEL_TEASE_ROWS = 3;

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
      <h3 className="report-accel__heading">
        {chapterHeading("Accelerators & Brakes", archetype)}
      </h3>

      <LearnPill prefix="accel" copy={copy} />

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
          /* Locked: the same two columns, teased the way Typical Beliefs is (Eman,
             2026-08-19). The first three triggers per column are live — rows one and
             two sharp, the third under a light CSS blur — and the rows past them are
             PIXELS: `accel-opens` / `accel-shuts`, build-time rasters of the real
             remaining rows, blurred and quarter-scaled before they ship (see
             LockedPreviewImage). Before this the locked chapter showed nothing but
             two legend words over a whole-chapter raster.

             One image per column for the same reason as beliefs: a single raster
             under the live rows could only line up with one of the two. */
          <div className="report-accel__columns report-accel__columns--tease" aria-hidden="true">
            <section className="report-accel__col">
              <h4 className="report-accel__col-heading report-accel__col-heading--open">
                <span aria-hidden="true">&#9650;</span> What opens you
              </h4>
              <ul className="report-accel__rows">
                {rows.opens.slice(0, ACCEL_TEASE_ROWS).map((row, i) => (
                  <AccelTriggerRow key={row.label} row={row} kind="open" index={i} />
                ))}
                <LockedPreviewImage name="accel-opens" />
              </ul>
            </section>
            <section className="report-accel__col">
              <h4 className="report-accel__col-heading report-accel__col-heading--shut">
                <span aria-hidden="true">&#9660;</span> What shuts you down
              </h4>
              <ul className="report-accel__rows">
                {rows.shuts.slice(0, ACCEL_TEASE_ROWS).map((row, i) => (
                  <AccelTriggerRow key={row.label} row={row} kind="shut" index={i} />
                ))}
                <LockedPreviewImage name="accel-shuts" />
              </ul>
            </section>
          </div>
        )}

        {/* And the shape of everything after the columns: the accelerator-vs-brake
            meter box and the verdict line, as one raster (`accel-tail`). Without it
            the locked chapter ended at the rows, so a reader could not see that a
            whole box and a closing verdict sit behind the paywall. The verdict
            sentence is the premium slot and never reaches a locked client as text —
            here it is pixels, blurred and half-scaled at build time. */}
        {/* The raster is the BACKDROP and the card is what sizes this box.
            Both in normal flow stacked ~330px of blurred tail ON TOP of a ~740px
            card, so the chapter reserved height for the pair: raising the card with
            negative margins left white either side of it, and raising it harder
            clipped it against the chapter's `overflow: hidden`. Taking the raster out
            of flow makes the box exactly as tall as the card at every width, with no
            measured offsets to drift. */}
        {locked ? (
          <div className="report-accel__locked-tail">
            <div className="report-accel__tail-preview" aria-hidden="true">
              <LockedPreviewImage name="accel-tail" />
            </div>
            <div className="report-accel__verdict report-accel__verdict--locked">
              {/* The paywall card only — the chapter behind it is the teased columns
                above, not a whole-chapter raster. The card is pulled down past the
                live rows in CSS so the triggers a reader is allowed to read are not
                sitting under it. */}
              <div className="report-accel__preview report-accel__preview--tease">
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
          </div>
        ) : copy.takeaway ? (
          <div className="report-accel__verdict report-verdict">
            <VerdictStar />
            <p className="report-accel__quote">{copy.takeaway}</p>
            <span className="report-verdict-rule" aria-hidden="true" />
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
                    {copy["edu.body.p1"] ? ` ${copy["edu.body.p1"]}` : null}
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
