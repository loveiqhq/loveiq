"use client";

import { useEffect, useRef, useState, type FC } from "react";
import PremiumOverlay from "./PremiumOverlay";
import {
  reportPracticeTendencies,
  type ReportPracticeTendencyContent,
  type ReportPracticeTendencyGroup,
  type ReportPracticeTendencyRow,
} from "@/data/report-practice-tendencies";

interface Props {
  archetype: string;
  archetypeHtml: string | null;
  generalHtml: string;
  isPremium: boolean;
  isUnlocked?: boolean;
  onUnlock?: () => void;
  sectionTitle: string;
}

type MetricTone = "fantasy" | "pleasure";

function slugifyPracticeKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toPercent(value: number) {
  return Math.min(10, Math.max(1, value)) * 10;
}

const InfoGlyph: FC<{ className?: string }> = ({ className }) => (
  <span className={className} aria-hidden="true">
    <svg viewBox="0 0 12 12" fill="none">
      <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1" />
      <path
        d="M6 5v2.2M6 3.55h.01"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1"
      />
    </svg>
  </span>
);

const PracticeMetricCell: FC<{
  label: string;
  tone: MetricTone;
  value: number;
}> = ({ label, tone, value }) => {
  const percent = toPercent(value);

  return (
    <div
      className={`report-practice-table__metric report-practice-table__metric--${tone}`}
      role="cell"
    >
      <span className="report-practice-table__metric-mobile-label">{label}</span>
      <div className="report-practice-table__metric-content">
        <span className="report-practice-table__metric-value">{percent}%</span>
        <span className="report-practice-table__metric-bar" aria-hidden="true">
          <span style={{ width: `${percent}%` }} />
        </span>
      </div>
    </div>
  );
};

const PracticeRow: FC<{
  group: ReportPracticeTendencyGroup;
  interactive: boolean;
  onOpen: (rowId: string) => void;
  onClose: (rowId: string) => void;
  openRowId: string | null;
  row: ReportPracticeTendencyRow;
}> = ({ group, interactive, onOpen, onClose, openRowId, row }) => {
  const rowId = `${slugifyPracticeKey(group.title)}-${slugifyPracticeKey(row.practice)}`;
  const popoverId = `report-practice-popover-${rowId}`;
  const isOpen = interactive && !!row.description && openRowId === rowId;

  return (
    <div className="report-practice-table__row" role="row">
      <div className="report-practice-table__practice" role="cell">
        <div
          className="report-practice-table__practice-stack"
          data-practice-popover-root
          onMouseEnter={interactive && row.description ? () => onOpen(rowId) : undefined}
          onMouseLeave={interactive && row.description ? () => onClose(rowId) : undefined}
        >
          <span className="report-practice-table__practice-label">{row.practice}</span>

          {interactive && row.description ? (
            <button
              type="button"
              className="report-practice-table__info-button"
              aria-label={`What ${row.practice} tends to organize`}
              aria-controls={popoverId}
              aria-expanded={isOpen}
              onBlur={() => onClose(rowId)}
              onClick={() => onOpen(rowId)}
              onFocus={() => onOpen(rowId)}
            >
              <InfoGlyph className="report-practice-table__info-glyph" />
            </button>
          ) : (
            <InfoGlyph className="report-practice-table__info-glyph report-practice-table__info-glyph--muted" />
          )}

          {interactive && row.description && isOpen ? (
            <div id={popoverId} role="tooltip" className="report-practice-table__popover">
              <p className="report-practice-table__popover-title">{row.practice}</p>
              <p className="report-practice-table__popover-copy">{row.description}</p>
            </div>
          ) : null}
        </div>
      </div>

      <PracticeMetricCell label="Fantasy Pull" tone="fantasy" value={row.fantasyPull} />
      <PracticeMetricCell label="Actual Pleasure" tone="pleasure" value={row.actualPleasure} />
    </div>
  );
};

