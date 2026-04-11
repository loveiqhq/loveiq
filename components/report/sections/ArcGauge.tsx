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
const GAUGE_ANIMATION_DURATION_MS = 2200;

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
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      "matchMedia" in window &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion) {
      const reducedMotionFrame = requestAnimationFrame(() => setOffset(targetOffset));
      return () => cancelAnimationFrame(reducedMotionFrame);
    }

    const startOffset = ARC_LENGTH;
    const start = performance.now();
    let frameId = 0;

    const step = (now: number) => {
      const progress = Math.min((now - start) / GAUGE_ANIMATION_DURATION_MS, 1);
      const eased = easeInOutCubic(progress);
      setOffset(startOffset + (targetOffset - startOffset) * eased);

      if (progress < 1) {
        frameId = requestAnimationFrame(step);
      }
    };

    frameId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameId);
  }, [animate, targetOffset]);

  return (
    <svg className="report-gauge" viewBox="0 0 208 114" fill="none" aria-hidden="true">
      {tone === "shared" && (
        <defs>
          <filter id="arc-glow" x="-15%" y="-40%" width="130%" height="180%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
        </defs>
      )}
      <path
        d={FULL_ARC}
        stroke="rgba(255, 255, 255, 0.09)"
        strokeWidth="12"
        strokeLinecap="round"
      />
      {ratio > 0 && tone === "shared" && (
        <path
          d={FULL_ARC}
          className="report-gauge__glow"
          stroke="currentColor"
          strokeWidth="18"
          strokeLinecap="round"
          filter="url(#arc-glow)"
          style={{
            strokeDasharray: ARC_LENGTH,
            strokeDashoffset: offset,
          }}
        />
      )}
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

function easeInOutCubic(progress: number) {
  return progress < 0.5
    ? 4 * progress * progress * progress
    : 1 - Math.pow(-2 * progress + 2, 3) / 2;
}

export default ArcGauge;
