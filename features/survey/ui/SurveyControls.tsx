"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type FC } from "react";
import { createPortal } from "react-dom";

/**
 * The question card's top row: the Auto-advance switch, with a tip on what it does, and
 * Pause. Both left with the 2026-10-04 redesign (Figma 11303:174, "each was used in about
 * 1% of survey starts") and came back on Marcus's review of 20.10 ("What happened to our
 * 'Pause + Auto answer options toggle'?"). This is the old header's top row (546c4f8b,
 * SurveyHeader) as it was, in the survey's white theme; its progress block stays out, the
 * footer shows progress now.
 */
interface SurveyControlsProps {
  onPause: () => void;
  autoAdvance: boolean;
  onToggleAutoAdvance: () => void;
}

const AUTO_ADVANCE_HELP =
  'When enabled, you\'ll automatically move to the next question after selecting an answer - no need to click "Next".';
const TOOLTIP_MEDIA_QUERY = "(hover: hover) and (pointer: fine)";
const TOOLTIP_EDGE_PADDING = 16;
const TOOLTIP_GAP = 12;

function supportsHoverTooltip() {
  if (typeof window === "undefined") {
    return false;
  }

  if (typeof window.matchMedia === "function") {
    return window.matchMedia(TOOLTIP_MEDIA_QUERY).matches;
  }

  return navigator.maxTouchPoints === 0;
}

function buildTooltipPosition(anchorRect: DOMRect, tooltipRect: DOMRect): CSSProperties {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  let left = anchorRect.left + anchorRect.width / 2 - tooltipRect.width / 2;
  left = Math.min(
    Math.max(TOOLTIP_EDGE_PADDING, left),
    viewportWidth - tooltipRect.width - TOOLTIP_EDGE_PADDING
  );

  let top = anchorRect.bottom + TOOLTIP_GAP;
  if (top + tooltipRect.height > viewportHeight - TOOLTIP_EDGE_PADDING) {
    top = anchorRect.top - tooltipRect.height - TOOLTIP_GAP;
  }

  top = Math.min(
    Math.max(TOOLTIP_EDGE_PADDING, top),
    viewportHeight - tooltipRect.height - TOOLTIP_EDGE_PADDING
  );

  return {
    left: `${Math.round(left)}px`,
    top: `${Math.round(top)}px`,
  };
}

const PauseIcon: FC = () => (
  <svg
    aria-hidden
    className="h-2.5 w-2.5"
    viewBox="0 0 10 10"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
  >
    <line x1="3" y1="1" x2="3" y2="9" />
    <line x1="7" y1="1" x2="7" y2="9" />
  </svg>
);

const InfoIcon: FC = () => (
  <svg
    aria-hidden
    className="h-3 w-3"
    viewBox="0 0 12 12"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.1"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="6" cy="6" r="4.6" />
    <path d="M6 5.2v2.3" />
    <path d="M6 3.55h.01" />
  </svg>
);

const CheckIcon: FC = () => (
  <svg
    aria-hidden
    className="h-3.5 w-3.5"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m3.5 8.1 2.5 2.5 6-6" />
  </svg>
);

