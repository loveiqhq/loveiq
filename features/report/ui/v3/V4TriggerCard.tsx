"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type FC } from "react";
import type { Report3TriggerRow } from "@/data/report3-accelerators";
import V4LockBadge from "./V4LockBadge";
import { guardedUnlock } from "./v4Unlock";

/**
 * One of Accelerator & Brakes' two trigger cards — "WHAT BRAKES YOU" (Figma
 * 713:6132, paywalled 386:416) and "WHAT ACCELERATES YOU" (713:6181 / 386:444). The
 * brakes card is coral and comes first, the accelerators card green.
 *
 * Each row is a label and one line of explanation. The scales that ran under them
 * are gone, and 2.0's fill animation with them (Mark, 25.09: "We swapped out these
 * visual elements. On the Paywalled version, we are just deleting the scales").
 *
 * OPEN, the card shows two rows and the third under a fade, with "Show all" on it.
 * The pill lists every row and goes; Figma draws no way back, as in the fantasy
 * table, whose pill this is. The pill unmounts under the keyboard's focus, so focus
 * moves to the first row it revealed.
 *
 * PAYWALLED, the cards keep their first `lockedFrom` rows sharp and blur the rest
 * uniformly, with the gradient lock badge floating over the blur. The blurred rows
 * arrive scrambled from the server; they are `aria-hidden` and `inert`, and the group
 * around them owns the click, so a tap anywhere on the blur opens the paywall once
 * (the badge has no handler of its own and bubbles to it — the same seam as
 * V4ShadowBeliefs). The frames ramp the first blurred row's blur in; it holds
 * uniform here, because a ramp would show that row's stand-in text nearly sharp.
 *
 * The chrome text lives here, never in the paid module.
 */

type Tone = "brake" | "accel";

const LABEL: Record<Tone, string> = {
  brake: "WHAT BRAKES YOU",
  accel: "WHAT ACCELERATES YOU",
};

/** 713:6179 — set in capitals by the stylesheet, as the frame's text case does. */
const SHOW_ALL: Record<Tone, string> = {
  brake: "Show all brakes",
  accel: "Show all accelerators",
};

/** 386:222 / 386:320, downloaded from the frame unchanged. */
const ICON: Record<Tone, string> = {
  brake: "/report/v3/accelerators/icon-minus.svg",
  accel: "/report/v3/accelerators/icon-plus.svg",
};

const NODE: Record<Tone, { open: string; locked: string }> = {
  brake: { open: "713:6132", locked: "386:416" },
  accel: { open: "713:6181", locked: "386:444" },
};

/** The rows an open card shows before its pill; the next one peeks under the fade. */
const CLEAR_ROWS = 2;

interface Props {
  tone: Tone;
  rows: readonly Report3TriggerRow[];
  /** Index of the first blurred row, or null/absent when the chapter is open. */
  lockedFrom?: number | null;
  /** Opens the paywall from the blurred rows. */
  onUnlock?: () => void;
}

const Row: FC<{ row: Report3TriggerRow; locked?: boolean; last: boolean; focusable?: boolean }> = ({
  row,
  locked = false,
  last,
  focusable = false,
}) => (
  <li
    className={`rv4-trig__row${locked ? " is-locked" : ""}${last ? " is-last" : ""}`}
    tabIndex={focusable ? -1 : undefined}
  >
    <p className="rv4-trig__title">{row.label}</p>
    <p className="rv4-trig__sub">{row.subtext}</p>
  </li>
);

const V4TriggerCard: FC<Props> = ({ tone, rows, lockedFrom = null, onUnlock }) => {
  const locked = lockedFrom !== null && lockedFrom < rows.length;
  const [showAll, setShowAll] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  /** Set by the pill: once the rows are in, focus goes to the first one it revealed. */
  const revealed = useRef(false);
  const collapsed = !locked && !showAll && rows.length > CLEAR_ROWS;
  const clear = locked ? rows.slice(0, lockedFrom) : collapsed ? rows.slice(0, CLEAR_ROWS) : rows;
  const peek = collapsed ? rows[CLEAR_ROWS] : undefined;
  const blurred = locked ? rows.slice(lockedFrom) : [];

  useEffect(() => {
    if (!showAll || !revealed.current) return;
    revealed.current = false;
    listRef.current?.querySelectorAll<HTMLElement>(".rv4-trig__row")[CLEAR_ROWS]?.focus();
  }, [showAll]);

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
        <ul className="rv4-trig__list" ref={listRef}>
          {clear.map((row, index) => (
            <Row
              key={index}
              row={row}
              last={!locked && !collapsed && index === rows.length - 1}
              focusable={showAll && index === CLEAR_ROWS}
            />
          ))}
        </ul>
        {peek ? (
          <div className="rv4-trig__peek">
            <ul className="rv4-trig__list" aria-hidden="true" inert>
              <Row row={peek} last />
            </ul>
            <span className="rv4-trig__fade" aria-hidden="true" />
            <button
              type="button"
              className="rv4-trig__pill"
              onClick={() => {
                revealed.current = true;
                setShowAll(true);
              }}
            >
              <span className="rv4-trig__pill-label">{SHOW_ALL[tone]}</span>
            </button>
          </div>
        ) : null}
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
