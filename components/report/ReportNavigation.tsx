import type { FC } from "react";
import type { ReportSection } from "@/data/report-general";

interface Props {
  activeSectionId: string;
  primaryArchetype: string;
  reportDate: string;
  sections: ReportSection[];
}

const ReportNavigation: FC<Props> = ({
  activeSectionId,
  primaryArchetype,
  reportDate,
  sections,
}) => {
  return (
    <>
      <div className="report-mobile-overview xl:hidden">
        <div className="report-mobile-overview__header">
          <p className="report-overline">LoveIQ report</p>
          <h1 className="report-mobile-overview__title">{primaryArchetype}</h1>
          <p className="report-mobile-overview__meta">{reportDate}</p>
        </div>

        <nav aria-label="Report sections" className="report-mobile-nav">
          {sections.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              aria-current={activeSectionId === section.id ? "location" : undefined}
              className={`report-mobile-nav__link ${activeSectionId === section.id ? "is-active" : ""}`}
            >
              <span className="report-mobile-nav__copy">
                <span className="report-mobile-nav__number">
                  {String(section.sectionNumber).padStart(2, "0")}
                </span>
                <span className="report-mobile-nav__label">{section.title}</span>
              </span>
              <span className="report-mobile-nav__meta">
                <span className={`report-nav-chip ${section.isPremium ? "is-premium" : "is-free"}`}>
                  {section.isPremium ? "Full Report" : "Free"}
                </span>
                {section.isPremium ? <LockBadge /> : null}
              </span>
            </a>
          ))}
        </nav>
      </div>

      <aside className="report-sidebar hidden xl:block">
        <div className="report-sidebar__frame">
          <p className="report-overline">LoveIQ report</p>
          <nav aria-label="Report sections" className="report-sidebar__nav">
            <div className="report-sidebar__nav-list">
              {sections.map((section) => (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  aria-current={activeSectionId === section.id ? "location" : undefined}
                  className={`report-sidebar__link ${activeSectionId === section.id ? "is-active" : ""}`}
                >
                  <span className="report-sidebar__copy">
                    <span className="report-sidebar__number">
                      {String(section.sectionNumber).padStart(2, "0")}
                    </span>
                    <span className="report-sidebar__label">{section.title}</span>
                  </span>
                  <span className="report-sidebar__meta">
                    <span
                      className={`report-nav-chip ${section.isPremium ? "is-premium" : "is-free"}`}
                    >
                      {section.isPremium ? "Full Report" : "Free"}
                    </span>
                    {section.isPremium ? <LockBadge /> : null}
                  </span>
                </a>
              ))}
            </div>
          </nav>
        </div>
      </aside>
    </>
  );
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
