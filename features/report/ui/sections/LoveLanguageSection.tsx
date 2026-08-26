"use client";

import { useState, type CSSProperties, type FC } from "react";
import LockedPreviewImage from "./LockedPreviewImage";
import PremiumOverlay, { type PremiumOverlayTier } from "./PremiumOverlay";
import { useRevealOnView } from "../hooks/useRevealOnView";
import type { ReportPriceQuoteSnapshot } from "@features/pricing/logic/reportPricing";
import { renderEduPara } from "./eduPara";
import { copyParagraphs } from "./copyParagraphs";
import LearnPill from "./LearnPill";

/**
 * Server-resolved love-language copy (`getReport2Section(name, "lovelang")`),
 * threaded as a prop because the 634KB copy module is server-only (see
 * `app/api/report/route.ts` → `lovelangCopy`).
 *
 * GATING (Part III, FULL_REPORT tier — section `love_language`, #19; NOT in
 * `ESSENTIALS_SECTION_IDS`, so it only unlocks at the full_report tier). The
 * universal slots — `edu.*`, `learn.*` — are always shipped. The
 * per-archetype payload — `body.p1` (the "catch" line) plus `love_language_order`
 * (the reader's ranked ordering of the five languages) — is the gated content:
 * shipped ONLY when unlocked at the full_report tier. A locked client
 * (`locked: true`) receives `body.p1: null` + `order: null`, renders the hook
 * teaser + a blurred stand-in + PremiumOverlay. Never send locked per-archetype
 * content to an unpaid client.
 */
export interface LoveLanguageCopy {
  "body.p1"?: string | null;
  "edu.eyebrow"?: string | null;
  "edu.teaser"?: string | null;
  "edu.body.p1"?: string | null;
  "edu.body.p2"?: string | null;
  "edu.body.p3"?: string | null;
  "learn.eyebrow"?: string | null;
  "learn.body"?: string | null;
  /** Second Key Concepts paragraph — see data/report2-key-concepts.ts. */
  "learn.body.p2"?: string | null;
  /** True when the per-archetype `body.p1` + `love_language_order` were withheld (unpaid). */
  locked: boolean;
}

