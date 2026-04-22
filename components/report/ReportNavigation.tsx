"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type FC } from "react";
import { ShareReportIcon } from "./ReportActionIcons";
import type { AccessTier, DisplayReportSection } from "./reportTitles";

interface Props {
  activeSectionId: string;
  onSectionClick?: (sectionId: string) => void;
  sections: DisplayReportSection[];
}

const ReportNavigation: FC<Props> = ({ activeSectionId, onSectionClick, sections }) => {
  const navRef = useRef<HTMLElement>(null);
  const browseButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);

  // Capture wheel events on the desktop nav so the page doesn't scroll instead
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;

    const onWheel = (e: WheelEvent) => {
      const { scrollTop, scrollHeight, clientHeight } = nav;
      const atTop = scrollTop <= 0 && e.deltaY < 0;
      const atBottom = scrollTop + clientHeight >= scrollHeight - 1 && e.deltaY > 0;
      if (!atTop && !atBottom) {
        e.preventDefault();
        e.stopPropagation();
        nav.scrollTop += e.deltaY;
      }
    };

    nav.addEventListener("wheel", onWheel, { passive: false });
    return () => nav.removeEventListener("wheel", onWheel);
  }, []);

  // Keep the active chapter link in view inside the sidebar as the page
  // scrolls. We adjust only nav.scrollTop — never the window — so the main
  // page scroll position is untouched. No-op when the link is already in
  // the sidebar's visible range.
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const activeLink = nav.querySelector<HTMLElement>(`a[href="#${activeSectionId}"]`);
    if (!activeLink) return;

    const navRect = nav.getBoundingClientRect();
    const linkRect = activeLink.getBoundingClientRect();
    const margin = 24;
    let delta = 0;
    if (linkRect.top < navRect.top + margin) {
      delta = linkRect.top - navRect.top - margin;
    } else if (linkRect.bottom > navRect.bottom - margin) {
      delta = linkRect.bottom - navRect.bottom + margin;
    }
    if (delta !== 0) {
      if (typeof nav.scrollBy === "function") {
        nav.scrollBy({ top: delta, behavior: "smooth" });
      } else {
        nav.scrollTop += delta;
      }
    }
  }, [activeSectionId]);

  // Lock body scroll while the drawer is open
  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [drawerOpen]);

  // Close drawer on Escape
  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [drawerOpen]);

  // Return focus to the trigger that opened the drawer
  useEffect(() => {
    if (drawerOpen) {
      closeButtonRef.current?.focus();
    } else {
      browseButtonRef.current?.focus();
    }
  }, [drawerOpen]);

  return (
    <>
      {/* ── Mobile nav (below xl) ── */}
      <div className="xl:hidden">
        {/* Fixed top bar — logo + wordmark + menu */}
        <header className="report-mobile-topbar">
          <div className="report-mobile-topbar__brand">
            <Image
              src="/favicon.svg"
              alt=""
              aria-hidden="true"
              className="report-mobile-topbar__logo"
              height={32}
              width={32}
              unoptimized
            />
            <span className="report-mobile-topbar__wordmark">LoveIQ</span>
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

        {/* Chapter drawer */}
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
                    height={40}
                    src="/images/LoveiqLogo.svg"
                    width={40}
                  />
                  <span className="report-chapter-panel__brand-text">LoveIQ Report</span>
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
                <button className="report-sidebar__btn" type="button">
                  <ShareReportIcon />
                  <span>Share Report</span>
                </button>
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

      {/* ── Desktop sidebar (xl+) ── */}
      <aside className="report-sidebar hidden xl:block">
        <div className="report-sidebar__inner">
          {/* Logo */}
          <div className="report-sidebar__brand">
            <Image
              alt="LoveIQ"
              className="report-sidebar__logo"
              height={40}
              priority
              src="/images/LoveiqLogo.svg"
              width={40}
            />
            <span className="report-sidebar__brand-text">LoveIQ Report</span>
          </div>

          {/* Action buttons */}
          <div className="report-sidebar__actions">
            <button className="report-sidebar__btn" type="button">
              <ShareReportIcon />
              <span>Share Report</span>
            </button>
          </div>

          {/* Chapters nav */}
          <div className="report-sidebar__chapters">
            <p className="report-sidebar__chapters-label">Chapters</p>

            <nav ref={navRef} aria-label="Report sections" className="report-sidebar__nav">
              <div className="report-sidebar__nav-list">
                {sections.map((section) => {
                  const isActive = activeSectionId === section.id;
                  const isSubheading = section.navType === "subheading";

                  return (
                    <a
                      key={section.id}
                      href={`#${section.id}`}
                      aria-current={isActive ? "location" : undefined}
                      title={section.displayTitle}
                      onClick={() => onSectionClick?.(section.id)}
                      className={[
                        "report-sidebar__item",
                        isActive && "is-active",
                        isSubheading && "is-subheading",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <span className="report-sidebar__item-label">
                        <span>{section.navTitle}</span>
                      </span>
                      <span className="report-sidebar__item-meta">
                        <NavBadge tier={section.accessTier} />
                      </span>
                    </a>
                  );
                })}
              </div>
            </nav>
          </div>
        </div>
      </aside>
    </>
  );
};

/* ── Shared sub-components ── */

const NavBadge: FC<{ tier: AccessTier }> = ({ tier }) => {
  const label =
    tier === "essentials" ? "Essentials" : tier === "full_report" ? "Full Report" : "Free";
  const modifier =
    tier === "free" ? "is-free" : tier === "essentials" ? "is-essentials" : "is-full";
  return <span className={`report-nav-chip ${modifier}`}>{label}</span>;
};

const LockBadge: FC = () => (
  <span className="report-nav-lock" aria-hidden="true">
    <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.15">
      <rect x="2.1" y="5.2" width="7.8" height="4.7" rx="1.2" />
      <path d="M3.6 5.2V3.9a2.4 2.4 0 1 1 4.8 0v1.3" />
    </svg>
  </span>
);

export default ReportNavigation;
