"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type FC } from "react";
import { createPortal } from "react-dom";
import { useSurveyTheme } from "./SurveyThemeContext";

interface SurveyHeaderProps {
  progress: number;
  onPause: () => void;
  autoAdvance: boolean;
  onToggleAutoAdvance: () => void;
}

const TOTAL_MINUTES = 15;
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

const ClockIcon: FC = () => (
  <svg
    aria-hidden
    className="h-3 w-3"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
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

const SurveyHeader: FC<SurveyHeaderProps> = ({
  progress,
  onPause,
  autoAdvance,
  onToggleAutoAdvance,
}) => {
  const white = useSurveyTheme() === "white";
  const minutesLeft = Math.ceil((TOTAL_MINUTES * (100 - progress)) / 100);
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
            className={`fixed z-[70] max-w-[320px] rounded-[16px] border px-[17px] py-[13px] text-left ${
              white
                ? "border-black/[0.08] bg-white shadow-[0_16px_48px_rgba(0,0,0,0.12)]"
                : "border-white/10 bg-[#130b17] shadow-[0_16px_48px_rgba(0,0,0,0.35)]"
            }`}
            style={
              tooltipPosition ?? {
                left: `${TOOLTIP_EDGE_PADDING}px`,
                top: `${TOOLTIP_EDGE_PADDING}px`,
              }
            }
            onMouseEnter={useHoverTooltip ? cancelTooltipClose : undefined}
            onMouseLeave={useHoverTooltip ? scheduleTooltipClose : undefined}
          >
            <p
              className={`font-sans text-[14px] font-medium leading-[20px] ${white ? "text-[#161021]" : "text-[#e5e7eb]"}`}
            >
              Auto-advance
            </p>
            <p
              className={`pt-[2px] font-sans text-[12px] font-light leading-[16px] ${white ? "text-[#6b6678]" : "text-[#d6d6d6]"}`}
            >
              {AUTO_ADVANCE_HELP}
            </p>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <header className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-end gap-3">
          <div
            className={`flex items-center gap-1.5 rounded-full border px-2 py-1.5 transition-colors ${
              isHelpTooltipOpen
                ? white
                  ? "border-[#8b6fbf]/30 bg-[rgba(139,111,191,0.08)]"
                  : "border-[#a78bfa]/30 bg-[rgba(167,139,250,0.08)]"
                : white
                  ? "border-black/10 bg-transparent"
                  : "border-white/10 bg-transparent"
            }`}
          >
            <button
              type="button"
              onClick={onToggleAutoAdvance}
              className={`flex items-center gap-2.5 rounded-full px-1 py-0.5 font-sans text-[13px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a78bfa]/50 focus-visible:ring-offset-2 ${
                white
                  ? "text-[#4a4458] hover:text-[#161021] focus-visible:ring-offset-white"
                  : "text-white/75 hover:text-white focus-visible:ring-offset-[#0a0510]"
              }`}
              aria-pressed={autoAdvance}
              title={autoAdvance ? "Auto-advance is on" : "Auto-advance is off"}
            >
              <span
                className={`flex h-[16px] w-[32px] items-center rounded-full px-[2px] transition-colors duration-200 ${
                  autoAdvance
                    ? white
                      ? "bg-[#8b6fbf]/35"
                      : "bg-[#a78bfa]/35"
                    : white
                      ? "bg-black/15"
                      : "bg-white/20"
                }`}
              >
                <span
                  className={`flex h-[12px] w-[12px] items-center justify-center rounded-full transition-transform duration-200 ${
                    autoAdvance
                      ? white
                        ? "translate-x-[16px] bg-[#8b6fbf] text-white shadow-[0_0_10px_rgba(139,111,191,0.45)]"
                        : "translate-x-[16px] bg-[#a78bfa] text-white shadow-[0_0_10px_rgba(167,139,250,0.45)]"
                      : white
                        ? "translate-x-0 bg-[#c9c5d4] text-transparent"
                        : "translate-x-0 bg-[#d9d9d9] text-transparent"
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
              className={`flex h-6 w-6 items-center justify-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a78bfa]/50 focus-visible:ring-offset-2 ${
                white
                  ? "text-[#8b6fbf]/90 hover:bg-[rgba(139,111,191,0.12)] hover:text-[#6b5b95] focus-visible:ring-offset-white"
                  : "text-[#a78bfa]/80 hover:bg-[rgba(167,139,250,0.12)] hover:text-[#e0d9ff] focus-visible:ring-offset-[#0a0510]"
              }`}
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
            className={`flex items-center gap-1.5 rounded-full border px-4 py-1.5 font-sans text-[13px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fe6839]/60 focus-visible:ring-offset-2 ${
              white
                ? "border-black/[0.12] text-[#6b6678] hover:border-black/20 hover:text-[#161021] focus-visible:ring-offset-white"
                : "border-white/10 text-white/50 hover:border-white/20 hover:text-white/60 focus-visible:ring-offset-[#0a0510]"
            }`}
          >
            <PauseIcon />
            Pause
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span
              className={`font-sans text-[13px] font-semibold uppercase tracking-[0.1em] ${white ? "text-[#6b6678]" : "text-white/60"}`}
            >
              Progress
            </span>

            <div
              className={`flex items-center gap-2.5 rounded-full border px-3.5 py-1 ${
                white
                  ? "border-[rgba(139,111,191,0.25)] bg-[rgba(139,111,191,0.1)]"
                  : "border-[rgba(167,139,250,0.2)] bg-[rgba(167,139,250,0.1)]"
              }`}
            >
              <span
                className={`font-sans text-[10px] font-semibold uppercase tracking-[1px] sm:text-[13px] sm:tracking-[0.1em] ${white ? "text-[#6b5b95]" : "text-[#a78bfa]"}`}
              >
                {progress}%
              </span>
              {progress < 100 && (
                <>
                  <div
                    className={`h-3 w-px ${white ? "bg-[rgba(139,111,191,0.4)]" : "bg-[rgba(167,139,250,0.4)]"}`}
                  />
                  <div
                    className={`flex items-center gap-1.5 ${white ? "text-[#6b5b95]" : "text-[#a78bfa]"}`}
                  >
                    <ClockIcon />
                    <span className="font-sans text-[10px] font-semibold uppercase tracking-[1px] sm:text-[13px] sm:tracking-[0.1em]">
                      ~{minutesLeft} min
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>

          <div
            className={`relative h-[6px] w-full overflow-hidden rounded-full ${white ? "bg-black/10" : "bg-white/10"}`}
          >
            <div
              className={`h-full rounded-full transition-all duration-500 ease-out ${
                white
                  ? "bg-[#8b6fbf] shadow-[0_0_10px_rgba(139,111,191,0.4)]"
                  : "bg-[#a78bfa] shadow-[0_0_10px_rgba(167,139,250,0.4)]"
              }`}
              style={{ width: `${Math.max(progress, 1)}%` }}
            />
          </div>
        </div>
      </header>

      {tooltipNode}
    </>
  );
};

export default SurveyHeader;
