"use client";

import { useState, type CSSProperties, type FC, useRef } from "react";
import VerdictStar from "./VerdictStar";
import LockedPreviewImage from "./LockedPreviewImage";
import PremiumOverlay, { type PremiumOverlayTier } from "./PremiumOverlay";
import { getReportTheme } from "../reportTheme";
import { useRevealOnView } from "../hooks/useRevealOnView";
import { archetypePresentation } from "@features/report/data/archetypePresentation";
import type { ArchetypeName } from "@features/report/server/archetypeSlug";
import type { ReportPriceQuoteSnapshot } from "@features/pricing/logic/reportPricing";
import { renderEduPara } from "./eduPara";
import { copyParagraphs } from "./copyParagraphs";
import LearnPill from "./LearnPill";
import { chapterHeading } from "./chapterHeading";

/**
 * Server-resolved power copy (`getReport2Section(name, "power")`), threaded as a
 * prop because the 634KB copy module is server-only (see
 * `app/api/report/route.ts` → `powerCopy`).
 *
 * GATING (Part III, FULL_REPORT tier — `power_orientation`, section 15, NOT in
 * `ESSENTIALS_SECTION_IDS`, so it only unlocks at the full_report tier). The
 * educational slots (`edu.*`, `learn.*`) are universal (
 * verified identical across all 14) and always shipped. The per-archetype
 * payload — `takeaway` (verdict) and `body.p1` (the reader's own read on the
 * map) plus `zone` (the reader's power-zone region label + the "You" dot
 * highlight/position) — is the gated content: shipped ONLY when the report is
 * unlocked at the full_report tier. A locked client (`locked: true`) receives
 * `takeaway: null` + `body.p1: null` + `zone: null`, renders the hook teaser +
 * PremiumOverlay, and the plane still draws (universal layout) but WITHOUT the
 * "You" highlight/zone. Never send locked per-archetype content to an unpaid
 * client.
 */
export interface PowerCopy {
  takeaway?: string | null;
  "body.p1"?: string | null;
  "edu.eyebrow"?: string | null;
  "edu.teaser"?: string | null;
  "edu.body.p1"?: string | null;
  "edu.body.p2"?: string | null;
  "edu.body.p3"?: string | null;
  "edu.body.p4"?: string | null;
  "learn.eyebrow"?: string | null;
  /** Chapter-opening definition, rendered in front of `learn.body`. */
  "learn.lead"?: string | null;
  "learn.body"?: string | null;
  /** Second Key Concepts paragraph — see data/report2-key-concepts.ts. */
  "learn.body.p2"?: string | null;
  /** What a `learn.lead` ending in a colon introduces. */
  "learn.questions"?: string[] | null;
  /**
   * The reader's power-zone region label (from config `families.power_zone`),
   * e.g. "Switch zone". Drives the top card label + the highlighted zone label
   * on the plane. Per-archetype → withheld (null) from a locked client.
   */
  zone?: string | null;
  /**
   * The card's top eyebrow — the reader's "result line" (Figma 8427:1953), e.g.
   * "Devotional switch — presence-guided". Distinct from `zone`: the
   * low-polarity plane reads "LOW-POLARITY ZONE" but its eyebrow reads "Gentle
   * switch — comfort-guided". Per-archetype → withheld from a locked client.
   */
  "zone.result"?: string | null;
  /** True when the per-archetype takeaway/body + zone/You highlight were withheld. */
  locked: boolean;
}

