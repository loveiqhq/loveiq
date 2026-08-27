"use client";

import { useState, type CSSProperties, type FC } from "react";
import LockedPreviewImage from "./LockedPreviewImage";
import PremiumOverlay, { type PremiumOverlayTier } from "./PremiumOverlay";
import type { ReportPriceQuoteSnapshot } from "@features/pricing/logic/reportPricing";
import { partnershipCentreMessage } from "@/data/report2-partnership-loops";
import { useRevealOnView } from "../hooks/useRevealOnView";
import { renderEduPara } from "./eduPara";
import LearnPill from "./LearnPill";
import ChapterHeading from "./ChapterHeading";
import type { Report2DocInserts } from "@/data/report2-doc-inserts";

/**
 * Server-resolved partnership copy (`getReport2Section(name, "partnership")`),
 * threaded as a prop because the 634KB copy module is server-only (see
 * `app/api/report/route.ts` → `partnershipCopy`).
 *
 * GATING (Part IV, FULL_REPORT tier). Partnership is NOT its own row in
 * `report-general.ts` — it renders inline right after Libido (section 28,
 * `libido_challenges_in_relationships`), and shares that section's gate: NOT in
 * `ESSENTIALS_SECTION_IDS`, so it only unlocks at the full_report tier. The
 * framing slots (`eyebrow`, `row1..3.label`, `edu.*`, `learn.*`)
 * are UNIVERSAL (verified identical across all 14 archetypes) and always
 * shipped. The per-archetype payload — `result` (the loop name, e.g. "The
 * Resonance Loop") and `row1..3.value` — is the gated content: shipped ONLY when
 * unlocked. A locked client (`locked: true`) receives those null and renders the
 * hook teaser + PremiumOverlay instead. Never send locked per-archetype content
 * to an unpaid client.
 */
