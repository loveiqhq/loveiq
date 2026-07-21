"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type FC } from "react";
import { createPortal } from "react-dom";
import PremiumOverlay, { type PremiumOverlayTier } from "./PremiumOverlay";
import type { ReportPriceQuoteSnapshot } from "@features/pricing/logic/reportPricing";
import type {
  ReportPracticeTendencyContentForUser,
  ReportPracticeTendencyGroupForUser,
  ReportPracticeTendencyRowData,
} from "@features/report/ui/hooks/useReportData";

// Wire-side row alias; metrics may be null on locked rows past index 0.
type ReportPracticeTendencyRow = ReportPracticeTendencyRowData;
import {
  extractPracticeSectionIntroHtml,
  extractReportHtmlBlocks,
} from "@features/report/ui/reportContent";

// Internal aliases for the legacy API used by PracticeRow / PracticeGroupTable.
type ReportPracticeTendencyGroup = ReportPracticeTendencyGroupForUser;
type ReportPracticeTendencyContent = ReportPracticeTendencyContentForUser;

interface Props {
  archetype: string;
  archetypeHtml: string | null;
  /**
   * Practice tendency content for the current archetype, server-filtered. When
   * the practice section is locked the server ships only the free-preview row
   * + totalRowCount per group; otherwise full rows are present.
   * Null when the user has no access to this archetype's practice content.
   */
  content: ReportPracticeTendencyContentForUser | null;
  generalHtml: string;
  isPremium: boolean;
  isUnlocked?: boolean;
  offerDeadline?: number;
  onUnlock?: () => void;
  quote?: ReportPriceQuoteSnapshot | null;
  sectionTitle: string;
  tier?: PremiumOverlayTier;
}

type MetricTone = "fantasy" | "pleasure";
type PracticePopoverMeta = {
  anchorEl: HTMLElement | null;
  description: string;
  practice: string;
};

type DesktopPopoverState = {
  anchorEl: HTMLElement;
  description: string;
  practice: string;
  rowId: string;
};

const DESKTOP_POPOVER_MEDIA_QUERY = "(min-width: 1025px)";
const DESKTOP_POPOVER_EDGE_PADDING = 24;
const DESKTOP_POPOVER_GAP = 18;
const COMPACT_LOCKED_GROUP_TITLES = new Set([
  "Penetration & Body Opening",
  "Technology & Distance",
  "Ritual, Tantra & Conscious Sex",
]);

function resolveDesktopPopoverMode() {
  if (typeof window === "undefined") {
    return false;
  }

  if (typeof window.matchMedia !== "function") {
    return window.innerWidth >= 1025;
  }

  return window.matchMedia(DESKTOP_POPOVER_MEDIA_QUERY).matches;
}

function slugifyPracticeKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Maps a 1–10 score to its qualitative likelihood bucket (Figma 8146:76002).
function likelihoodLabel(value: number): string {
  if (value >= 7) return "More likely";
  if (value >= 4) return "Neutral likely";
  return "Less likely";
}

function buildDesktopPopoverPosition(anchorRect: DOMRect, tooltipRect: DOMRect): CSSProperties {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  let left = anchorRect.right + DESKTOP_POPOVER_GAP;
  if (left + tooltipRect.width > viewportWidth - DESKTOP_POPOVER_EDGE_PADDING) {
    left = anchorRect.left - tooltipRect.width - DESKTOP_POPOVER_GAP;
  }

  if (left < DESKTOP_POPOVER_EDGE_PADDING) {
    left = DESKTOP_POPOVER_EDGE_PADDING;
  }

  let top = anchorRect.top + anchorRect.height / 2 - tooltipRect.height / 2;
  const maxTop = viewportHeight - tooltipRect.height - DESKTOP_POPOVER_EDGE_PADDING;
  top = Math.min(Math.max(DESKTOP_POPOVER_EDGE_PADDING, top), maxTop);

  return {
    left: `${Math.round(left)}px`,
    top: `${Math.round(top)}px`,
  };
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
  tone: MetricTone;
  value: number | null;
}> = ({ tone, value }) => {
  // value === null marks a locked-row placeholder. Premium scores must NEVER
  // hit the DOM behind a CSS overlay — DevTools would surface them. Render a
  // visible "--" with no underlying numeric value (and no label) when locked.
  const isLocked = value === null;

  return (
    <div
      className={`report-practice-table__metric report-practice-table__metric--${tone}${
        isLocked ? " report-practice-table__metric--locked" : ""
      }`}
      role="cell"
    >
      <div className="report-practice-table__metric-content">
        <span className="report-practice-table__metric-value">{isLocked ? "--" : value}</span>
        {!isLocked && (
          <span className="report-practice-table__metric-likelihood">{likelihoodLabel(value)}</span>
        )}
      </div>
    </div>
  );
};

