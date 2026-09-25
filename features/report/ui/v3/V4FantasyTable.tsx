"use client";

import { useEffect, useId, useState, type FC } from "react";
import type {
  Report3FantasyCategory,
  Report3FantasyRow,
  Report3FantasyTable,
} from "@/data/report3-fantasy";
import V4LockBadge from "./V4LockBadge";
import { guardedUnlock } from "./v4Unlock";

/**
 * The fantasy table — Figma 639:308 (open: "collapsible, 3 rows + fade") and
 * 639:1905 (paywalled: "3 + 2 blurred"), in Fantasy vs. Reality's body.
 *
 * Eleven categories, each a heading whose whole row toggles it. An open category
 * sets three column heads and its rows: the fantasy with an info mark, then its
 * Fantasy Pull and Actual Pleasure scores, each over its likelihood.
 *
 * OPEN. Three rows sharp; the fourth and fifth peek, inert, under a 96px fade with
 * "Show all N fantasies" on it. The peek stands exactly 96px under the third row,
 * so the fade always starts where the fourth row does, whatever the first three
 * wrap to — 639:308's fixed 328px frame is that for its two open categories.
 * "Show all" drops the fade and lists every row; Figma draws no way back, so the
 * category toggle is it.
 *
 * PAYWALLED. The server sends three real rows of the first three categories and
 * blurred stand-ins after them — a scrambled name, no scores, no note — and three
 * stand-ins for every other category. One group owns the click over the stand-ins,
 * the lock and the "Unlock all N fantasies" pill, so any of them opens the paywall
 * once (the badge and the pill only bubble). The stand-ins' scores are drawn here:
 * a score never leaves the server for a row the reader has not bought.
 *
 * No copy is quoted in these comments on purpose: production serves browser source
 * maps, so a client component's comments are public.
 */

interface Props {
  table: Report3FantasyTable;
  /** Opens the paywall. Omitted where it would be inert. */
  onUnlock?: () => void;
}

/** Maps a 1-10 score to its likelihood, as V2's section does (Figma 8146:76002). */
const likelihood = (score: number): string =>
  score >= 7 ? "More likely" : score >= 4 ? "Neutral likely" : "Less likely";

/** Drawn under the blur for a stand-in row, cycling. Never a real score. */
const STAND_IN_SCORES: readonly (readonly [number, number])[] = [
  [5, 7],
  [7, 6],
  [4, 5],
];

