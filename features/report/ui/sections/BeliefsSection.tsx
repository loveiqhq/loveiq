"use client";

import { useState, type FC } from "react";
import LockedPreviewImage from "./LockedPreviewImage";
import PremiumOverlay, { type PremiumOverlayTier } from "./PremiumOverlay";
import type { ReportPriceQuoteSnapshot } from "@features/pricing/logic/reportPricing";
import { renderEduPara } from "./eduPara";
import { copyParagraphs } from "./copyParagraphs";

/**
 * Server-resolved beliefs copy (`getReport2Section(name, "beliefs")`), threaded
 * as a prop because the 634KB copy module is server-only (see
 * `app/api/report/route.ts` → `beliefsCopy`).
 *
 * GATING: `edu.*` and `learn.*` are universal and always shipped.
 * The per-archetype `body.p1`, `keep.*`, `loosen.*.{belief,shift}` slots are the
 * premium payload — the server sends them ONLY when the report is unlocked at the
 * essentials tier (or above). For a locked client they arrive `null` and the
 * client renders the teaser + PremiumOverlay instead. `locked` tells the client
 * which it received. Slot counts vary per archetype; render only what exists.
 */
export interface BeliefsCopy {
  "edu.eyebrow"?: string | null;
  "edu.teaser"?: string | null;
  "edu.body.p1"?: string | null;
  "edu.body.p2"?: string | null;
  "edu.body.p3"?: string | null;
  "body.p1"?: string | null;
  keep: (string | null)[];
  loosen: { belief: string | null; shift: string | null }[];
  "learn.eyebrow"?: string | null;
  "learn.body"?: string | null;
  /** True when the per-archetype keep/loosen/body were withheld (unpaid). */
  locked: boolean;
}

