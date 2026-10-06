"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type FC } from "react";
import Image from "next/image";
import {
  trackHeroVideoComplete,
  trackHeroVideoError,
  trackHeroVideoPaused,
  trackHeroVideoPlay,
  trackHeroVideoProgress,
  trackHeroVideoResumed,
} from "@features/analytics/client";

/**
 * Arm B's hero (Figma Report-3.0 `1503:12473`, "B- Landingpage_5.10.26"): the presenter
 * video in the slot where arm A asks question 1.
 *
 * Three layers in one rounded box, so nothing reflows when one takes over from another:
 *   1. the poster, a caption-free pause from the video, server-rendered and fetched at
 *      high priority — it is the largest thing above the fold on a desktop;
 *   2. a 7.5 s silent loop of the opening ("the animated GIF that already rolls" asked
 *      for at the 2026-10-06 sync), which only rolls on screen, in a visible tab, and
 *      never under reduced motion, Save-Data or a 2G/3G link;
 *   3. the full video with sound, mounted from the start with `preload="none"` so a tap
 *      can call `play()` inside the gesture — iOS plays with sound only from one.
 *
 * Files: encoded from Marcus's VEED export (see public/AGENT_README.md). The captions are
 * burned in, so the silent loop stays readable and no caption track is needed.
 */
export const HERO_VIDEO_SRC = "/videos/white/emma-intro.96705e65.mp4";
export const HERO_PREVIEW_SRC = "/videos/white/emma-preview.a47a3687.mp4";
export const HERO_POSTER_SRC = "/images/white/emma-poster.ab3f901e.jpg";

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

/** preview: poster + loop + button · starting: tapped, waiting for frames · playing: own controls. */
type Phase = "preview" | "starting" | "playing";

const errorName = (error: unknown): string =>
  (error as { name?: string } | null)?.name || "play-rejected";

type NetworkInformationLike = { saveData?: boolean; effectiveType?: string };
type WebkitVideo = HTMLVideoElement & {
  webkitDisplayingFullscreen?: boolean;
  webkitExitFullscreen?: () => void;
};

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

const subscribeToMotion = (onChange: () => void) => {
  if (typeof window.matchMedia !== "function") return () => {};
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener?.("change", onChange);
  return () => query.removeEventListener?.("change", onChange);
};

