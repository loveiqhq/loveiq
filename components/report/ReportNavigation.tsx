import type { FC } from "react";
import type { ReportSection } from "@/data/report-general";
import type { ReportTheme } from "./reportTheme";

interface Props {
  activeSectionId: string;
  matchScore: number;
  primaryArchetype: string;
  reportDate: string;
  sections: ReportSection[];
  theme: ReportTheme;
}

const ReportNavigation: FC<Props> = ({
  activeSectionId,
  matchScore,
  primaryArchetype,
  reportDate,
  sections,
  theme,
}) => {
  const { Icon } = theme;

  return (
    <>
      <div className="report-mobile-overview xl:hidden">
        <div className="report-mobile-card report-card">
          <div className="report-mobile-card__icon" aria-hidden="true">
            <Icon className="report-archetype-icon" />
          </div>
          <div className="min-w-0">
            <p className="report-overline">Your report theme</p>
            <h1 className="report-mobile-card__title">{primaryArchetype}</h1>
            <p className="report-mobile-card__meta">{reportDate}</p>
          </div>
          <div className="report-mobile-card__score">
            <span className="report-mobile-card__score-value">{Math.round(matchScore)}%</span>
            <span className="report-mobile-card__score-label">match</span>
          </div>
        </div>

        <nav aria-label="Report sections" className="report-mobile-nav">
          {sections.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              aria-current={activeSectionId === section.id ? "location" : undefined}
              className={`report-mobile-nav__link ${
                activeSectionId === section.id ? "is-active" : ""
              }`}
            >
              <span className="report-mobile-nav__number">
                {String(section.sectionNumber).padStart(2, "0")}
              </span>
              <span className="report-mobile-nav__label">{section.title}</span>
            </a>
          ))}
        </nav>
      </div>

      <aside className="report-sidebar hidden xl:flex">
        <div className="report-sidebar__frame">
          <div className="report-sidebar__summary report-card">
            <div className="report-sidebar__brand">
              <div className="report-sidebar__icon" aria-hidden="true">
                <Icon className="report-archetype-icon" />
              </div>
              <div>
                <p className="report-overline">LoveIQ report</p>
                <h2 className="report-sidebar__title">{primaryArchetype}</h2>
              </div>
            </div>

            <div className="report-sidebar__stats">
              <div>
                <p className="report-stat__label">Dominant match</p>
                <p className="report-stat__value">{Math.round(matchScore)}%</p>
              </div>
              <div>
                <p className="report-stat__label">Generated</p>
                <p className="report-stat__value report-stat__value--small">{reportDate}</p>
              </div>
            </div>
          </div>

          <nav aria-label="Report sections" className="report-sidebar__nav report-card">
            <div className="report-sidebar__nav-header">
              <p className="report-overline">Chapters</p>
              <p className="report-sidebar__nav-copy">{sections.length} sections</p>
            </div>

            <div className="report-sidebar__nav-list">
              {sections.map((section) => (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  aria-current={activeSectionId === section.id ? "location" : undefined}
                  className={`report-sidebar__link ${
                    activeSectionId === section.id ? "is-active" : ""
                  }`}
                >
                  <div className="report-sidebar__link-copy">
                    <span className="report-sidebar__number">
                      {String(section.sectionNumber).padStart(2, "0")}
                    </span>
                    <span className="report-sidebar__label">{section.title}</span>
                  </div>
                  <span
                    className={`report-sidebar__badge ${
                      section.isPremium ? "is-premium" : "is-free"
                    }`}
                  >
                    {section.isPremium ? "Full Report" : "Free"}
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

export default ReportNavigation;
