"use client";

import { useCallback, useEffect, useRef, useState, type FC } from "react";
import Image from "next/image";
import { HERO_POSTER_SRC, HERO_VIDEO_SRC } from "@features/landing/ui/white/heroVideoFiles";
import { trackPtsVideoPlay } from "../analytics";
import { PTS_VIDEO } from "./payToStartContent";

/**
 * The hero's film (Figma 1706:1720, phone 1706:2057): Emma's intro, the landing's video
 * files, in Figma's wide box (850 x 360, radius 24) with a white play button in the middle
 * and the running time in a dark pill at the bottom right.
 *
 * Its own component, not the landing's WHeroVideo: that one reports to the landing test's
 * hero-video events, and nothing on this page may count there. It keeps WHeroVideo's two
 * rules that matter: the file is named only on the tap (so no engine fetches 5 MB before
 * anyone asks), and play() runs inside the tap (iOS plays with sound only from one).
 *
 * The film is 16:9 and the box wider, so while it plays it is shown whole on a dark ground
 * rather than cropped: its captions are burned in at the bottom.
 */

/** A tap whose film shows no frame by then gives the button back. */
const START_TIMEOUT_MS = 12_000;

type Phase = "poster" | "starting" | "playing";

export const PtsHeroMedia: FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [phase, setPhase] = useState<Phase>("poster");
  const phaseRef = useRef<Phase>("poster");
  const timerRef = useRef<number | undefined>(undefined);

  const moveTo = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const clearTimer = () => {
    window.clearTimeout(timerRef.current);
    timerRef.current = undefined;
  };

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  /** Back to the poster with nothing loading, so the next tap starts clean. */
  const reset = () => {
    clearTimer();
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.removeAttribute("src");
      video.load();
    }
    moveTo("poster");
  };

  const start = () => {
    const video = videoRef.current;
    if (!video || phaseRef.current !== "poster") return;
    if (!video.getAttribute("src")) video.src = HERO_VIDEO_SRC;
    video.muted = false;
    video.currentTime = 0;
    const playing = video.play();
    moveTo("starting");
    void playing?.catch(() => {
      if (phaseRef.current === "starting") reset();
    });
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      if (phaseRef.current === "starting") reset();
    }, START_TIMEOUT_MS);
  };

  const onPlaying = () => {
    if (phaseRef.current !== "starting") return;
    clearTimer();
    moveTo("playing");
    trackPtsVideoPlay();
    requestAnimationFrame(() => videoRef.current?.focus({ preventScroll: true }));
  };

  const onEnded = () => {
    moveTo("poster");
    requestAnimationFrame(() => buttonRef.current?.focus({ preventScroll: true }));
  };

  const playing = phase === "playing";

  return (
    <div
      data-testid="pts-hero-media"
      className="relative isolate aspect-[850/360] w-full overflow-hidden rounded-[24px] bg-[#f0eef4]"
    >
      <Image
        src={HERO_POSTER_SRC}
        alt=""
        fill
        // The largest thing above the fold on a desktop, as on the landing (WHeroVideo).
        fetchPriority="high"
        loading="eager"
        sizes="(min-width: 898px) 850px, calc(100vw - 32px)"
        className="object-cover object-[50%_32%]"
      />
      <video
        ref={videoRef}
        data-testid="pts-hero-video"
        preload="none"
        playsInline
        controls={playing}
        tabIndex={playing ? 0 : -1}
        aria-hidden={playing ? undefined : true}
        aria-label={PTS_VIDEO.videoLabel}
        onPlaying={onPlaying}
        onEnded={onEnded}
        onError={() => {
          if (phaseRef.current !== "poster") reset();
        }}
        className={`absolute inset-0 h-full w-full bg-[#161021] object-contain transition-opacity duration-300 ${
          playing ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      {!playing && (
        <button
          ref={buttonRef}
          type="button"
          onClick={start}
          disabled={phase === "starting"}
          aria-label={PTS_VIDEO.label}
          className="focus-visible-ring group absolute inset-0 z-10 flex cursor-pointer items-center justify-center rounded-[inherit] disabled:cursor-progress"
        >
          <span
            aria-hidden
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-[0_8px_24px_-8px_rgba(22,16,33,0.45)] transition-transform duration-300 motion-safe:group-hover:scale-105 sm:h-[76px] sm:w-[76px]"
          >
            {phase === "starting" ? (
              <span className="h-4 w-4 rounded-full border-2 border-[#161021]/25 border-t-[#161021] motion-safe:animate-spin sm:h-6 sm:w-6" />
            ) : (
              <svg viewBox="0 0 12 12" fill="#161021" className="ml-[2px] h-3 w-3 sm:h-4 sm:w-4">
                <path d="M2.5 1.4v9.2a.6.6 0 0 0 .9.52l7.7-4.6a.6.6 0 0 0 0-1.04L3.4.88a.6.6 0 0 0-.9.52Z" />
              </svg>
            )}
          </span>
          <span
            aria-hidden
            className="absolute bottom-2.5 right-3 rounded-full bg-[#161021]/75 px-2 py-0.5 font-sans text-[12px] font-medium leading-[18px] text-white sm:bottom-6 sm:right-[29px] sm:px-3 sm:py-[5px] sm:text-[15px] sm:leading-[23px]"
          >
            {PTS_VIDEO.duration}
          </span>
        </button>
      )}
    </div>
  );
};
