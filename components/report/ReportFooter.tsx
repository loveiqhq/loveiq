import type { FC } from "react";
import Image from "next/image";

const ReportFooter: FC = () => (
  <footer className="report-footer">
    <div className="report-footer__brand">
      <Image
        src="/images/loveiq-mark.svg"
        alt=""
        width={32}
        height={28}
        unoptimized
        className="report-footer__mark"
      />
      <span className="report-footer__logo" aria-label="LoveIQ">
        <span aria-hidden="true" className="report-footer__logo-love">
          Love
        </span>
        <span aria-hidden="true" className="report-footer__logo-iq">
          IQ
        </span>
      </span>
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
