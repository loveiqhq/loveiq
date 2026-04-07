"use client";

import type { FC } from "react";

interface Props {
  animate?: boolean;
  tone?: "accent" | "shared";
  max: number;
  value: number;
}

const ArcGauge: FC<Props> = ({ animate = false, tone = "accent", max, value }) => {
  const ratio = Math.min(Math.max(value / max, 0), 1);
  const radius = 80;
  const arcLength = Math.PI * radius;
  const endAngle = 180 - ratio * 180;
  const valuePath = ratio > 0 ? describeArc(104, 100, radius, 180, endAngle) : "";

  return (
    <svg className="report-gauge" viewBox="0 0 208 114" fill="none" aria-hidden="true">
      <path
        d={describeArc(104, 100, radius, 180, 0)}
        stroke="rgba(255, 255, 255, 0.09)"
        strokeWidth="12"
        strokeLinecap="round"
      />
      {valuePath ? (
        <path
          d={valuePath}
          className={`report-gauge__value ${tone === "shared" ? "is-shared" : "is-accent"} ${
            animate ? "is-animated" : ""
          }`}
          stroke="currentColor"
          strokeWidth="12"
          strokeLinecap="round"
          style={{
            strokeDasharray: `${arcLength}`,
            strokeDashoffset: `${arcLength * (1 - ratio)}`,
          }}
        />
      ) : null}
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
