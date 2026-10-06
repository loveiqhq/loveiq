"use client";

import { useState, type CSSProperties, type FC } from "react";
import type { FindingsCopy } from "../sections/FindingsSection";

/**
 * Snapshot — "X3 IGNITE". The V3 redesign of `FindingsSection`: the same five
 * `fN.head` / `fN.body` findings, rebuilt as a single-open accordion.
 *
 * Figma states: 10392:25895 (nothing open, at rest) and 10392:25610 / 25667 /
 * 25724 / 25781 / 25838 (tiles 1-5 open). Only ever one row open at a time —
 * true in all six frames.
 */

/** Per-row ramp colour and the darkened ink the "turn" line uses on white.
 *
 * The ramp values came from get_design_context on 10392:25610, which reports
 * all five rows regardless of which one is open. The turn inks are NOT a
 * uniform darkening of the ramp (row 1 is x0.76/0.78/0.80 per channel, row 3 is
 * x0.74/0.68/0.77), so each was pixel-sampled from its own open-state frame.
 * The method was validated first on rows 1-3, where it reproduced the
 * design-context values exactly. */
const RAMP: ReadonlyArray<{ edge: string; turn: string }> = [
  { edge: "#f8694a", turn: "#bc523b" },
  { edge: "#ec6a6b", turn: "#b14d53" },
  { edge: "#e16b8c", turn: "#a6496c" },
  { edge: "#d56cad", turn: "#9b4584" },
  { edge: "#c96dce", turn: "#90409c" },
];

/**
 * The design splits each finding body into a coral "turn" and a grey
 * "mechanism", but the copy matrix only stores one `fN.body` string.
 *
 * Across all 70 rows the last sentence is always the turn — the resolving or
 * actionable line ("Relighting desire is a skill, and it's learnable.", "Lower
 * the pressure and it returns.", "Keep it in imagination, guilt-free.") — and
 * everything before it is the mechanism. Verified against the four open-state
 * frames and against all 11 three-sentence bodies.
 *
 * Two rows (spiritual-lover f3 and f5) are a single sentence, so they have no
 * mechanism; they render as a turn line alone rather than leaving a blank slot.
 */
export function splitFinding(body: string): { turn: string; mechanism: string } {
  const sentences = body
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (sentences.length <= 1) return { turn: body.trim(), mechanism: "" };
  return {
    turn: sentences[sentences.length - 1] as string,
    mechanism: sentences.slice(0, -1).join(" "),
  };
}

const Chevron: FC = () => (
  // 10392:25622 — stroke #8F8A9C at 2.1, drawn pointing down; the open row
  // rotates it 180deg in CSS so the transition is a real rotation.
  <svg className="rv3-ignite__chev" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth="2.1" />
  </svg>
);

interface Props {
  copy: FindingsCopy | null;
}

type Finding = { head: string; body: string };

const V3SnapshotIgnite: FC<Props> = ({ copy }) => {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (!copy) return null;

  const findings: Finding[] = ([1, 2, 3, 4, 5] as const)
    .map((n) => ({
      head: copy[`f${n}.head`] ?? "",
      body: copy[`f${n}.body`] ?? "",
    }))
    .filter((f): f is Finding => Boolean(f.head));

  if (!findings.length) return null;

  const active = openIndex === null ? null : RAMP[openIndex % RAMP.length];
  const panelStyle = active ? ({ "--rv3-ramp": active.edge } as CSSProperties) : undefined;

  return (
    <div
      className={`rv3-ignite ${openIndex === null ? "" : "is-open"}`}
      style={panelStyle}
      data-node-id="10513:4910"
    >
      <div className="rv3-ignite__wash rv3-ignite__wash--coral" aria-hidden="true" />
      <div className="rv3-ignite__wash rv3-ignite__wash--orchid" aria-hidden="true" />
      <div className="rv3-ignite__rule" aria-hidden="true" />

      <div className="rv3-ignite__rows">
        {findings.map((finding, idx) => {
          const ramp = RAMP[idx % RAMP.length] as { edge: string; turn: string };
          const isOpen = openIndex === idx;
          const { turn, mechanism } = splitFinding(finding.body);
          const rowStyle = {
            "--rv3-ramp": ramp.edge,
            "--rv3-turn": ramp.turn,
          } as CSSProperties;

          return (
            <div key={finding.head}>
              {idx > 0 ? <div className="rv3-ignite__divider" aria-hidden="true" /> : null}
              <div className={`rv3-ignite__row ${isOpen ? "is-open" : ""}`} style={rowStyle}>
                <div className="rv3-ignite__edge" aria-hidden="true">
                  <div className="rv3-ignite__ramp" />
                </div>
                <div className="rv3-ignite__content">
                  <button
                    type="button"
                    className="rv3-ignite__claim"
                    aria-expanded={isOpen}
                    aria-controls={`rv3-ignite-body-${idx}`}
                    onClick={() => setOpenIndex(isOpen ? null : idx)}
                  >
                    <span className="rv3-ignite__claim-text">{finding.head}</span>
                    <Chevron />
                  </button>
                  <div className="rv3-ignite__body" id={`rv3-ignite-body-${idx}`} role="region">
                    <div>
                      <div className="rv3-ignite__body-inner">
                        {turn ? <p className="rv3-ignite__turn">{turn}</p> : null}
                        {mechanism ? <p className="rv3-ignite__mechanism">{mechanism}</p> : null}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default V3SnapshotIgnite;
