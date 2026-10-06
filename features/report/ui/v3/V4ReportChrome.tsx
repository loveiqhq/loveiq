import Image from "next/image";
import type { FC } from "react";

/**
 * The two overlays that float above the whole report scroll — Report V4.
 *
 * Figma: header 1:1279 (377x48 at 8,8) and the chapter pill 1:1272 (291x56, inside
 * a 393x56 band at y=80). Both sit outside the scrolling container (1:166), so they
 * float over it rather than taking part in the flow.
 *
 * The pill is STATIC, reading "Core Archetype" exactly as the frame draws it. An
 * earlier pass had it track the current chapter on scroll; that is not in the
 * design and has been removed.
 */

const V4ReportChrome: FC = () => (
  <div className="rv4-chrome" aria-hidden="true">
    {/* 1:1279 */}
    <div className="rv4-chrome__header" data-node-id="1:1279">
      <span className="rv4-chrome__lockup">
        <Image src="/images/loveiq-mark.svg" alt="" width={27} height={24} unoptimized priority />
        <span className="rv4-chrome__wordmark">
          Love<span className="rv4-chrome__iq">IQ</span> Report
        </span>
      </span>
    </div>

    {/* 1:1272 / 1:1275 */}
    <div className="rv4-chrome__pillband">
      <div className="rv4-chrome__pill" data-node-id="1:1272">
        <span className="rv4-chrome__pill-text">
          <span className="rv4-chrome__pill-label">Chapter:</span>{" "}
          <span className="rv4-chrome__pill-name">Core Archetype</span>
        </span>
        <span className="rv4-chrome__pill-chev" />
      </div>
    </div>
  </div>
);

export default V4ReportChrome;
