"use client";

import { useId, useState, type FC } from "react";
import { useRevealOnView } from "../hooks/useRevealOnView";
import PremiumOverlay, { type PremiumOverlayTier } from "./PremiumOverlay";
import type { ReportPriceQuoteSnapshot } from "@features/pricing/logic/reportPricing";
import { renderEduPara } from "./eduPara";

/**
 * Server-resolved attachment copy (`getReport2Section(name, "attachment")`),
 * threaded as a prop because the 634KB copy module is server-only (see
 * `app/api/report/route.ts` → `attachmentCopy`).
 *
 * GATING (Part II, essentials tier): `eyebrow`, `edu.*` and
 * `learn.*` are universal and always shipped. The per-archetype `result`,
 * `row*.value`, `insight.value`, `body.p1` and the attachment-plane coords are
 * the premium payload — the server sends them ONLY when the report is unlocked
 * at the essentials tier (or above). For a locked client they arrive `null` and
 * the client renders a blurred stand-in + PremiumOverlay. `locked` says which.
 *
 * The row2/row3 LABELS are family-specific (from the attachment family), not
 * from copy — resolved client-side via {@link ATTACHMENT_ROW_LABELS_BY_FAMILY}
 * so the labels match the map's drift-dot ("secure-anxious" → "Under lingering
 * disconnection" / "After rupture"). Figma 8427:1447 is the source of truth.
 */
export interface AttachmentCopy {
  eyebrow?: string | null;
  result?: string | null;
  "row1.label"?: string | null;
  "row1.value"?: string | null;
  "row2.value"?: string | null;
  "row3.value"?: string | null;
  "insight.label"?: string | null;
  "insight.value"?: string | null;
  "edu.eyebrow"?: string | null;
  "edu.teaser"?: string | null;
  "edu.body.p1"?: string | null;
  "edu.body.p2"?: string | null;
  "edu.body.p3"?: string | null;
  "edu.body.p4"?: string | null;
  "edu.body.p5"?: string | null;
  "edu.body.p6"?: string | null;
  "edu.body.p7"?: string | null;
  "body.p1"?: string | null;
  "learn.eyebrow"?: string | null;
  "learn.body"?: string | null;
  /** True when the per-archetype result/rows/insight/body/plane were withheld. */
  locked: boolean;
}

/** Normalized (0..1) attachment-plane geometry for the reader's two dots. */
export interface AttachmentPlane {
  /** Solid "home" dot, normalized to the axis box (0,0 = top-left corner). */
  home: { x: number; y: number };
  /** Hollow "strain" dot, normalized. Null when there's no drift target. */
  strain: { x: number; y: number } | null;
  homeLabel: string;
  strainLabel: string;
  /** Which corner the accent (solid-purple label) sits in. */
  accentCorner: "ANXIOUS" | "FEARFUL" | "SECURE" | "AVOIDANT";
}

interface Props {
  archetype: string;
  copy: AttachmentCopy | null;
  plane: AttachmentPlane | null;
  /**
   * Attachment family from `getReport2Config(name).families.attachment` — one of
   * {secure-anxious, secure-avoidant, avoidant}. Drives the family-specific
   * row2/row3 labels. `null` falls back to universal copy labels.
   */
  family: string | null;
  offerDeadline?: number;
  onUnlock: () => void;
  quote?: ReportPriceQuoteSnapshot | null;
  sectionTitle: string;
  tier?: PremiumOverlayTier;
}

/**
 * Family-specific row2/row3 labels (Figma-verified). The row VALUES come from
 * copy; only the labels vary by attachment family. `avoidant` falls back for any
 * value not in the DECISIONS-2026-07-30 set of {secure-anxious, secure-avoidant,
 * avoidant}.
 */
const ATTACHMENT_ROW_LABELS_BY_FAMILY: Record<string, { row2: string; row3: string }> = {
  "secure-anxious": { row2: "Under lingering disconnection", row3: "After rupture" },
  "secure-avoidant": { row2: "Under pressure to merge", row3: "After withdrawal" },
  avoidant: { row2: "When closeness stays constant", row3: "After space is restored" },
};

