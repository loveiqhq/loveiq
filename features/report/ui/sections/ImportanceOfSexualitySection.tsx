"use client";

import { useEffect, useState, type CSSProperties, type FC } from "react";
import { getReport2Config } from "@/data/report2-config";
import { getReportTheme } from "../reportTheme";

interface Props {
  archetype: string;
  importanceValue: number | null;
}

type Band = "Low" | "Medium" | "High";

// Universal per-band description (same for all 14 archetypes). The "High" text
// is taken verbatim from Figma node 8427:1394 (the authoritative source); Low /
// Medium are not shown in that frame so their existing copy is preserved.
const BAND_DESCRIPTION: Record<Band, string> = {
  Low: "Sex matters, but it isn't the axis your sense of self turns on. Closeness can survive long gaps without it, and that is a stable position rather than a deficit.",
  Medium:
    "Sex matters to you, and it sits alongside other sources of meaning rather than above them. Its weight rises and falls with context.",
  High: "Sex feels central to vitality, identity, and connection, and it carries real weight in overall life satisfaction.",
};

// Bold fragment inside the High description, per Figma (Manrope Bold run).
const HIGH_BOLD = "central to vitality, identity, and connection";

// Fixed importance ranking of all 14 archetypes, low → high. Positions are the
// normalized x (0..1 across the axis) extracted from Figma node 8427:1407; the
// same layout renders for every viewer — only which entry is the highlighted
// "You" changes. Dot colour = each archetype's report-theme accent (matches the
// Figma dot fills exactly). The two ends (Loyal Ritualist / Relational Nurturer)
// are labelled as anchors, exactly as the Figma shows.
const RANKING: { name: string; x: number }[] = [
  { name: "Loyal Ritualist", x: 0.0655 },
  { name: "Quiet Withdrawer", x: 0.1691 },
  { name: "Minimalist Companion", x: 0.1818 },
  { name: "Curious Apprentice", x: 0.3436 },
  { name: "Analytical Sexualist", x: 0.4073 },
  { name: "Tender Devotee", x: 0.5909 },
  { name: "Sensual Connector", x: 0.6345 },
  { name: "Emotional Voyeur", x: 0.6727 },
  { name: "Spiritual Lover", x: 0.7291 },
  { name: "Spark Seeker", x: 0.7855 },
  { name: "Authority Conductor", x: 0.8091 },
  { name: "Explorer of Edges", x: 0.84 },
  { name: "Radiant Performer", x: 0.8709 },
  { name: "Relational Nurturer", x: 0.96 },
];

// First + last of the ranking are labelled directly under the axis (Figma).
const END_LABELS = new Set([RANKING[0]!.name, RANKING[RANKING.length - 1]!.name]);

/** Fallback band from the raw 1-7 answer when config has no band (stub archetypes). */
function bandFromValue(value: number | null): Band {
  if (value === null || value <= 2) return value === null ? "Medium" : "Low";
  return value <= 5 ? "Medium" : "High";
}

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

const ImportanceOfSexualitySection: FC<Props> = ({ archetype, importanceValue }) => {
  const band: Band =
    getReport2Config(archetype)?.importance_strip?.band ?? bandFromValue(importanceValue);
  const description = BAND_DESCRIPTION[band];

  const [isAnimated, setIsAnimated] = useState(false);
  useEffect(() => {
    const rafId = requestAnimationFrame(() => setIsAnimated(true));
    return () => cancelAnimationFrame(rafId);
  }, []);

  // The viewer's own dot = their entry in the fixed ranking.
  const youIndex = RANKING.findIndex((d) => d.name === archetype);

  return (
    <div className="report-flow report-flow--gap-xl">
      <article className="report-importance">
        <div className="report-importance__highlight" aria-hidden="true" />

        {/* Header */}
        <div className="report-importance__header">
          <div className="report-importance__overline">
            <span className="report-importance__overline-line" />
            <span>Your Result</span>
          </div>

          <div className="report-importance__result">
            <p className="report-importance__band">{band}</p>
            <span className="report-importance__divider" aria-hidden="true" />
            <p className="report-importance__desc">
              {band === "High" ? highDescriptionNodes(description) : description}
            </p>
          </div>
        </div>

        {/* Continuum: matters less ●———●———(You)———●——— matters more */}
        <div className={`report-importance__strip${isAnimated ? " is-animated" : ""}`}>
          <div className="report-importance__axis" aria-hidden="true">
            <span className="report-importance__axis-line" />

            {RANKING.map((dot, i) => {
              const isYou = i === youIndex;
              const accent = getReportTheme(dot.name).accent;
              const style = {
                "--dot-x": `${dot.x * 100}%`,
                "--dot-accent-rgb": hexToRgbTriplet(accent),
                "--dot-order": i,
              } as CSSProperties;
              return (
                <span
                  key={dot.name}
                  className={`report-importance__dot${isYou ? " is-you" : ""}`}
                  style={style}
                >
                  {isYou && <span className="report-importance__dot-pill">You</span>}
                  {END_LABELS.has(dot.name) && !isYou && (
                    <span className="report-importance__dot-label">{shortLabel(dot.name)}</span>
                  )}
                </span>
              );
            })}
          </div>
          <div className="report-importance__ends" aria-hidden="true">
            <span>matters less</span>
            <span>matters more</span>
          </div>
        </div>
      </article>
      {/* No trailing prose: Figma 8427:1394 is heading → card, nothing after. */}
    </div>
  );
};

/** Split the High copy so the Figma bold fragment renders as <strong>. */
function highDescriptionNodes(text: string) {
  const idx = text.indexOf(HIGH_BOLD);
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <strong>{HIGH_BOLD}</strong>
      {text.slice(idx + HIGH_BOLD.length)}
    </>
  );
}

/** Figma abbreviates "Relational Nurturer" → "Rel. Nurturer" on the axis. */
function shortLabel(name: string): string {
  return name === "Relational Nurturer" ? "Rel. Nurturer" : name;
}

export default ImportanceOfSexualitySection;
