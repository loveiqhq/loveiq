"use client";

import { useEffect, useState, type CSSProperties, type FC } from "react";
import LockedPreviewImage from "./LockedPreviewImage";
import PremiumOverlay, { type PremiumOverlayTier } from "./PremiumOverlay";
import { getReportTheme } from "../reportTheme";
import type { ReportPriceQuoteSnapshot } from "@features/pricing/logic/reportPricing";
import { renderEduPara } from "./eduPara";
import { archetypeSlug } from "@/data/report2-config";
import { getConfidenceProfile } from "@/data/report2-confidence";
import { useRevealOnView } from "../hooks/useRevealOnView";

/**
 * Server-resolved Confidence Level copy (`getReport2Section(name, "confidence")`),
 * threaded as a prop because the 634KB copy module is server-only (see
 * `app/api/report/route.ts` → `confidenceCopy`).
 *
 * GATING (Part II, essentials tier): UNLIKE the sibling premium sections, EVERY
 * copy slot here is universal education (`gate.hook`, `edu.*`, `chartnote1`,
 * `learn.*`) — always shipped. The per-archetype specificity is the confidence
 * RESULT, which lives in config `confidence_strip` (see `ConfidenceStrip`), not
 * in copy. `locked` tells the client whether the report is unlocked at the
 * essentials tier; when locked, `confidenceStrip` arrives `null` (withheld
 * server-side) and the client renders a blurred stand-in + PremiumOverlay.
 */
export interface ConfidenceCopy {
  "gate.hook"?: string | null;
  "edu.eyebrow"?: string | null;
  "edu.teaser"?: string | null;
  "edu.body.p1"?: string | null;
  "edu.body.p2"?: string | null;
  chartnote1?: string | null;
  "learn.eyebrow"?: string | null;
  "learn.body"?: string | null;
  /** True when the report is not unlocked at the essentials tier. */
  locked: boolean;
}

/**
 * The reader's confidence RESULT from `getReport2Config(name).confidence_strip`.
 * Only Spiritual Lover carries a real one today (`result_word` "Meaning-
 * Contingent"); the other 13 are null in config, so `confidenceStrip` is null for
 * them and the strip renders WITHOUT the reader's dot/result (never fabricated).
 * `you_dot_x` is the Figma fine x — unused for dot placement (the fixed ranking
 * below owns positions), kept for parity with the handoff.
 */
export interface ConfidenceStrip {
  you_dot_x?: number | null;
  result_word: string;
}

interface Props {
  archetype: string;
  copy: ConfidenceCopy | null;
  /** Per-archetype result; null when locked OR when config has no strip. */
  strip: ConfidenceStrip | null;
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
 * The confidence strip: 14 archetype dots on a horizontal continuum, positions
 * extracted from Figma node 8427:1577 (normalized x, 0..1 across the axis). The
 * SAME layout renders for every viewer — only the highlighted "You" dot changes.
 * The Figma labels ONLY three: the two named endpoints (Quiet Withdrawer, left;
 * Radiant Performer, right) and the reader's own dot. The other 11 stay anonymous
 * colored markers — exactly as the frame shows — so no archetype→dot identity is
 * fabricated. `youX` is the reader's own dot x (Spiritual Lover = 0.4909 per
 * Figma); when null, the reader's dot/pill is omitted (config had no strip).
 */
const DOT_XS = [
  0.0727, 0.1418, 0.2255, 0.3255, 0.4473, 0.4909, 0.5473, 0.64, 0.7109, 0.7891, 0.8364, 0.8855,
  0.9291, 0.9691,
] as const;

/**
 * Per-dot colour, sampled straight off Figma 8427:1577 in x order.
 *
 * The frame gives every dot its own archetype accent; ours painted all fourteen
 * the same flat rgba(157,138,215,0.45), so thirteen archetypes were rendered as
 * anonymous grey-purple and only the reader's own dot carried colour.
 *
 * The index mapping is measured, not assumed: solving the axis span from the
 * first and last dot predicts every intermediate dot's x to within 1px of
 * DOT_XS, and index 5 comes back both #9d8ad7 (Spiritual Lover, the archetype
 * this frame mocks) and physically wider than its neighbours — the "you" dot,
 * exactly where DOT_XS puts it at 0.4909. Index 1 is grey because it is
 * Minimalist Companion; it needs sampling off the axis line to isolate, since a
 * saturation test drops it.
 *
 * No archetype→dot identity is named here — these stay anonymous markers as the
 * frame intends. Only their colour is restored.
 */
const DOT_COLORS = [
  "#9fc4df",
  "#cccac8",
  "#c9f7f5",
  "#bb96f0",
  "#e7bdc9",
  "#9d8ad7",
  "#92f2bf",
  "#e5a1a2",
  "#81efe6",
  "#f5bb6e",
  "#f59c82",
  "#e7c78d",
  "#f57898",
  "#94b9ac",
] as const;

