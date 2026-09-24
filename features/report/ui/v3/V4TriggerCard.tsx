"use client";

import Image from "next/image";
import type { CSSProperties, FC } from "react";
import type { Report3TriggerRow } from "@/data/report3-accelerators";
import V4LockBadge from "./V4LockBadge";
import { guardedUnlock } from "./v4Unlock";

/**
 * One of Accelerator & Brakes' two trigger cards — "WHAT BRAKES YOU" (Figma
 * 386:219, paywalled 386:416) and "WHAT ACCELERATES YOU" (386:317 / 386:444). The
 * brakes card is coral and comes first, the accelerators card green.
 *
 * Each row is a label, one line of explanation and a thin scale. The fills are the
 * frame's and decorative, not the reader's scores — Sanjin and Mark are still
 * deciding whether the lines imply a ranking (Figma, 2026-09-22); dropping them is
 * removing `<RowScale />` below.
 *
 * PAYWALLED, the cards keep their first `lockedFrom` rows sharp and blur the rest
 * uniformly — no ramp row, unlike Typical Beliefs' panels — with the gradient lock
 * badge floating over the blur. The blurred rows arrive scrambled from the server;
 * they are `aria-hidden` and `inert`, and the group around them owns the click, so
 * a tap anywhere on the blur opens the paywall once (the badge has no handler of
 * its own and bubbles to it — the same seam as V4ShadowBeliefs).
 *
 * The chrome text lives here, never in the paid module.
 */

type Tone = "brake" | "accel";

const LABEL: Record<Tone, string> = {
  brake: "WHAT BRAKES YOU",
  accel: "WHAT ACCELERATES YOU",
};

/** 386:222 / 386:320, downloaded from the frame unchanged. */
const ICON: Record<Tone, string> = {
  brake: "/report/v3/accelerators/icon-minus.svg",
  accel: "/report/v3/accelerators/icon-plus.svg",
};

const NODE: Record<Tone, { open: string; locked: string }> = {
  brake: { open: "386:219", locked: "386:416" },
  accel: { open: "386:317", locked: "386:444" },
};

interface Props {
  tone: Tone;
  rows: readonly Report3TriggerRow[];
  /** Index of the first blurred row, or null/absent when the chapter is open. */
  lockedFrom?: number | null;
  /** Opens the paywall from the blurred rows. */
  onUnlock?: () => void;
}

/** 469:225 — a 2px track, the fill and a 6px knob centred on its end. */
const RowScale: FC<{ fill: number }> = ({ fill }) => (
  <span
    className="rv4-trig__scale"
    style={{ "--fill": `${fill}%` } as CSSProperties}
    aria-hidden="true"
  >
    <span className="rv4-trig__track" />
    <span className="rv4-trig__fill" />
    <span className="rv4-trig__knob" />
  </span>
);

const Row: FC<{ row: Report3TriggerRow; locked: boolean; last: boolean }> = ({
  row,
  locked,
  last,
}) => (
  <li className={`rv4-trig__row${locked ? " is-locked" : ""}${last ? " is-last" : ""}`}>
    <p className="rv4-trig__title">{row.label}</p>
    <p className="rv4-trig__sub">{row.subtext}</p>
    <RowScale fill={row.fill} />
  </li>
);

const V4TriggerCard: FC<Props> = ({ tone, rows, lockedFrom = null, onUnlock }) => {
  const locked = lockedFrom !== null && lockedFrom < rows.length;
  const clear = locked ? rows.slice(0, lockedFrom) : rows;
  const blurred = locked ? rows.slice(lockedFrom) : [];
  // Scrambled rows are not stable keys, so rows are keyed by position.
  return (
    <section
      className={`rv4-trig rv4-trig--${tone}`}
      data-node-id={locked ? NODE[tone].locked : NODE[tone].open}
      data-name={tone === "brake" ? "Card · What shuts you down" : "Card · What opens you"}
    >
      <div className="rv4-trig__head">
        <span className="rv4-trig__badge" aria-hidden="true">
          <Image src={ICON[tone]} alt="" width={16} height={16} unoptimized />
        </span>
        <h4 className="rv4-trig__label">{LABEL[tone]}</h4>
      </div>
      <div className="rv4-trig__rows">
        <ul className="rv4-trig__list">
          {clear.map((row, index) => (
            <Row key={index} row={row} locked={false} last={!locked && index === rows.length - 1} />
          ))}
        </ul>
        {locked ? (
          <div className="rv4-tb-lock rv4-trig__lock" onClick={guardedUnlock(onUnlock)}>
            <ul className="rv4-trig__list is-locked" aria-hidden="true" inert>
              {blurred.map((row, index) => (
                <Row key={index} row={row} locked last={index === blurred.length - 1} />
              ))}
            </ul>
            <V4LockBadge />
          </div>
        ) : null}
      </div>
    </section>
  );
};

export default V4TriggerCard;