export interface PartnershipCopy {
  /** Document passages placed in this chapter; null when locked or absent. */
  inserts?: Report2DocInserts["partnership"] | null;
  // Universal (always shipped) — these frame the section for locked clients too.
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
  /** Chapter-opening definition, rendered in front of `learn.body`. */
  "learn.lead"?: string | null;
  "learn.body"?: string | null;
  /** Second Key Concepts paragraph — see data/report2-key-concepts.ts. */
  "learn.body.p2"?: string | null;
  /** What a `learn.lead` ending in a colon introduces. */
  "learn.questions"?: string[] | null;
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
  /**
   * The loop's three steps + the reader's own bid, resolved server-side from
   * `data/report2-partnership-loops.ts`. Drives the circular orbit (Figma
   * 9114:633). Null when locked, so the orbit drops with the rest of the
   * per-archetype content.
   */
  loop: { steps: readonly [string, string, string]; exitQuote: string } | null;
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

/** Cycle icon at the orbit's centre (Figma 9114:639). */
const CycleIcon: FC = () => (
  <svg
    viewBox="0 0 16 16"
    fill="none"
    aria-hidden="true"
    className="report-partnership__orbit-icon"
  >
    <path
      d="M14 8a6 6 0 0 1-9.9 4.5M2 8a6 6 0 0 1 9.9-4.5"
      stroke="#a341ff"
      strokeWidth="1.4"
      strokeLinecap="round"
    />
    <path
      d="M11.6 1.2v2.6H9M4.4 14.8v-2.6H7"
      stroke="#a341ff"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * The three dashed flow arrows that carry the eye 1 → 2 → 3 → 1 around the ring
 * (Figma 9114:667/668/669, `#9D8AD7`). Drawn inline rather than as the three
 * exported SVGs, whose asset URLs expire after 7 days.
 */
const OrbitArrows: FC = () => (
  <svg
    className="report-partnership__orbit-arrows"
    viewBox="0 0 520 520"
    fill="none"
    aria-hidden="true"
  >
    {/*
      True arcs on a radius-240 circle inside the ring, so the dashes follow the
      same curve the cards sit on. Each runs clockwise between two card angles
      (measured from 12 o'clock) and ends in a tangent arrowhead.
    */}
    {/*
      Each hop is its own group so the reveal can walk the cycle in order —
      step, hop, step, hop, and finally the hop that closes back to step 1.
      The arcs keep their `4 7` dash pattern, so they are faded in rather than
      stroke-drawn: animating dashoffset on an already-dashed path marches the
      dashes around the curve instead of drawing it.
    */}
    {/* 1 → 2 : 18° → 108° */}
    <g className="report-partnership__orbit-hop" style={{ "--row": 0 } as CSSProperties}>
      <path
        d="M334 32 A240 240 0 0 1 488 334"
        stroke="#9D8AD7"
        strokeWidth="1.8"
        strokeDasharray="4 7"
        strokeLinecap="round"
      />
      <path d="M487 338 L485 326 L495 330 Z" fill="#9D8AD7" />
    </g>
    {/* 2 → 3 : 132° → 228°, along the bottom */}
    <g className="report-partnership__orbit-hop" style={{ "--row": 1 } as CSSProperties}>
      <path
        d="M438 421 A240 240 0 0 1 82 421"
        stroke="#9D8AD7"
        strokeWidth="1.8"
        strokeDasharray="4 7"
        strokeLinecap="round"
      />
      <path d="M79 418 L90 422 L82 428 Z" fill="#9D8AD7" />
    </g>
    {/* 3 → 1 : 252° → 342° — the hop that closes the loop */}
    <g className="report-partnership__orbit-hop" style={{ "--row": 2 } as CSSProperties}>
      <path
        d="M32 334 A240 240 0 0 1 186 32"
        stroke="#9D8AD7"
        strokeWidth="1.8"
        strokeDasharray="4 7"
        strokeLinecap="round"
      />
      <path d="M190 31 L182 39 L178 29 Z" fill="#9D8AD7" />
    </g>
  </svg>
);
/**
 * The circular orbit (Figma 9114:633 "Desktop Circular Orbit Layout"): three
 * concentric rings, a centre message, and the loop's three steps pinned at 12,
 * 4 and 8 o'clock with step 1 highlighted as the active stage. Figma sets the
 * cards `whitespace-nowrap`, which clips its own longer labels — ours wrap
 * instead, since step text differs per archetype.
 *
 * Below 720px the circle cannot hold three cards at a readable size, so the
 * steps stack in order and the centre message follows them; the numbering still
 * carries the cycle.
 */
const PartnershipOrbit: FC<{ steps: readonly [string, string, string]; exitQuote: string }> = ({
  steps,
  exitQuote,
}) => {
  // Walks the cycle on arrival: ring, step 1, hop, step 2, hop, step 3, the hop
  // that closes back to 1, then the centre — which is the way out of the loop, so
  // it arrives only once the loop it exits has been drawn.
  const [orbitRef, revealed] = useRevealOnView<HTMLDivElement>({ threshold: 0.2 });
  return (
    <div
      ref={orbitRef}
      className={`report-partnership__orbit report-chart-reveal${revealed ? " is-revealed" : ""}`}
      role="img"
      aria-label="The loop, step by step, cycling back to the start"
    >
      <div className="report-partnership__orbit-ring">
        <span className="report-partnership__orbit-ring-mid" aria-hidden="true" />
        <span className="report-partnership__orbit-ring-inner" aria-hidden="true" />
        <OrbitArrows />
      </div>

      <div className="report-partnership__orbit-centre">
        <CycleIcon />
        <p className="report-partnership__orbit-message">{partnershipCentreMessage(exitQuote)}</p>
      </div>

      {steps.map((step, i) => (
        <div
          key={i}
          className={`report-partnership__orbit-step report-partnership__orbit-step--${i + 1}${
            i === 0 ? " is-active" : ""
          }`}
          style={{ "--row": i } as CSSProperties}
        >
          <span className="report-partnership__orbit-dot" aria-hidden="true" />
          <span className="report-partnership__orbit-label">{`${i + 1} · ${step}`}</span>
        </div>
      ))}
    </div>
  );
};

const PartnershipSection: FC<Props> = ({
  archetype,
  loop,
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
      <ChapterHeading
        base="Challenges in Partnership"
        archetype={archetype}
        className="report-partnership__heading"
      />

      <LearnPill prefix="partnership" copy={copy} />

      <article className="report-partnership__card">
        {locked ? (
          <>
            <div className="report-partnership__preview">
              {/* A pre-blurred render of the REAL chapter. Blurring the PIXELS at
                  build time means the paid copy is not in the file that ships, so
                  it cannot be read back out of the DOM. See LockedPreviewImage. */}
              <div
                className="report-partnership__preview-fade report-preview-fade--image"
                aria-hidden="true"
              >
                <LockedPreviewImage name="partnership" />
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

            {loop ? <PartnershipOrbit steps={loop.steps} exitQuote={loop.exitQuote} /> : null}

            {/* Document insert, 2026-08-27: under the loop visual, before the
                educational block. */}
            {copy.inserts?.underFlywheel ? (
              <div className="report-partnership__insert-block">
                <p className="report-partnership__insert-label">
                  {copy.inserts.underFlywheel.label}
                </p>
                {copy.inserts.underFlywheel.paras.map((para, i) => (
                  <p key={i} className="report-partnership__insert">
                    {para}
                  </p>
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
              aria-expanded={locked ? false : expanded}
              onClick={locked ? onUnlock : () => setExpanded((v) => !v)}
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

            {locked || !expanded ? (
              <div className="report-partnership__details-peek report-learn-peek">
                {copy["edu.teaser"] ? (
                  <p className="report-partnership__details-teaser report-learn-teaser">
                    {copy["edu.teaser"]}
                    {copy["edu.body.p1"] ? ` ${copy["edu.body.p1"]}` : null}
                  </p>
                ) : null}
                {locked || eduBody.length > 0 ? (
                  <button
                    type="button"
                    className="report-partnership__peek-cta report-learn-cta"
                    onClick={locked ? onUnlock : () => setExpanded(true)}
                  >
                    {locked ? "Unlock to read the full explanation" : "Read the full explanation"}
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="report-partnership__details-body">
                {copy["edu.teaser"] ? (
                  <p className="report-partnership__details-teaser report-learn-teaser-full">
                    {copy["edu.teaser"]}
                  </p>
                ) : null}
                {eduBody.map((para, i) => (
                  <p key={i} className="report-partnership__details-para">
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

export default PartnershipSection;
