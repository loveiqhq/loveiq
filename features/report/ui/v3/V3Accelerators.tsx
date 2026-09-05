"use client";

import type { CSSProperties, FC } from "react";
import type { AccelRow, AccelVerdict } from "@/data/report2-accel-rows";
import { useRevealOnView } from "../hooks/useRevealOnView";

/**
 * Chapter 2.1 "Accelerators & Brakes", V3 layout — Figma 10392:19343.
 *
 * Same data as the V1 section (`data/report2-accel-rows.ts`), rearranged the way
 * V3 wants it:
 *   V1: one card, two side-by-side columns, meter underneath, verdict below.
 *   V3: a hero gauge card FIRST, then the two trigger lists as separate
 *       full-width cards with BRAKES BEFORE ACCELERATORS — which is the
 *       chapter's own argument ("removing a brake beats adding an accelerator").
 *
 * Rows come in three visual tiers (Figma names them STRONGEST / STRONG / ALSO
 * PRESENT): row 1 is serif and large, rows 2-3 bold sans, rows 4+ smaller and
 * dimmer. The tier is positional, matching the frame.
 */

const CirclePlus: FC = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <path d="M8 12h8M12 8v8" />
  </svg>
);

const CircleMinus: FC = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <path d="M8 12h8" />
  </svg>
);

type Tone = "open" | "shut";

const TriggerCard: FC<{
  tone: Tone;
  title: string;
  rows: readonly AccelRow[];
  /** Figma shows the count on the accelerators card only (10392:19413); the
   * brakes card lost both its count and its closing note on 2026-09-05. */
  showCount?: boolean;
}> = ({ tone, title, rows, showCount = false }) => {
  const [ref, revealed] = useRevealOnView<HTMLDivElement>();
  return (
    <section
      ref={ref}
      className={`rv3-accel-card rv3-accel-card--${tone} report-chart-reveal${revealed ? " is-revealed" : ""}`}
      data-node-id={tone === "shut" ? "10392:19367" : "10392:19413"}
    >
      <header className="rv3-accel-card__head">
        <span className="rv3-accel-card__badge" aria-hidden="true">
          {tone === "shut" ? <CircleMinus /> : <CirclePlus />}
        </span>
        <p className="rv3-accel-card__title">{title}</p>
        {showCount ? <p className="rv3-accel-card__count">{rows.length} triggers</p> : null}
      </header>
      <div className="rv3-accel-card__rows">
        {rows.map((row, i) => (
          <div
            key={row.label}
            className={`rv3-accel-row rv3-accel-row--${i === 0 ? "lead" : i < 3 ? "strong" : "also"}`}
            style={{ "--row": i } as CSSProperties}
          >
            <p className="rv3-accel-row__label">{row.label}</p>
            <p className="rv3-accel-row__sub">{row.subtext}</p>
            <div
              className="rv3-accel-row__scale"
              role="img"
              aria-label={`${row.label}: ${row.fill}% of the strongest`}
            >
              <span className="rv3-accel-row__track" />
              <span className="rv3-accel-row__fill" style={{ width: `${row.fill}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

interface Props {
  opens: readonly AccelRow[];
  shuts: readonly AccelRow[];
  verdict: AccelVerdict;
  /** `edu.body.p1`-style lead paragraph shown under the hero. */
  intro?: string | null;
}

const V3Accelerators: FC<Props> = ({ opens, shuts, verdict, intro }) => {
  const [gaugeRef, gaugeRevealed] = useRevealOnView<HTMLDivElement>();
  // The verdict caption names the leaning side; the hero headline and the note
  // inside the brakes card both use it, so it is split once here.
  const side = verdict.side;
  const leaning: Tone = /brake/i.test(side) ? "shut" : "open";

  return (
    <div className="rv3-accel">
      <div
        ref={gaugeRef}
        className={`rv3-accel-hero report-chart-reveal${gaugeRevealed ? " is-revealed" : ""}`}
        data-node-id="10392:19344"
      >
        <p className="rv3-accel-hero__eyebrow">Your dual-control reading</p>
        <p className="rv3-accel-hero__headline">
          Your system is{" "}
          <span className={`rv3-accel-hero__side rv3-accel-hero__side--${leaning}`}>{side}</span>
        </p>
        <p className="rv3-accel-hero__sub">
          {leaning === "shut"
            ? "Always start by releasing, not adding."
            : "Lead with what adds, not what you remove."}
        </p>
        <div className="rv3-accel-gauge">
          <div className="rv3-accel-gauge__track" role="img" aria-label={verdict.caption}>
            <span className="rv3-accel-gauge__tick" aria-hidden="true" />
            {/* `--dot` rather than `left` so the needle travels from centre on
                reveal and an un-revealed gauge still shows the real reading. */}
            <span
              className="rv3-accel-gauge__needle"
              style={{ "--dot": `${verdict.dot}%` } as CSSProperties}
            />
          </div>
          <div className="rv3-accel-gauge__ends">
            <span className="rv3-accel-gauge__end rv3-accel-gauge__end--open">
              <CirclePlus />
              Accelerator-led
            </span>
            <span className="rv3-accel-gauge__end rv3-accel-gauge__end--shut">
              <CircleMinus />
              Brake-led
            </span>
          </div>
        </div>
      </div>

      {intro ? <p className="rv3-accel__intro">{intro}</p> : null}

      <TriggerCard tone="shut" title="What shuts you down" rows={shuts} />
      <TriggerCard tone="open" title="What opens you" rows={opens} showCount />
    </div>
  );
};

export default V3Accelerators;
