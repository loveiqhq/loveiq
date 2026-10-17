"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type FC } from "react";
import { createPortal } from "react-dom";
import {
  trackTourBack,
  trackTourCompleted,
  trackTourSkipped,
  trackTourStarted,
  trackTourStepViewed,
} from "@features/analytics/client";
import {
  FINISH_FADE_MS,
  HOLE_TRAVEL_MS,
  LANDING_TOLERANCE_PX,
  bubbleWidth,
  easeInOutQuad,
  holeFor,
  lerpHole,
  placeBubble,
  scrimPath,
  scrollDurationMs,
  scrollTargetFor,
  stepMotion,
  tourSteps,
  type TourHole,
  type TourOutcome,
  type TourSkipSource,
  type TourStepId,
  type TourTrigger,
} from "@features/report/logic/guidedTour";
import { useCloseOnBack } from "@features/report/ui/hooks/useCloseOnBack";
import { isBodyScrollLocked } from "@shared/ui/body-scroll-lock";
import { isGuidedTourActive, setGuidedTourActive } from "@shared/ui/guided-tour-state";
import { getSmoothScroll } from "@shared/ui/smooth-scroll-registry";
import { findTourAnchor, type TourAnchor } from "./guidedTourAnchors";
import { TOUR_COPY, TOUR_LABELS, TOUR_MENU_BODY_SIDEBAR, tourStepLabel } from "./guidedTourContent";
import "./guidedTour.css";

interface Props {
  trigger: TourTrigger;
  /** The unlock stop, for a reader who has not paid (Fatih, 17.10: Essentials buyers have). */
  includeUnlock: boolean;
  /**
   * The tour is over: the page unmounts it, which lets go of the page, and puts focus back
   * on whatever replayed it (it cannot from here: the page is still inert at this point).
   */
  onDone: (outcome: TourOutcome) => void;
}

interface Bubble {
  key: number;
  index: number;
  total: number;
  id: TourStepId;
  sidebar: boolean;
}

type Phase = "idle" | "scrolling" | "settling" | "travelling" | "shown" | "finishing" | "ended";

/** On a control while it shows its move (guidedTour.css): the chevrons' nudge and turn. */
export const TOUR_GESTURE_ATTR = "data-rv4-tour-gesture";

const FOCUSABLE = "button:not([disabled])";
const SCROLL_KEYS = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "]);

/**
 * The page's own record of the scroll position on a history traversal, held at "manual"
 * while a tour runs. The back button closes the tour (useCloseOnBack) through a same-URL
 * history entry, and when the tour ends that entry is taken back off: with "auto" the
 * browser then restored the position the reader had when the entry went on, so a replay
 * started deep in the report finished at the top and jumped straight back down. Put back
 * once that traversal has landed (or after a second, when there is none), and only if no
 * tour has started since: React's development double mount runs this twice over.
 */
let heldRestoration: ScrollRestoration | null = null;

function holdScrollRestoration(): void {
  if (!("scrollRestoration" in window.history)) return;
  if (heldRestoration === null) heldRestoration = window.history.scrollRestoration;
  window.history.scrollRestoration = "manual";
}

function releaseScrollRestoration(): void {
  if (heldRestoration === null) return;
  let timer = 0;
  const restore = () => {
    window.removeEventListener("popstate", restore);
    window.clearTimeout(timer);
    if (isGuidedTourActive() || heldRestoration === null) return;
    window.history.scrollRestoration = heldRestoration;
    heldRestoration = null;
  };
  window.addEventListener("popstate", restore);
  timer = window.setTimeout(restore, 1_000);
}