// The reader's dot for Spiritual Lover sits at index 5 (x 0.4909) in the Figma.
const SPIRITUAL_LOVER_YOU_X = 0.4909;

// The two Figma-labelled endpoints (first + last dot x, from DOT_XS).
const END_LABELS: { x: number; text: string }[] = [
  { x: 0.0727, text: "Quiet Withdrawer" },
  { x: 0.9691, text: "Radiant Performer" },
];

/** #RRGGBB → "r g b" for rgb() with slash-alpha halos. */
function hexToRgbTriplet(hex: string): string {
  const c = hex.replace("#", "");
  const n = Number.parseInt(
    c.length === 3
      ? c
          .split("")
          .map((ch) => ch + ch)
          .join("")
      : c,
    16
  );
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

/**
 * The confidence continuum (inline CSS strip, per Figma 8427:1577). `youX` marks
 * the reader's dot when known; `youAccent` colours it. `blurred` renders the
 * gated stand-in (real result withheld). Anonymous dots use a neutral tint.
 */
const ConfidenceStripGraphic: FC<{
  youX: number | null;
  youAccent: string;
  youLabel: string;
}> = ({ youX, youAccent, youLabel }) => {
  // Was a mount-time requestAnimationFrame, so the marker had already slid into
  // place long before the reader scrolled down to the strip.
  const [stripRef, isAnimated] = useRevealOnView<HTMLDivElement>();

  return (
    <div
      ref={stripRef}
      className={`report-confidence__strip${isAnimated ? " is-animated" : ""}`}
      role="img"
      aria-label="Where your sexual confidence sits among the archetypes"
    >
      <div className="report-confidence__endpoints" aria-hidden="true">
        {END_LABELS.map((e) => (
          <span
            key={e.text}
            className="report-confidence__endpoint"
            style={{ "--dot-x": `${e.x * 100}%` } as CSSProperties}
          >
            {e.text}
          </span>
        ))}
      </div>

      <div className="report-confidence__axis" aria-hidden="true">
        <span className="report-confidence__axis-line" />
        {DOT_XS.map((x, i) => {
          const isYou = youX !== null && Math.abs(x - youX) < 0.0001;
          const style = {
            "--dot-x": `${x * 100}%`,
            "--dot-order": i,
            "--dot-color": DOT_COLORS[i] ?? "#9d8ad7",
            ...(isYou ? { "--dot-accent-rgb": hexToRgbTriplet(youAccent) } : {}),
          } as CSSProperties;
          return (
            <span
              key={i}
              className={`report-confidence__dot${isYou ? " is-you" : ""}`}
              style={style}
            >
              {isYou && <span className="report-confidence__dot-pill">You</span>}
            </span>
          );
        })}
      </div>

      <div className="report-confidence__ends" aria-hidden="true">
        <span>steadier when conditions are met</span>
        <span>steady by default</span>
      </div>

      {youX !== null ? <span className="report-confidence__sr-only">{youLabel}</span> : null}
    </div>
  );
};

const ConfidenceSection: FC<Props> = ({
  archetype,
  copy,
  strip,
  offerDeadline,
  onUnlock,
  quote = null,
  sectionTitle,
  tier = "essentials",
}) => {
  const [expanded, setExpanded] = useState(false);
  if (!copy) return null;

  const locked = copy.locked;
  const accent = getReportTheme(archetype).accent;
  // Per-archetype result word + definition tail + strip position for ALL 14.
  // `confidence_strip` config only ever existed for Spiritual Lover, so the result
  // block and the reader's dot used to be absent for the other 13 — the section
  // rendered a strip with no "You" marker and no result at all. See
  // `data/report2-confidence.ts` for where these come from.
  const profile = getConfidenceProfile(archetypeSlug(archetype));
  // Config wins where it exists (Spiritual Lover), then the derived profile.
  const resultWord = strip?.result_word ?? profile?.resultWord ?? null;
  const youX = profile ? profile.dot / 100 : strip ? SPIRITUAL_LOVER_YOU_X : null;

  const eduParas = [copy["edu.body.p1"], copy["edu.body.p2"]].filter((p): p is string => !!p);
  const hasEdu = !!copy["edu.teaser"] || eduParas.length > 0;

  return (
    <div className="report-confidence">
      <h3 className="report-confidence__heading">Confidence Level</h3>

      {copy["learn.body"] ? (
        <div className="report-confidence__learn-pill-wrap">
          <span className="report-confidence__learn-pill">
            <span className="report-confidence__learn-pill-icon" aria-hidden="true">
              <BookIcon />
            </span>
            {copy["learn.eyebrow"] ?? "What you will learn"}
          </span>
          <p className="report-confidence__learn-body">{copy["learn.body"]}</p>
        </div>
      ) : null}

      <article className="report-confidence__card">
        <p className="report-confidence__eyebrow">Your Sexual Confidence</p>

        {locked ? (
          <>
            {copy["gate.hook"] ? (
              <p className="report-confidence__hook">{copy["gate.hook"]}</p>
            ) : null}
            <div className="report-confidence__preview">
              {/* A pre-blurred render of the REAL chapter. Blurring the PIXELS at
                  build time means the paid copy is not in the file that ships, so
                  it cannot be read back out of the DOM. See LockedPreviewImage. */}
              <div
                className="report-confidence__preview-fade report-preview-fade--image"
                aria-hidden="true"
              >
                <LockedPreviewImage name="confidence" />
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
            {resultWord ? (
              <div className="report-confidence__result">
                <p className="report-confidence__result-word">{resultWord}</p>
                <span className="report-confidence__result-divider" aria-hidden="true" />
                {/* Figma 9107:800 bolds the middle clause and follows it with a
                    per-archetype "Yours …" line. */}
                <p className="report-confidence__result-def">
                  How confident you feel{" "}
                  <strong>initiating, expressing, and staying present</strong> during intimacy.
                  {profile ? <> Yours {profile.anchor}.</> : null}
                </p>
              </div>
            ) : null}

            <ConfidenceStripGraphic
              youX={youX}
              youAccent={accent}
              youLabel={`You — the ${archetype}`}
            />

            {copy.chartnote1 ? (
              <p className="report-confidence__chartnote">{copy.chartnote1}</p>
            ) : null}

            {/* The three condition rows + trap + way out. Figma shows these under
                the strip; the section rendered none of them. Per-archetype, from
                `data/report2-confidence.ts`. */}
            {profile ? (
              <>
                <dl className="report-confidence__conditions">
                  {(
                    [
                      ["rises", "Rises with", "↑", profile.risesWith],
                      ["contracts", "Contracts with", "↓", profile.contractsWith],
                      ["unmoved", "Unmoved by", "→", profile.unmovedBy],
                    ] as const
                  ).map(([kind, label, glyph, value]) => (
                    <div
                      key={kind}
                      className={`report-confidence__condition report-confidence__condition--${kind}`}
                    >
                      <span className="report-confidence__condition-icon" aria-hidden="true">
                        {glyph}
                      </span>
                      <dt className="report-confidence__condition-label">{label}</dt>
                      <dd className="report-confidence__condition-value">{value}</dd>
                    </div>
                  ))}
                </dl>

                <div className="report-confidence__trap">
                  <p className="report-confidence__block-label">The trap</p>
                  <p className="report-confidence__trap-body">{profile.trap}</p>
                </div>

                <div className="report-confidence__wayout">
                  <p className="report-confidence__block-label">The way out</p>
                  <p className="report-confidence__wayout-body">{profile.wayOut}</p>
                </div>
              </>
            ) : null}
          </>
        )}

        {hasEdu ? (
          <div className="report-confidence__details">
            <button
              type="button"
              className="report-confidence__details-summary"
              aria-expanded={locked ? false : expanded}
              onClick={locked ? onUnlock : () => setExpanded((v) => !v)}
            >
              <span className="report-confidence__details-icon" aria-hidden="true">
                <BookIcon />
              </span>
              <span className="report-confidence__details-eyebrow">
                {copy["edu.eyebrow"] ?? "Learn: sexual confidence"}
              </span>
              <span
                className={`report-confidence__details-chevron${expanded ? " is-open" : ""}`}
                aria-hidden="true"
              >
                ⌄
              </span>
            </button>

            {copy["edu.teaser"] && (locked || !expanded) ? (
              <div className="report-confidence__details-peek report-learn-peek">
                <p className="report-confidence__details-teaser report-learn-teaser">
                  {copy["edu.teaser"]}
                  {copy["edu.body.p1"] ? ` ${copy["edu.body.p1"]}` : null}
                </p>
                {locked || eduParas.length > 0 ? (
                  <button
                    type="button"
                    className="report-confidence__peek-cta report-learn-cta"
                    onClick={locked ? onUnlock : () => setExpanded(true)}
                  >
                    {locked ? "Unlock to read the full explanation" : "Read the full explanation"}
                  </button>
                ) : null}
              </div>
            ) : null}

            {!locked && expanded ? (
              <div className="report-confidence__details-body">
                {copy["edu.teaser"] ? (
                  <p className="report-confidence__details-teaser report-learn-teaser-full">
                    {copy["edu.teaser"]}
                  </p>
                ) : null}
                {eduParas.map((para, i) => (
                  <p key={i} className="report-confidence__details-para">
                    {renderEduPara(para)}
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

export default ConfidenceSection;
