import type { FC } from "react";
import type { ReportTheme } from "./reportTheme";

interface Props {
  reportDate: string;
  theme: ReportTheme;
}

const ReportFooter: FC<Props> = ({ reportDate, theme }) => (
  <footer className="report-footer report-card">
    <div className="report-footer__brand">
      <div className="report-footer__mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M12 20s-7-4.35-7-10a4 4 0 0 1 7-2.4A4 4 0 0 1 19 10c0 5.65-7 10-7 10Z" />
        </svg>
      </div>
      <div>
        <p className="report-overline">LoveIQ</p>
        <h2 className="report-footer__title">{theme.archetype} report</h2>
      </div>
    </div>

    <div className="report-footer__meta">
      <p>
        Generated on <strong>{reportDate}</strong>. This report is educational and reflective, not
        diagnostic medical or psychological advice.
      </p>
      <nav className="report-footer__links" aria-label="Legal">
        <a href="/privacy-policy">Privacy Policy</a>
        <a href="/terms-of-use">Terms of Service</a>
      </nav>
    </div>
  </footer>
);

export default ReportFooter;
