"use client";

import Image from "next/image";
import { useEffect, useRef, type FC } from "react";
import { trackSectionNavigated } from "@features/analytics/client";
import { ReferFriendIcon, ShareReportIcon } from "./ReportActionIcons";
import ReportNavBadge, { type ReportNavAccess } from "./ReportNavBadge";
import { REPORT_NAV_PARTS } from "./reportNav";

interface Props {
  activeSectionId: string;
  /**
   * Per-chapter access state, keyed by nav item id. Every item carries a badge:
   * `free`, `locked`, or `unlocked` once the reader's plan opens it.
   */
  accessById?: ReadonlyMap<string, ReportNavAccess>;
  onReferFriend?: () => void;
  onSectionClick?: (sectionId: string) => void;
  onShareClick?: () => void;
}

const ReportDesktopSidebar: FC<Props> = ({
  activeSectionId,
  accessById,
  onReferFriend,
  onSectionClick,
  onShareClick,
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

        <nav ref={navRef} aria-label="Report sections" className="report-sidebar__nav">
          {REPORT_NAV_PARTS.map((part) => (
            <div key={part.part} className="report-sidebar__part-group">
              <p className="report-sidebar__part">
                {part.part} · {part.label}
              </p>
              <div className="report-sidebar__nav-list">
                {part.items.map((item) => {
                  const isActive = activeSectionId === item.id;

                  return (
                    <a
                      key={item.id}
                      href={`#${item.id}`}
                      aria-current={isActive ? "location" : undefined}
                      title={item.label}
                      onClick={() => {
                        trackSectionNavigated({
                          section_id: item.id,
                          source: "desktop_sidebar",
                        });
                        onSectionClick?.(item.id);
                      }}
                      className={["report-sidebar__item", isActive && "is-active"]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <span className="report-sidebar__item-label">
                        <span>{item.label}</span>
                      </span>
                      <ReportNavBadge access={accessById?.get(item.id) ?? "free"} />
                    </a>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </div>
    </aside>
  );
};

export default ReportDesktopSidebar;