interface Props {
  archetype: string;
  copy: LoveLanguageCopy | null;
  /**
   * Reader's ranked ordering of the five languages — config `love_language_order`
   * (slug list, rank 1..5). Null when locked or absent for the archetype (only
   * some archetypes carry one; e.g. Spiritual Lover). Absent ⇒ the framing/edu
   * render WITHOUT the ranked list rather than fabricating an order.
   */
  order: string[] | null;
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
 * The five love languages are UNIVERSAL — the same five for every archetype;
 * only their RANK ORDER varies per reader. Display name + a one-line blurb are
 * hardcoded here from the Figma (8427:2107…8427:2165), so the row heading/
 * description are correct for all 14 without fabricating any archetype-specific
 * line. Keyed by the `order` slug from config `love_language_order`.
 */
const LANGUAGES: Record<string, { name: string; blurb: string }> = {
  presence_time: {
    name: "Presence & time",
    blurb: "Undivided attention — a partner who truly arrives",
  },
  reverent_touch: {
    name: "Reverent touch",
    blurb: "Slow, lingering contact — worship, not grabbing",
  },
  sincere_words: {
    name: "Sincere words",
    blurb: "Heartfelt truth over compliments",
  },
  acts_of_care: {
    name: "Acts of care",
    blurb: "Received warmly — but they don't open the erotic door",
  },
  gifts: {
    name: "Gifts",
    blurb: "Sweet, but never the main channel",
  },
};

/**
 * Per-RANK visual: intensity word + meter fill % + track/dot colors. Per the
 * Figma (8427:2101), the bars/labels are tinted by POSITION, not by which
 * language sits there — rank 1 fills ~92% solid purple ("strongest"), and it
 * decays to rank 5 at ~11% muted ("lightest"). Universal for every reader; the
 * reader's `order` only decides which language occupies each rank. The 6th+
 * entry (never expected — only five languages) reuses the lightest style.
 */
const RANK_STYLES = [
  { word: "strongest", fill: 92, track: "rgba(157,138,215,0.6)", dot: "#9d8ad7", glow: "#a78bfa" },
  { word: "strong", fill: 78, track: "rgba(167,139,250,0.5)", dot: "#a78bfa", glow: "#c4b5fd" },
  { word: "moderate", fill: 55, track: "rgba(107,102,120,0.45)", dot: "#8d84a6", glow: "#b3aac6" },
  { word: "lighter", fill: 34, track: "rgba(107,102,120,0.3)", dot: "#a6a0b5", glow: "#c9c3d8" },
  { word: "lightest", fill: 12, track: "rgba(107,102,120,0.2)", dot: "#c9c3d8", glow: "#ded9e8" },
] as const;

/** One ranked language row: index · name+blurb · meter bar · intensity word. */
const LanguageRow: FC<{ index: number; name: string; blurb: string }> = ({
  index,
  name,
  blurb,
}) => {
  const style = RANK_STYLES[Math.min(index, RANK_STYLES.length - 1)]!;
  return (
    // `--row` staggers this row's bar behind the one above it (see .report-chart-reveal).
    <li className="report-lovelang__row" style={{ "--row": index } as CSSProperties}>
      <span className="report-lovelang__rank" aria-hidden="true">
        {String(index + 1).padStart(2, "0")}
      </span>
      <span className="report-lovelang__row-main">
        <span className="report-lovelang__lang">{name}</span>
        <span className="report-lovelang__blurb">{blurb}</span>
      </span>
      <span className="report-lovelang__meter" aria-hidden="true">
        <span className="report-lovelang__meter-track" />
        <span
          className="report-lovelang__meter-fill"
          style={{ width: `${style.fill}%`, background: style.track }}
        />
        <span
          className="report-lovelang__meter-dot"
          style={{
            left: `${style.fill}%`,
            background: style.dot,
            boxShadow: `0 0 9px ${style.glow}`,
          }}
        />
      </span>
      <span className="report-lovelang__intensity">{style.word}</span>
    </li>
  );
};

/** The ranked list of the five languages in the reader's order (rank 1..5). */
const RankedList: FC<{ order: string[] }> = ({ order }) => {
  const [listRef, revealed] = useRevealOnView<HTMLOListElement>();
  return (
    <ol
      ref={listRef}
      className={`report-lovelang__list report-chart-reveal${revealed ? " is-revealed" : ""}`}
    >
      {order.map((slug, i) => {
        const lang = LANGUAGES[slug] ?? { name: slug, blurb: "" };
        return <LanguageRow key={slug} index={i} name={lang.name} blurb={lang.blurb} />;
      })}
    </ol>
  );
};

// Fallback ordering for the locked blurred stand-in only — generic filler under
// the blur; the reader's real order is withheld server-side.
const PLACEHOLDER_ORDER = [
  "presence_time",
  "reverent_touch",
  "sincere_words",
  "acts_of_care",
  "gifts",
];

const LoveLanguageSection: FC<Props> = ({
  archetype,
  copy,
  order,
  offerDeadline,
  onUnlock,
  quote = null,
  sectionTitle,
  tier = "full_report",
}) => {
  const [expanded, setExpanded] = useState(false);
  if (!copy) return null;

  const locked = copy.locked;

  // Educational block is universal — always safe to show.
  const eduParas = [copy["edu.body.p1"], copy["edu.body.p2"], copy["edu.body.p3"]].filter(
    (p): p is string => !!p
  );
  const hasEdu = !!copy["edu.teaser"] || eduParas.length > 0;

  // Ranked list renders only when config carries a real order (never fabricated).
  const hasOrder = !!order && order.length > 0;

  return (
    <div className="report-lovelang">
      <h3 className="report-lovelang__heading">Love Language</h3>

      <LearnPill prefix="lovelang" copy={copy} />

      <article className="report-lovelang__card">
        {locked ? (
          <>
            <div className="report-lovelang__preview">
              {/* A pre-blurred render of the REAL chapter. Blurring the PIXELS at
                  build time means the paid copy is not in the file that ships, so
                  it cannot be read back out of the DOM. See LockedPreviewImage. */}
              <div
                className="report-lovelang__preview-fade report-preview-fade--image"
                aria-hidden="true"
              >
                <LockedPreviewImage name="lovelang" />
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
            {/* Starting-hypothesis caption above the list (Figma 8427:2100). */}
            <p className="report-lovelang__caption">
              A likely pattern for your archetype — consider it a starting hypothesis. Everyone
              weighs these a little differently, and yours can shift with the season you&rsquo;re
              in.
            </p>

            {hasOrder ? <RankedList order={order!} /> : null}

            {copy["body.p1"] ? (
              <p className="report-lovelang__catch">{copyParagraphs(copy["body.p1"])}</p>
            ) : null}
          </>
        )}

        {hasEdu ? (
          <div className="report-lovelang__details">
            <button
              type="button"
              className="report-lovelang__details-summary"
              aria-expanded={locked ? false : expanded}
              onClick={locked ? onUnlock : () => setExpanded((v) => !v)}
            >
              <span className="report-lovelang__details-icon" aria-hidden="true">
                <BookIcon />
              </span>
              <span className="report-lovelang__details-eyebrow">
                {copy["edu.eyebrow"] ?? "Learn: the five love languages"}
              </span>
              <span
                className={`report-lovelang__details-chevron${expanded ? " is-open" : ""}`}
                aria-hidden="true"
              >
                ⌄
              </span>
            </button>

            {locked || !expanded ? (
              <div className="report-lovelang__details-peek report-learn-peek">
                {copy["edu.teaser"] ? (
                  <p className="report-lovelang__details-teaser report-learn-teaser">
                    {copy["edu.teaser"]}
                    {copy["edu.body.p1"] ? ` ${copy["edu.body.p1"]}` : null}
                  </p>
                ) : null}
                {locked || eduParas.length > 0 ? (
                  <button
                    type="button"
                    className="report-lovelang__peek-cta report-learn-cta"
                    onClick={locked ? onUnlock : () => setExpanded(true)}
                  >
                    {locked ? "Unlock to read the full explanation" : "Read the full explanation"}
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="report-lovelang__details-body">
                {copy["edu.teaser"] ? (
                  <p className="report-lovelang__details-teaser report-learn-teaser-full">
                    {copy["edu.teaser"]}
                  </p>
                ) : null}
                {eduParas.map((para, i) => (
                  <p key={i} className="report-lovelang__details-para">
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

export default LoveLanguageSection;