const prefersReducedMotion = () =>
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * The report's guided tour (features/report/logic/guidedTour.ts has the why and the rules).
 *
 * One click-through over the page: a dim with a rounded hole on one control at a time, its
 * edge glowing, and a bubble beside it. The page scrolls itself to each control; the
 * reader cannot scroll or tap it until the tour ends, and Finish fades the dim while the
 * page goes back to the top (Figma 1755:1275; Mark's prototype, tab "Guided tour").
 *
 * Drawn in a layer of its own on `document.body`, outside the report, which sits in a
 * stacking context of its own and is inert while this runs (the page sets that). Nothing
 * in the report is restyled: every frame reads the control's box and draws round it, so
 * a pill sliding back in, a fold measuring itself or fonts arriving are followed for free.
 * Positions are written straight to the layer's elements from one animation frame loop;
 * React only renders which bubble is up.
 */
const V4GuidedTour: FC<Props> = ({ trigger, includeUnlock, onDone }) => {
  const [bubble, setBubble] = useState<Bubble | null>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const edgeRef = useRef<HTMLDivElement>(null);
  const shimmerRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const arrowRef = useRef<HTMLSpanElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const apiRef = useRef<{
    next: () => void;
    back: () => void;
    skip: (source: TourSkipSource) => void;
  } | null>(null);
  const startedRef = useRef(false);
  const onDoneRef = useRef(onDone);
  const ids = useId();

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  /**
   * Holds the page for as long as the tour is mounted, and lets go of every part of it on
   * unmount, however the tour ends. A layout effect, declared before useCloseOnBack's, so
   * the history entry goes on with the scroll position already held (see above).
   *
   * Not the shared body lock (body-scroll-lock.ts): it pins the body with position: fixed,
   * and a page pinned like that cannot be scrolled by the tour either. Instead the root
   * stops scrolling to the reader (`overflow: hidden`, which a script can still scroll, and
   * which also hides the scrollbar a mouse could drag), the smooth scroll stands down
   * (Lenis, on desktops), and touch and wheel input over the layer is cancelled: a finger
   * still pans a page whose root is `overflow: hidden` on iOS. The CookieYes banner sits
   * above the layer and keeps working.
   */
  useLayoutEffect(() => {
    const html = document.documentElement;
    const saved = { overflow: html.style.overflow, scrollBehavior: html.style.scrollBehavior };
    holdScrollRestoration();
    html.style.overflow = "hidden";
    // Every scroll here is the tour's own animation; the stylesheet's smooth behaviour
    // (globals.css) would animate each of its frames again.
    html.style.scrollBehavior = "auto";
    getSmoothScroll()?.stop();
    setGuidedTourActive(true);
    const block = (event: Event) => {
      if (event.target instanceof Node && layerRef.current?.contains(event.target)) {
        event.preventDefault();
      }
    };
    window.addEventListener("wheel", block, { capture: true, passive: false });
    window.addEventListener("touchmove", block, { capture: true, passive: false });
    return () => {
      window.removeEventListener("wheel", block, { capture: true });
      window.removeEventListener("touchmove", block, { capture: true });
      html.style.overflow = saved.overflow;
      html.style.scrollBehavior = saved.scrollBehavior;
      setGuidedTourActive(false);
      if (!isBodyScrollLocked()) {
        const smooth = getSmoothScroll();
        smooth?.start();
        smooth?.resize();
      }
      releaseScrollRestoration();
    };
  }, []);

  useCloseOnBack(true, () => apiRef.current?.skip("browser_back"));

  /** The tour itself: a loop of animation frames over the stops. */
  useEffect(() => {
    const svg = svgRef.current;
    const path = pathRef.current;
    const edge = edgeRef.current;
    const shimmer = shimmerRef.current;
    const layer = layerRef.current;
    if (!svg || !path || !edge || !shimmer || !layer) return;
    const reduced = prefersReducedMotion();

    let raf = 0;
    let phase: Phase = "idle";
    let steps: TourStepId[] = [];
    let index = -1;
    let anchor: TourAnchor | null = null;
    let anchorRadius = 0;
    let hole: TourHole | null = null;
    let travelFrom: TourHole | null = null;
    let travelStart = 0;
    let scrollFrom = 0;
    let scrollStart = 0;
    let scrollDuration = 0;
    let corrected = false;
    let finishStart = 0;
    let startedAt = 0;
    let gestureEl: HTMLElement | null = null;
    let shimmering = false;
    let bubbleKey = 0;
    let drawn = "";

    edge.hidden = true;
    shimmer.hidden = true;

    const view = () => {
      const html = document.documentElement;
      const banner = parseFloat(html.style.getPropertyValue("--liq-consent-h")) || 0;
      const height = window.innerHeight;
      return {
        width: html.clientWidth || window.innerWidth,
        height,
        bottom: Math.max(0, height - banner),
      };
    };
    const jump = (y: number) =>
      window.scrollTo({ top: Math.round(y), left: 0, behavior: "instant" as ScrollBehavior });
    const holeOf = (a: TourAnchor) => {
      const box = a.box();
      return holeFor({ x: box.left, y: box.top, w: box.width, h: box.height }, anchorRadius);
    };
    const currentId = () => steps[index] ?? "chapter_menu";
    const motion = () => stepMotion(currentId(), { sidebar: anchor?.sidebar ?? false });
    const targetFor = (a: TourAnchor) => {
      if (motion().toTop) return 0;
      const box = a.box();
      return scrollTargetFor({
        anchor: { top: box.top, height: box.height },
        scrollY: window.scrollY,
        view: { top: 0, height: view().bottom },
        maxScroll: document.documentElement.scrollHeight - window.innerHeight,
      });
    };

    const draw = () => {
      const v = view();
      const d = scrimPath(v.width, v.height, hole);
      if (d !== drawn) {
        svg.setAttribute("viewBox", `0 0 ${v.width} ${v.height}`);
        path.setAttribute("d", d);
        drawn = d;
      }
      if (hole && phase !== "finishing") {
        edge.style.left = `${hole.x}px`;
        edge.style.top = `${hole.y}px`;
        edge.style.width = `${hole.w}px`;
        edge.style.height = `${hole.h}px`;
        edge.style.borderRadius = `${hole.r}px`;
        edge.hidden = false;
      } else {
        edge.hidden = true;
      }
      if (shimmering && anchor) {
        const box = anchor.box();
        shimmer.style.left = `${box.left}px`;
        shimmer.style.top = `${box.top}px`;
        shimmer.style.width = `${box.width}px`;
        shimmer.style.height = `${box.height}px`;
        shimmer.style.borderRadius = `${Math.min(anchorRadius, box.height / 2) || 0}px`;
      }
    };

    /** The bubble beside the hole, every frame: it follows the control wherever it moves. */
    const place = () => {
      const el = bubbleRef.current;
      if (!el || !hole || el.dataset.state === "out") return;
      const v = view();
      const width = bubbleWidth(v.width);
      el.style.width = `${width}px`;
      const placed = placeBubble({
        hole,
        size: { w: width, h: el.offsetHeight },
        view: { width: v.width, top: 0, bottom: v.bottom },
        prefer: motion().prefer,
      });
      el.style.left = `${placed.left}px`;
      el.style.top = `${placed.top}px`;
      if (el.dataset.placement !== placed.placement) el.dataset.placement = placed.placement;
      const arrow = arrowRef.current;
      if (arrow) {
        arrow.style.left = placed.placement === "right" ? "" : `${placed.arrow}px`;
        arrow.style.top = placed.placement === "right" ? `${placed.arrow}px` : "";
      }
      if (el.dataset.state === "measuring") el.dataset.state = "in";
    };

    const stopGesture = () => {
      gestureEl?.removeAttribute(TOUR_GESTURE_ATTR);
      gestureEl = null;
      shimmering = false;
      shimmer.hidden = true;
      shimmer.removeAttribute("data-run");
      edge.removeAttribute("data-pulse");
    };

    /** Off the current stop: its move stops and its bubble fades while the next one comes. */
    const leave = () => {
      stopGesture();
      const old = bubbleRef.current;
      if (old) old.dataset.state = "out";
    };

    const arrive = () => {
      if (!anchor) return;
      phase = "shown";
      const id = currentId();
      const { gesture } = motion();
      if (!reduced) {
        edge.removeAttribute("data-pulse");
        void edge.offsetWidth;
        edge.setAttribute("data-pulse", "");
        if (gesture === "nudge" || gesture === "turn") {
          anchor.el.setAttribute(TOUR_GESTURE_ATTR, gesture);
          gestureEl = anchor.el;
        } else if (gesture === "shimmer") {
          shimmering = true;
          shimmer.hidden = false;
          void shimmer.offsetWidth;
          shimmer.setAttribute("data-run", "");
        }
      }
      bubbleKey += 1;
      setBubble({ key: bubbleKey, index, total: steps.length, id, sidebar: anchor.sidebar });
      trackTourStepViewed({ trigger, n: index + 1, id, steps: steps.length });
    };

    const goTo = (to: number, now: number): boolean => {
      const id = steps[to];
      const next = id ? findTourAnchor(id) : null;
      if (!next) return false;
      leave();
      index = to;
      anchor = next;
      anchorRadius = parseFloat(getComputedStyle(next.el).borderTopLeftRadius);
      corrected = false;
      travelFrom = hole;
      scrollFrom = window.scrollY;
      scrollDuration = reduced ? 0 : scrollDurationMs(targetFor(next) - scrollFrom);
      scrollStart = now;
      phase = "scrolling";
      return true;
    };

    const end = (outcome: TourOutcome) => {
      if (phase === "ended") return;
      phase = "ended";
      window.cancelAnimationFrame(raf);
      stopGesture();
      onDoneRef.current(outcome);
    };

    const finish = (now: number) => {
      trackTourCompleted({ trigger, steps: steps.length, duration_ms: now - startedAt });
      leave();
      phase = "finishing";
      finishStart = now;
      scrollFrom = window.scrollY;
      scrollStart = now;
      scrollDuration = reduced ? 0 : scrollDurationMs(scrollFrom);
      layer.setAttribute("data-finishing", "");
    };

    const loop = (now: number) => {
      raf = window.requestAnimationFrame(loop);
      // A control that re-rendered away (the page redrew it) is found again, or the tour ends.
      if (anchor && !anchor.el.isConnected && phase !== "finishing") {
        const again = findTourAnchor(currentId());
        if (!again) return end("skipped");
        anchor = again;
      }
      switch (phase) {
        case "scrolling": {
          if (!anchor) break;
          const target = targetFor(anchor);
          const k = scrollDuration > 0 ? Math.min(1, (now - scrollStart) / scrollDuration) : 1;
          jump(scrollFrom + (target - scrollFrom) * easeInOutQuad(k));
          if (k >= 1) phase = "settling";
          break;
        }
        case "settling": {
          // Rows that turn as they pass the middle, and folds that measure late, can move
          // the control while the page travels: one correction, then the spotlight goes.
          if (!anchor) break;
          const target = targetFor(anchor);
          if (!corrected && Math.abs(target - window.scrollY) > LANDING_TOLERANCE_PX) {
            corrected = true;
            jump(target);
            break;
          }
          travelStart = now;
          phase = "travelling";
          break;
        }
        case "travelling": {
          if (!anchor) break;
          const to = holeOf(anchor);
          const k = Math.min(1, (now - travelStart) / HOLE_TRAVEL_MS);
          if (!travelFrom || reduced || k >= 1) {
            hole = to;
            arrive();
          } else {
            hole = lerpHole(travelFrom, to, easeInOutQuad(k));
          }
          break;
        }
        case "shown": {
          if (anchor) hole = holeOf(anchor);
          place();
          break;
        }
        case "finishing": {
          const k = scrollDuration > 0 ? Math.min(1, (now - scrollStart) / scrollDuration) : 1;
          jump(scrollFrom * (1 - easeInOutQuad(k)));
          if (k >= 1 && now - finishStart >= FINISH_FADE_MS) return end("completed");
          break;
        }
        default:
          break;
      }
      draw();
    };

    const onResize = () => {
      if (phase === "shown" && anchor) jump(targetFor(anchor));
    };
    window.addEventListener("resize", onResize);

    apiRef.current = {
      next: () => {
        if (phase !== "shown") return;
        const now = performance.now();
        if (index >= steps.length - 1 || !goTo(index + 1, now)) finish(now);
      },
      back: () => {
        if (phase !== "shown" || index <= 0) return;
        trackTourBack({ trigger, to: index, steps: steps.length });
        goTo(index - 1, performance.now());
      },
      skip: (source) => {
        if (phase === "idle" || phase === "finishing" || phase === "ended") return;
        trackTourSkipped({
          trigger,
          at: index + 1,
          id: currentId(),
          steps: steps.length,
          source,
          duration_ms: performance.now() - startedAt,
        });
        leave();
        jump(0);
        end("skipped");
      },
    };

    raf = window.requestAnimationFrame((now) => {
      steps = tourSteps({ includeUnlock }).filter((id) => findTourAnchor(id) !== null);
      if (steps.length === 0) {
        phase = "ended";
        onDoneRef.current("skipped");
        return;
      }
      startedAt = now;
      if (!startedRef.current) {
        startedRef.current = true;
        trackTourStarted({ trigger, steps: steps.length });
      }
      goTo(0, now);
      loop(now);
    });

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      stopGesture();
      apiRef.current = null;
    };
  }, [includeUnlock, trigger]);

  /** Focus to the new bubble's Next, so Enter and Space carry on through the tour. */
  useEffect(() => {
    if (bubble) nextRef.current?.focus({ preventScroll: true });
  }, [bubble]);

  /**
   * The keys (spec card 1755:1276): the arrows move between stops, Escape ends the tour at
   * any of them. Captured first, so nothing behind the tour hears them, and the keys that
   * would scroll the page are kept from it. Tab goes round the bubble's buttons.
   */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const api = apiRef.current;
      if (!api) return;
      // From now on the focused button shows its ring (guidedTour.css): a reader on the
      // keyboard needs it, and a reader who only taps never sees it.
      layerRef.current?.setAttribute("data-keys", "");
      const inBubble =
        event.target instanceof Element && Boolean(bubbleRef.current?.contains(event.target));
      if (event.key === "Escape") {
        // Cancels the close request too, so it ends once, as "escape".
        event.preventDefault();
        api.skip("escape");
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        api.next();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        api.back();
      } else if (event.key === "Tab") {
        const buttons = bubbleRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
        event.preventDefault();
        if (!buttons || buttons.length === 0) return;
        const list = Array.from(buttons);
        const at = inBubble ? list.indexOf(event.target as HTMLElement) : -1;
        const step = event.shiftKey ? -1 : 1;
        const to = at === -1 ? 0 : (at + step + list.length) % list.length;
        list[to]?.focus({ preventScroll: true });
      } else if (SCROLL_KEYS.has(event.key)) {
        // Space on a bubble button presses it; anywhere else it would scroll the page.
        if (event.key === " " && inBubble) return;
        event.preventDefault();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, []);

  if (typeof document === "undefined") return null;

  const last = bubble ? bubble.index === bubble.total - 1 : false;
  const copy = bubble ? TOUR_COPY[bubble.id] : null;
  const body =
    bubble && copy
      ? bubble.id === "chapter_menu" && bubble.sidebar
        ? TOUR_MENU_BODY_SIDEBAR
        : copy.body
      : "";

  return createPortal(
    <div ref={layerRef} className="rv4-tour" data-rv4-tour="">
      <div className="rv4-tour__blocker" />
      <svg ref={svgRef} className="rv4-tour__scrim" aria-hidden="true" focusable="false">
        <path ref={pathRef} fillRule="evenodd" />
      </svg>
      <div ref={edgeRef} className="rv4-tour__edge" aria-hidden="true" />
      <div ref={shimmerRef} className="rv4-tour__shimmer" aria-hidden="true">
        <span />
      </div>
      {bubble && copy && (
        <div
          key={bubble.key}
          ref={bubbleRef}
          className="rv4-tour__bubble"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${ids}-title`}
          aria-describedby={`${ids}-step ${ids}-body`}
          data-state="measuring"
          data-placement="below"
          data-step={bubble.id}
        >
          <span ref={arrowRef} className="rv4-tour__arrow" aria-hidden="true" />
          <div className="rv4-tour__card">
            <p id={`${ids}-step`} className="rv4-tour__step">
              {tourStepLabel(bubble.index + 1, bubble.total)}
            </p>
            <h2 id={`${ids}-title`} className="rv4-tour__title">
              {copy.title}
            </h2>
            <p id={`${ids}-body`} className="rv4-tour__body">
              {body}
            </p>
            <div className="rv4-tour__actions">
              {!last && (
                <button
                  type="button"
                  className="rv4-tour__skip"
                  onClick={() => apiRef.current?.skip("skip_button")}
                >
                  {TOUR_LABELS.skip}
                </button>
              )}
              <span className="rv4-tour__nav">
                {bubble.index > 0 && (
                  <button
                    type="button"
                    className="rv4-tour__back"
                    onClick={() => apiRef.current?.back()}
                  >
                    {TOUR_LABELS.back}
                  </button>
                )}
                <button
                  ref={nextRef}
                  type="button"
                  className="rv4-tour__next"
                  onClick={() => apiRef.current?.next()}
                >
                  {last ? TOUR_LABELS.finish : TOUR_LABELS.next}
                </button>
              </span>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
};

export default V4GuidedTour;