/** The frame's 15px chevron, pointing down; CSS turns it up on an open category. */
const Chevron: FC = () => (
  <svg viewBox="0 0 15 15" fill="none">
    <path
      d="M3.28125 5.625L7.5 9.84375L11.7188 5.625"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * The info mark — 639:338 in a row (10.875px, a 0.906 stroke at 92%), 639:322 in a
 * column head (9.89px, 0.824 at 82%). One drawing, scaled by its box.
 */
const Mark: FC = () => (
  <svg viewBox="0 0 10.875 10.875" fill="none" aria-hidden="true">
    <circle cx="5.4375" cy="5.4375" r="4.531" stroke="currentColor" strokeWidth="0.906" />
    <path
      d="M5.4375 4.53V6.524M5.4375 3.216H5.4465"
      stroke="currentColor"
      strokeWidth="0.906"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const Score: FC<{ tone: "pull" | "pleasure"; value: number }> = ({ tone, value }) => (
  <div className={`rv4-fvt__score rv4-fvt__score--${tone}`} role="cell">
    <span className="rv4-fvt__num">{value}</span>
    <span className="rv4-fvt__qual">{likelihood(value)}</span>
  </div>
);

interface RowProps {
  row: Report3FantasyRow;
  /** Stand-in scores, for a blurred row. */
  standIn?: readonly [number, number];
  noteId?: string;
  noteOpen?: boolean;
  onToggleNote?: () => void;
}

const Row: FC<RowProps> = ({ row, standIn, noteId, noteOpen = false, onToggleNote }) => {
  const pull = row.pull ?? standIn?.[0] ?? 0;
  const pleasure = row.pleasure ?? standIn?.[1] ?? 0;
  const hasNote = Boolean(row.description && noteId && onToggleNote);
  return (
    <>
      <div className="rv4-fvt__row" role="row">
        <div className="rv4-fvt__label" role="cell">
          <span className="rv4-fvt__name">{row.practice}</span>
          {hasNote ? (
            <button
              type="button"
              className="rv4-fvt__info"
              aria-label={`What ${row.practice} tends to organize`}
              aria-expanded={noteOpen}
              aria-controls={noteId}
              data-fvt-note
              onClick={onToggleNote}
            >
              <span className="rv4-fvt__mark">
                <Mark />
              </span>
            </button>
          ) : (
            <span className="rv4-fvt__info" aria-hidden="true">
              <span className="rv4-fvt__mark">
                <Mark />
              </span>
            </span>
          )}
        </div>
        <Score tone="pull" value={pull} />
        <Score tone="pleasure" value={pleasure} />
      </div>
      {hasNote && noteOpen ? (
        <div className="rv4-fvt__note-row" role="row">
          <div className="rv4-fvt__note" id={noteId} role="cell" aria-colspan={3} data-fvt-note>
            <span className="rv4-fvt__note-name">{row.practice}</span>
            <span className="rv4-fvt__note-text">{row.description}</span>
          </div>
        </div>
      ) : null}
    </>
  );
};

interface CategoryProps {
  category: Report3FantasyCategory;
  locked: boolean;
  onUnlock?: () => void;
  openNote: string | null;
  setOpenNote: (key: string | null) => void;
  index: number;
}

/** Rows drawn sharp above the fade (639:308) or the blur (639:1905). */
const CLEAR_ROWS = 3;
/** The peek under the fade: rows 4 and 5 of 639:308. */
const PEEK_ROWS = 2;

const Category: FC<CategoryProps> = ({
  category,
  locked,
  onUnlock,
  openNote,
  setOpenNote,
  index,
}) => {
  const [isOpen, setIsOpen] = useState(category.defaultOpen);
  const [showAll, setShowAll] = useState(false);
  const baseId = useId();
  const panelId = `${baseId}-panel`;
  const clear = category.rows.slice(0, category.blurredFrom);
  const hidden = category.rows.slice(category.blurredFrom);
  const collapsed = !locked && !showAll && clear.length > CLEAR_ROWS;
  const sharp = collapsed ? clear.slice(0, CLEAR_ROWS) : clear;
  const peek = collapsed ? clear.slice(CLEAR_ROWS, CLEAR_ROWS + PEEK_ROWS) : [];
  const noteKey = (row: number) => `${index}:${row}`;

  return (
    <section className={`rv4-fvt__cat${isOpen ? " is-open" : ""}`}>
      <h4 className="rv4-fvt__head">
        <button
          type="button"
          className="rv4-fvt__toggle"
          aria-expanded={isOpen}
          aria-controls={panelId}
          onClick={() => setIsOpen((v) => !v)}
        >
          <span className="rv4-fvt__title">{category.title}</span>
          <span className="rv4-fvt__disc" aria-hidden="true">
            <Chevron />
          </span>
        </button>
      </h4>

      <div className="rv4-fvt__panel" id={panelId} hidden={!isOpen}>
        <div className="rv4-fvt__grid" role="table" aria-label={category.title}>
          <div className="rv4-fvt__cols" role="row">
            <span className="rv4-fvt__col rv4-fvt__col--practice" role="columnheader">
              Fantasy &amp; Practice
            </span>
            {/* 639:319 — the frame breaks both heads after their first word and
             * centres each line with its trailing space, so the lines are set
             * apart here and the space kept unbreakable. */}
            <span className="rv4-fvt__col rv4-fvt__col--score" role="columnheader">
              <span className="rv4-fvt__col-line">Fantasy&nbsp;</span>{" "}
              <span className="rv4-fvt__col-line">Pull</span>
              <span className="rv4-fvt__mark" aria-hidden="true">
                <Mark />
              </span>
            </span>
            <span className="rv4-fvt__col rv4-fvt__col--score" role="columnheader">
              <span className="rv4-fvt__col-line">Actual&nbsp;</span>{" "}
              <span className="rv4-fvt__col-line">Pleasure</span>
              <span className="rv4-fvt__mark" aria-hidden="true">
                <Mark />
              </span>
            </span>
          </div>

          <div className="rv4-fvt__rows" role="rowgroup">
            {sharp.map((row, i) => (
              <Row
                key={row.practice}
                row={row}
                noteId={`${baseId}-note-${i}`}
                noteOpen={openNote === noteKey(i)}
                onToggleNote={() => setOpenNote(openNote === noteKey(i) ? null : noteKey(i))}
              />
            ))}
          </div>

          {collapsed ? (
            <div className="rv4-fvt__peek">
              <div className="rv4-fvt__peek-rows" aria-hidden="true" inert>
                {peek.map((row) => (
                  <Row key={row.practice} row={row} />
                ))}
              </div>
              <span className="rv4-fvt__fade" aria-hidden="true" />
              <button type="button" className="rv4-fvt__pill" onClick={() => setShowAll(true)}>
                <span className="rv4-fvt__pill-label">Show all {category.total} fantasies</span>
              </button>
            </div>
          ) : null}

          {hidden.length ? (
            <div className="rv4-fvt__lock" onClick={guardedUnlock(onUnlock)}>
              {/* 639:2094 — the badge sits on the middle of the blurred rows. */}
              <div className="rv4-fvt__lockrows">
                <div className="rv4-fvt__blurred" aria-hidden="true" inert>
                  {hidden.map((row, i) => (
                    <Row
                      key={`${row.practice}-${i}`}
                      row={row}
                      standIn={STAND_IN_SCORES[i % STAND_IN_SCORES.length]}
                    />
                  ))}
                </div>
                <V4LockBadge />
              </div>
              {/* 639:2098 */}
              <div className="rv4-fvt__cta">
                <button type="button" className="rv4-fvt__pill">
                  <span className="rv4-fvt__pill-label">Unlock all {category.total} fantasies</span>
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
};

const V4FantasyTable: FC<Props> = ({ table, onUnlock }) => {
  // One note open at a time across the table, as V2's section keeps it.
  const [openNote, setOpenNote] = useState<string | null>(null);

  useEffect(() => {
    if (openNote === null) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-fvt-note]")) return;
      setOpenNote(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenNote(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openNote]);

  return (
    <div className="rv4-fvt" data-node-id={table.locked ? "639:1905" : "639:308"}>
      {table.categories.map((category, index) => (
        <Category
          key={category.title}
          category={category}
          locked={table.locked}
          onUnlock={onUnlock}
          openNote={openNote}
          setOpenNote={setOpenNote}
          index={index}
        />
      ))}
    </div>
  );
};

export default V4FantasyTable;