interface Props {
  archetype: string;
  copy: BeliefsCopy | null;
  isUnlocked: boolean;
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

/** One "keep" belief — a green left-border quote card. */
const KeepItem: FC<{ text: string }> = ({ text }) => (
  <div className="report-beliefs__item report-beliefs__item--keep">
    <span className="report-beliefs__quote" aria-hidden="true">
      &ldquo;
    </span>
    <p className="report-beliefs__belief">{text}</p>
  </div>
);

/** One "loosen" belief → the shift it reframes into. */
const LoosenItem: FC<{ belief: string; shift: string | null }> = ({ belief, shift }) => (
  <div className="report-beliefs__item report-beliefs__item--loosen">
    <span className="report-beliefs__quote" aria-hidden="true">
      &ldquo;
    </span>
    <p className="report-beliefs__belief">{belief}</p>
    {shift ? (
      <p className="report-beliefs__shift">
        <span className="report-beliefs__shift-label">The shift</span>
        <span className="report-beliefs__shift-arrow" aria-hidden="true">
          →
        </span>
        <span className="report-beliefs__shift-text">
          &ldquo;<span className="report-beliefs__shift-inner">{shift}</span>&rdquo;
        </span>
      </p>
    ) : null}
  </div>
);

const BeliefsSection: FC<Props> = ({
  archetype,
  copy,
  isUnlocked,
  onUnlock,
  quote = null,
  sectionTitle,
  tier = "essentials",
}) => {
  const [expanded, setExpanded] = useState(false);
  if (!copy) return null;

  const keep = copy.keep.filter((v): v is string => !!v && v.trim().length > 0);
  const loosen = copy.loosen.filter((v) => !!v.belief && v.belief.trim().length > 0);
  const locked = copy.locked;

  // Educational block is universal — always safe to show. The two-column
  // keep/loosen card is the premium payload: teased when locked.
  const eduParas = [copy["edu.body.p1"], copy["edu.body.p2"], copy["edu.body.p3"]].filter(
    (p): p is string => !!p
  );
  const hasEdu = !!copy["edu.teaser"] || eduParas.length > 0;

  // When locked, tease the first two "keep" beliefs unblurred (universal-safe
  // in spirit — they're gentle, and the real per-archetype set is withheld
  // server-side anyway) and blur any that remain behind the overlay.

  return (
    <div className="report-beliefs">
      <h3 className="report-beliefs__heading">Typical Beliefs</h3>

      {copy["learn.body"] ? (
        <div className="report-beliefs__learn-pill-wrap">
          <span className="report-beliefs__learn-pill">
            <span className="report-beliefs__learn-pill-icon" aria-hidden="true">
              <BookIcon />
            </span>
            {copy["learn.eyebrow"] ?? "What you will learn"}
          </span>
          <p className="report-beliefs__learn-body">{copy["learn.body"]}</p>
        </div>
      ) : null}

      <article className="report-beliefs__card">
        {locked ? (
          <>
            {/* Teaser: a couple of "keep" beliefs peek through, the full
                per-archetype keep/loosen grid is withheld server-side and the
                PremiumOverlay anchors over the blurred stand-in. */}
            <div className="report-beliefs__preview report-beliefs__preview--locked">
              {/* Two real beliefs per column, sharp — Figma's locked frame keeps this
                  chapter's top rows crisp rather than blurring them — and the rest
                  of each column as PIXELS.

                  Those pixels are `beliefs-keep` / `beliefs-loosen`: build-time
                  rasters of the real remaining rows, blurred and quarter-scaled
                  before shipping (see LockedPreviewImage). That is what lets the
                  chapter stand at its true nineteen-row length while only two
                  beliefs per column are in the payload — strip every filter in
                  devtools and there is nothing past row two to read.

                  One image per column, not one for the section: the columns sit
                  side by side but a keep row is 51px against a loosen row's 111px,
                  so a single raster under the sharp rows would line up with one
                  column and not the other.

                  Each raster is a SIBLING of its list, not its last child, so the
                  two columns can share grid row tracks (label / rows / raster) and
                  the blur starts on one straight line across the card however the
                  rows wrap. */}
              <div className="report-beliefs__preview-fade report-beliefs__preview-fade--tease">
                <div className="report-beliefs__cols">
                  {keep.length > 0 ? (
                    <div className="report-beliefs__col">
                      <p className="report-beliefs__col-label report-beliefs__col-label--keep">
                        Serve you &mdash; keep
                      </p>
                      <div className="report-beliefs__list">
                        {keep.map((text, i) => (
                          <KeepItem key={i} text={text} />
                        ))}
                      </div>
                      <LockedPreviewImage name="beliefs-keep" />
                    </div>
                  ) : null}

                  {loosen.length > 0 ? (
                    <div className="report-beliefs__col report-beliefs__col--loosen-col">
                      <p className="report-beliefs__col-label report-beliefs__col-label--loosen">
                        Box you in &mdash; loosen
                      </p>
                      <div className="report-beliefs__list">
                        {loosen.map((item, i) => (
                          <LoosenItem key={i} belief={item.belief as string} shift={item.shift} />
                        ))}
                      </div>
                      <LockedPreviewImage name="beliefs-loosen" />
                    </div>
                  ) : null}
                </div>
              </div>
              <PremiumOverlay
                archetype={archetype}
                sectionTitle={sectionTitle}
                tier={tier}
                quote={quote}
                onUnlock={onUnlock}
              />
            </div>
          </>
        ) : (
          <>
            <div className="report-beliefs__cols">
              {keep.length > 0 ? (
                <div className="report-beliefs__col">
                  <p className="report-beliefs__col-label report-beliefs__col-label--keep">
                    Serve you &mdash; keep
                  </p>
                  <div className="report-beliefs__list">
                    {keep.map((text, i) => (
                      <KeepItem key={i} text={text} />
                    ))}
                  </div>
                </div>
              ) : null}

              {loosen.length > 0 ? (
                <div className="report-beliefs__col report-beliefs__col--loosen-col">
                  <p className="report-beliefs__col-label report-beliefs__col-label--loosen">
                    Box you in &mdash; loosen
                  </p>
                  <div className="report-beliefs__list">
                    {loosen.map((item, i) => (
                      <LoosenItem key={i} belief={item.belief as string} shift={item.shift} />
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            {copy["body.p1"] ? (
              <p className="report-beliefs__note">{copyParagraphs(copy["body.p1"])}</p>
            ) : null}
          </>
        )}

        {hasEdu ? (
          <div className="report-beliefs__details">
            <button
              type="button"
              className="report-beliefs__details-summary"
              aria-expanded={locked ? false : expanded}
              onClick={locked ? onUnlock : () => setExpanded((v) => !v)}
            >
              <span className="report-beliefs__details-icon" aria-hidden="true">
                <BookIcon />
              </span>
              <span className="report-beliefs__details-eyebrow">
                {copy["edu.eyebrow"] ?? "Learn: where beliefs come from"}
              </span>
              <span
                className={`report-beliefs__details-chevron${expanded ? " is-open" : ""}`}
                aria-hidden="true"
              >
                ⌄
              </span>
            </button>

            {/* Figma's "peek CTA" — the third and last collapsible that was
                missing it (see AttachmentPatternsSection / AcceleratorsSection). */}
            {locked || !expanded ? (
              <div className="report-beliefs__details-peek report-learn-peek">
                {copy["edu.teaser"] ? (
                  <p className="report-beliefs__details-teaser report-learn-teaser">
                    {copy["edu.teaser"]}
                    {copy["edu.body.p1"] ? ` ${copy["edu.body.p1"]}` : null}
                  </p>
                ) : null}
                {locked || eduParas.length > 0 ? (
                  <button
                    type="button"
                    className="report-beliefs__peek-cta report-learn-cta"
                    onClick={locked ? onUnlock : () => setExpanded(true)}
                  >
                    {locked ? "Unlock to read the full explanation" : "Read the full explanation"}
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="report-beliefs__details-body">
                {copy["edu.teaser"] ? (
                  <p className="report-beliefs__details-teaser report-learn-teaser-full">
                    {copy["edu.teaser"]}
                  </p>
                ) : null}
                {eduParas.map((para, i) => (
                  <p key={i} className="report-beliefs__details-para">
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

export default BeliefsSection;
