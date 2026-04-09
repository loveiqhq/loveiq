import type { FC } from "react";

const ReportFooter: FC = () => (
  <footer className="report-footer">
    <div className="report-footer__brand">
      <svg
        className="report-footer__heart"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        aria-hidden="true"
      >
        <path d="M12 20s-7-4.35-7-10a4 4 0 0 1 7-2.4A4 4 0 0 1 19 10c0 5.65-7 10-7 10Z" />
      </svg>
      <span className="report-footer__logo">LoveIQ</span>
    </div>

    <p className="report-footer__disclaimer">
      &copy; 2026 LoveIQ Inc. All rights reserved. The content provided in this report is for
      educational purposes only and is not a substitute for professional psychological or medical
      advice. Your data is encrypted and stored anonymously.
    </p>

    <nav className="report-footer__links" aria-label="Legal">
      <a href="/privacy-policy">Privacy Policy</a>
      <a href="/terms-of-use">Terms of Service</a>
      <a href="mailto:support@loveiq.org">Support</a>
    </nav>
  </footer>
);

export default ReportFooter;
