"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type FC } from "react";
import Image from "next/image";
import {
  trackHeroVideoAbandoned,
  trackHeroVideoComplete,
  trackHeroVideoError,
  trackHeroVideoPaused,
  trackHeroVideoPlay,
  trackHeroVideoProgress,
  trackHeroVideoResumed,
  trackHeroVideoTap,
} from "@features/analytics/client";
import { useCtaSeen } from "@features/analytics/useCtaSeen";
import { HERO_POSTER_SRC, HERO_VIDEO_SRC } from "./heroVideoFiles";

/**
 * Arm B's hero (Figma Report-3.0 `1503:12473`, "B- Landingpage_5.10.26"): the presenter
 * video in the slot where arm A asks question 1.
 *
 * Paused until tapped. The silent loop asked for at the 2026-10-06 sync went at the 29.10
 * one: Marcus suspected it of keeping people from tapping. Two layers in one rounded box,
 * so nothing reflows when one takes over from the other:
 *   1. the poster, a caption-free pause from the video, server-rendered and fetched at
 *      high priority — it is the largest thing above the fold on a desktop — under a big
 *      play button in the brand gradient (the old corner pill's), pulsing softly;
 *   2. the full video with sound, mounted from the start but with no src: the tap names
 *      the file and calls `play()` inside the gesture (iOS plays with sound only from
 *      one), so no engine fetches a byte of it before the tap.
 *
 * Files: encoded from Marcus's VEED export (see public/AGENT_README.md). The captions are
 * burned in, so no caption track is needed.
 */
export { HERO_POSTER_SRC, HERO_VIDEO_SRC };

/** The full video runs 70.4 s. */
const DURATION_LABEL = "1:10";
/** For the progress milestones, until the browser has read the real duration. */
const FALLBACK_DURATION_SEC = 70.4;
const MILESTONES = [25, 50, 75] as const;
/**
 * A tap whose video has shown no frame after this long gives up and brings the button
 * back. Starting needs the first ~2 s of a 1 Mbps file, a few seconds even on 3G.
 */
const START_TIMEOUT_MS = 12_000;

/** poster: the poster and the button · starting: tapped, waiting for frames · playing: own controls. */
type Phase = "poster" | "starting" | "playing";

const errorName = (error: unknown): string =>
  (error as { name?: string } | null)?.name || "play-rejected";

type WebkitVideo = HTMLVideoElement & {
  webkitDisplayingFullscreen?: boolean;
  webkitExitFullscreen?: () => void;
};

// True once this component has hydrated, i.e. once the button has its click handler.
const subscribeToNothing = () => () => {};
const hydratedInBrowser = () => true;
const notHydratedOnServer = () => false;

const exitFullscreen = (video: WebkitVideo) => {
  if (document.fullscreenElement === video) {
    void document.exitFullscreen?.().catch(() => {});
  } else if (video.webkitDisplayingFullscreen) {
    video.webkitExitFullscreen?.();
  }
};

/**
 * The full video as it was before the first tap: no source, nothing loading, no error.
 *
 * A media element that has failed keeps its error, and play() on it then rejects at
 * once (NotSupportedError, in Chrome, Safari and Firefox alike), so without this the
 * button came back after a dropped connection and every later tap failed. One given up
 * on by the timeout would also keep downloading, and could start later, with sound,
 * behind the poster. The next tap names the file again, exactly like the first.
 */
const unload = (video: HTMLVideoElement) => {
  video.pause();
  video.removeAttribute("src");
  video.load();
};