/** The five universal attachment patterns (Figma 8439:653–739). Not per-archetype. */
const ATTACHMENT_FAMILY_CARDS: {
  title: string;
  body: string;
  chips: { label: string; color: string }[];
}[] = [
  {
    title: "Secure attachment",
    body: "These archetypes generally feel safe with intimacy and autonomy. They can enjoy closeness without losing themselves and tolerate distance without panic. Desire is relatively stable and flexible across relationship phases.",
    chips: [
      { label: "Sensual Connector", color: "#e57373" },
      { label: "Relational Nurturer", color: "#7fae9e" },
      { label: "Loyal Ritualist", color: "#2aff8f" },
      { label: "Spiritual Lover", color: "#8b7bbe" },
      { label: "Curious Apprentice", color: "#5565f7" },
    ],
  },
  {
    title: "Anxious attachment",
    body: "These archetypes are highly attuned to signs of closeness or rejection. Desire is often intertwined with reassurance, validation, and fear of loss. Sexuality can become a way to secure connection or soothe anxiety.",
    chips: [{ label: "Tender Devotee", color: "#e7b3c2" }],
  },
  {
    title: "Avoidant attachment",
    body: "These archetypes value autonomy and emotional self-containment. They may experience closeness as threatening or overwhelming. Desire often activates through distance, novelty, or control rather than sustained emotional intimacy.",
    chips: [
      { label: "Spark Seeker", color: "#ff6a3d" },
      { label: "Minimalist Companion", color: "#b5b2ad" },
      { label: "Emotional Voyeur", color: "#2ef6e3" },
      { label: "Analytical Sexualist", color: "#6a00ff" },
      { label: "Quiet Withdrawer", color: "#c9f7f5" },
    ],
  },
  {
    title: "Disorganized or mixed",
    body: "These archetypes experience closeness as both desired and threatening. Desire may surge and collapse unpredictably. Sexuality can oscillate between craving connection and needing escape, intensity, or control.",
    chips: [
      { label: "Explorer of Edges", color: "#ff2e63" },
      { label: "Authority Conductor", color: "#ff9f1c" },
    ],
  },
  {
    title: "Contextual / adaptive",
    body: "Some archetypes shift attachment expression depending on partner, power dynamics, or relational safety. Their attachment is less fixed and more situationally activated.",
    chips: [
      { label: "Spark Seeker", color: "#ff6a3d" },
      { label: "Radiant Performer", color: "#e6b65c" },
      { label: "Explorer of Edges", color: "#ff2e63" },
    ],
  },
];

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

const CORNERS: { key: AttachmentPlane["accentCorner"]; label: string; pos: string }[] = [
  { key: "ANXIOUS", label: "ANXIOUS", pos: "report-attachment-plane__corner--tl" },
  { key: "FEARFUL", label: "FEARFUL", pos: "report-attachment-plane__corner--tr" },
  { key: "SECURE", label: "SECURE", pos: "report-attachment-plane__corner--bl" },
  { key: "AVOIDANT", label: "AVOIDANT", pos: "report-attachment-plane__corner--br" },
];

/**
 * The 2-D attachment map: two axes crossing at center, four corner labels, and
 * (when unlocked with real coords) the reader's solid "home" dot with an aura +
 * a hollow "strain" dot joined by a dashed drift line. Coords are pre-normalized
 * to 0..1 over the axis box; percentages position them responsively.
 */
/**
 * Mark's `attachment.result` carries a qualifier for 13 of the 14 archetypes —
 * parenthesised in 12 ("Secure (anxious under imbalance)") and comma-separated in
 * `tender-devotee` ("Secure, anxious when criticised"). Only `spiritual-lover` is
 * a bare "Secure", and that is the archetype the Figma frame mocks, which is why
 * the design shows no bracket.
 *
 * Rather than discard the qualifier (real copy) or keep it inline (reads as
 * parenthetical clutter against the design's single bold pattern word), split it
 * onto its own smaller line: the pattern word keeps the design's visual weight and
 * the nuance survives. Returns `[word, qualifier | null]`.
 */
