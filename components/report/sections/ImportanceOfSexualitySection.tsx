"use client";

import { useEffect, useRef, useState, type CSSProperties, type FC } from "react";

interface Props {
  generalHtml: string;
  importanceLabel: string;
  importanceValue: number | null;
}

function getBand(value: number | null): {
  label: string;
  zone: "low" | "medium" | "high";
  description: string;
} {
  if (value === null) return { label: "—", zone: "medium", description: "" };
  if (value <= 2)
    return {
      label: "Low",
      zone: "low",
      description:
        "Sex is <strong>not the main organizing force</strong> right now and tends to matter more in specific contexts than as a constant priority.",
    };
  if (value <= 5)
    return {
      label: "Medium",
      zone: "medium",
      description:
        "Sex is a <strong>meaningful part</strong> of your identity among many other parts.",
    };
  return {
    label: "High",
    zone: "high",
    description:
      "Sex feels <strong>central to vitality, identity, and connection</strong>, and it carries real weight in overall life satisfaction.",
  };
}

/**
 * Map 1-7 value to bar height percentage.
 * 1→12%, 4→52%, 7→92%
 */
function valueToHeight(v: number): number {
  return Math.round(((v - 1) / 6) * 80 + 12);
}

function stripResultParagraph(html: string) {
  return html.replace(/<p><strong>Your result:\s*<\/strong>.*?<\/p>/i, "").trim();
}

/**
 * Bar chart with 4 positions. The user's bar replaces the
 * reference bar in their zone:
 * - Low user → position 1 is the user bar
 * - Medium user → position 2 or 3 is the user bar
 * - High user → position 4 is the user bar
 */
const ImportanceOfSexualitySection: FC<Props> = ({
  generalHtml,
  importanceLabel,
  importanceValue,
}) => {
  const band = getBand(importanceValue);
  const userValue = importanceValue ?? 4;
  const userHeight = valueToHeight(userValue);

  // Define 4 bar slots: each can be user or reference
  const bars = [
    { height: valueToHeight(1.5), isUser: band.zone === "low" },
    { height: valueToHeight(3.5), isUser: band.zone === "medium" },
    { height: valueToHeight(5.5), isUser: band.zone === "high" },
    { height: valueToHeight(6.8), isUser: false },
  ];

  // Override the user bar's height with the actual value
  const userBar = bars.find((b) => b.isUser);
  if (userBar) userBar.height = userHeight;

  const chartRef = useRef<HTMLDivElement>(null);
  const [isAnimated, setIsAnimated] = useState(() => typeof IntersectionObserver === "undefined");

  useEffect(() => {
    const el = chartRef.current;
    if (!el || isAnimated) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsAnimated(true);
          observer.disconnect();
        }
      },
      { threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [isAnimated]);

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
            <p className="report-importance__band">{band.label}</p>
            <span className="report-importance__divider" aria-hidden="true" />
            <p
              className="report-importance__desc"
              dangerouslySetInnerHTML={{ __html: band.description }}
            />
          </div>
        </div>

        {/* Bar chart */}
        <div
          ref={chartRef}
          className={`report-importance__chart${isAnimated ? " is-animated" : ""}`}
        >
          <div className="report-importance__yaxis">
            <span>High</span>
            <span>Medium</span>
            <span>Low</span>
          </div>

          <div className="report-importance__bars">
            <div className="report-importance__grid">
              <div className="report-importance__gridline report-importance__gridline--dashed" />
              <div className="report-importance__gridline report-importance__gridline--faint" />
              <div className="report-importance__gridline report-importance__gridline--faint" />
            </div>

            {bars.map((bar, i) => (
              <div
                key={i}
                className="report-importance__bar"
                style={
                  {
                    ["--stagger-i"]: i,
                    ["--bar-fill-h"]: `${bar.height}%`,
                  } as CSSProperties
                }
              >
                <div
                  className={`report-importance__bar-fill ${bar.isUser ? "report-importance__bar-fill--user" : "report-importance__bar-fill--ref"}`}
                >
                  {bar.isUser && <div className="report-importance__tooltip">You</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </article>

      <div
        className="report-prose"
        dangerouslySetInnerHTML={{ __html: stripResultParagraph(generalHtml) }}
      />
    </div>
  );
};

export default ImportanceOfSexualitySection;
