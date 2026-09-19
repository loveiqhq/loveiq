"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState, type FC } from "react";
import { trackSectionNavigated } from "@features/analytics/client";
import { lockBodyScroll, unlockBodyScroll } from "@shared/ui/body-scroll-lock";
import { ReferFriendIcon, ShareReportIcon } from "./ReportActionIcons";
import ReportNavBadge, { type ReportNavAccess } from "./ReportNavBadge";
import { REPORT_NAV_PARTS } from "./reportNav";

interface Props {
  activeSectionId: string;
  /** Same contract as the desktop sidebar — every item gets a badge. */
  accessById?: ReadonlyMap<string, ReportNavAccess>;
  onReferFriend?: () => void;
  onSectionClick?: (sectionId: string) => void;
  onShareClick?: () => void;
  /** Fired each time the chapter drawer opens (for analytics). */
  onDrawerOpened?: () => void;
}

// Flat id → label lookup for the floating "Chapter: …" pill, from the same
// curated nav the drawer renders (Figma 8719:9326).
const NAV_LABEL_BY_ID = new Map<string, string>(
  REPORT_NAV_PARTS.flatMap((part) => part.items.map((item) => [item.id, item.label] as const))
);

const PILL_SCROLL_THRESHOLD = 15;
const PILL_HIDE_BREAKPOINT = 1280;
const DRAWER_CLOSE_DURATION_MS = 220;

type DrawerPhase = "closed" | "open" | "closing";

