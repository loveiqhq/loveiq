"use client";

import { useEffect, useRef, useState } from "react";
import { bandOf, type Check } from "@features/mira/content/checks";
import { bandText, shortDate, sinceLastTime, type CheckResult } from "./data";

/**
 * A check's results over time: one line across the scale's bands, shaded in one hue from light
 * (the lowest band) to darker, each named at the right. Dates are spaced by time, so a long gap
 * reads as one. Drawn at the container's own width, so its text stays the page's size on a phone
 * and on a desk. The sentence above it and the table below it say everything it shows.
 */

/**
 * One hue, faint to stronger, for the bands (lowest first): purple over the page, so the bands
 * deepen on the dark theme too and the ink line and score stay readable on all of them.
 */
const TINTS = [
  "fill-ap-purple/[0.02]",
  "fill-ap-purple/[0.09]",
  "fill-ap-purple/[0.15]",
  "fill-ap-purple/[0.22]",
  "fill-ap-purple/30",
];
const H = 196;
const PAD = { left: 12, right: 92, top: 22, bottom: 30 };

/** The plain-words summary of a check's results: how many, the latest, the points since last time. */
export function trendSummary(check: Check, results: CheckResult[]): string {
  const last = results.at(-1);
  if (!last) return "No results yet.";
  const latest = `${bandOf(check, last.score).label.toLowerCase()} (${last.score} of ${check.max}) on ${shortDate(last.at)}`;
  if (results.length === 1) return `One result so far: ${latest}.`;
  const since = sinceLastTime(results.at(-2)!.score, last.score);
  return `${results.length} results. Your latest is ${latest}, ${since}.`;
}

/** The container's width, for drawing at 1:1 (600 until measured, and where nothing measures). */
function useWidth(drawn: boolean) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(600);
  useEffect(() => {
    const el = ref.current;
    if (!drawn || !el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => {
      const w = Math.round(entry?.contentRect.width ?? 0);
      if (w > 0) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [drawn]);
  return { ref, width };
}

/** "Moderately severe" on two lines in the label column; short names on one. */
function BandLabel({ x, y, label }: { x: number; y: number; label: string }) {
  const [first, ...rest] = label.split(" ");
  const two = label.length > 10 && rest.length > 0;
  return (
    <text x={x} y={two ? y - 7 : y} dominantBaseline="middle" className="fill-ap-muted text-[12px]">
      {two ? (
        <>
          <tspan x={x}>{first}</tspan>
          <tspan x={x} dy={14}>
            {rest.join(" ")}
          </tspan>
        </>
      ) : (
        label
      )}
    </text>
  );
}

export function TrendChart({ check, results }: { check: Check; results: CheckResult[] }) {
  const { ref, width } = useWidth(results.length > 0);
  if (results.length === 0) return null;
  const low = check.bands[0]!.min;
  const plotW = Math.max(120, width - PAD.left - PAD.right);
  const plotH = H - PAD.top - PAD.bottom;
  const y = (score: number) => PAD.top + (1 - (score - low) / (check.max - low)) * plotH;
  const times = results.map((r) => Date.parse(r.at));
  const t0 = times[0]!;
  const span = times.at(-1)! - t0;
  const x = (t: number) => PAD.left + (span ? ((t - t0) / span) * plotW : plotW / 2);
  const points = results.map((r, i) => ({ r, x: x(times[i]!), y: y(r.score) }));
  const path = points.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join("");
  const last = points.at(-1)!;
  return (
    <div ref={ref} className="w-full motion-safe:animate-mira-in">
      <svg
        width="100%"
        height={H}
        viewBox={`0 0 ${PAD.left + plotW + PAD.right} ${H}`}
        aria-hidden="true"
        focusable="false"
        className="block"
      >
        {check.bands.map((b, i) => {
          // Scores are whole numbers, so bands meet halfway: a 5 sits inside "mild", not on its edge.
          const next = check.bands[i + 1];
          const top = y(next ? next.min - 0.5 : check.max);
          const bottom = y(i === 0 ? low : b.min - 0.5);
          return (
            <g key={b.id}>
              <rect
                x={PAD.left}
                y={top}
                width={plotW}
                height={Math.max(0, bottom - top)}
                className={TINTS[Math.min(i, TINTS.length - 1)]}
              />
              <BandLabel x={PAD.left + plotW + 10} y={(top + bottom) / 2} label={b.label} />
            </g>
          );
        })}
        <path
          d={path}
          fill="none"
          className="stroke-ap-ink"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {points.map((p, i) => {
          const latest = i === points.length - 1;
          return (
            <g key={p.r.at}>
              <title>{`${shortDate(p.r.at)}: ${bandText(check, p.r).toLowerCase()} (${p.r.score})`}</title>
              <circle
                cx={p.x}
                cy={p.y}
                r={latest ? 6 : 5}
                className={latest ? "fill-ap-ink stroke-white" : "fill-white stroke-ap-ink"}
                strokeWidth={2}
              />
            </g>
          );
        })}
        <text
          x={last.x}
          y={last.y - 12 < PAD.top - 6 ? last.y + 24 : last.y - 12}
          textAnchor={points.length > 1 ? "end" : "middle"}
          className="fill-ap-ink text-[14px] font-bold"
        >
          {last.r.score}
        </text>
        <text x={PAD.left} y={H - 8} className="fill-ap-muted text-[12px]">
          {shortDate(results[0]!.at)}
        </text>
        {results.length > 1 ? (
          <text
            x={PAD.left + plotW}
            y={H - 8}
            textAnchor="end"
            className="fill-ap-muted text-[12px]"
          >
            {shortDate(results.at(-1)!.at)}
          </text>
        ) : null}
      </svg>
    </div>
  );
}
