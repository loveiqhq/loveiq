"use client";

import type { FC } from "react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { trackStartSurvey } from "@features/analytics/client";

const noopSubscribe = () => () => {};
const getVideoSrc = () =>
  window.innerWidth < 640 ? "/couple-hero-mobile.mp4" : "/couple-hero.mp4";
const getServerVideoSrc = (): string | null => null;

const S01Hero: FC = () => {
  const [videoReady, setVideoReady] = useState(false);
  const videoSrc = useSyncExternalStore(noopSubscribe, getVideoSrc, getServerVideoSrc);
  const videoElRef = useRef<HTMLVideoElement | null>(null);

  const tryPlay = useCallback(() => {
    const video = videoElRef.current;
    if (!video || !video.paused) return;
    video.play().catch(() => {
      const resume = () => video.play().catch(() => {});
      document.addEventListener("touchstart", resume, { once: true, capture: true });
      document.addEventListener("click", resume, { once: true, capture: true });
    });
  }, []);

  const videoRef = useCallback(
    (video: HTMLVideoElement | null) => {
      if (!video) return;
      videoElRef.current = video;
      video.playbackRate = 0.75;
      const onReady = () => {
        setVideoReady(true);
        tryPlay();
      };
      if (video.readyState >= 2) {
        onReady();
        return;
      }
      video.addEventListener("canplay", onReady, { once: true });
      video.addEventListener("loadeddata", onReady, { once: true });
      video.addEventListener("playing", onReady, { once: true });
    },
    [tryPlay]
  );

  useEffect(() => {
    const handleVisibility = () => {
      if (!document.hidden) tryPlay();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pageshow", tryPlay);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pageshow", tryPlay);
    };
  }, [tryPlay]);

  return (
    <section
      id="start"
      className="section-shell relative -mt-2 flex min-h-[82svh] items-center overflow-hidden bg-page text-text-primary sm:-mt-3 sm:min-h-screen"
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {videoSrc && (
          <video
            ref={videoRef}
            className="absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ease-out sm:scale-105 sm:translate-y-[2%] sm:[object-position:50%_40%] [object-position:50%_30%]"
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            // @ts-expect-error -- fetchPriority is valid HTML but missing from React types
            fetchPriority="high"
            aria-hidden
            src={videoSrc}
            style={{ opacity: videoReady ? 1 : 0 }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-[#0b0613]/5 via-[#0b0613]/15 to-[#0b0613]/50" />
        <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-b from-transparent via-[#0b0613]/35 to-[#0A0510]" />
      </div>

      <div className="content-shell relative z-10 flex flex-col items-center px-4 text-center">
        <div className="animate-on-scroll mt-2 inline-flex items-center gap-2 rounded-full border border-border bg-white/5 px-4 py-2 text-[11px] font-semibold tracking-[0.08em] text-[#D8B4FE] shadow-soft backdrop-blur">
          <span
            className="h-2 w-2 rounded-full bg-accent-orange shadow-[0_0_0_6px_rgba(242,109,79,0.12)] animate-pulse-glow"
            aria-hidden
          />
          Science-backed methodology
        </div>

        <div className="mt-8 space-y-[2px]">
          <h1 className="animate-on-scroll font-serif text-[40px] font-semibold leading-[1.04] tracking-[-0.6px] sm:text-[48px] md:text-[60px] lg:text-[72px] lg:leading-[72px] lg:tracking-[-1.4px]">
            Gain Insights Into Your
          </h1>
          <div className="animate-on-scroll relative inline-block">
            <span className="bg-gradient-to-r from-[#ff6a3a] via-[#cf5afb] to-[#7d88ff] bg-clip-text font-serif text-[72px] font-[500] italic leading-[72px] tracking-[-1.8px] text-transparent">
              Sexual Psychology
            </span>
            <div aria-hidden className="pointer-events-none absolute inset-x-0 top-full mt-[4px]">
              <svg
                viewBox="0 0 100 24"
                fill="none"
                preserveAspectRatio="none"
                className="h-[14px] w-full"
              >
                <path
                  d="M0 10 C 25 22, 75 22, 100 10"
                  stroke="#FE6839"
                  strokeWidth="9"
                  strokeLinecap="round"
                  opacity="0.3"
                />
              </svg>
            </div>
          </div>
        </div>

        <p className="animate-on-scroll mt-8 max-w-3xl text-lg leading-relaxed text-text-secondary sm:text-xl">
          Grounded in state-of-the-art science &amp; research.{" "}
          <strong className="font-semibold text-white">
            In just 15 minutes, unlock a freemium personalized report
          </strong>{" "}
          decoding your sexual archetype and patterns, so you get clear, practical steps to improve
          intimacy.
        </p>

        <div className="animate-on-scroll mt-8 flex justify-center">
          <div className="relative rounded-full p-0 shadow-[0_28px_90px_rgba(254,104,57,0.28),0_14px_50px_rgba(0,0,0,0.45)]">
            <Link
              href="/survey"
              aria-label="Start test now - begin your assessment"
              className="group relative inline-flex h-[58px] min-w-[220px] items-center justify-center gap-2 overflow-hidden rounded-full bg-gradient-brand px-10 text-[15px] font-semibold text-white shadow-pill transition hover:translate-y-[-2px] focus-visible-ring transition-colors duration-500"
              onClick={() => trackStartSurvey("hero")}
            >
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-white opacity-0 transition-opacity duration-500 group-hover:opacity-100"
              />
              <div
                aria-hidden
                className="absolute inset-0 translate-y-full bg-white/20 transition-transform duration-300 group-hover:translate-y-0"
              />
              <span className="pointer-events-none absolute inset-0 rounded-full bg-white/10 opacity-0 transition duration-300 group-hover:opacity-100" />
              <span className="pointer-events-none absolute inset-[-12%] rounded-full border border-white/15 mix-blend-screen opacity-70" />
              <span className="relative z-10 transition-colors duration-500 group-hover:text-black">
                Start test now
              </span>
              <svg
                aria-hidden
                className="relative z-10 h-5 w-5 transition-colors duration-500 group-hover:text-black"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </Link>
          </div>
        </div>

        <div className="animate-on-scroll mt-4 flex items-center justify-center gap-x-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/75 sm:text-xs">
          <svg
            aria-hidden
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v6l4 2" />
          </svg>
          <span className="whitespace-nowrap">Takes 15 minutes</span>
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-white/60" aria-hidden />
          <span className="whitespace-nowrap">No account required</span>
        </div>

        <p className="animate-on-scroll mt-12 text-center text-base leading-7 text-white">
          <span className="font-light">Your </span>
          <span className="font-extrabold">privacy &amp; anonymity</span>
          <span className="font-light"> comes first. Learn more at our &gt; </span>
          <Link href="/trust-zone" className="font-bold text-[#FE6839] hover:underline">
            Trust Zone
          </Link>
        </p>
      </div>
    </section>
  );
};

export default S01Hero;
