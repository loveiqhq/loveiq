"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState, type FC } from "react";
import type { AccessTier, DisplayReportSection } from "./reportTitles";

interface Props {
  activeSectionId: string;
  onSectionClick?: (sectionId: string) => void;
  primaryArchetype: string;
  reportDate: string;
  sections: DisplayReportSection[];
}

const ReportNavigation: FC<Props> = ({
  activeSectionId,
  onSectionClick,
  primaryArchetype,
  reportDate,
  sections,
}) => {
  const navRef = useRef<HTMLElement>(null);
  const introRef = useRef<HTMLDivElement>(null);
  const browseButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [stickyVisible, setStickyVisible] = useState(false);

  // Derived section progress values
  const linkSections = useMemo(() => sections.filter((s) => s.navType === "link"), [sections]);
  const activeSection = sections.find((s) => s.id === activeSectionId);
  const activeProgress = activeSection?.sectionNumber ?? 1;
  const totalLinks = linkSections.length;
  const progressLabel = `${String(activeProgress).padStart(2, "0")} / ${String(totalLinks).padStart(2, "0")}`;

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

  // Show sticky bar once the intro block leaves the viewport
  useEffect(() => {
    const intro = introRef.current;
    if (!intro || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      ([entry]) => setStickyVisible(!entry.isIntersecting),
      { threshold: 0 }
    );

    observer.observe(intro);
    return () => observer.disconnect();
  }, []);

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
        {/* LAYER 1 — Compact intro block */}
        <div ref={introRef} className="report-mobile-intro">
          <div className="report-mobile-intro__meta">
            <p className="report-overline">LoveIQ report</p>
            {totalLinks > 0 && (
              <span
                className="report-mobile-intro__progress"
                aria-label={`Section ${activeProgress} of ${totalLinks}`}
              >
                {progressLabel}
              </span>
            )}
          </div>
          <h1 className="report-mobile-intro__title">{primaryArchetype}</h1>
          <p className="report-mobile-intro__date">{reportDate}</p>
          <button
            ref={browseButtonRef}
            type="button"
            className="report-mobile-intro__browse-btn"
            aria-expanded={drawerOpen}
            aria-controls="report-chapter-drawer"
            onClick={() => setDrawerOpen(true)}
          >
            Browse chapters
          </button>
        </div>

        {/* LAYER 2 — Slim sticky bar (appears once intro scrolls away) */}
        <div
          className={`report-mobile-sticky${stickyVisible ? " is-visible" : ""}`}
          aria-hidden={!stickyVisible}
        >
          <div className="report-mobile-sticky__section">
            <span className="report-mobile-sticky__number">
              {String(activeProgress).padStart(2, "0")}
            </span>
            <span className="report-mobile-sticky__label">{activeSection?.navTitle ?? ""}</span>
          </div>
          <button
            type="button"
            className="report-mobile-sticky__chapters-btn"
            tabIndex={stickyVisible ? 0 : -1}
            aria-expanded={drawerOpen}
            aria-controls="report-chapter-drawer"
            onClick={() => setDrawerOpen(true)}
          >
            ≡ Chapters
          </button>
        </div>

        {/* LAYER 3 — Chapter drawer */}
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
                <span className="report-chapter-panel__heading">Chapters</span>
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
              <nav aria-label="Report sections" className="report-chapter-panel__nav">
                {sections.map((section) => (
                  <a
                    key={section.id}
                    href={`#${section.id}`}
                    aria-current={activeSectionId === section.id ? "location" : undefined}
                    title={section.displayTitle}
                    className={[
                      "report-mobile-nav__link",
                      activeSectionId === section.id && "is-active",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => {
                      onSectionClick?.(section.id);
                      setDrawerOpen(false);
                    }}
                  >
                    <span className="report-mobile-nav__copy">
                      <span className="report-mobile-nav__number">
                        {String(section.sectionNumber).padStart(2, "0")}
                      </span>
                      <span className="report-mobile-nav__label">{section.navTitle}</span>
                    </span>
                    <span className="report-mobile-nav__meta">
                      <NavBadge tier={section.accessTier} />
                    </span>
                  </a>
                ))}
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
              <ShareIcon />
              <span>Share Report</span>
            </button>
            <button className="report-sidebar__btn" type="button">
              <ReferIcon />
              <span>Refer a Friend</span>
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

const ShareIcon: FC = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
    <path d="M8 10.4V3.1" strokeLinecap="round" />
    <path d="m5.3 5.8 2.7-2.7 2.7 2.7" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M3.2 10.1v1.3c0 .8.6 1.4 1.4 1.4h6.8c.8 0 1.4-.6 1.4-1.4v-1.3" strokeLinecap="round" />
  </svg>
);

const ReferIcon: FC = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.35">
    <path
      d="M8 12.3c-.2 0-.4-.1-.6-.2C4.3 9.9 2.4 8 2.4 5.8c0-1.6 1.2-2.8 2.7-2.8 1 0 1.8.5 2.3 1.2C8 3.5 8.8 3 9.8 3c1.5 0 2.7 1.2 2.7 2.8 0 2.2-1.9 4.1-5 6.3-.1.1-.3.2-.5.2Z"
      strokeLinejoin="round"
    />
    <path d="M13 3.5v3.5" strokeLinecap="round" />
    <path d="M11.2 5.3h3.6" strokeLinecap="round" />
  </svg>
);

export default ReportNavigation;
