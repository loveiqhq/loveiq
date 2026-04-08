"use client";

import { useEffect, useRef, useState, type FC } from "react";

interface Props {
  animate?: boolean;
  tone?: "accent" | "shared";
  max: number;
  value: number;
}

const RADIUS = 80;
const ARC_LENGTH = Math.PI * RADIUS;

/** Full semicircle path (180deg to 0deg) */
const FULL_ARC = describeArc(104, 100, RADIUS, 180, 0);

const ArcGauge: FC<Props> = ({ animate = false, tone = "accent", max, value }) => {
  const ratio = Math.min(Math.max(value / max, 0), 1);
  const targetOffset = ARC_LENGTH * (1 - ratio);
  const [offset, setOffset] = useState(ARC_LENGTH);
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (!animate || hasAnimated.current) return;
    hasAnimated.current = true;
    // Next frame so browser paints the hidden state first
    const id = requestAnimationFrame(() => setOffset(targetOffset));
    return () => cancelAnimationFrame(id);
  }, [animate, targetOffset]);

  return (
    <svg className="report-gauge" viewBox="0 0 208 114" fill="none" aria-hidden="true">
      <path
        d={FULL_ARC}
        stroke="rgba(255, 255, 255, 0.09)"
        strokeWidth="12"
        strokeLinecap="round"
      />
      {ratio > 0 && (
        <path
          d={FULL_ARC}
          className={`report-gauge__value ${tone === "shared" ? "is-shared" : "is-accent"}`}
          stroke="currentColor"
          strokeWidth="12"
          strokeLinecap="round"
          style={{
            strokeDasharray: ARC_LENGTH,
            strokeDashoffset: offset,
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