const PracticeRow: FC<{
  group: ReportPracticeTendencyGroup;
  interactive: boolean;
  onOpen: (rowId: string, meta: PracticePopoverMeta) => void;
  onClose: (rowId: string) => void;
  openRowId: string | null;
  row: ReportPracticeTendencyRow;
  useDesktopPopover: boolean;
}> = ({ group, interactive, onOpen, onClose, openRowId, row, useDesktopPopover }) => {
  const infoButtonRef = useRef<HTMLButtonElement | null>(null);
  const rowId = `${slugifyPracticeKey(group.title)}-${slugifyPracticeKey(row.practice)}`;
  const popoverId = `report-practice-popover-${rowId}`;
  const isOpen = interactive && !!row.description && openRowId === rowId;
  const handleOpenFromAnchor = (anchorEl: HTMLButtonElement) => {
    if (!row.description) {
      return;
    }

    onOpen(rowId, {
      anchorEl,
      description: row.description,
      practice: row.practice,
    });
  };
  const handleDesktopHoverOpen = () => {
    if (!row.description) {
      return;
    }

    onOpen(rowId, {
      anchorEl: infoButtonRef.current,
      description: row.description,
      practice: row.practice,
    });
  };

  return (
    <div className="report-practice-table__row" role="row">
      <div className="report-practice-table__practice" role="cell">
        <div className="report-practice-table__practice-stack" data-practice-popover-root>
          <span className="report-practice-table__practice-label">{row.practice}</span>

          {interactive && row.description ? (
            <button
              ref={infoButtonRef}
              type="button"
              className="report-practice-table__info-button"
              aria-label={`What ${row.practice} tends to organize`}
              aria-controls={popoverId}
              aria-expanded={isOpen}
              onBlur={() => onClose(rowId)}
              onClick={(event) => handleOpenFromAnchor(event.currentTarget)}
              onFocus={(event) => handleOpenFromAnchor(event.currentTarget)}
              onMouseEnter={handleDesktopHoverOpen}
              onMouseLeave={() => onClose(rowId)}
            >
              <InfoGlyph className="report-practice-table__info-glyph" />
            </button>
          ) : (
            <InfoGlyph className="report-practice-table__info-glyph report-practice-table__info-glyph--muted" />
          )}
        </div>
      </div>

      <PracticeMetricCell tone="fantasy" value={row.fantasyPull} />
      <PracticeMetricCell tone="pleasure" value={row.actualPleasure} />

      {interactive && row.description && isOpen && !useDesktopPopover ? (
        <div className="report-practice-table__inline-popover" data-practice-popover-root>
          <div
            id={popoverId}
            role="tooltip"
            className="report-practice-table__popover report-practice-table__popover--inline"
          >
            <p className="report-practice-table__popover-title">{row.practice}</p>
            <p className="report-practice-table__popover-copy">{row.description}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
};

const PracticeGroupLocked: FC<{
  archetype: string;
  group: ReportPracticeTendencyGroup;
  offerDeadline?: number;
  onUnlock: () => void;
  quote?: ReportPriceQuoteSnapshot | null;
  sectionTitle: string;
  tier: PremiumOverlayTier;
}> = ({ archetype, group, offerDeadline, onUnlock, quote = null, sectionTitle, tier }) => {
  const freeRow = group.rows[0] ?? null;
  // Row 0 ships with real metric values (free preview). Rows 1+ ship with
  // their practice names but `fantasyPull` / `actualPleasure` nulled out by
  // `buildPracticeTendenciesForUser` — names tease what's behind the paywall,
  // numbers stay server-stripped. The cover overlay sits over columns 2–3.
  const lockedRows = group.rows.slice(1);
  const useCompactLockedCard = COMPACT_LOCKED_GROUP_TITLES.has(group.title);

  return (
    <section
      className="report-practice-group report-practice-group--locked"
      aria-labelledby={`practice-group-locked-${slugifyPracticeKey(group.title)}`}
    >
      <h3
        id={`practice-group-locked-${slugifyPracticeKey(group.title)}`}
        className="report-practice-group__title"
      >
        {group.title}
      </h3>

      <div className="report-practice-group__table-shell">
        <div
          className="report-practice-table"
          role="table"
          aria-label={`${group.title} tendencies`}
        >
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
            {freeRow && (
              <div className="report-practice-table__row" role="row">
                <div className="report-practice-table__practice" role="cell">
                  <div className="report-practice-table__practice-stack">
                    <span className="report-practice-table__practice-label">
                      {freeRow.practice}
                    </span>
                    <InfoGlyph className="report-practice-table__info-glyph report-practice-table__info-glyph--muted" />
                  </div>
                </div>
                <PracticeMetricCell tone="fantasy" value={freeRow.fantasyPull} />
                <PracticeMetricCell tone="pleasure" value={freeRow.actualPleasure} />
              </div>
            )}

            {lockedRows.length > 0 && (
              <div
                className={`report-practice-table__locked-section${useCompactLockedCard ? " report-practice-table__locked-section--compact" : ""}`}
                role="presentation"
              >
                {lockedRows.map((row, index) => (
                  <div
                    key={`locked-${index}`}
                    className="report-practice-table__row report-practice-table__row--locked"
                    role="row"
                  >
                    <div className="report-practice-table__practice" role="cell">
                      <div className="report-practice-table__practice-stack">
                        <span className="report-practice-table__practice-label">
                          {row.practice}
                        </span>
                        <InfoGlyph className="report-practice-table__info-glyph report-practice-table__info-glyph--muted" />
                      </div>
                    </div>
                    <PracticeMetricCell tone="fantasy" value={row.fantasyPull} />
                    <PracticeMetricCell tone="pleasure" value={row.actualPleasure} />
                  </div>
                ))}

                {/* Cover: replicates the table column grid so the card sits over
                    exactly columns 2–3, leaving column 1 (names) fully visible */}
                <div className="report-practice-table__locked-cover">
                  <div className="report-practice-table__locked-cover__name-spacer" />
                  <div
                    className={`report-practice-table__locked-cover__metrics${
                      useCompactLockedCard
                        ? " report-practice-table__locked-cover__metrics--compact"
                        : ""
                    }`}
                  >
                    <PremiumOverlay
                      archetype={archetype}
                      sectionTitle={sectionTitle}
                      tier={tier}
                      quote={quote}
                      offerDeadline={offerDeadline}
                      onUnlock={onUnlock}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

const PracticeGroupTable: FC<{
  group: ReportPracticeTendencyGroup;
  interactive: boolean;
  onOpen: (rowId: string, meta: PracticePopoverMeta) => void;
  onClose: (rowId: string) => void;
  openRowId: string | null;
  useDesktopPopover: boolean;
}> = ({ group, interactive, onOpen, onClose, openRowId, useDesktopPopover }) => (
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
              useDesktopPopover={useDesktopPopover}
            />
          ))}
        </div>
      </div>
    </div>
  </section>
);

const PracticeIntro: FC<{
  archetype: string;
  generalHtml: string;
}> = ({ archetype, generalHtml }) => {
  const introBlocks = extractReportHtmlBlocks(extractPracticeSectionIntroHtml(generalHtml));

  if (!introBlocks.length) {
    return null;
  }

  return (
    <div className="report-practice-panel__intro report-prose">
      {introBlocks.map((block, index) => (
        <div
          key={`${archetype}-practice-intro-${index}`}
          className="report-practice-panel__intro-block"
          dangerouslySetInnerHTML={{ __html: block }}
        />
      ))}
    </div>
  );
};

const PracticePanel: FC<{
  archetype: string;
  content: ReportPracticeTendencyContent;
  interactive: boolean;
}> = ({ content, interactive }) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const desktopPopoverRef = useRef<HTMLDivElement | null>(null);
  const [openRowId, setOpenRowId] = useState<string | null>(null);
  const [desktopPopover, setDesktopPopover] = useState<DesktopPopoverState | null>(null);
  const [desktopPopoverPosition, setDesktopPopoverPosition] = useState<CSSProperties | null>(null);
  const [useDesktopPopover, setUseDesktopPopover] = useState(resolveDesktopPopoverMode);
  const [isAnimated, setIsAnimated] = useState(() => typeof IntersectionObserver === "undefined");

  useEffect(() => {
    const el = rootRef.current;
    if (!el || isAnimated) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) {
          setIsAnimated(true);
          observer.disconnect();
        }
      },
      { threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [isAnimated]);

  useEffect(() => {
    if (!interactive || typeof window === "undefined") {
      return;
    }

    const syncDesktopPopoverMode = () => {
      const nextDesktopPopoverMode = resolveDesktopPopoverMode();
      setUseDesktopPopover(nextDesktopPopoverMode);

      if (!nextDesktopPopoverMode) {
        setDesktopPopover(null);
        setDesktopPopoverPosition(null);
      }
    };
    syncDesktopPopoverMode();

    if (typeof window.matchMedia === "function") {
      const mediaQuery = window.matchMedia(DESKTOP_POPOVER_MEDIA_QUERY);

      if (typeof mediaQuery.addEventListener === "function") {
        mediaQuery.addEventListener("change", syncDesktopPopoverMode);
        return () => mediaQuery.removeEventListener("change", syncDesktopPopoverMode);
      }

      mediaQuery.addListener(syncDesktopPopoverMode);
      return () => mediaQuery.removeListener(syncDesktopPopoverMode);
    }

    window.addEventListener("resize", syncDesktopPopoverMode);
    return () => window.removeEventListener("resize", syncDesktopPopoverMode);
  }, [interactive]);

  useLayoutEffect(() => {
    if (!interactive || !useDesktopPopover || !desktopPopover) {
      return;
    }

    let rafId = 0;

    const updateDesktopPopoverPosition = () => {
      const tooltipEl = desktopPopoverRef.current;
      const anchorEl = desktopPopover.anchorEl;

      if (!tooltipEl || !anchorEl.isConnected) {
        setDesktopPopover(null);
        setDesktopPopoverPosition(null);
        return;
      }

      const anchorRect = anchorEl.getBoundingClientRect();
      const tooltipRect = tooltipEl.getBoundingClientRect();
      setDesktopPopoverPosition(buildDesktopPopoverPosition(anchorRect, tooltipRect));
    };

    const scheduleUpdate = () => {
      cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(updateDesktopPopoverPosition);
    };

    scheduleUpdate();
    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("scroll", scheduleUpdate, true);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("scroll", scheduleUpdate, true);
    };
  }, [desktopPopover, interactive, useDesktopPopover]);

  useEffect(() => {
    if (!interactive || !openRowId) {
      return;
    }

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
      setDesktopPopover(null);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenRowId(null);
        setDesktopPopover(null);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [interactive, openRowId]);

  const handleOpen = (rowId: string, meta: PracticePopoverMeta) => {
    if (!interactive) return;

    const shouldUseDesktopPopover = resolveDesktopPopoverMode();
    setUseDesktopPopover(shouldUseDesktopPopover);
    setOpenRowId(rowId);

    if (shouldUseDesktopPopover && meta.anchorEl) {
      setDesktopPopover({
        anchorEl: meta.anchorEl,
        description: meta.description,
        practice: meta.practice,
        rowId,
      });
      return;
    }

    setDesktopPopover(null);
  };

  const handleClose = (rowId: string) => {
    if (!interactive) return;
    setOpenRowId((current) => (current === rowId ? null : current));
    setDesktopPopover((current) => (current?.rowId === rowId ? null : current));
  };

  const desktopPopoverNode =
    interactive && useDesktopPopover && desktopPopover && typeof document !== "undefined"
      ? createPortal(
          <div
            id={`report-practice-popover-${desktopPopover.rowId}`}
            ref={desktopPopoverRef}
            role="tooltip"
            data-practice-tooltip-root
            className="report-practice-table__popover report-practice-table__popover--floating"
            style={desktopPopoverPosition ?? { left: "24px", opacity: 0, top: "24px" }}
          >
            <p className="report-practice-table__popover-title">{desktopPopover.practice}</p>
            <p className="report-practice-table__popover-copy">{desktopPopover.description}</p>
          </div>,
          document.body
        )
      : null;

  return (
    <div ref={rootRef} className={`report-practice-panel${isAnimated ? " is-animated" : ""}`}>
      <div className="report-practice-panel__groups">
        {content.groups.map((group) => (
          <PracticeGroupTable
            key={group.title}
            group={group}
            interactive={interactive}
            onOpen={handleOpen}
            onClose={handleClose}
            openRowId={openRowId}
            useDesktopPopover={useDesktopPopover}
          />
        ))}
      </div>

      {desktopPopoverNode}
    </div>
  );
};

const PracticeTendenciesSection: FC<Props> = ({
  archetype,
  content,
  generalHtml,
  isPremium,
  isUnlocked = false,
  offerDeadline,
  onUnlock,
  quote = null,
  sectionTitle,
  tier = "full_report",
}) => {
  const unlocked = isUnlocked;

  function handleUnlock() {
    onUnlock?.();
  }

  if (!content) {
    return (
      <p className="report-practice-empty">
        Practice tendencies for this archetype are being prepared.
      </p>
    );
  }

  return (
    <div className="report-flow__stack report-flow__stack--md report-practice-layout">
      <PracticeIntro archetype={archetype} generalHtml={generalHtml} />

      {isPremium && !unlocked ? (
        // `is-animated` (static) so locked previews render immediately — this
        // wrapper has no IntersectionObserver, unlike the interactive panel.
        <div className="report-practice-panel is-animated">
          {content.groups.map((group) => (
            <PracticeGroupLocked
              key={group.title}
              archetype={archetype}
              group={group}
              sectionTitle={sectionTitle}
              tier={tier}
              quote={quote}
              offerDeadline={offerDeadline}
              onUnlock={handleUnlock}
            />
          ))}
        </div>
      ) : (
        <PracticePanel archetype={archetype} content={content} interactive={true} />
      )}
    </div>
  );
};

export default PracticeTendenciesSection;