const ChevronDownIcon: FC = () => (
  <svg viewBox="0 0 14 8" fill="none" aria-hidden="true">
    <path
      d="M1 1l6 6 6-6"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const ReportMobileNav: FC<Props> = ({
  activeSectionId,
  accessById,
  onReferFriend,
  onSectionClick,
  onShareClick,
  onDrawerOpened,
}) => {
  const pillButtonRef = useRef<HTMLButtonElement>(null);
  const panelPillButtonRef = useRef<HTMLButtonElement>(null);
  const wasDrawerOpenRef = useRef(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [phase, setPhase] = useState<DrawerPhase>("closed");
  const [pillHidden, setPillHidden] = useState(false);

  const drawerMounted = phase !== "closed";
  const drawerOpen = phase === "open";
  const drawerClosing = phase === "closing";

  const activeChapter = useMemo(
    () => NAV_LABEL_BY_ID.get(activeSectionId) ?? "Overview",
    [activeSectionId]
  );

  // Pill scroll-hide. Intentionally no `drawerOpen` dep — guards the same
  // race-condition class we hit on the landing NavSection where including a
  // click-driven state in a scroll listener could re-trigger and close itself.
  useEffect(() => {
    const lastScrollY = { current: window.scrollY };
    const lastDirection: { current: "up" | "down" | null } = { current: null };
    let ticking = false;

    const update = () => {
      const scrollY = window.scrollY || document.documentElement.scrollTop;
      const belowXl = window.innerWidth < PILL_HIDE_BREAKPOINT;

      if (!belowXl) {
        setPillHidden(false);
        lastScrollY.current = scrollY;
        ticking = false;
        return;
      }

      if (scrollY <= 0) {
        setPillHidden(false);
        lastScrollY.current = scrollY;
        ticking = false;
        return;
      }

      const diff = scrollY - lastScrollY.current;
      if (Math.abs(diff) >= PILL_SCROLL_THRESHOLD) {
        const direction = diff > 0 ? "down" : "up";
        if (direction !== lastDirection.current) {
          lastDirection.current = direction;
          setPillHidden(direction === "down");
        }
        lastScrollY.current = scrollY;
      }
      ticking = false;
    };

    const onScroll = () => {
      if (!ticking) {
        requestAnimationFrame(update);
        ticking = true;
      }
    };

    const onResize = () => {
      if (window.innerWidth >= PILL_HIDE_BREAKPOINT) setPillHidden(false);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  const openDrawer = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    // Reset scroll-hide so focus returning to the pill on close lands on
    // something the user can actually see.
    setPillHidden(false);
    setPhase("open");
    onDrawerOpened?.();
  }, [onDrawerOpened]);

  const closeDrawer = useCallback(() => {
    if (closeTimerRef.current) return; // already closing
    setPhase("closing");
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      setPhase("closed");
    }, DRAWER_CLOSE_DURATION_MS);
  }, []);

  // Body-scroll lock active for the full mount lifetime (open + closing) so
  // the page doesn't jump during the exit animation.
  useEffect(() => {
    if (!drawerMounted) return;
    lockBodyScroll();
    return unlockBodyScroll;
  }, [drawerMounted]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDrawer();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [drawerOpen, closeDrawer]);

  // Clear any pending close timer on unmount to avoid a setState-after-unmount.
  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    };
  }, []);

  // Focus moves to the in-panel pill on open, and back to the floating pill
  // ONLY on a true open→close transition. Skipping the initial mount avoids
  // stealing focus to the pill on every page load.
  useEffect(() => {
    if (drawerOpen) {
      wasDrawerOpenRef.current = true;
      panelPillButtonRef.current?.focus();
    } else if (phase === "closed" && wasDrawerOpenRef.current) {
      wasDrawerOpenRef.current = false;
      pillButtonRef.current?.focus();
    }
  }, [drawerOpen, phase]);

  return (
    <div className="xl:hidden">
      <header
        className={`report-mobile-topbar${pillHidden ? " report-mobile-topbar--hidden" : ""}`}
      >
        <div className="report-mobile-topbar__brand">
          <Image
            src="/images/loveiq-mark.svg"
            alt=""
            aria-hidden="true"
            className="report-mobile-topbar__logo"
            height={24}
            width={27}
            unoptimized
          />
          <span className="report-mobile-topbar__wordmark" aria-label="LoveIQ Report">
            <span aria-hidden="true" className="report-mobile-topbar__love">
              Love
            </span>
            <span aria-hidden="true" className="report-mobile-topbar__iq">
              IQ
            </span>
            <span aria-hidden="true">&nbsp;Report</span>
          </span>
        </div>
      </header>

      <div
        className={[
          "report-chapter-pill",
          pillHidden && "report-chapter-pill--hidden",
          // Only hide while phase === 'open' so the floating pill fades back
          // IN during the closing animation — its return crossfades with the
          // panel pill fading OUT, avoiding any blank-frame between them.
          drawerOpen && "report-chapter-pill--drawer-open",
        ]
          .filter(Boolean)
          .join(" ")}
        // `inert` covers both phases — focus / clicks stay redirected to the
        // panel pill until the panel fully unmounts.
        inert={drawerMounted}
      >
        <button
          ref={pillButtonRef}
          type="button"
          className="report-chapter-pill__btn"
          aria-haspopup="dialog"
          aria-expanded={drawerOpen}
          aria-controls="report-chapter-drawer"
          onClick={openDrawer}
        >
          <span className="report-chapter-pill__label">
            Chapter:<span className="report-chapter-pill__chapter">{activeChapter}</span>
          </span>
          <span className="report-chapter-pill__chevron">
            <ChevronDownIcon />
          </span>
        </button>
      </div>

      {drawerMounted && (
        <div className="report-chapter-drawer-root">
          <div
            className={`report-chapter-backdrop is-open${drawerClosing ? " is-closing" : ""}`}
            aria-hidden="true"
            onClick={closeDrawer}
          />
          <div
            id="report-chapter-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Report chapters"
            className={`report-chapter-panel${drawerClosing ? " report-chapter-panel--closing" : ""}`}
          >
            <div className="report-chapter-panel__pill">
              <button
                ref={panelPillButtonRef}
                type="button"
                className="report-chapter-pill__btn"
                aria-label="Close chapter menu"
                onClick={closeDrawer}
              >
                <span className="report-chapter-pill__label">
                  Chapter:<span className="report-chapter-pill__chapter">{activeChapter}</span>
                </span>
                <span className="report-chapter-pill__chevron report-chapter-pill__chevron--up">
                  <ChevronDownIcon />
                </span>
              </button>
            </div>

            <div className="report-chapter-panel__actions">
              {onShareClick && (
                <button
                  className="report-sidebar__btn"
                  type="button"
                  onClick={() => {
                    closeDrawer();
                    onShareClick();
                  }}
                >
                  <ShareReportIcon />
                  <span>Share report</span>
                </button>
              )}
              {onReferFriend && (
                <button
                  className="report-sidebar__btn"
                  type="button"
                  onClick={() => {
                    closeDrawer();
                    onReferFriend();
                  }}
                >
                  <ReferFriendIcon />
                  <span>Refer a friend</span>
                </button>
              )}
            </div>

            <nav
              aria-label="Report sections"
              className="report-chapter-panel__nav"
              data-lenis-prevent
            >
              {REPORT_NAV_PARTS.map((part) => (
                <div key={part.part} className="report-chapter-panel__part-group">
                  <p className="report-chapter-panel__part">
                    {part.part} · {part.label}
                  </p>
                  {part.items.map((item, idx) => {
                    const isActive = activeSectionId === item.id;
                    // Cap stagger so the last items don't lag on a long list.
                    const delayIdx = Math.min(idx, 8);
                    return (
                      <a
                        key={item.id}
                        href={`#${item.id}`}
                        aria-current={isActive ? "location" : undefined}
                        title={item.label}
                        className={[
                          "report-mobile-nav__link",
                          "report-chapter-panel__item",
                          isActive && "is-active",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        style={{ animationDelay: `${delayIdx * 24}ms` }}
                        onClick={() => {
                          trackSectionNavigated({
                            section_id: item.id,
                            source: "mobile_drawer",
                          });
                          onSectionClick?.(item.id);
                          closeDrawer();
                        }}
                      >
                        <span className="report-mobile-nav__label">{item.label}</span>
                        <ReportNavBadge access={accessById?.get(item.id) ?? "free"} />
                      </a>
                    );
                  })}
                </div>
              ))}
            </nav>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportMobileNav;