const SurveyControls: FC<SurveyControlsProps> = ({ onPause, autoAdvance, onToggleAutoAdvance }) => {
  const helpTriggerRef = useRef<HTMLButtonElement | null>(null);
  const helpTooltipRef = useRef<HTMLDivElement | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isHelpTooltipOpen, setIsHelpTooltipOpen] = useState(false);
  const [useHoverTooltip, setUseHoverTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState<CSSProperties | null>(null);

  useEffect(() => {
    const syncTooltipMode = () => {
      const nextUseHoverTooltip = supportsHoverTooltip();
      setUseHoverTooltip(nextUseHoverTooltip);

      if (nextUseHoverTooltip) {
        setIsHelpTooltipOpen(false);
      }
    };

    syncTooltipMode();

    if (typeof window.matchMedia === "function") {
      const mediaQuery = window.matchMedia(TOOLTIP_MEDIA_QUERY);

      if (typeof mediaQuery.addEventListener === "function") {
        mediaQuery.addEventListener("change", syncTooltipMode);
        return () => mediaQuery.removeEventListener("change", syncTooltipMode);
      }

      mediaQuery.addListener(syncTooltipMode);
      return () => mediaQuery.removeListener(syncTooltipMode);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  useLayoutEffect(() => {
    if (!isHelpTooltipOpen) {
      return;
    }

    let rafId = 0;

    const updateTooltipPosition = () => {
      const anchorEl = helpTriggerRef.current;
      const tooltipEl = helpTooltipRef.current;

      if (!anchorEl || !tooltipEl) {
        return;
      }

      setTooltipPosition(
        buildTooltipPosition(anchorEl.getBoundingClientRect(), tooltipEl.getBoundingClientRect())
      );
    };

    const scheduleUpdate = () => {
      cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(updateTooltipPosition);
    };

    scheduleUpdate();
    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("scroll", scheduleUpdate, true);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("scroll", scheduleUpdate, true);
    };
  }, [isHelpTooltipOpen]);

  useEffect(() => {
    if (!isHelpTooltipOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;

      const clickedTrigger = helpTriggerRef.current?.contains(target);
      const clickedTooltip = helpTooltipRef.current?.contains(target);

      if (!clickedTrigger && !clickedTooltip) {
        setIsHelpTooltipOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsHelpTooltipOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isHelpTooltipOpen]);

  const cancelTooltipClose = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const scheduleTooltipClose = () => {
    cancelTooltipClose();
    closeTimerRef.current = setTimeout(() => {
      setIsHelpTooltipOpen(false);
    }, 70);
  };

  const openTooltip = () => {
    cancelTooltipClose();
    setIsHelpTooltipOpen(true);
  };

  const tooltipNode =
    isHelpTooltipOpen && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={helpTooltipRef}
            role="tooltip"
            id="survey-auto-advance-help"
            className="fixed z-[70] max-w-[320px] rounded-[16px] border border-black/[0.08] bg-white px-[17px] py-[13px] text-left shadow-[0_16px_48px_rgba(0,0,0,0.12)]"
            style={
              tooltipPosition ?? {
                left: `${TOOLTIP_EDGE_PADDING}px`,
                top: `${TOOLTIP_EDGE_PADDING}px`,
              }
            }
            onMouseEnter={useHoverTooltip ? cancelTooltipClose : undefined}
            onMouseLeave={useHoverTooltip ? scheduleTooltipClose : undefined}
          >
            <p className="font-sans text-[14px] font-medium leading-[20px] text-[#161021]">
              Auto-advance
            </p>
            <p className="pt-[2px] font-sans text-[12px] font-light leading-[16px] text-[#6b6678]">
              {AUTO_ADVANCE_HELP}
            </p>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <div className="flex flex-wrap items-center justify-end gap-3" data-survey-controls>
        <div
          className={`flex items-center gap-1.5 rounded-full border px-2 py-1.5 transition-colors ${
            isHelpTooltipOpen
              ? "border-[#8b6fbf]/30 bg-[rgba(139,111,191,0.08)]"
              : "border-black/10 bg-transparent"
          }`}
        >
          <button
            type="button"
            onClick={onToggleAutoAdvance}
            className="flex items-center gap-2.5 rounded-full px-1 py-0.5 font-sans text-[13px] font-medium text-[#4a4458] transition hover:text-[#161021] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a78bfa]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
            aria-pressed={autoAdvance}
            title={autoAdvance ? "Auto-advance is on" : "Auto-advance is off"}
          >
            <span
              className={`flex h-[16px] w-[32px] items-center rounded-full px-[2px] transition-colors duration-200 ${
                autoAdvance ? "bg-[#8b6fbf]/35" : "bg-black/15"
              }`}
            >
              <span
                className={`flex h-[12px] w-[12px] items-center justify-center rounded-full transition-transform duration-200 ${
                  autoAdvance
                    ? "translate-x-[16px] bg-[#8b6fbf] text-white shadow-[0_0_10px_rgba(139,111,191,0.45)]"
                    : "translate-x-0 bg-[#c9c5d4] text-transparent"
                }`}
              >
                {autoAdvance ? <CheckIcon /> : null}
              </span>
            </span>
            <span>Auto-advance</span>
          </button>

          <button
            ref={helpTriggerRef}
            type="button"
            aria-label="Explain auto-advance"
            aria-describedby={isHelpTooltipOpen ? "survey-auto-advance-help" : undefined}
            aria-expanded={isHelpTooltipOpen}
            className="flex h-6 w-6 items-center justify-center rounded-full text-[#8b6fbf]/90 transition hover:bg-[rgba(139,111,191,0.12)] hover:text-[#6b5b95] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a78bfa]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
            onBlur={useHoverTooltip ? scheduleTooltipClose : undefined}
            onClick={() => {
              if (useHoverTooltip) {
                openTooltip();
                return;
              }

              setIsHelpTooltipOpen((current) => !current);
            }}
            onFocus={useHoverTooltip ? openTooltip : undefined}
            onMouseEnter={useHoverTooltip ? openTooltip : undefined}
            onMouseLeave={useHoverTooltip ? scheduleTooltipClose : undefined}
          >
            <InfoIcon />
          </button>
        </div>

        <button
          type="button"
          onClick={onPause}
          className="flex items-center gap-1.5 rounded-full border border-black/[0.12] px-4 py-1.5 font-sans text-[13px] font-medium text-[#6b6678] transition hover:border-black/20 hover:text-[#161021] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fe6839]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
        >
          <PauseIcon />
          Pause
        </button>
      </div>

      {tooltipNode}
    </>
  );
};

export default SurveyControls;
