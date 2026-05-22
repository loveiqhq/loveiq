"use client";

import Image from "next/image";
import { useEffect, useRef, type FC } from "react";
import { ReferFriendIcon, ShareReportIcon } from "./ReportActionIcons";
import type { AccessTier, DisplayReportSection } from "./reportTitles";

interface Props {
  activeSectionId: string;
  onReferFriend?: () => void;
  onSectionClick?: (sectionId: string) => void;
  onShareClick?: () => void;
  sections: DisplayReportSection[];
}

const ReportDesktopSidebar: FC<Props> = ({
  activeSectionId,
  onReferFriend,
  onSectionClick,
  onShareClick,
  sections,
}) => {
  const navRef = useRef<HTMLElement>(null);

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
  // page scroll position is untouched.
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

  return (
    <aside className="report-sidebar hidden xl:block">
      <div className="report-sidebar__inner">
        <div className="report-sidebar__brand">
          <Image
            alt=""
            className="report-sidebar__logo"
            height={40}
            priority
            src="/images/loveiq-mark.svg"
            width={45}
          />
          <span className="report-sidebar__brand-text" aria-label="LoveIQ Report">
            <span aria-hidden="true" className="report-sidebar__love">
              Love
            </span>
            <span aria-hidden="true" className="report-sidebar__iq">
              IQ
            </span>
            <span aria-hidden="true">&nbsp;Report</span>
          </span>
        </div>

        <div className="report-sidebar__actions">
          <button
            className="report-sidebar__btn"
            type="button"
            onClick={() => onShareClick?.()}
            disabled={!onShareClick}
          >
            <ShareReportIcon />
            <span>Share Report</span>
          </button>
          {onReferFriend && (
            <button className="report-sidebar__btn" type="button" onClick={() => onReferFriend()}>
              <ReferFriendIcon />
              <span>Refer a Friend</span>
            </button>
          )}
        </div>

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
  );
};

const NavBadge: FC<{ tier: AccessTier }> = ({ tier }) => {
  const label =
    tier === "essentials" ? "Essentials" : tier === "full_report" ? "Full Report" : "Free";
  const modifier =
    tier === "free" ? "is-free" : tier === "essentials" ? "is-essentials" : "is-full";
  return <span className={`report-nav-chip ${modifier}`}>{label}</span>;
};

export default ReportDesktopSidebar;