const PracticeGroupTable: FC<{
  group: ReportPracticeTendencyGroup;
  interactive: boolean;
  onOpen: (rowId: string) => void;
  onClose: (rowId: string) => void;
  openRowId: string | null;
}> = ({ group, interactive, onOpen, onClose, openRowId }) => (
  <section
    className="report-practice-group"
    aria-labelledby={`practice-group-${slugifyPracticeKey(group.title)}`}
  >
    <h3
      id={`practice-group-${slugifyPracticeKey(group.title)}`}
      className="report-practice-group__title"
    >
      {group.title}
    </h3>

    <div className="report-practice-group__table-shell">
      <div className="report-practice-table" role="table" aria-label={`${group.title} tendencies`}>
        <div className="report-practice-table__header" role="row">
          <div
            className="report-practice-table__header-cell report-practice-table__header-cell--name"
            role="columnheader"
          >
            Fantasy &amp; Practice
          </div>
          <div className="report-practice-table__header-cell" role="columnheader">
            <span>Fantasy Pull</span>
            <InfoGlyph className="report-practice-table__header-glyph" />
          </div>
          <div className="report-practice-table__header-cell" role="columnheader">
            <span>Actual Pleasure</span>
            <InfoGlyph className="report-practice-table__header-glyph" />
          </div>
        </div>

        <div className="report-practice-table__body" role="rowgroup">
          {group.rows.map((row) => (
            <PracticeRow
              key={`${group.title}-${row.practice}`}
              group={group}
              interactive={interactive}
              onOpen={onOpen}
              onClose={onClose}
              openRowId={openRowId}
              row={row}
            />
          ))}
        </div>
      </div>
    </div>
  </section>
);

const PracticePanel: FC<{
  archetype: string;
  content: ReportPracticeTendencyContent;
  interactive: boolean;
}> = ({ archetype, content, interactive }) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const [openRowId, setOpenRowId] = useState<string | null>(null);

  useEffect(() => {
    if (!interactive || !openRowId) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;

      const root = rootRef.current;
      if (!root) return;

      const popoverRoot = (
        target instanceof Element ? target.closest("[data-practice-popover-root]") : null
      ) as Element | null;

      if (popoverRoot && root.contains(popoverRoot)) {
        return;
      }

      setOpenRowId(null);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenRowId(null);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [interactive, openRowId]);

  const handleOpen = (rowId: string) => {
    if (!interactive) return;
    setOpenRowId(rowId);
  };

  const handleClose = (rowId: string) => {
    if (!interactive) return;
    setOpenRowId((current) => (current === rowId ? null : current));
  };

  return (
    <div ref={rootRef} className="report-practice-panel">
      <span className="report-practice-panel__glow" aria-hidden="true" />

      <div className="report-practice-panel__header">
        <h2 className="report-practice-panel__title">
          <span>Typical Sexual Fantasy &amp; Practice Tendencies of the </span>
          <span className="report-practice-panel__title-accent">{archetype}</span>
        </h2>

        <div className="report-practice-panel__intro">
          {content.introBlocks.map((block, index) => (
            <div
              key={`${archetype}-practice-intro-${index}`}
              className="report-practice-panel__intro-block"
              dangerouslySetInnerHTML={{ __html: block }}
            />
          ))}
        </div>
      </div>

      <div className="report-practice-panel__groups">
        {content.groups.map((group) => (
          <PracticeGroupTable
            key={group.title}
            group={group}
            interactive={interactive}
            onOpen={handleOpen}
            onClose={handleClose}
            openRowId={openRowId}
          />
        ))}
      </div>
    </div>
  );
};

const PracticeTendenciesSection: FC<Props> = ({
  archetype,
  isPremium,
  isUnlocked = false,
  onUnlock,
  sectionTitle,
}) => {
  const [locallyUnlocked, setLocallyUnlocked] = useState(false);
  const unlocked = isUnlocked || locallyUnlocked;
  const content = reportPracticeTendencies[archetype];

  function handleUnlock() {
    if (onUnlock) {
      onUnlock();
      return;
    }

    setLocallyUnlocked(true);
  }

  if (!content) {
    return (
      <p className="report-practice-empty">
        Practice tendencies for this archetype are being prepared.
      </p>
    );
  }

  return (
    <div className="report-flow report-flow--gap-xl">
      <div className="report-themed-block">
        {isPremium && !unlocked ? (
          <div className="report-themed-block__preview report-themed-block__preview--practice">
            <div className="report-practice-layout report-themed-block__blurred" aria-hidden="true">
              <PracticePanel archetype={archetype} content={content} interactive={false} />
            </div>
            <PremiumOverlay
              archetype={archetype}
              sectionTitle={sectionTitle}
              onUnlock={handleUnlock}
            />
          </div>
        ) : (
          <div className="report-practice-layout">
            <PracticePanel archetype={archetype} content={content} interactive={true} />
          </div>
        )}
      </div>
    </div>
  );
};

export default PracticeTendenciesSection;
