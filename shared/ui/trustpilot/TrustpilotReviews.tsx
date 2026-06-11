"use client";

import { useEffect, useRef, useState, type FC } from "react";
import { hasCookieYesConsent } from "@features/analytics/client";
import {
  getTrustpilotConfig,
  isTrustpilotLiveConfigured,
  TRUSTPILOT_FALLBACK_URL,
  type TrustpilotConfig,
} from "./config";

declare global {
  interface Window {
    /** Injected by Trustpilot's bootstrap (loads only after `functional` consent). */
    Trustpilot?: {
      loadFromElement?: (el: HTMLElement | null, forceReload?: boolean) => void;
    };
  }
}

const TP_GREEN = "#00b67a";

type Variant = "carousel" | "compact";
type Theme = "light" | "dark";

/* ------------------------------------------------------------------ */
/*  Cookieless brand marks (rendered by us — set no cookies)           */
/* ------------------------------------------------------------------ */
const STAR_PATH =
  "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z";

const TrustpilotLogo: FC<{ theme: Theme }> = ({ theme }) => (
  <span className="inline-flex items-center gap-1.5">
    <svg viewBox="0 0 24 24" width="18" height="18" fill={TP_GREEN} aria-hidden="true">
      <path d={STAR_PATH} />
    </svg>
    <span
      className={`font-sans text-[15px] font-semibold tracking-tight ${theme === "light" ? "text-gray-900" : "text-white"}`}
    >
      Trustpilot
    </span>
  </span>
);

const StarTile: FC<{ size: number }> = ({ size }) => (
  <span
    className="inline-flex items-center justify-center rounded-[2px]"
    style={{ background: TP_GREEN, width: size, height: size }}
  >
    <svg
      viewBox="0 0 24 24"
      width={size * 0.66}
      height={size * 0.66}
      fill="#fff"
      aria-hidden="true"
    >
      <path d={STAR_PATH} />
    </svg>
  </span>
);

const TrustpilotStars: FC<{ size?: number }> = ({ size = 28 }) => (
  <div className="flex items-center gap-1" role="img" aria-label="Rated 5 out of 5 stars">
    {Array.from({ length: 5 }).map((_, i) => (
      <StarTile key={i} size={size} />
    ))}
  </div>
);

/* ------------------------------------------------------------------ */
/*  Static, cookieless block — ALWAYS shown until the live widget paints */
/* ------------------------------------------------------------------ */
const StaticBlock: FC<{
  variant: Variant;
  config: TrustpilotConfig;
  showProfileLink: boolean;
  theme: Theme;
}> = ({ variant, config, showProfileLink, theme }) => {
  const showScore = config.score !== null && config.reviewCount !== null;
  const href = config.profileUrl ?? TRUSTPILOT_FALLBACK_URL;
  const starSize = variant === "carousel" ? 30 : 24;
  const isLight = theme === "light";

  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <TrustpilotLogo theme={theme} />
      <TrustpilotStars size={starSize} />
      <p className={`font-sans ${isLight ? "text-gray-900" : "text-white"}`}>
        <span className="font-bold">Excellent</span>
        {showScore && (
          <span className={`font-normal ${isLight ? "text-gray-500" : "text-white/70"}`}>
            {" "}
            · TrustScore {config.score} · {config.reviewCount} reviews
          </span>
        )}
      </p>
      {showProfileLink && (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="focus-visible-ring rounded text-sm font-medium text-[#34c79a] underline-offset-4 transition hover:underline"
        >
          See our reviews on Trustpilot
        </a>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  TrustpilotReviews                                                  */
/* ------------------------------------------------------------------ */
/**
 * Renders Trustpilot social proof with consent-aware progressive enhancement:
 *
 *  - A cookieless static block (logo + stars + link) ALWAYS renders, so the spot
 *    is never empty and no cookies are set without consent.
 *  - When a Business Unit ID is configured AND the visitor has granted the
 *    CookieYes `functional` category, Trustpilot's bootstrap (loaded via a
 *    `data-cookieyes="cookieyes-functional"` script in app/layout.tsx) becomes
 *    available, and the live interactive TrustBox replaces the static block as
 *    soon as its iframe actually paints.
 */
const TrustpilotReviews: FC<{
  variant: Variant;
  className?: string;
  /** Show the "See our reviews on Trustpilot" link in the static block (default true). */
  showProfileLink?: boolean;
  /** Colour theme for the static block + live widget (default "dark"). The white
   *  landing passes "light". */
  theme?: Theme;
}> = ({ variant, className, showProfileLink = true, theme = "dark" }) => {
  const config = getTrustpilotConfig();
  const liveConfigured = isTrustpilotLiveConfigured(config);
  const widgetRef = useRef<HTMLDivElement>(null);
  const [liveReady, setLiveReady] = useState(false);

  useEffect(() => {
    if (!liveConfigured) return;
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;
    let observer: MutationObserver | null = null;

    const stop = () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
      observer?.disconnect();
      observer = null;
    };

    // Ask Trustpilot to (re)hydrate our element. Guarded on consent + bootstrap
    // presence — window.Trustpilot only exists once CookieYes runs the gated
    // bootstrap, i.e. after `functional` consent.
    const tryInit = () => {
      if (cancelled) return;
      if (!hasCookieYesConsent("functional")) return;
      const el = widgetRef.current;
      if (!el || !window.Trustpilot?.loadFromElement) return;
      window.Trustpilot.loadFromElement(el, true);
    };

    // Flip to "live" ONLY once Trustpilot has injected its iframe, so the static
    // block never disappears into an empty gap.
    if (widgetRef.current) {
      observer = new MutationObserver(() => {
        if (widgetRef.current?.querySelector("iframe")) {
          if (!cancelled) setLiveReady(true);
          stop();
        }
      });
      observer.observe(widgetRef.current, { childList: true, subtree: true });
    }

    tryInit();
    // Poll covers: consent granted after mount (CookieYes runs the gated
    // bootstrap, window.Trustpilot appears) and the bootstrap arriving late.
    interval = setInterval(tryInit, 1000);

    return () => {
      cancelled = true;
      stop();
    };
  }, [liveConfigured]);

  return (
    <div className={`relative ${className ?? ""}`}>
      {!liveReady && (
        <StaticBlock
          variant={variant}
          config={config}
          showProfileLink={showProfileLink}
          theme={theme}
        />
      )}

      {liveConfigured && (
        <div
          ref={widgetRef}
          className="trustpilot-widget"
          data-locale={config.locale}
          data-template-id={variant === "carousel" ? config.templateCarousel : config.templateMicro}
          data-businessunit-id={config.businessUnitId ?? undefined}
          data-style-height={variant === "carousel" ? "240px" : "120px"}
          data-style-width="100%"
          data-theme={theme}
          aria-hidden={liveReady ? undefined : true}
          style={
            liveReady
              ? undefined
              : {
                  // Loaded but invisible so its iframe still paints (display:none
                  // can suppress iframe loading); the static block sits on top.
                  position: "absolute",
                  inset: 0,
                  opacity: 0,
                  pointerEvents: "none",
                }
          }
        >
          {/* Standard Trustpilot fallback link — replaced by the iframe on load. */}
          <a
            href={config.profileUrl ?? TRUSTPILOT_FALLBACK_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            Trustpilot
          </a>
        </div>
      )}
    </div>
  );
};

export default TrustpilotReviews;
