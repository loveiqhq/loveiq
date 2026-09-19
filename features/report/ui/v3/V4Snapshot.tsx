"use client";

import { Fragment, useState, type FC } from "react";
import type { Report3SnapshotRow } from "@/data/report3-archetype-page";

/**
 * "Snapshot of the <Archetype>" — Report V4, Figma 1:763 / panel 55:1700.
 *
 * A separate component from `V3SnapshotIgnite` rather than another branch on it,
 * because V4 changed both the behaviour and the chrome:
 *
 * - V3 is a single-open accordion — its own comment records "only ever one row
 *   open at a time — true in all six frames". V4 draws every row open
 *   (55:1701 … 55:1749 are each named "Row N — open").
 * - V3's panel carries coral/orchid washes, a per-row ramp colour and row numbers.
 *   V4's is one white panel, a violet hairline border, a 26px radius and a single
 *   offset shadow, with plain hairline dividers between rows.
 *
 * Rows stay individually collapsible so the chevron keeps meaning something; they
 * simply all start open, which is the state the frame is delivered in.
 */

interface Props {
  archetype: string;
  rows: readonly Report3SnapshotRow[];
}

const V4Snapshot: FC<Props> = ({ archetype, rows }) => {
  const [closed, setClosed] = useState<ReadonlySet<number>>(new Set());

  const toggle = (i: number) =>
    setClosed((prev) => {
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

      {/* 55:1700 — one white panel, violet hairline, 26px radius. */}
      <div className="rv4-snap__panel" data-node-id="55:1700">
        {rows.map((row, i) => {
          const isOpen = !closed.has(i);
          return (
            <Fragment key={row.claim}>
              {i > 0 ? <div className="rv4-snap__divider" aria-hidden="true" /> : null}
              <div className={`rv4-snap__row${isOpen ? " is-open" : ""}`}>
                {/* 55:1702 — a 3px edge column the frame keeps empty in this state. */}
                <div className="rv4-snap__edge" aria-hidden="true" />
                <div className="rv4-snap__content">
                  <button
                    type="button"
                    className="rv4-snap__claimrow"
                    aria-expanded={isOpen}
                    onClick={() => toggle(i)}
                  >
                    <span className="rv4-snap__claim">{row.claim}</span>
                    <span className="rv4-snap__chev" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none">
                        <path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth="2" />
                      </svg>
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