interface Props {
  archetype: string;
  copy: PowerCopy | null;
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
 * All 14 archetypes plotted on the power plane, positions extracted from the
 * Figma vectors (node 8427:1965 + the "You" dot 8427:1983) and normalized to
 * the plot box (0..1). x = yielding(0) → leading(1); y = explicit-power(0, top)
 * → implicit-power(1, bottom). This is a FIXED universal layout — every viewer
 * sees the same 14 dots in the same places; only WHICH one is the highlighted
 * "You" changes (the reader's `archetype` prop).
 *
 * Dot fill = each archetype's report-theme accent (the Figma renders them as
 * pastel tints of exactly these accents). Only the "You" dot is labelled on the
 * plane — the Figma labels no other dot — so the 13 others are anonymous
 * context and their name→position pairing only affects dot colour.
 *
 * RE-PLOTTED 2026-08-26 — Spark Seeker, from (0.856, 0.115) to (0.63, 0.36).
 *
 * The Figma position was the furthest-right and highest of all fourteen: maximum
 * leading, maximum explicit power. That contradicted three things at once.
 *   - `families.power_zone` calls the Spark Seeker a `switch`, yet the plot put
 *     them further into "leading" than BOTH archetypes the same config calls
 *     `dominant-leaning` (Explorer of Edges 0.737, Authority Conductor 0.659).
 *   - Their own `body.p1` in this chapter reads "Leading happens when momentum
 *     grabs you; yielding happens when the game is good" — both directions.
 *   - The same paragraph says power stays "loose and improvised" and that
 *     "scripted dominance and solemn rituals drain it fast", which is implicit
 *     signalling, not the explicit end of the y axis.
 *
 * So: x just right of centre, because they do initiate (chapter 22 puts them
 * under "Active / Direct initiation"), but left of both dominant-leaning
 * archetypes; y a little above the midline, because they are overt about wanting
 * but play rather than negotiate. It lands them between Radiant Performer
 * (0.585, 0.418, leads through seduction) and Authority Conductor (0.659, 0.309,
 * leads through structure), which is the right company for playful leading.
 *
 * The other thirteen are untouched — they are the designer's plot. Anyone
 * revisiting this should check the same three sources per archetype rather than
 * nudging dots by eye.
 */
const PLANE: { name: string; x: number; y: number }[] = [
  { name: "Spark Seeker", x: 0.63, y: 0.36 },
  { name: "Explorer of Edges", x: 0.737, y: 0.206 },
  { name: "Authority Conductor", x: 0.659, y: 0.309 },
  { name: "Analytical Sexualist", x: 0.641, y: 0.618 },
  { name: "Radiant Performer", x: 0.585, y: 0.418 },
  { name: "Minimalist Companion", x: 0.404, y: 0.449 },
  { name: "Emotional Voyeur", x: 0.33, y: 0.588 },
  { name: "Sensual Connector", x: 0.311, y: 0.673 },
  { name: "Loyal Ritualist", x: 0.274, y: 0.642 },
  { name: "Relational Nurturer", x: 0.382, y: 0.752 },
  { name: "Tender Devotee", x: 0.163, y: 0.63 },
  { name: "Quiet Withdrawer", x: 0.126, y: 0.812 },
  { name: "Curious Apprentice", x: 0.289, y: 0.873 },
  { name: "Spiritual Lover", x: 0.467, y: 0.824 },
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
 * The 2-axis power plane (per Figma 8427:1954). A fixed universal layout drawn
 * for everyone; the "You" highlight + the tinted "switch/leading/…" zone are
 * per-archetype and only render when unlocked. `youZoneLabel` is null when
 * locked, so the zone glow + "You" pill drop out but the pack still reads.
 */
const PowerPlane: FC<{ archetype: string; youZoneLabel: string | null }> = ({
  archetype,
  youZoneLabel,
}) => {
  const you = PLANE.find((d) => d.name === archetype) ?? null;
  const showYou = !!youZoneLabel && !!you;
  // The dots used to stagger in on a mount-time requestAnimationFrame, so the
  // whole cascade was over before the reader had scrolled anywhere near the
  // plane. Triggered off the plane itself now.
  const [planeRef, animated] = useRevealOnView<HTMLDivElement>();
  const frameRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<number | null>(null);

  /**
   * Nearest dot to the pointer, in the plane's own normalised space.
   *
   * Picking by proximity rather than per-dot hit areas is not a preference: on
   * a 390px screen the frame is 272x166 and the closest pair sits 11.2px apart
   * while the dots themselves are 9px, so per-dot targets would overlap and the
   * tighter half of them could never be selected. Proximity means every dot is
   * reachable at any size, and the same gesture is hover on a mouse and a drag
   * under a finger.
   */
  const pick = (e: { clientX: number; clientY: number }) => {
    const el = frameRef.current;
    if (!el) return;
    const b = el.getBoundingClientRect();
    if (b.width <= 0 || b.height <= 0) return;
    const px = (e.clientX - b.left) / b.width;
    const py = (e.clientY - b.top) / b.height;
    let best = 0;
    let bestD = Infinity;
    PLANE.forEach((d, i) => {
      // Scaled to the frame's real aspect so "nearest" means nearest on screen,
      // not nearest in a square that the plane is not.
      const dx = (d.x - px) * b.width;
      const dy = (d.y - py) * b.height;
      const dist = dx * dx + dy * dy;
      if (dist < bestD) {
        bestD = dist;
        best = i;
      }
    });
    setActive(best);
  };

  return (
    <div ref={planeRef} className={`report-power-plane${animated ? " is-animated" : ""}`}>
      <div
        ref={frameRef}
        className="report-power-plane__frame"
        onPointerMove={pick}
        onPointerDown={pick}
        onPointerLeave={(e) => {
          // A finger lifting fires leave too; on touch the readout stays up so
          // it can actually be read after the drag.
          if (e.pointerType === "mouse") setActive(null);
        }}
      >
        {/* Axis crosshair + border */}
        <span className="report-power-plane__axis report-power-plane__axis--v" aria-hidden="true" />
        <span className="report-power-plane__axis report-power-plane__axis--h" aria-hidden="true" />

        {/* Reader's zone glow (per-archetype, unlocked only), centred on the You dot. */}
        {showYou ? (
          <span
            className="report-power-plane__zone"
            style={
              {
                left: `${you!.x * 100}%`,
                top: `${you!.y * 100}%`,
                // Zone glow + label take the reader's own dot colour (Figma
                // 9125:576/577 are #94a3b8 for Minimalist Companion).
                "--zone-accent-rgb": hexToRgbTriplet(
                  archetypePresentation[archetype as ArchetypeName]?.dotColor ??
                    getReportTheme(archetype).accent
                ),
              } as CSSProperties
            }
            aria-hidden="true"
          >
            <span className="report-power-plane__zone-label">
              {youZoneLabel!.toUpperCase()} ZONE
            </span>
          </span>
        ) : null}

        {/* Readout pinned to the top of the frame rather than floating at the
            dot. On a 272px-wide mobile plane a floating label sits under the
            finger that is selecting it, and a nowrap name near an edge would
            overflow; a fixed slot can do neither, and it is what Stocks/Health
            do for the same reason. */}
        <span
          className={`report-power-plane__readout${active !== null ? " is-on" : ""}`}
          aria-hidden="true"
        >
          {PLANE[active ?? 0]!.name}
        </span>

        {/* The 14 dots */}
        {PLANE.map((d, i) => {
          const isYou = showYou && d.name === archetype;
          // Figma's own note: "Accent = production dotColor from
          // archetypePresentation.ts" (e.g. Minimalist Companion #94a3b8,
          // Authority Conductor #eab308) — NOT the report-theme accent, which
          // differs for all 14.
          const accent =
            archetypePresentation[d.name as ArchetypeName]?.dotColor ??
            getReportTheme(d.name).accent;
          const style = {
            "--dot-x": `${d.x * 100}%`,
            "--dot-y": `${d.y * 100}%`,
            "--dot-accent-rgb": hexToRgbTriplet(accent),
            "--dot-order": i,
          } as CSSProperties;
          return (
            <span
              key={d.name}
              className={`report-power-plane__dot${isYou ? " is-you" : ""}${
                active === i ? " is-active" : active !== null ? " is-muted" : ""
              }`}
              style={style}
            >
              {/* Named rather than "You" (2026-08-25) — the plane plots all
                  fourteen and this dot is the archetype's position on it. */}
              {isYou ? <span className="report-power-plane__dot-pill">{archetype}</span> : null}
            </span>
          );
        })}
      </div>

      {/* Axis captions */}
      <span className="report-power-plane__cap report-power-plane__cap--left" aria-hidden="true">
        &larr; yielding
      </span>
      <span className="report-power-plane__cap report-power-plane__cap--right" aria-hidden="true">
        leading &rarr;
      </span>
      <span className="report-power-plane__cap report-power-plane__cap--top" aria-hidden="true">
        &rarr; explicit power
      </span>
      <span className="report-power-plane__cap report-power-plane__cap--bottom" aria-hidden="true">
        implicit power &larr;
      </span>
    </div>
  );
};

const PowerSection: FC<Props> = ({
  archetype,
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

  // Educational block is universal — always safe to show.
  const eduParas = [
    copy["edu.body.p1"],
    copy["edu.body.p2"],
    copy["edu.body.p3"],
    copy["edu.body.p4"],
  ].filter((p): p is string => !!p);
  const hasEdu = !!copy["edu.teaser"] || eduParas.length > 0;

  // The reader's zone label (from config power_zone) — null when locked, which
  // also suppresses the "You" highlight on the plane.
  const zoneLabel = locked ? null : (copy.zone ?? null);

  return (
    <div className="report-power">
      <h3 className="report-power__heading">{chapterHeading("Power Orientation", archetype)}</h3>

      <LearnPill prefix="power" copy={copy} />

      <article className="report-power__card">
        {locked ? (
          <>
            <div className="report-power__preview">
              {/* A pre-blurred render of the REAL chapter. Blurring the PIXELS at
                  build time means the paid copy is not in the file that ships, so
                  it cannot be read back out of the DOM. See LockedPreviewImage. */}
              <div
                className="report-power__preview-fade report-preview-fade--image"
                aria-hidden="true"
              >
                <LockedPreviewImage name="power" />
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
            {(copy["zone.result"] ?? zoneLabel) ? (
              <p className="report-power__zone-eyebrow">{copy["zone.result"] ?? zoneLabel}</p>
            ) : null}

            <PowerPlane archetype={archetype} youZoneLabel={zoneLabel} />

            {copy["body.p1"] ? (
              <p className="report-power__body">{copyParagraphs(copy["body.p1"])}</p>
            ) : null}

            {copy.takeaway ? (
              <div className="report-power__verdict report-verdict">
                <VerdictStar />
                <p className="report-power__takeaway">{copy.takeaway}</p>
                <span className="report-verdict-rule" aria-hidden="true" />
              </div>
            ) : null}
          </>
        )}

        {hasEdu ? (
          <div className="report-power__details">
            <button
              type="button"
              className="report-power__details-summary"
              aria-expanded={locked ? false : expanded}
              onClick={locked ? onUnlock : () => setExpanded((v) => !v)}
            >
              <span className="report-power__details-icon" aria-hidden="true">
                <BookIcon />
              </span>
              <span className="report-power__details-eyebrow">
                {copy["edu.eyebrow"] ?? "Learn: leading and yielding"}
              </span>
              <span
                className={`report-power__details-chevron${expanded ? " is-open" : ""}`}
                aria-hidden="true"
              >
                ⌄
              </span>
            </button>

            {locked || !expanded ? (
              <div className="report-power__details-peek report-learn-peek">
                {copy["edu.teaser"] ? (
                  <p className="report-power__details-teaser report-learn-teaser">
                    {copy["edu.teaser"]}
                    {copy["edu.body.p1"] ? ` ${copy["edu.body.p1"]}` : null}
                  </p>
                ) : null}
                {locked || eduParas.length > 0 ? (
                  <button
                    type="button"
                    className="report-power__peek-cta report-learn-cta"
                    onClick={locked ? onUnlock : () => setExpanded(true)}
                  >
                    {locked ? "Unlock to read the full explanation" : "Read the full explanation"}
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="report-power__details-body">
                {copy["edu.teaser"] ? (
                  <p className="report-power__details-teaser report-learn-teaser-full">
                    {copy["edu.teaser"]}
                  </p>
                ) : null}
                {eduParas.map((para, i) => (
                  <p key={i} className="report-power__details-para">
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

export default PowerSection;