export function splitAttachmentResult(raw: string): [string, string | null] {
  const trimmed = raw.trim();
  const paren = trimmed.match(/^(.+?)\s*\((.+)\)$/);
  if (paren?.[1] && paren[2]) return [paren[1].trim(), paren[2].trim()];
  const comma = trimmed.match(/^([^,]+),\s*(.+)$/);
  if (comma?.[1] && comma[2]) return [comma[1].trim(), comma[2].trim()];
  return [trimmed, null];
}

/**
 * Figma draws the drift connector as a BOWED bezier, not a straight segment. That
 * is not a judgement call: in the design the two axes are vectors with `w=0` /
 * `h=0` (genuinely straight), while the connector's box is `174.79 x 28.181` with
 * both dimensions non-zero, and its exported path is a cubic —
 * `M47.8452 27.5914 C-71.1362 16.179 47.8452 7.55018 174.759 0.591419`
 * (Figma 9107:530, SCALE 2). Its endpoints do not sit on the dot centres, so it is
 * a decorative swoop rather than a strict dot-to-dot join; reproducing it from the
 * two dot positions keeps one implementation correct for all three family scales
 * instead of hardcoding a per-scale path.
 *
 * A quadratic's maximum deviation from its chord is HALF the control offset, so
 * `DRIFT_BOW = 0.28` yields a ~14% sagitta — matching the design's proportions
 * (~28.18 of excursion across a ~174.79 span ≈ 16%). The bow points AWAY from the
 * plane centre, which is the direction Figma's control point swings.
 */
const DRIFT_BOW = 0.28;

function driftPath(a: { x: number; y: number }, b: { x: number; y: number }): string {
  const ax = a.x * 100;
  const ay = a.y * 100;
  const bx = b.x * 100;
  const by = b.y * 100;
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  // Degenerate case: dots coincide, so there is no chord to bow off.
  if (len === 0) return `M${ax.toFixed(2)} ${ay.toFixed(2)}`;

  const mx = (ax + bx) / 2;
  const my = (ay + by) / 2;
  let px = -dy / len;
  let py = dx / len;
  // Flip the perpendicular so the arc bows outward, away from the centre (50,50).
  if ((mx - 50) * px + (my - 50) * py < 0) {
    px = -px;
    py = -py;
  }
  const off = len * DRIFT_BOW;
  const cx = mx + px * off;
  const cy = my + py * off;
  return `M${ax.toFixed(2)} ${ay.toFixed(2)} Q${cx.toFixed(2)} ${cy.toFixed(2)} ${bx.toFixed(2)} ${by.toFixed(2)}`;
}

