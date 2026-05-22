"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type FC } from "react";
import { trackSectionNavigated } from "@features/analytics/client";
import { ReferFriendIcon, ShareReportIcon } from "./ReportActionIcons";
import type { AccessTier, DisplayReportSection } from "./reportTitles";

interface Props {
  activeSectionId: string;
  onReferFriend?: () => void;
  onSectionClick?: (sectionId: string) => void;
  onShareClick?: () => void;
  sections: DisplayReportSection[];
}

const TOPBAR_SCROLL_THRESHOLD = 15;
const TOPBAR_HIDE_BREAKPOINT = 1280;

const ReportMobileNav: FC<Props> = ({
  activeSectionId,
  onReferFriend,
  onSectionClick,
  onShareClick,
  sections,
}) => {
  const browseButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [topbarHidden, setTopbarHidden] = useState(false);

  useEffect(() => {
    const lastScrollY = { current: window.scrollY };
    const lastDirection: { current: "up" | "down" | null } = { current: null };
    let ticking = false;

    const update = () => {
      const scrollY = window.scrollY || document.documentElement.scrollTop;
      const belowXl = window.innerWidth < TOPBAR_HIDE_BREAKPOINT;

      if (!belowXl) {
        setTopbarHidden(false);
        lastScrollY.current = scrollY;
        ticking = false;
        return;
      }

      if (scrollY <= 0) {
        setTopbarHidden(false);
        lastScrollY.current = scrollY;
        ticking = false;
        return;
      }

      const diff = scrollY - lastScrollY.current;
      if (Math.abs(diff) >= TOPBAR_SCROLL_THRESHOLD) {
        const direction = diff > 0 ? "down" : "up";
        if (direction !== lastDirection.current) {
          lastDirection.current = direction;
          setTopbarHidden(direction === "down");
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
      if (window.innerWidth >= TOPBAR_HIDE_BREAKPOINT) setTopbarHidden(false);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [drawerOpen]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [drawerOpen]);

  useEffect(() => {
    if (drawerOpen) {
      closeButtonRef.current?.focus();
    } else {
      browseButtonRef.current?.focus();
    }
  }, [drawerOpen]);

  return (
    <div className="xl:hidden">
      <header
        className={`report-mobile-topbar${topbarHidden ? " report-mobile-topbar--hidden" : ""}`}
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
        <button
          ref={browseButtonRef}
          type="button"
          className="report-mobile-topbar__menu-btn"
          aria-label="Open chapters menu"
          aria-expanded={drawerOpen}
          aria-controls="report-chapter-drawer"
          onClick={() => setDrawerOpen(true)}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </header>

      {drawerOpen && (
        <div className="report-chapter-drawer-root">
          <div
            className="report-chapter-backdrop"
            aria-hidden="true"
            onClick={() => setDrawerOpen(false)}
          />
          <div
            ref={drawerRef}
            id="report-chapter-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Report chapters"
            className="report-chapter-panel"
          >
            <div className="report-chapter-panel__header">
              <div className="report-chapter-panel__brand">
                <Image
                  alt=""
                  aria-hidden="true"
                  className="report-chapter-panel__logo"
                  height={32}
                  src="/images/loveiq-mark.svg"
                  width={36}
                />
                <span className="report-chapter-panel__brand-text" aria-label="LoveIQ Report">
                  <span aria-hidden="true" className="report-chapter-panel__love">
                    Love
                  </span>
                  <span aria-hidden="true" className="report-chapter-panel__iq">
                    IQ
                  </span>
                  <span aria-hidden="true">&nbsp;Report</span>
                </span>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                className="report-chapter-panel__close"
                aria-label="Close chapter list"
                onClick={() => setDrawerOpen(false)}
              >
                <svg
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  aria-hidden="true"
                >
                  <path d="M3 3l10 10M13 3L3 13" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div className="report-chapter-panel__actions">
              <button
                className="report-sidebar__btn"
                type="button"
                onClick={() => {
                  setDrawerOpen(false);
                  onShareClick?.();
                }}
                disabled={!onShareClick}
              >
                <ShareReportIcon />
                <span>Share Report</span>
              </button>
              {onReferFriend && (
                <button
                  className="report-sidebar__btn"
                  type="button"
                  onClick={() => {
                    setDrawerOpen(false);
                    onReferFriend();
                  }}
                >
                  <ReferFriendIcon />
                  <span>Refer a Friend</span>
                </button>
              )}
            </div>

            <p className="report-chapter-panel__label">Chapters</p>

            <nav aria-label="Report sections" className="report-chapter-panel__nav">
              {sections.map((section) => {
                const isActive = activeSectionId === section.id;
                const isSubheading = section.navType === "subheading";
                return (
                  <a
                    key={section.id}
                    href={`#${section.id}`}
                    aria-current={isActive ? "location" : undefined}
                    title={section.displayTitle}
                    className={[
                      "report-mobile-nav__link",
                      isActive && "is-active",
                      isSubheading && "is-subheading",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => {
                      trackSectionNavigated({
                        section_id: section.id,
                        source: "mobile_drawer",
                      });
                      onSectionClick?.(section.id);
                      setDrawerOpen(false);
                    }}
                  >
                    <span className="report-mobile-nav__label">{section.navTitle}</span>
                    <span className="report-mobile-nav__meta">
                      <NavBadge tier={section.accessTier} />
                    </span>
                  </a>
                );
              })}
            </nav>
          </div>
        </div>
      )}
    </div>
  );
};

const NavBadge: FC<{ tier: AccessTier }> = ({ tier }) => {
  const label =
    tier === "essentials" ? "Essentials" : tier === "full_report" ? "Full Report" : "Free";
  const modifier =
    tier === "free" ? "is-free" : tier === "essentials" ? "is-essentials" : "is-full";
  return <span className={`report-nav-chip ${modifier}`}>{label}</span>;
};

export default ReportMobileNav;
