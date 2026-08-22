"use client";

import { useState, type CSSProperties, type FC } from "react";
import VerdictStar from "./VerdictStar";
import LockedPreviewImage from "./LockedPreviewImage";
import PremiumOverlay, { type PremiumOverlayTier } from "./PremiumOverlay";
import type { ReportPriceQuoteSnapshot } from "@features/pricing/logic/reportPricing";
import { getReportTheme } from "../reportTheme";
import { useRevealOnView } from "../hooks/useRevealOnView";
import { rewardStatDots } from "./RewardSection";
import { copyParagraphs } from "./copyParagraphs";

/**
 * Server-resolved initiation copy (`getReport2Section(name, "initiation")`),
 * threaded as a prop because the 634KB copy module is server-only (see
 * `app/api/report/route.ts` → `initiationCopy`).
 *
 * GATING (Part III, FULL_REPORT tier — this section is `initiation_style`,
 * section 22, NOT in `ESSENTIALS_SECTION_IDS`, so it only unlocks at the
 * full_report tier). The framing slots (`eyebrow`, `row1.label`,
 * `practical.label`, `learn.*`) are UNIVERSAL (identical across all 14
 * archetypes) and always shipped. The per-archetype payload — `result` (e.g.
 * "Presence-led"), `row1.value`, `takeaway`, `practical.teaser`,
 * `practical.line1..3`, `body.p1`, `stat1`/`stat1.caption` PLUS the timeline
 * chart specifics (variant label) — is the gated content: shipped ONLY when the
 * report is unlocked at the full_report tier. A locked client (`locked: true`)
 * receives those `null` + null config and renders the hook teaser +
 * PremiumOverlay instead. Never send locked per-archetype content to an unpaid
 * client.
 */
export interface InitiationCopy {
  // Universal (always shipped) — these frame the section for locked clients too.
  eyebrow?: string | null;
  "row1.label"?: string | null;
  "practical.label"?: string | null;
  "learn.eyebrow"?: string | null;
  "learn.body"?: string | null;
  // Per-archetype — withheld (null) from locked clients.
  result?: string | null;
  "row1.value"?: string | null;
  takeaway?: string | null;
  "practical.teaser"?: string | null;
  "practical.line1"?: string | null;
  "practical.line2"?: string | null;
  "practical.line3"?: string | null;
  "body.p1"?: string | null;
  stat1?: string | null;
  "stat1.caption"?: string | null;
  /** True when the per-archetype result/values/copy/chart-variant were withheld. */
  locked: boolean;
}

/**
 * Timeline-chart config from `getReport2Config(name)` — normalized server-side
 * and only the small, client-safe bits are sent (the whole thing is safe even
 * when locked, since it's family framing, not per-archetype prose). `family` is
 * `families.initiation` ∈ {lost-in-translation, heard-too-loudly} and selects
 * the two-column mismatch SHAPE + labels. `variant` is `initiation_variant`
 * (e.g. "presence-led"); it's a per-archetype accent only shown unlocked.
 */
export interface InitiationConfig {
  /** families.initiation — selects the timeline-chart mismatch shape. */
  family: string;
  /** initiation_variant — per-archetype accent; may be null. */
  variant: string | null;
}