const AttachmentPlane: FC<{ plane: AttachmentPlane }> = ({ plane }) => {
  const home = plane.home;
  const strain = plane.strain;
  const pct = (n: number) => `${(n * 100).toFixed(2)}%`;
  const [planeRef, revealed] = useRevealOnView<HTMLDivElement>({ threshold: 0.3 });
  // Two planes can render on one page (the map and its locked stand-in), and a
  // duplicated mask id would make the first one's mask win for both.
  const driftMaskId = `attach-drift-${useId().replace(/:/g, "")}`;

  /**
   * A label normally hangs under its dot, but a dot low in the field would push
   * its label off the bottom edge, so those flip above. Figma places these by
   * hand per scale — under the dot on scale 2, above it on the mobile scale 3,
   * beside it on the base — and a rule that reads the dot's own position
   * reproduces all three instead of hardcoding one scale's choice. The
   * threshold is 0.82, not 0.7: the base scale's home dot sits at y=0.715 and
   * Figma keeps ITS label underneath, so a lower bar flips a label the design
   * leaves alone.
   */
  const labelFlip = (p: { y: number }) => (p.y > 0.82 ? " is-above" : "");

  return (
    <div
      ref={planeRef}
      className={`report-attachment-plane${revealed ? " is-revealed" : ""}`}
      role="img"
      aria-label="Attachment map"
    >
      {/* The field is a rounded SQUARE split into four quadrants — Figma
          8427:1488 (441px panel, 15px radius, #edecef hairline on #faf8fe).
          This used to render two concentric rings, i.e. a circular field, which
          is a different chart entirely: a quadrant map says "which of these
          four states are you in", rings say "how far from centre", and the
          corner labels only mean anything against quadrants. */}
      <span className="report-attachment-plane__field" aria-hidden="true" />
      {/* Sits ABOVE the field and outside its clip: in the design the glow
          spills past the panel edge into the margin, so it cannot be a
          background of the field itself. */}
      <span
        className="report-attachment-plane__glow"
        style={{ left: pct(home.x), top: pct(home.y) }}
        aria-hidden="true"
      />
      <span
        className="report-attachment-plane__axis report-attachment-plane__axis--v"
        aria-hidden="true"
      />
      <span
        className="report-attachment-plane__axis report-attachment-plane__axis--h"
        aria-hidden="true"
      />

      {CORNERS.map((c) => (
        <span
          key={c.key}
          className={`report-attachment-plane__corner ${c.pos}${
            c.key === plane.accentCorner ? " is-accent" : ""
          }`}
        >
          {c.label}
        </span>
      ))}

      {strain ? (
        /* The trail draws itself from the home dot outward. A dashed stroke
           can't be drawn with stroke-dashoffset — that just slides the dashes
           along — so the dashes are revealed through a mask whose own solid
           stroke is what animates, at pathLength 1 so the timing is identical
           for every scale's curve regardless of its length. */
        <svg
          className="report-attachment-plane__drift"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <mask id={driftMaskId} maskUnits="userSpaceOnUse">
              <path
                className="report-attachment-plane__drift-reveal"
                d={driftPath(home, strain)}
                pathLength={1}
              />
            </mask>
          </defs>
          <path d={driftPath(home, strain)} mask={`url(#${driftMaskId})`} />
        </svg>
      ) : null}

      <span
        className="report-attachment-plane__dot report-attachment-plane__dot--home"
        style={{ left: pct(home.x), top: pct(home.y) }}
        aria-hidden="true"
      />
      <span
        className={`report-attachment-plane__dot-label report-attachment-plane__dot-label--home${labelFlip(home)}`}
        style={{ left: pct(home.x), top: pct(home.y) }}
      >
        {plane.homeLabel}
      </span>

      {strain ? (
        <>
          <span
            className="report-attachment-plane__dot report-attachment-plane__dot--strain"
            style={{ left: pct(strain.x), top: pct(strain.y) }}
            aria-hidden="true"
          />
          <span
            className={`report-attachment-plane__dot-label report-attachment-plane__dot-label--strain${labelFlip(strain)}`}
            style={{ left: pct(strain.x), top: pct(strain.y) }}
          >
            {plane.strainLabel}
          </span>
        </>
      ) : null}
    </div>
  );
};

