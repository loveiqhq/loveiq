"use client";

import Image from "next/image";
import type { CSSProperties, FC } from "react";
import { GATE_ACTIVE_CHAPTER, GATE_CHAPTER_PARTS } from "./gateChapters";
import { GATE_COPY, GATE_PITCHES } from "./gateContent";

type Line =
  | { kind: "part"; key: string; text: string }
  | {
      kind: "row";
      key: string;
      id: string;
      label: string;
      access: "in_full" | "partly_open" | "locked";
    };

const LINES: readonly Line[] = GATE_CHAPTER_PARTS.flatMap((part): Line[] => [
  { kind: "part", key: `part:${part.heading}`, text: part.heading },
  ...part.rows.map((row): Line => ({ kind: "row", key: row.id, ...row })),
]);

/** Each chapter's line in the drawer, 1-based: the grid row its pitch sits on. */
const LINE_OF = new Map(
  LINES.flatMap((line, index) => (line.kind === "row" ? [[line.id, index + 1] as const] : []))
);

const Badge: FC<{ access: "in_full" | "partly_open" | "locked" }> = ({ access }) =>
  access === "in_full" ? (
    <span className="iug-map__chip">{GATE_COPY.mapLabels.inFull}</span>
  ) : (
    <Image
      className="iug-map__lock"
      src={
        access === "partly_open"
          ? "/report/gate/badge-partly-open.svg"
          : "/report/gate/badge-locked.svg"
      }
      alt=""
      width={8.09}
      height={8.09}
      unoptimized
    />
  );

/**
 * "The questions your report answers." (1665:3276, 1665:3096): the report's chapter drawer
 * beside five pitches, each on the line of the chapter it is about. The drawer is the live
 * V4 nav (gateChapters.ts) drawn small, so it only ever names chapters the report has; it is
 * a picture of the report, hidden from screen readers, and the pitches carry what it says.
 *
 * The drawer's lines and the pitches share the grid's rows (the drawer is a subgrid), so a
 * pitch stays on its chapter however the lines wrap. A pitch is a zero-height item on the
 * line's centre, its text hung from it: it never stretches the line it sits on.
 */
export const GateChapterMap: FC = () => (
  <section className="iug-map-section animate-on-scroll" aria-labelledby="iug-map-title">
    <h2 id="iug-map-title" className="rpg__section-title iug-section-title">
      {GATE_COPY.mapTitle.lead} <br className="iug-section-title__break" />
      <em className="rpg-gradient">{GATE_COPY.mapTitle.emph}</em>
      {GATE_COPY.mapTitle.tail}
    </h2>

    <div className="iug-map" style={{ "--iug-lines": LINES.length } as CSSProperties}>
      <div className="iug-map__card" aria-hidden="true">
        {LINES.map((line) =>
          line.kind === "part" ? (
            <p key={line.key} className="iug-map__part">
              {line.text}
            </p>
          ) : (
            <p
              key={line.key}
              className={`iug-map__row iug-map__row--${line.access}${
                line.id === GATE_ACTIVE_CHAPTER ? " is-active" : ""
              }`}
              data-iug-chapter={line.id}
              data-access={line.access}
            >
              {line.id === GATE_ACTIVE_CHAPTER ? (
                <Image
                  className="iug-map__dot"
                  src="/report/gate/item-dot.svg"
                  alt=""
                  width={12.71}
                  height={12.71}
                  unoptimized
                />
              ) : null}
              <span className="iug-map__label">{line.label}</span>
              <Badge access={line.access} />
            </p>
          )
        )}
      </div>

      {GATE_PITCHES.map((pitch) => (
        <div
          key={pitch.anchor}
          className="iug-map__pitch"
          style={{ gridRow: LINE_OF.get(pitch.anchor) }}
        >
          <div className="iug-map__pitch-body">
            {pitch.label === "inFull" ? (
              <span className="iug-map__chip iug-map__chip--pitch">
                {GATE_COPY.mapLabels.inFull}
              </span>
            ) : pitch.label === "partlyOpen" ? (
              <span className="iug-map__partly">
                <Image
                  src="/report/gate/badge-partly-open-label.svg"
                  alt=""
                  width={10.11}
                  height={10.11}
                  unoptimized
                />
                <span className="iug-map__partly-text">{GATE_COPY.mapLabels.partlyOpen}</span>
              </span>
            ) : null}
            <p className="iug-map__pitch-title">{pitch.title}</p>
            {pitch.body ? <p className="iug-map__pitch-text">{pitch.body}</p> : null}
          </div>
        </div>
      ))}
    </div>
  </section>
);
