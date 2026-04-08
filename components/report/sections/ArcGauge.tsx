"use client";

import { useEffect, useState, type FC } from "react";

interface Props {
  animate?: boolean;
  tone?: "accent" | "shared";
  max: number;
  value: number;
}

const RADIUS = 80;
const ARC_LENGTH = Math.PI * RADIUS;

/** Full semicircle path (180° → 0°) used by both background and value arcs */
const FULL_ARC = describeArc(104, 100, RADIUS, 180, 0);

const ArcGauge: FC<Props> = ({ animate = false, tone = "accent", max, value }) => {
  const ratio = Math.min(Math.max(value / max, 0), 1);
  const targetOffset = ARC_LENGTH * (1 - ratio);

  // Start fully hidden, then reveal when animate triggers
  const [offset, setOffset] = useState(ARC_LENGTH);

  useEffect(() => {
    if (!animate) return;
    // Small delay so the transition actually plays (from hidden → target)
    const id = requestAnimationFrame(() => setOffset(targetOffset));
    return () => cancelAnimationFrame(id);
  }, [animate, targetOffset]);

  return (
    <svg className="report-gauge" viewBox="0 0 208 114" fill="none" aria-hidden="true">
      {/* Background track */}
      <path
        d={FULL_ARC}
        stroke="rgba(255, 255, 255, 0.09)"
        strokeWidth="12"
        strokeLinecap="round"
      />
      {/* Value arc */}
      {ratio > 0 && (
        <path
          d={FULL_ARC}
          className={`report-gauge__value ${tone === "shared" ? "is-shared" : "is-accent"}`}
          stroke="currentColor"
          strokeWidth="12"
          strokeLinecap="round"
          style={{
            strokeDasharray: ARC_LENGTH,
            strokeDashoffset: animate ? offset : targetOffset,
          }}
        />
      )}
    </svg>
  );
};

function describeArc(cx: number, cy: number, radius: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, radius, startAngle);
  const end = polarToCartesian(cx, cy, radius, endAngle);
  const largeArcFlag = Math.abs(startAngle - endAngle) > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`;
}

function polarToCartesian(cx: number, cy: number, radius: number, angleInDegrees: number) {
  const radians = (angleInDegrees * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(radians),
    y: cy - radius * Math.sin(radians),
  };
}

export default ArcGauge;
