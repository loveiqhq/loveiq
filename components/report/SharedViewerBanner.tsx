"use client";

import { useEffect, useState, type FC } from "react";

interface Props {
  ownerFirstName: string | null;
}

const DISMISS_KEY = "report:shared-banner-dismissed";

const SharedViewerBanner: FC<Props> = ({ ownerFirstName }) => {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === "1") {
        // Hydrate dismiss state from sessionStorage (SSR-safe mount-once).
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setDismissed(true);
      }
    } catch {
      // sessionStorage may be unavailable (Safari private mode)
    }
  }, []);

  const name = ownerFirstName?.trim() || "someone";

  if (dismissed) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="report-shared-banner report-shared-banner--chip"
      >
        Shared view
      </div>
    );
  }

  return (
    <div role="status" aria-live="polite" className="report-shared-banner">
      <div className="report-shared-banner__inner">
        <span className="report-shared-banner__copy">
          <strong>Shared by {name}.</strong> You&rsquo;re viewing a private copy of their LoveIQ
          report.
        </span>
        <button
          type="button"
          className="report-shared-banner__dismiss"
          aria-label="Dismiss shared view banner"
          onClick={() => {
            setDismissed(true);
            try {
              sessionStorage.setItem(DISMISS_KEY, "1");
            } catch {
              // ignore
            }
          }}
        >
          <svg
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            aria-hidden="true"
          >
            <path d="m5 5 10 10M15 5 5 15" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default SharedViewerBanner;
