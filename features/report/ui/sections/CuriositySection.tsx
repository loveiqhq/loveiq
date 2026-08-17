"use client";

import { useState, type FC } from "react";
import LockedPreviewImage from "./LockedPreviewImage";
import PremiumOverlay, { type PremiumOverlayTier } from "./PremiumOverlay";
import type { ReportPriceQuoteSnapshot } from "@features/pricing/logic/reportPricing";
import { renderEduPara } from "./eduPara";

/**
 * Server-resolved curiosity copy (`getReport2Section(name, "curiosity")`),
 * threaded as a prop because the 634KB copy module is server-only (see
 * `app/api/report/route.ts` → `curiosityCopy`).
 *
 * GATING (Part III, FULL_REPORT tier — `curiosity_level`, section 16; NOT in
 * `ESSENTIALS_SECTION_IDS`, so it only unlocks at the full_report tier). The
 * universal slots — `gate.hook`, `edu.*` (incl. the 14-item `edu.struct.N` list
 * of relationship structures) and `learn.*` — are always shipped. The
 * per-archetype payload — `takeaway` (italic pull-quote), `body.p1` (the bold
 * intro read) plus `body.p2/p3`, and the `relationshipFit` map — is the gated
 * content: shipped ONLY when unlocked at the full_report tier. A locked client
 * (`locked: true`) receives `takeaway/body.* : null` + `relationshipFit: null`,
 * renders the hook teaser + a blurred stand-in + PremiumOverlay. Never send
 * locked per-archetype content to an unpaid client.
 */
export interface CuriosityCopy {
  "gate.hook"?: string | null;
  takeaway?: string | null;
  "body.p1"?: string | null;
  "body.p2"?: string | null;
  "body.p3"?: string | null;
  "edu.eyebrow"?: string | null;
  "edu.teaser"?: string | null;
  "edu.body.p1"?: string | null;
  "edu.body.p2"?: string | null;
  "learn.eyebrow"?: string | null;
  "learn.body"?: string | null;
  /** Universal list of relationship structures (`edu.struct.1` … `edu.struct.14`). */
  [struct: `edu.struct.${number}`]: string | null | undefined;
  /** True when the per-archetype takeaway/body + fit map were withheld (unpaid). */
  locked: boolean;
}