interface Props {
  archetype: string;
  copy: InitiationCopy | null;
  /** Timeline-chart config (family + variant); null when locked or absent. */
  config: InitiationConfig | null;
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

/** Lightbulb — the gold "practical" block summary icon (Figma 8762:16002). */
const BulbIcon: FC = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.6.45 1 1.16 1 1.95V16h5.2v-.25c0-.79.4-1.5 1-1.95A6 6 0 0 0 12 3Z"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * The timeline / pattern chart is the two-column mismatch (Figma 8427:2294):
 * a left "What you sent" column (your signal, per-family) and a right "What
 * arrived / was heard" column (how the partner received it). The three-beat
 * rows are UNIVERSAL-PER-FAMILY framing (never per-archetype prose — no such
 * copy slots exist beyond the Figma's Spiritual-Lover example, and we never
 * fabricate 13 more), keyed off `families.initiation`:
 *
 *   • lost-in-translation — the invitation is UNDER-received: a soft, indirect
 *     signal (presence, invitation, atmosphere) lands as an ordinary pleasant
 *     moment. This is the Figma's own default (8427:2296–2313).
 *   • heard-too-loudly — the invitation is OVER-received: a direct, playful,
 *     high-energy signal lands as pressure or a claim on the whole evening.
 *
 * Both families head the right column "What arrived" (Figma 8427:2307 and
 * 9107:1326) — the two stories are told by the six row values, which is exactly
 * what the variant frame's footer promises: "one editorial spread, two mirrored
 * families. The six row values and the takeaway swap." Values are Figma verbatim:
 * lost-in-translation from the base card 8427:2294, heard-too-loudly from
 * 9107:1313.
 */
type ChartFamily = {
  rightHeading: string;
  rows: { sent: string; got: string }[];
};

const LOST_IN_TRANSLATION: ChartFamily = {
  rightHeading: "What arrived",
  rows: [
    { sent: "a gaze held one beat longer", got: '"a calm evening"' },
    { sent: "a question that actually listened", got: '"good conversation"' },
    { sent: "a hand that wasn't in a hurry", got: '"affectionate, sleepy"' },
  ],
};

const HEARD_TOO_LOUDLY: ChartFamily = {
  // Figma 9107:1326 keeps "What arrived" for BOTH families — the mismatch is
  // carried by the row values, not by relabelling the column.
  rightHeading: "What arrived",
  rows: [
    { sent: "a clear move, said out loud", got: '"pressure"' },
    { sent: "a hand with stated intention", got: '"a demand to answer now"' },
    { sent: "an invitation without hedging", got: '"something to deflect"' },
  ],
};

export const CHART_FAMILIES: Record<string, ChartFamily> = {
  "lost-in-translation": LOST_IN_TRANSLATION,
  "heard-too-loudly": HEARD_TOO_LOUDLY,
};

/** The two-column sent → received mismatch chart (Figma 8427:2294). */
const TimelineChart: FC<{ fam: ChartFamily }> = ({ fam }) => {
  // Each row's "what you sent" appears just before "what arrived", pair by pair
  // down the chart — the mismatch is the point, so it reads as a sequence of
  // send-then-land rather than two columns switching on at once.
  const [chartRef, revealed] = useRevealOnView<HTMLDivElement>();
  return (
    <div
      ref={chartRef}
      className={`report-initiation__chart report-chart-reveal${revealed ? " is-revealed" : ""}`}
      role="img"
      aria-label="What you send versus how it arrives"
    >
      <div className="report-initiation__chart-col report-initiation__chart-col--sent">
        <p className="report-initiation__chart-head report-initiation__chart-head--sent">
          What you sent
        </p>
        {fam.rows.map((row, i) => (
          <p
            key={i}
            className="report-initiation__chart-cell"
            style={{ "--row": i } as CSSProperties}
          >
            {row.sent}
          </p>
        ))}
      </div>
      <span className="report-initiation__chart-divider" aria-hidden="true" />
      <div className="report-initiation__chart-col report-initiation__chart-col--got">
        <p className="report-initiation__chart-head report-initiation__chart-head--got">
          {fam.rightHeading}
        </p>
        {fam.rows.map((row, i) => (
          <p
            key={i}
            className="report-initiation__chart-cell report-initiation__chart-cell--got"
            style={{ "--row": i } as CSSProperties}
          >
            {row.got}
          </p>
        ))}
      </div>
    </div>
  );
};

/**
 * The mini-stat's dot-progress meter (Figma 8503:685): a row of six dots with
 * one filled — "1 in 10 make the first move". Universal decorative framing that
 * accompanies the per-archetype stat number/caption.
 */
const StatDots: FC<{ stat?: string | null }> = ({ stat }) => {
  // Derived from the stat, not a fixed six: the comment above describes "1 in
  // 10" while six dots were drawn, so the graphic contradicted the number
  // beside it. Same rule as the Reward and Arousal boxes.
  const { filled, total } = rewardStatDots(stat);
  return (
    <span className="report-initiation__stat-dots" aria-hidden="true">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          style={{ "--i": i } as CSSProperties}
          className={`report-initiation__stat-dot${i < filled ? " is-on" : ""}`}
        />
      ))}
    </span>
  );
};

