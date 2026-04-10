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
  <svg viewBox="0 0 12 13" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path
      d="M0.5 0.5H1.83333C2.18696 0.5 2.52609 0.640476 2.77614 0.890524C3.02619 1.14057 3.16667 1.47971 3.16667 1.83333V2.72933"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M5.16667 0.5H1.16667C0.798477 0.5 0.5 0.798477 0.5 1.16667V2.5C0.5 2.86819 0.798477 3.16667 1.16667 3.16667H5.16667C5.53486 3.16667 5.83333 2.86819 5.83333 2.5V1.16667C5.83333 0.798477 5.53486 0.5 5.16667 0.5Z"
      transform="translate(0.833 4.667)"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M3.16667 0.5H1.83333C1.47971 0.5 1.14057 0.640476 0.890524 0.890524C0.640476 1.14057 0.5 1.47971 0.5 1.83333V11.1667C0.5 11.5203 0.640476 11.8594 0.890524 12.1095C1.14057 12.3595 1.47971 12.5 1.83333 12.5H9.83333C10.0819 12.5001 10.3256 12.4306 10.5368 12.2995C10.7481 12.1684 10.9184 11.9808 11.0287 11.758"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M0.5 0.5H7.16667"
      transform="translate(2.167 7.833)"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M0.5 5.83333L3.16667 3.16667L0.5 0.5"
      transform="translate(8.167 4.667)"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const ReferIcon: FC = () => (
  <svg viewBox="0 0 11 7" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path
      d="M3.16667 5.83333C4.63943 5.83333 5.83333 4.63943 5.83333 3.16667C5.83333 1.69391 4.63943 0.5 3.16667 0.5C1.69391 0.5 0.5 1.69391 0.5 3.16667C0.5 4.63943 1.69391 5.83333 3.16667 5.83333Z"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M9.83333 4.5V3.16667C9.83333 2.45942 9.55238 1.78115 9.05228 1.28105C8.55219 0.780952 7.87391 0.5 7.16667 0.5H3.16667C2.45942 0.5 1.78115 0.780952 1.28105 1.28105C0.780952 1.78115 0.5 2.45942 0.5 3.16667V4.5"
      transform="translate(0.333 1)"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M4.5 0.5H0.5"
      transform="translate(5.833 3.167)"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M0.5 0.5V4.5"
      transform="translate(7.833 1.167)"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export default ReportNavigation;