/** Whether the silent loop may roll at all on this device and connection. */
const previewAllowed = (): boolean => {
  if (typeof window.matchMedia === "function" && window.matchMedia(REDUCED_MOTION).matches) {
    return false;
  }
  const connection = (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
  if (connection?.saveData) return false;
  return !/^(slow-2g|2g|3g)$/.test(connection?.effectiveType ?? "");
};

// The server never renders the loop's src: the decision needs the visitor's device.
const previewAllowedOnServer = () => false;

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

const WHeroVideo: FC = () => {
  const previewOn = useSyncExternalStore(subscribeToMotion, previewAllowed, previewAllowedOnServer);
  const hydrated = useSyncExternalStore(subscribeToNothing, hydratedInBrowser, notHydratedOnServer);
  const [phase, setPhase] = useState<Phase>("preview");
  const [loopShowing, setLoopShowing] = useState(false);

  const boxRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLVideoElement>(null);
  const fullRef = useRef<HTMLVideoElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  // Mirrors of state that the media and observer callbacks read between renders.
  const phaseRef = useRef<Phase>("preview");
  const inViewRef = useRef(false);
  const playsRef = useRef(0);
  const milestonesSentRef = useRef(new Set<number>());
  const pausedByViewerRef = useRef(false);
  const startTimerRef = useRef<number | undefined>(undefined);
  const previewErrorSentRef = useRef(false);

  const moveTo = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const clearStartTimer = useCallback(() => {
    window.clearTimeout(startTimerRef.current);
    startTimerRef.current = undefined;
  }, []);

  useEffect(() => clearStartTimer, [clearStartTimer]);

  /** Once per page: a broken loop file or codec. A blocked autoplay never gets here. */
  const reportPreviewError = useCallback((reason: string) => {
    if (previewErrorSentRef.current) return;
    previewErrorSentRef.current = true;
    trackHeroVideoError({ video: "preview", reason });
  }, []);

  /** Rolls the loop only while it is on screen, in a visible tab, and nothing else plays. */
  const syncPreview = useCallback(() => {
    const preview = previewRef.current;
    if (!preview) return;
    const shouldRoll =
      phaseRef.current === "preview" && inViewRef.current && document.visibilityState === "visible";
    if (!shouldRoll) {
      preview.pause();
      return;
    }
    // React sets `muted` as a property and never writes the attribute; iOS reads both.
    preview.muted = true;
    preview.defaultMuted = true;
    void preview.play()?.catch((error: unknown) => {
      const name = errorName(error);
      // Low Power Mode or a blocked autoplay, or one of our own pause() calls: the
      // poster and the button stay, as designed. Anything else is a fault worth seeing.
      if (name === "NotAllowedError" || name === "AbortError") return;
      reportPreviewError(name);
    });
  }, [reportPreviewError]);

  useEffect(() => {
    if (!previewOn) return;
    const box = boxRef.current;
    const preview = previewRef.current;
    if (!box || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        // One callback can carry several crossings; the last is where the box is now.
        const entry = entries[entries.length - 1];
        inViewRef.current = !!entry && entry.intersectionRatio >= 0.25;
        syncPreview();
      },
      { threshold: [0, 0.25] }
    );
    observer.observe(box);
    document.addEventListener("visibilitychange", syncPreview);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", syncPreview);
      preview?.pause();
    };
  }, [previewOn, syncPreview]);

  /**
   * A start that will not play: back to the poster and an enabled button, so a second
   * tap can try again, and one event saying why. Acts only while starting, so the
   * several signals one failure can raise (a rejection, `pause`, `error`) count once.
   */
  const failStart = (reason: string) => {
    if (phaseRef.current !== "starting") return;
    clearStartTimer();
    // Given up on by the timeout it may still be loading, and must not start later,
    // with sound, behind the poster. Already paused, this does nothing.
    fullRef.current?.pause();
    moveTo("preview");
    syncPreview();
    trackHeroVideoError({ video: "full", reason });
  };

  const startFullVideo = () => {
    const full = fullRef.current;
    if (!full || phaseRef.current !== "preview") return;
    // Everything up to play() happens inside the tap, before any state update.
    previewRef.current?.pause();
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
    trackHeroVideoPlay({ replay: playsRef.current > 0 });
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
    const reason = `media-error-${fullRef.current?.error?.code ?? "unknown"}`;
    if (phaseRef.current === "starting") return failStart(reason);
    // Mid-film the native controls show the failure; it is still worth counting.
    if (phaseRef.current === "playing") trackHeroVideoError({ video: "full", reason });
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
        trackHeroVideoProgress({ percent: milestone });
      }
    }
  };

  const onFullEnded = () => {
    const full = fullRef.current as WebkitVideo | null;
    trackHeroVideoComplete();
    const hadFocus = !!full && document.activeElement === full;
    if (full) exitFullscreen(full);
    moveTo("preview");
    syncPreview();
    if (hadFocus) requestAnimationFrame(() => buttonRef.current?.focus({ preventScroll: true }));
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
        ref={previewRef}
        data-testid="hero-video-preview"
        src={previewOn ? HERO_PREVIEW_SRC : undefined}
        muted
        loop
        playsInline
        preload="none"
        aria-hidden
        tabIndex={-1}
        disablePictureInPicture
        disableRemotePlayback
        onPlaying={() => setLoopShowing(true)}
        onError={() =>
          reportPreviewError(`media-error-${previewRef.current?.error?.code ?? "unknown"}`)
        }
        className={`absolute inset-0 h-full w-full rounded-[inherit] object-cover transition-opacity duration-500 ${
          loopShowing && !fullShowing ? "opacity-100" : "opacity-0"
        }`}
      />
      <video
        ref={fullRef}
        data-testid="hero-video-full"
        src={HERO_VIDEO_SRC}
        preload="none"
        playsInline
        controls={fullShowing}
        // Focusable while it plays, so its controls are reachable by keyboard — and a tap
        // on it is not mistaken for a click on nothing by the dead-click signal.
        tabIndex={fullShowing ? 0 : -1}
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
          // Contains both visible words ("Watch", "1:10"), so a voice user saying what they
          // see finds it (WCAG 2.5.3).
          aria-label={`Watch the intro video with sound (${DURATION_LABEL})`}
          // The whole video is the target; the pill is only the visible affordance. It sits
          // bottom-left: the presenter's face is in the middle and the captions are low and
          // centred, so a centred button would cover one or the other.
          className="focus-visible-ring group absolute inset-0 z-10 flex cursor-pointer items-end justify-start rounded-[inherit] p-[3.4%] disabled:cursor-progress"
        >
          <span className="inline-flex items-center gap-2 rounded-full bg-[#161021]/60 py-[5px] pl-[5px] pr-3.5 text-white shadow-[0_6px_18px_-6px_rgba(22,16,33,0.55)] backdrop-blur-[6px] transition duration-300 group-hover:bg-[#161021]/75 lg:gap-2.5 lg:py-1.5 lg:pl-1.5 lg:pr-4">
            <span
              aria-hidden
              className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#fe6839] via-[#bf66d9] via-[43%] to-[#958ef6] lg:h-8 lg:w-8"
            >
              {phase === "starting" ? (
                <span className="h-3 w-3 rounded-full border-2 border-white/40 border-t-white motion-safe:animate-spin lg:h-3.5 lg:w-3.5" />
              ) : (
                <svg
                  viewBox="0 0 12 12"
                  className="ml-[2px] h-3 w-3 lg:h-3.5 lg:w-3.5"
                  fill="white"
                >
                  <path d="M2.5 1.4v9.2a.6.6 0 0 0 .9.52l7.7-4.6a.6.6 0 0 0 0-1.04L3.4.88a.6.6 0 0 0-.9.52Z" />
                </svg>
              )}
            </span>
            <span className="text-[13px] font-semibold leading-none lg:text-[14px]">Watch</span>
            <span className="text-[13px] font-medium leading-none text-white/75 lg:text-[14px]">
              {DURATION_LABEL}
            </span>
          </span>
        </button>
      )}
    </div>
  );
};

export default WHeroVideo;