interface Props {
  archetype: string;
  copy: CuriosityCopy | null;
  /**
   * Reader's fit across relationship forms — config `relationship_fit`
   * (structure slug → 0..3 score), falling back to
   * `data/report2-relationship-fit.ts` for the 13 archetypes with no config
   * entry. Null only when locked ⇒ the fit rows render without dots.
   */
  relationshipFit: Record<string, number> | null;
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
 * The nine relationship forms shown in the fit table, keyed to the config
 * `relationship_fit` slugs. Order + display label are FIXED per Figma
 * (8427:2013…8427:2069) — universal for every reader; only the per-slug score
 * (→ how many of the three dots fill) is per-archetype. This is the compact
 * "fit" ranking, distinct from the fuller 14-item educational struct list
 * (`edu.struct.N`), which stays universal copy.
 */
const FIT_FORMS: { slug: string; label: string }[] = [
  { slug: "monogamy", label: "Monogamy" },
  { slug: "deep_monogamy", label: 'Deep monogamy · "soul-bond" partnership' },
  {
    slug: "structured_openness",
    label: "Structured openness with an unmistakable emotional center",
  },
  { slug: "monogamish", label: "Monogamish (rare, negotiated exceptions)" },
  { slug: "open_no_priority", label: "Open relationship without emotional priority" },
  { slug: "polyamory_no_priority", label: "Polyamory without emotional prioritization" },
  { slug: "dadt", label: "Don't-ask-don't-tell arrangements" },
  { slug: "casual", label: "Casual dating & situationships" },
  { slug: "anarchy", label: "Relationship anarchy without shared meaning" },
];

/**
 * Dot state per position from a 0..3 fit score. The Figma renders three dots:
 * full purple `#9d8ad7` when the score covers the whole slot (`score ≥ i+1`),
 * orange `#e2a48f` for a half slot (`score ≥ i+0.5`), muted `#f0eef4`
 * otherwise. e.g. 3 → ●●● purple; 2 → ●● purple + muted; 1.5 → ● purple +
 * orange + muted; 0.5 → orange + muted + muted. `null` score (locked/absent) is
 * handled by the caller (no dots rendered).
 */
function dotFill(score: number, i: number): "full" | "half" | "empty" {
  if (score >= i + 1) return "full";
  if (score >= i + 0.5) return "half";
  return "empty";
}

/** One fit row: form label + three fill dots (or none when the score is absent). */
const FitRow: FC<{ label: string; score: number | null }> = ({ label, score }) => (
  <li className="report-curiosity__fit-row">
    <span className="report-curiosity__fit-label">{label}</span>
    <span className="report-curiosity__fit-dots" aria-hidden="true">
      {score == null
        ? null
        : [0, 1, 2].map((i) => (
            <span
              key={i}
              className={`report-curiosity__fit-dot report-curiosity__fit-dot--${dotFill(score, i)}`}
            />
          ))}
    </span>
  </li>
);

/**
 * Figma 8427:2010 sets the lead paragraph's opening phrase in Manrope Bold
 * `#161021` and the rest in regular `#3f3a4d` — the phrase naming the reader's
 * curiosity type ("Depth-first curiosity", "Care-first curiosity", …). Two
 * archetypes phrase it as a condition instead ("Your curiosity has one
 * condition:"), so the early-colon form is bolded too. Anything else is left
 * plain rather than guessing where the emphasis ends.
 */
function renderCuriosityLead(text: string) {
  const typed = /^[A-Z][\w-]*-first curiosity/.exec(text);
  const colon = typed ? null : /^[^.!?]{0,44}?:/.exec(text);
  const lead = typed?.[0] ?? colon?.[0];
  if (!lead) return text;
  return (
    <>
      <strong className="report-curiosity__lead-strong">{lead}</strong>
      {text.slice(lead.length)}
    </>
  );
}

/** The compact fit table — the nine forms with the reader's dots. */
const FitTable: FC<{ fit: Record<string, number> | null }> = ({ fit }) => (
  <>
    <p className="report-curiosity__fit-eyebrow">Fit by relationship form</p>
    <ul className="report-curiosity__fit-list">
      {FIT_FORMS.map(({ slug, label }) => (
        <FitRow key={slug} label={label} score={fit ? (fit[slug] ?? null) : null} />
      ))}
    </ul>
  </>
);

const CuriositySection: FC<Props> = ({
  archetype,
  copy,
  relationshipFit,
  offerDeadline,
  onUnlock,
  quote = null,
  sectionTitle,
  tier = "full_report",
}) => {
  const [expanded, setExpanded] = useState(false);
  if (!copy) return null;

  const locked = copy.locked;

  // Educational block is universal — always safe to show. p2 introduces the
  // struct list, which renders as a bulleted "structure: description" list.
  const eduIntro = [copy["edu.body.p1"], copy["edu.body.p2"]].filter((p): p is string => !!p);
  const structs = Array.from({ length: 14 }, (_, i) => copy[`edu.struct.${i + 1}`]).filter(
    (s): s is string => !!s
  );
  const hasEdu = !!copy["edu.teaser"] || eduIntro.length > 0 || structs.length > 0;

  return (
    <div className="report-curiosity">
      <h3 className="report-curiosity__heading">Curiosity &amp; Relationship Form</h3>

      {copy["learn.body"] ? (
        <div className="report-curiosity__learn-pill-wrap">
          <span className="report-curiosity__learn-pill">
            <span className="report-curiosity__learn-pill-icon" aria-hidden="true">
              <BookIcon />
            </span>
            {copy["learn.eyebrow"] ?? "What you will learn"}
          </span>
          <p className="report-curiosity__learn-body">{copy["learn.body"]}</p>
        </div>
      ) : null}

      <article className="report-curiosity__card">
        {locked ? (
          <>
            {copy["gate.hook"] ? (
              <p className="report-curiosity__hook">{copy["gate.hook"]}</p>
            ) : null}
            <div className="report-curiosity__preview">
              {/* A pre-blurred render of the REAL chapter. Blurring the PIXELS at
                  build time means the paid copy is not in the file that ships, so
                  it cannot be read back out of the DOM. See LockedPreviewImage. */}
              <div
                className="report-curiosity__preview-fade report-preview-fade--image"
                aria-hidden="true"
              >
                <LockedPreviewImage name="curiosity" />
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
            {copy["body.p1"] ? (
              <p className="report-curiosity__lead">{renderCuriosityLead(copy["body.p1"])}</p>
            ) : null}

            <FitTable fit={relationshipFit} />

            {copy.takeaway ? (
              <div className="report-curiosity__verdict">
                <span className="report-curiosity__star" aria-hidden="true">
                  &#10037;
                </span>
                <p className="report-curiosity__takeaway">{copy.takeaway}</p>
              </div>
            ) : null}
          </>
        )}

        {hasEdu ? (
          <div className="report-curiosity__details">
            <button
              type="button"
              className="report-curiosity__details-summary"
              aria-expanded={locked ? false : expanded}
              onClick={locked ? onUnlock : () => setExpanded((v) => !v)}
            >
              <span className="report-curiosity__details-icon" aria-hidden="true">
                <BookIcon />
              </span>
              <span className="report-curiosity__details-eyebrow">
                {copy["edu.eyebrow"] ?? "Learn: curiosity and structure"}
              </span>
              <span
                className={`report-curiosity__details-chevron${expanded ? " is-open" : ""}`}
                aria-hidden="true"
              >
                ⌄
              </span>
            </button>

            {locked || !expanded ? (
              <div className="report-curiosity__details-peek report-learn-peek">
                {copy["edu.teaser"] ? (
                  <p className="report-curiosity__details-teaser report-learn-teaser">
                    {copy["edu.teaser"]}
                  </p>
                ) : null}
                {locked || eduIntro.length > 0 || structs.length > 0 ? (
                  <button
                    type="button"
                    className="report-curiosity__peek-cta report-learn-cta"
                    onClick={locked ? onUnlock : () => setExpanded(true)}
                  >
                    {locked ? "Unlock to read the full explanation" : "Read the full explanation"}
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="report-curiosity__details-body">
                {copy["edu.teaser"] ? (
                  <p className="report-curiosity__details-teaser report-learn-teaser-full">
                    {copy["edu.teaser"]}
                  </p>
                ) : null}
                {eduIntro.map((para, i) => (
                  <p key={i} className="report-curiosity__details-para">
                    {renderEduPara(para)}
                  </p>
                ))}
                {structs.length > 0 ? (
                  <ul className="report-curiosity__struct-list">
                    {structs.map((line, i) => {
                      // "Structure name: description." — bold the label before the colon.
                      const idx = line.indexOf(":");
                      const name = idx >= 0 ? line.slice(0, idx + 1) : line;
                      const rest = idx >= 0 ? line.slice(idx + 1) : "";
                      return (
                        <li key={i} className="report-curiosity__struct-item">
                          <span className="report-curiosity__struct-name">{name}</span>
                          {rest}
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </div>
            )}
          </div>
        ) : null}
      </article>
    </div>
  );
};

export default CuriositySection;