const InitiationSection: FC<Props> = ({
  archetype,
  copy,
  config,
  offerDeadline,
  onUnlock,
  quote = null,
  sectionTitle,
  tier = "full_report",
}) => {
  const [statRef, statRevealed] = useRevealOnView<HTMLDivElement>({ threshold: 0 });
  const [expanded, setExpanded] = useState(false);
  if (!copy) return null;

  const locked = copy.locked;
  // Figma tints the eyebrow + "What you sent" with the reader's accent (purple on
  // the base card, orange on the variant); both were hardcoded purple for all 14.
  const accent = getReportTheme(archetype).accent;
  const accentVars = {
    "--init-accent": accent,
    "--init-accent-muted": `color-mix(in srgb, ${accent} 70%, #3f3a4d)`,
  } as CSSProperties;

  // Chart family — universal fallback to `lost-in-translation` (the Figma
  // default) when config is absent (locked). The chart is family framing, so
  // it's safe to draw even locked (under the blur), keyed off config present.
  const family = config?.family ?? "lost-in-translation";
  const fam = CHART_FAMILIES[family] ?? LOST_IN_TRANSLATION;

  // Practical block — per-archetype but the label is universal; teaser/lines are
  // withheld (null) for a locked client. Same peek→expand pattern as siblings.
  const practicalLines = [
    copy["practical.line1"],
    copy["practical.line2"],
    copy["practical.line3"],
  ].filter((p): p is string => !!p);

  /**
   * The collapsed peek is three lines of flowing prose that break mid-sentence
   * (Figma 8762:15709). The teaser alone runs ~2.7 lines at desktop width, so the
   * tease continues into the numbered steps — with their "1." / "2." markers
   * dropped, since inside a paragraph they read as stray digits rather than a list.
   */
  const practicalTease = [
    copy["practical.teaser"],
    copy["practical.line1"],
    copy["practical.line2"],
  ]
    .filter((part): part is string => !!part)
    .map((part, i) => (i === 0 ? part : part.replace(/^\s*\d+\.\s*/, "")))
    .join(" ");
  const hasPractical = !!copy["practical.teaser"] || practicalLines.length > 0;

  // Mini-stat — per-archetype; render only when both value + caption present
  // (never fabricate a stat). Withheld (null) for a locked client.
  const stat = copy.stat1?.trim();
  const statCaption = copy["stat1.caption"]?.trim();
  const hasStat = !!stat && !!statCaption;

  // The "How you start" row (row1.label universal; row1.value per-archetype).
  const hasRow1 = !!copy["row1.value"]?.trim();

  return (
    <div className="report-initiation" style={accentVars}>
      <h3 className="report-initiation__heading">Initiation Style</h3>

      {copy["learn.body"] ? (
        <div className="report-initiation__learn-pill-wrap">
          <span className="report-initiation__learn-pill">
            <span className="report-initiation__learn-pill-icon" aria-hidden="true">
              <BookIcon />
            </span>
            {copy["learn.eyebrow"] ?? "What you will learn"}
          </span>
          <p className="report-initiation__learn-body">{copy["learn.body"]}</p>
        </div>
      ) : null}

      <article className="report-initiation__card">
        {locked ? (
          <>
            <div className="report-initiation__preview">
              {/* A pre-blurred render of the REAL chapter. Blurring the PIXELS at
                  build time means the paid copy is not in the file that ships, so
                  it cannot be read back out of the DOM. See LockedPreviewImage. */}
              <div
                className="report-initiation__preview-fade report-preview-fade--image"
                aria-hidden="true"
              >
                <LockedPreviewImage name="initiation" />
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
            <div className="report-initiation__result-head">
              <p className="report-initiation__result-eyebrow">
                {copy.eyebrow ?? "Your Initiation Style"}
              </p>
              {copy.result ? <p className="report-initiation__result">{copy.result}</p> : null}
            </div>

            <TimelineChart fam={fam} />

            {copy["body.p1"] ? (
              <p className="report-initiation__body">{copyParagraphs(copy["body.p1"])}</p>
            ) : null}

            {hasRow1 ? (
              <div className="report-initiation__row">
                <p className="report-initiation__row-term">
                  {copy["row1.label"] ?? "How you start"}
                </p>
                <p className="report-initiation__row-detail">{copy["row1.value"]}</p>
              </div>
            ) : null}

            {hasStat ? (
              <div
                ref={statRef}
                className={`report-initiation__stat report-chart-reveal${
                  statRevealed ? " is-revealed" : ""
                }`}
              >
                <StatDots stat={stat} />
                <span className="report-initiation__stat-value">{stat}</span>
                <span className="report-initiation__stat-caption">{statCaption}</span>
              </div>
            ) : null}

            {copy.takeaway ? (
              <div className="report-initiation__verdict report-verdict">
                <VerdictStar />
                <p className="report-initiation__takeaway">{copy.takeaway}</p>
                <span className="report-verdict-rule" aria-hidden="true" />
              </div>
            ) : null}
          </>
        )}

        {/* Locked renders this too, exactly as the eleven purple "Learn" expanders do:
            the label is universal and the block is already locked-aware (closed, with
            an unlock CTA). `hasPractical` is false on a locked report — the teaser and
            the moves are the reader's own and withheld — so gating on it alone dropped
            the block entirely, and putting it in the raster instead made it read at the
            raster's 62% wash while every other chapter's expander sat live beside it. */}
        {locked || hasPractical ? (
          <div className="report-initiation__details">
            <button
              type="button"
              className="report-initiation__details-summary"
              aria-expanded={locked ? false : expanded}
              onClick={locked ? onUnlock : () => setExpanded((v) => !v)}
            >
              <span className="report-initiation__details-icon" aria-hidden="true">
                <BulbIcon />
              </span>
              <span className="report-initiation__details-eyebrow">
                {copy["practical.label"] ?? "The fix: one conversation"}
              </span>
              <span
                className={`report-initiation__details-chevron${expanded ? " is-open" : ""}`}
                aria-hidden="true"
              >
                ⌄
              </span>
            </button>

            {locked || !expanded ? (
              <div className="report-initiation__details-peek report-learn-peek">
                {/* The teaser is per-archetype and withheld from a locked client, so it
                    arrives as pixels — a build-time capture of the real line, in the
                    slot the eleven universal expanders fill with live text. Without it
                    the block read as label + button while every other chapter's showed
                    a sentence. */}
                {locked ? (
                  <LockedPreviewImage name="practical-initiation" />
                ) : copy["practical.teaser"] ? (
                  <p className="report-initiation__details-teaser report-learn-teaser">
                    {practicalTease}
                  </p>
                ) : null}
                {locked || practicalLines.length > 0 ? (
                  <button
                    type="button"
                    className="report-initiation__peek-cta report-learn-cta"
                    onClick={locked ? onUnlock : () => setExpanded(true)}
                  >
                    {locked ? "Unlock to read the full practice" : "Read the full practice"}
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="report-initiation__details-body">
                {copy["practical.teaser"] ? (
                  <p className="report-initiation__details-teaser report-learn-teaser-full">
                    {copy["practical.teaser"]}
                  </p>
                ) : null}
                {practicalLines.map((para, i) => (
                  <p key={i} className="report-initiation__details-para">
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

export default InitiationSection;
