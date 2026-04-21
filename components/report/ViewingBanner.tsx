"use client";

import type { FC } from "react";

interface Props {
  archetypeName: string;
  returnHref: string;
}

const ViewingBanner: FC<Props> = ({ archetypeName, returnHref }) => {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        alignItems: "center",
        background: "rgba(255, 255, 255, 0.06)",
        borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
        color: "var(--report-fg, #f7f4fb)",
        display: "flex",
        fontSize: "0.875rem",
        gap: "0.75rem",
        justifyContent: "center",
        padding: "0.5rem 1rem",
        position: "sticky",
        top: 0,
        zIndex: 30,
      }}
    >
      <span>
        Viewing:{" "}
        <strong style={{ color: "var(--prob-accent, currentColor)" }}>{archetypeName}</strong>
      </span>
      <a
        href={returnHref}
        style={{
          color: "currentColor",
          textDecoration: "underline",
          textUnderlineOffset: "3px",
        }}
      >
        Return to my primary report
      </a>
    </div>
  );
};

export default ViewingBanner;