const AttachmentPatternsSection: FC<Props> = ({
  archetype,
  copy,
  plane,
  family,
  offerDeadline,
  onUnlock,
  quote = null,
  sectionTitle,
  tier = "essentials",
}) => {
  const [expanded, setExpanded] = useState(false);

  /* Defined once and rendered in two places: inside the expanded explainer
     for a reader who opened it, and directly in the locked peek. These five
     patterns are UNIVERSAL, not per-archetype, so putting them inside the
     explainer alone would have paywalled free educational content — which is
     exactly what the locked-state test guards against.  */
  const patternsBlock = (
    <div className="report-attachment__patterns">
      <h3 className="report-attachment__patterns-title">
        Common Attachment Style Patterns Across Archetypes
      </h3>
      <div className="report-attachment__patterns-grid">
        {ATTACHMENT_FAMILY_CARDS.map((card) => (
          <div key={card.title} className="report-attachment-family">
            <h4 className="report-attachment-family__title">{card.title}</h4>
            <p className="report-attachment-family__body">{card.body}</p>
            <div className="report-attachment-family__chips-wrap">
              <p className="report-attachment-family__chips-label">Associated Archetypes</p>
              <div className="report-attachment-family__chips">
                {card.chips.map((chip) => (
                  <span
                    key={chip.label}
                    className="report-attachment-family__chip"
                    style={{
                      borderColor: chip.color,
                      backgroundColor: `color-mix(in srgb, ${chip.color} 20%, transparent)`,
                    }}
                  >
                    {chip.label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
  if (!copy) return null;

  const locked = copy.locked;

  const [resultWord, resultQualifier] = copy.result
    ? splitAttachmentResult(copy.result)
    : [null, null];
  // row2/row3 labels are family-specific (Figma-verified); values come from copy.
  const labels = family ? ATTACHMENT_ROW_LABELS_BY_FAMILY[family] : undefined;

  // Rows: label is family-specific for 2/3, universal for row1. Values from copy.
  const row1Label = copy["row1.label"] ?? "Most of the time";
  const rows: { label: string; value: string }[] = [];
  if (copy["row1.value"]) rows.push({ label: row1Label, value: copy["row1.value"] });
  if (copy["row2.value"])
    rows.push({ label: labels?.row2 ?? "Under strain", value: copy["row2.value"] });
  if (copy["row3.value"])
    rows.push({ label: labels?.row3 ?? "After conflict", value: copy["row3.value"] });

  const eduParas = [
    copy["edu.body.p1"],
    copy["edu.body.p2"],
    copy["edu.body.p3"],
    copy["edu.body.p4"],
    copy["edu.body.p5"],
    copy["edu.body.p6"],
    copy["edu.body.p7"],
  ].filter((p): p is string => !!p);
  const hasEdu = !!copy["edu.teaser"] || eduParas.length > 0;

  return (
    <div className="report-attachment">
      {copy["learn.body"] ? (
        <div className="report-attachment__learn-pill-wrap">
          <span className="report-attachment__learn-pill">
            <span className="report-attachment__learn-pill-icon" aria-hidden="true">
              <BookIcon />
            </span>
            {copy["learn.eyebrow"] ?? "What you will learn"}
          </span>
          <p className="report-attachment__learn-body">{copy["learn.body"]}</p>
        </div>
      ) : null}

      {/* ── Result card ("Your Attachment Style") — GATED per-archetype ── */}
      {locked || resultWord || rows.length > 0 ? (
        <div
          className={`report-attachment__result-wrap${
            locked ? " report-attachment__result-wrap--locked" : ""
          }`}
        >
          {locked ? (
            <>
              <article
                className="report-attachment-card report-attachment-card--blur"
                aria-hidden="true"
              >
                <span className="report-attachment-card__glow" />
                <p className="report-attachment-card__eyebrow">
                  {copy.eyebrow ?? "Your Attachment Style"}
                </p>
                <h3 className="report-attachment-card__result">Your pattern</h3>
                <dl className="report-attachment-card__rows">
                  {["Most of the time", "Under strain", "After conflict"].map((label) => (
                    <div key={label} className="report-attachment-card__row">
                      <dt>{label}</dt>
                      <dd>Where your desire settles, and what quietly moves it.</dd>
                    </div>
                  ))}
                </dl>
                <div className="report-attachment-card__insight">
                  <p className="report-attachment-card__insight-label">The Key</p>
                  <p className="report-attachment-card__insight-value">
                    The one move that changes how closeness feels for you.
                  </p>
                </div>
              </article>
              <PremiumOverlay
                archetype={archetype}
                sectionTitle={sectionTitle}
                tier={tier}
                quote={quote}
                offerDeadline={offerDeadline}
                onUnlock={onUnlock}
              />
            </>
          ) : (
            <article className="report-attachment-card">
              <span className="report-attachment-card__glow" aria-hidden="true" />
              {copy.eyebrow ? (
                <p className="report-attachment-card__eyebrow">{copy.eyebrow}</p>
              ) : null}
              {resultWord ? <h3 className="report-attachment-card__result">{resultWord}</h3> : null}
              {resultQualifier ? (
                <p className="report-attachment-card__result-note">{resultQualifier}</p>
              ) : null}

              {rows.length > 0 ? (
                <dl className="report-attachment-card__rows">
                  {rows.map((r) => (
                    <div key={r.label} className="report-attachment-card__row">
                      <dt>{r.label}</dt>
                      <dd>{r.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}

              {copy["insight.value"] ? (
                <div className="report-attachment-card__insight">
                  <p className="report-attachment-card__insight-label">
                    {copy["insight.label"] ?? "The Key"}
                  </p>
                  <p className="report-attachment-card__insight-value">{copy["insight.value"]}</p>
                </div>
              ) : null}
            </article>
          )}
        </div>
      ) : null}

      {/* ── Article: the map + caption + educational block ── */}
      <article
        className={`report-attachment__article${
          locked ? " report-attachment__article--locked" : ""
        }`}
      >
        <p className="report-attachment__map-eyebrow">The map — where those two states live</p>

        {plane && !locked ? (
          <AttachmentPlane plane={plane} />
        ) : (
          <div
            /* is-revealed from the start: this stand-in never mounts the reveal
               observer, and without it the shared arrival styles would leave
               the field and its labels sitting at opacity 0 forever. */
            className="report-attachment-plane report-attachment-plane--empty is-revealed"
            role="img"
            aria-label="Attachment map"
          >
            <span className="report-attachment-plane__field" aria-hidden="true" />
            <span
              className="report-attachment-plane__axis report-attachment-plane__axis--v"
              aria-hidden="true"
            />
            <span
              className="report-attachment-plane__axis report-attachment-plane__axis--h"
              aria-hidden="true"
            />
            {CORNERS.map((c) => (
              <span key={c.key} className={`report-attachment-plane__corner ${c.pos}`}>
                {c.label}
              </span>
            ))}
          </div>
        )}

        {copy["body.p1"] && !locked ? (
          <p className="report-attachment__map-caption">{copy["body.p1"]}</p>
        ) : (
          <p className="report-attachment__map-caption">
            Two dots, one person. The solid dot is where you live; the glow around it shows how much
            of the map feels like home. The hollow dot is where unrepaired distance takes you — not
            a different attachment style, just your secure base under strain. Repair brings the dot
            home.
          </p>
        )}

        {/* Educational block — universal, always shown. */}
        <div className="report-attachment__edu">
          {hasEdu ? (
            <div className="report-attachment__details">
              <button
                type="button"
                className="report-attachment__details-summary"
                aria-expanded={locked ? false : expanded}
                onClick={locked ? onUnlock : () => setExpanded((v) => !v)}
              >
                <span className="report-attachment__details-icon" aria-hidden="true">
                  <BookIcon />
                </span>
                <span className="report-attachment__details-eyebrow">
                  {copy["edu.eyebrow"] ?? "Learn: the five attachment patterns"}
                </span>
                <span
                  className={`report-attachment__details-chevron${expanded ? " is-open" : ""}`}
                  aria-hidden="true"
                >
                  ⌄
                </span>
              </button>

              {/* Collapsed state shows the teaser plus the "peek CTA" that Figma
                  specifies (node 8762:15996 "peek CTA" → 8762:15997 "Read the full
                  explanation"). 13 of the report's 16 collapsibles already ship
                  this button; Attachment was one of three that never did, so the
                  only way to expand was the header row. */}
              {locked || !expanded ? (
                <div
                  className={`report-attachment__details-peek report-learn-peek${locked ? " report-learn-peek--locked" : ""}`}
                >
                  {copy["edu.teaser"] ? (
                    <p className="report-attachment__details-teaser report-learn-teaser">
                      {copy["edu.teaser"]}
                      {copy["edu.body.p1"] ? ` ${copy["edu.body.p1"]}` : null}
                    </p>
                  ) : null}
                  {locked || eduParas.length > 0 ? (
                    <button
                      type="button"
                      className="report-attachment__peek-cta report-learn-cta"
                      onClick={locked ? onUnlock : () => setExpanded(true)}
                    >
                      {locked ? "Unlock to read the full explanation" : "Read the full explanation"}
                    </button>
                  ) : null}
                  {locked ? patternsBlock : null}
                </div>
              ) : (
                <div className="report-attachment__details-body">
                  {copy["edu.teaser"] ? (
                    <p className="report-attachment__details-teaser report-learn-teaser-full">
                      {copy["edu.teaser"]}
                    </p>
                  ) : null}
                  {eduParas.map((para, i) => (
                    <p key={i} className="report-attachment__details-para">
                      {renderEduPara(para)}
                    </p>
                  ))}
                  {patternsBlock}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </article>
    </div>
  );
};

export default AttachmentPatternsSection;
