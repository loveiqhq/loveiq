"use client";

import { Fragment, useState, type FC } from "react";
import type { Report3SnapshotRow } from "@/data/report3-archetype-page";

/**
 * "Snapshot of the <Archetype>" — Report V4, Figma 1:763 / panel 316:250.
 *
 * A separate component from `V3SnapshotIgnite` rather than another branch on it,
 * because V4 changed both the behaviour and the chrome:
 *
 * - V3's panel carries coral/orchid washes, a per-row ramp colour and row numbers.
 *   V4's is one white panel, a violet hairline border, a 26px radius and a single
 *   centred shadow, with plain hairline dividers between rows.
 * - V3 is a single-open accordion. V4 lets any number of rows stand open at once.
 *
 * ROWS START CLOSED, which is the state the frame is delivered in: 316:251 through
 * 316:295 are each named "Row N — closed", and the panel measures 484px — five
 * 86px rows, four 1px dividers and the 26/24 padding, with no body text anywhere
 * in it. The earlier panel (55:1700) drew every row open and this component
 * followed it; the redraw reverses that, so the state is tracked as "which rows
 * are open" rather than "which are closed".
 *
 * The 3px "Ramp edge" rail survives in the frame at `opacity: 0` (316:253), so the
 * column is kept and left empty rather than removed — it still reserves the 3px
 * the claim column is offset by.
 */

interface Props {
  archetype: string;
  rows: readonly Report3SnapshotRow[];
}

const V4Snapshot: FC<Props> = ({ archetype, rows }) => {
  const [open, setOpen] = useState<ReadonlySet<number>>(new Set());

  const toggle = (i: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  return (
    <section className="rv4-snap" data-node-id="1:763" data-name="Snapshot">
      <h2 className="rv4-snap__heading" data-node-id="1:766">
        Snapshot of the <span className="rv4-snap__archetype">{archetype}</span>
      </h2>

      {/* 316:250 — one white panel, violet hairline, 26px radius. */}
      <div className="rv4-snap__panel" data-node-id="316:250" data-name="Ignite panel">
        {rows.map((row, i) => {
          const isOpen = open.has(i);
          return (
            <Fragment key={row.claim}>
              {i > 0 ? <div className="rv4-snap__divider" aria-hidden="true" /> : null}
              <div className={`rv4-snap__row${isOpen ? " is-open" : ""}`}>
                {/* 316:252 — the 3px edge column, empty in this state. */}
                <div className="rv4-snap__edge" aria-hidden="true" />
                <div className="rv4-snap__content">
                  <button
                    type="button"
                    className="rv4-snap__claimrow"
                    aria-expanded={isOpen}
                    onClick={() => toggle(i)}
                  >
                    <span className="rv4-snap__claim">{row.claim}</span>
                    {/* 316:257 "Lock slot" — a 34px disc holding the 18px chevron. */}
                    <span className="rv4-snap__disc" aria-hidden="true">
                      <span className="rv4-snap__chev">
                        <svg viewBox="0 0 18 18" fill="none">
                          <path
                            d="M4.78 6.89L9 11.11L13.22 6.89"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                    </span>
                  </button>
                  {isOpen ? (
                    <p className="rv4-snap__body">
                      {row.body.split("\n").map((line, j) => (
                        <Fragment key={j}>
                          {j > 0 ? <br /> : null}
                          {line}
                        </Fragment>
                      ))}
                    </p>
                  ) : null}
                </div>
              </div>
            </Fragment>
          );
        })}
      </div>

      {/* 1:831 */}
      <div className="rv4-snap__sep" aria-hidden="true" />
    </section>
  );
};

export default V4Snapshot;
