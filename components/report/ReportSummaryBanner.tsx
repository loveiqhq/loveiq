"use client";

import { type FC } from "react";

interface Props {
  onSummaryClick?: () => void;
}

const ReportSummaryBanner: FC<Props> = ({ onSummaryClick }) => (
  <div className="report-summary-banner">
    <a href="#summary" className="report-summary-banner__btn" onClick={onSummaryClick}>
      <svg
        width="20"
        height="20"
        viewBox="0 0 20 20"
        fill="none"
        aria-hidden="true"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M11.667 2.5H5.833A1.667 1.667 0 0 0 4.167 4.167v11.666A1.667 1.667 0 0 0 5.833 17.5h8.334a1.667 1.667 0 0 0 1.666-1.667V7.5l-4.166-5Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M11.667 2.5v5h5M13.333 10.833H6.667M13.333 13.333H6.667M8.333 8.333H6.667"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span>Want it shorter?&nbsp;&nbsp;Read Report summary</span>
    </a>
  </div>
);

export default ReportSummaryBanner;