const WHeroVideo: FC = () => {
  const hydrated = useSyncExternalStore(subscribeToNothing, hydratedInBrowser, notHydratedOnServer);
  const [phase, setPhase] = useState<Phase>("poster");

  const boxRef = useRef<HTMLDivElement>(null);
  const fullRef = useRef<HTMLVideoElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  // Mirrors of state that the media callbacks read between renders.
  const phaseRef = useRef<Phase>("poster");
  const playsRef = useRef(0);
  // Whether the watch now playing is a replay, for its milestones and its finish.
  const replayRef = useRef(false);
  const milestonesSentRef = useRef(new Set<number>());
  const pausedByViewerRef = useRef(false);
  const startTimerRef = useRef<number | undefined>(undefined);
  // Set when the video had focus as it handed back to the poster: the button it returns
  // focus to exists only once that render has committed.
  const refocusButtonRef = useRef(false);

  const moveTo = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const clearStartTimer = useCallback(() => {
    window.clearTimeout(startTimerRef.current);
    startTimerRef.current = undefined;
  }, []);

  useEffect(() => {
    if (phase !== "poster" || !refocusButtonRef.current) return;
    refocusButtonRef.current = false;
    buttonRef.current?.focus({ preventScroll: true });
  }, [phase]);

  /**
   * A tap whose film had not started when the visitor left sent nothing: the timeout that
   * would have reported it dies with the page. So leaving ends the start, once, and says
   * so by beacon — on `pagehide` (the tab closed, or another site), or on unmount (another
   * page of the app). Back on the poster with nothing loading, should the page come back
   * from the browser's cache.
   */
  useEffect(() => {
    // The film's element lives as long as this component; React lets go of the ref before
    // an unmount's cleanup runs.
    const full = fullRef.current;
    const leave = () => {
      if (phaseRef.current !== "starting") return;
      clearStartTimer();
      if (full) unload(full);
      moveTo("poster");
      trackHeroVideoAbandoned();
    };
    window.addEventListener("pagehide", leave);
    return () => {
      window.removeEventListener("pagehide", leave);
      leave();
    };
  }, [clearStartTimer, moveTo]);

  // Whether it was on screen. Since the condensed phone hero (12.10) it sits on the first
  // screen of most phones, not all, and a visitor can leave before it loads, so this, not
  // the page view, is the denominator for the share who tap play.
  useCtaSeen(boxRef, "hero_video");

  const resetFull = () => {
    if (fullRef.current) unload(fullRef.current);
  };

  /**
   * A start that will not play: back to the poster and an enabled button, so a second
   * tap can try again, and one event saying why. Acts only while starting, so the
   * several signals one failure can raise (a rejection, `pause`, `error`) count once.
   */
  const failStart = (reason: string) => {
    if (phaseRef.current !== "starting") return;
    clearStartTimer();
    resetFull();
    // The button is disabled while it starts, and a focused control that is disabled
    // loses focus to the page (measured: Chrome, Safari and Firefox), so a keyboard
    // user who pressed play was left at the top of the page. Back on the button,
    // unless they have moved on to something else meanwhile.
    const active = document.activeElement;
    refocusButtonRef.current = !active || active === document.body || active === buttonRef.current;
    moveTo("poster");
    trackHeroVideoError({ video: "full", reason });
  };

  /** Back to the poster and the button, handing focus back if the video had it. */
  const backToPoster = (full: WebkitVideo) => {
    refocusButtonRef.current = document.activeElement === full;
    exitFullscreen(full);
    moveTo("poster");
  };

  const startFullVideo = () => {
    const full = fullRef.current;
    if (!full || phaseRef.current !== "poster") return;
    // Counted at once: the share who tap is the click-through, and a start that stalls
    // is still a tap. A play is counted later, when frames show.
    trackHeroVideoTap({ replay: playsRef.current > 0 });
    // Everything up to play() happens inside the tap, before any state update.
    // The file is named only now. With the src in the page and `preload="none"`, WebKit
    // on Linux still opened a request for the 5 MB file on load (CI, 2026-10-07); with
    // no src there is nothing any engine can fetch before the tap.
    if (!full.getAttribute("src")) full.src = HERO_VIDEO_SRC;
    full.muted = false;
    full.currentTime = 0;
    milestonesSentRef.current = new Set();
    pausedByViewerRef.current = false;
    const playing = full.play();
    moveTo("starting");
    // Every rejection ends the start, an AbortError too: nothing here pauses the video
    // while it starts, so an abort came from the browser or the OS (an app switch on
    // iOS, a headset button), and the visitor needs the button back.
    void playing?.catch((error: unknown) => failStart(errorName(error)));
    // A network error after the first bytes fires `error` but never settles play().
    clearStartTimer();
    startTimerRef.current = window.setTimeout(() => failStart("timeout"), START_TIMEOUT_MS);
  };

  const onFullPlaying = () => {
    if (phaseRef.current !== "starting") return;
    clearStartTimer();
    moveTo("playing");
    // Counted when frames start, not at the tap, so a failed start is never a play.
    replayRef.current = playsRef.current > 0;
    trackHeroVideoPlay({ replay: replayRef.current });
    playsRef.current += 1;
    // The button that had focus is gone; the video's own controls take it.
    requestAnimationFrame(() => fullRef.current?.focus({ preventScroll: true }));
  };

  const onFullPause = () => {
    const full = fullRef.current;
    // Browsers fire `pause` just before `ended`: that is a finish, not a pause.
    if (!full || full.ended) return;
    // Paused before a frame showed (the OS, a headset, another tab's audio): no start.
    if (phaseRef.current === "starting") return failStart("paused-before-playing");
    if (phaseRef.current !== "playing") return;
    pausedByViewerRef.current = true;
    trackHeroVideoPaused({ current_time_sec: Math.round(full.currentTime) });
  };

  const onFullError = () => {
    const full = fullRef.current as WebkitVideo | null;
    const reason = `media-error-${full?.error?.code ?? "unknown"}`;
    if (phaseRef.current === "starting") return failStart(reason);
    if (phaseRef.current !== "playing" || !full) return;
    // Mid-film: a player that cannot go on, and cannot be restarted from its own controls.
    // Back to the poster, so a tap can start it again.
    trackHeroVideoError({ video: "full", reason });
    backToPoster(full);
    resetFull();
  };

  const onFullPlay = () => {
    const full = fullRef.current;
    if (!full || !pausedByViewerRef.current) return;
    pausedByViewerRef.current = false;
    trackHeroVideoResumed({ current_time_sec: Math.round(full.currentTime) });
  };

  const onFullTimeUpdate = () => {
    const full = fullRef.current;
    if (!full) return;
    const duration =
      Number.isFinite(full.duration) && full.duration > 0 ? full.duration : FALLBACK_DURATION_SEC;
    const percent = (full.currentTime / duration) * 100;
    for (const milestone of MILESTONES) {
      if (percent >= milestone && !milestonesSentRef.current.has(milestone)) {
        milestonesSentRef.current.add(milestone);
        trackHeroVideoProgress({ percent: milestone, replay: replayRef.current });
      }
    }
  };

  const onFullEnded = () => {
    const full = fullRef.current as WebkitVideo | null;
    trackHeroVideoComplete({ replay: replayRef.current });
    // Not reset: a replay plays from what is already loaded.
    if (full) backToPoster(full);
  };

  const fullShowing = phase === "playing";

  return (
    <div
      ref={boxRef}
      data-testid="hero-video"
      // Present once hydrated: a tap before then reaches a button with no handler yet.
      // Tests and probes wait on this rather than on a timer.
      data-ready={hydrated ? "" : undefined}
      className="relative isolate mx-auto w-[min(472px,90.5%)] overflow-hidden bg-[#efe4d8] lg:mx-0 lg:w-full"
      // Figma's box (472 x 269.896, radius 17.99 at desktop, 12.07 at 316.75 on a phone):
      // one rule at every width, because the radius is a share of the box, not pixels.
      style={{ aspectRatio: "472 / 269.896", borderRadius: "3.811% / 6.665%" }}
    >
      <Image
        src={HERO_POSTER_SRC}
        alt=""
        fill
        sizes="(min-width: 1024px) 472px, 91vw"
        fetchPriority="high"
        loading="eager"
        className="rounded-[inherit] object-cover"
      />
      <video
        ref={fullRef}
        data-testid="hero-video-full"
        preload="none"
        playsInline
        controls={fullShowing}
        // Focusable while it plays, so its controls are reachable by keyboard — and a tap
        // on it is not mistaken for a click on nothing by the dead-click signal.
        tabIndex={fullShowing ? 0 : -1}
        // Invisible until it plays, so hidden from screen readers too: until then the
        // button is the way to it, and a second, unseen "video" beside it is noise.
        aria-hidden={fullShowing ? undefined : true}
        aria-label="LoveIQ intro video"
        onPlaying={onFullPlaying}
        onPlay={onFullPlay}
        onPause={onFullPause}
        onError={onFullError}
        onTimeUpdate={onFullTimeUpdate}
        onEnded={onFullEnded}
        className={`absolute inset-0 h-full w-full rounded-[inherit] object-cover transition-opacity duration-300 ${
          fullShowing ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      {!fullShowing && (
        <button
          ref={buttonRef}
          type="button"
          data-testid="hero-video-play"
          onClick={startFullVideo}
          disabled={phase === "starting"}
          // Contains the visible "1:10", so a voice user saying what they see finds it
          // (WCAG 2.5.3).
          aria-label={`Watch the intro video with sound (${DURATION_LABEL})`}
          // The whole video is the target; the circle is the visible affordance. Its focus
          // ring is drawn inside the edge: the box clips anything outside it, and the
          // site's `focus-visible-ring` (an outer shadow) was cut off entirely. An outline,
          // because forced colours keep outlines and drop shadows; the white band inside
          // it keeps it apart from the photo.
          className="group absolute inset-0 z-10 cursor-pointer rounded-[inherit] outline-none focus-visible:shadow-[inset_0_0_0_5px_#fff] focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-[-3px] focus-visible:outline-[#9c7dff] disabled:cursor-progress"
        >
          {/* Under a mouse the poster dims a little (hover: Tailwind's hoverOnlyWhenSupported). */}
          <span
            aria-hidden
            className="absolute inset-0 rounded-[inherit] bg-[#161021]/0 transition-colors duration-300 group-hover:bg-[#161021]/15"
          />
          {/* Low, on Emma's chest, so her face stays clear: its centre at 70% of the box. */}
          <span
            aria-hidden
            data-testid="hero-video-play-icon"
            className="absolute left-1/2 top-[70%] h-[52px] w-[52px] -translate-x-1/2 -translate-y-1/2 transition-transform duration-300 motion-safe:group-hover:scale-[1.08] sm:h-[72px] sm:w-[72px]"
          >
            {/* A soft ring swelling out of the circle and fading, as the hero's live dot pings:
                none under reduced motion, and none while the film starts. */}
            {phase !== "starting" && (
              <span
                data-testid="hero-video-play-pulse"
                className="absolute inset-0 rounded-full bg-gradient-to-br from-[#fe6839] via-[#bf66d9] via-[43%] to-[#958ef6] opacity-0 motion-safe:animate-play-pulse motion-reduce:hidden"
              />
            )}
            {/* The old corner pill's circle (before 29.10): the brand gradient, a white triangle. */}
            <span className="relative flex h-full w-full items-center justify-center rounded-full bg-gradient-to-br from-[#fe6839] via-[#bf66d9] via-[43%] to-[#958ef6] shadow-[0_8px_24px_-8px_rgba(22,16,33,0.55)] ring-2 ring-white/30">
              {phase === "starting" ? (
                <span className="h-[18px] w-[18px] rounded-full border-2 border-white/40 border-t-white motion-safe:animate-spin sm:h-6 sm:w-6" />
              ) : (
                <svg
                  viewBox="0 0 12 12"
                  fill="white"
                  className="ml-[2px] h-[18px] w-[18px] sm:ml-[3px] sm:h-6 sm:w-6"
                >
                  <path d="M2.5 1.4v9.2a.6.6 0 0 0 .9.52l7.7-4.6a.6.6 0 0 0 0-1.04L3.4.88a.6.6 0 0 0-.9.52Z" />
                </svg>
              )}
            </span>
          </span>
          <span className="absolute bottom-2.5 right-2.5 rounded-full bg-[#161021]/75 px-2 py-0.5 text-[12px] font-medium leading-[18px] text-white tabular-nums sm:bottom-4 sm:right-4 sm:px-2.5 sm:py-1 sm:text-[14px] sm:leading-[20px]">
            {DURATION_LABEL}
          </span>
        </button>
      )}
    </div>
  );
};

export default WHeroVideo;
