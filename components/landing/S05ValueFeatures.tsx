"use client";

import type { FC } from "react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};
const getVideoSrc = () =>
  window.innerWidth <= 640 ? "/couple-hero-mobile.mp4" : "/couple-hero.mp4";
const getServerVideoSrc = (): string | null => null;

const bullets = [
  {
    title: "Struggling to explain?",
    description:
      "Desire is complex. Without the right words, needs go unmet and frustrations build silently.",
    icon: "arrow",
  },
  {
    title: "Tired of vague advice?",
    description:
      "Because every psychology is unique, one-size-fits-all advice doesn’t work. We all need guidance tailored to our emotional blueprint.",
    icon: "lock",
  },
];

const S05ValueFeatures: FC = () => {
  const [loadVideo, setLoadVideo] = useState(false);
  const sectionRef = useRef<HTMLElement | null>(null);
  const videoSrc = useSyncExternalStore(noopSubscribe, getVideoSrc, getServerVideoSrc);
  const videoElRef = useRef<HTMLVideoElement | null>(null);

  const tryPlay = useCallback(() => {
    const video = videoElRef.current;
    if (!video || !video.paused) return;
    video.play().catch(() => {});
  }, []);

  const videoRef = useCallback(
    (video: HTMLVideoElement | null) => {
      if (!video) return;
      videoElRef.current = video;
      const onReady = () => tryPlay();
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

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setLoadVideo(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      className="section-shell relative overflow-hidden bg-[#0A0510] px-4 text-text-primary"
      aria-labelledby="value-heading"
    >
      <div className="pointer-events-none absolute inset-0" />

      <div className="content-shell relative grid gap-10 lg:grid-cols-[1fr_1.05fr] lg:items-center lg:gap-[0px]">
        <div className="pointer-events-none absolute -left-[302px] top-[52.275px] h-[160px] w-[160px] rounded-full bg-[#FE6839] mix-blend-screen blur-[99.5px]" />
        <div className="pointer-events-none absolute -right-[1014.5px] bottom-[136px] h-[257px] w-[257px] rounded-full bg-[#541475] mix-blend-screen blur-[100px]" />

        <div className="lg:hidden space-y-3">
          <h2
            id="value-heading"
            className="font-serif text-[34px] leading-[1.05] text-white sm:text-[38px]"
          >
            Great intimacy requires a vocabulary most of us were never taught.
          </h2>
        </div>

        <div className="relative overflow-hidden rounded-[24px] border border-[rgba(255,255,255,0.08)] bg-[#0A0510] shadow-[0_30px_90px_rgba(0,0,0,0.55)] aspect-square lg:aspect-auto lg:h-[640px] order-1 w-full lg:order-1 lg:max-w-[456px]">
          <div className="relative h-full w-full overflow-hidden rounded-[24px]">
            {loadVideo && videoSrc && (
              <video
                ref={videoRef}
                className="absolute inset-0 h-full w-full object-cover lg:object-cover"
                autoPlay
                muted
                loop
                playsInline
                preload="none"
                aria-hidden
                src={videoSrc}
              />
            )}
          </div>
        </div>

        <div className="relative space-y-8 order-2 lg:order-2">
          <h2
            id="value-heading"
            className="hidden font-serif text-[34px] leading-[1.05] text-white sm:text-[38px] lg:text-[44px] lg:block"
          >
            Great intimacy requires a vocabulary most of us were never taught.
          </h2>
          <div className="space-y-6">
            {bullets.map((item) => (
              <div key={item.title} className="group flex gap-3 rounded-2xl bg-transparent p-4">
                <div
                  className="mt-0.5 flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-[#241433]/80 text-[#cbb8ff] shadow-[0_16px_50px_rgba(0,0,0,0.35)] transition duration-300 ease-out group-hover:-translate-y-1 group-hover:scale-[1.03] group-hover:border-white/20 group-hover:bg-gradient-to-br group-hover:from-[#f26d4f] group-hover:via-[#9c7dff] group-hover:to-[#5d7cff] group-hover:text-[#0d0715]"
                  aria-hidden
                >
                  {item.icon === "arrow" ? (
                    <svg
                      width="29"
                      height="29"
                      viewBox="0 0 29 29"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-7 w-7"
                    >
                      <path
                        d="M24 24.3234H8.9644C8.30923 24.3235 7.68095 24.5809 7.21774 25.0389L4.4977 27.7275C4.25172 27.9888 3.8674 28.0715 3.5338 27.9349C3.20021 27.7983 2.98759 27.4712 3.00056 27.1146V7.22953C3.00054 6.26627 3.5734 5.39301 4.46311 5"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M1 1L26.5 26"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M8 3H24.1523C25.724 3 27 4.20886 27 5.69784V21"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : (
                    <svg
                      width="24"
                      height="17"
                      viewBox="0 0 24 17"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-7 w-7"
                    >
                      <path
                        d="M3.19748 14.4785C0.958739 12.1228 0.368225 8.58644 1.71419 5.5958C3.06017 2.60516 6.06198 0.783745 9.25429 1.02069C12.4466 1.25764 15.1638 3.50354 16.0795 6.66205H18.0486C20.2294 6.66179 22.1534 8.13129 22.7864 10.2806C23.4194 12.4298 22.6123 14.7526 20.7988 16.0001"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </div>
                <div className="space-y-1">
                  <p className="font-serif text-[17px] font-semibold text-white">{item.title}</p>
                  <p className="text-base leading-relaxed text-white/70">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default S05ValueFeatures;
