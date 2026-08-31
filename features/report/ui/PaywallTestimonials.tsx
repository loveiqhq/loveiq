"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FC,
  type PointerEvent as ReactPointerEvent,
} from "react";
import Image from "next/image";
import { trackTestimonialInteraction } from "@features/analytics/client";

/**
 * "Real people. Real insights. Real results." testimonials carousel.
 *
 * Rendered by ReportPricingModal. It was shared with a second paywall modal
 * until that one (the forced wall) was removed on 2026-08-31. Continuous leftward
 * auto-scroll with a float-accumulator (see the auto-scroll effect — reading
 * back the integer-rounded scrollLeft each frame dropped the sub-pixel delta and
 * stuttered), grab-to-pan (mouse), click-to-pause, prev/next arrows, and a dots
 * status indicator between the arrows that tracks the centered review.
 *
 * Styling lives under `.report-pricing-modal--white .rpm-tm*` / `.rpm-dots` in
 * globals.css — both host modals carry the `--white` class, so it applies to
 * both with no extra CSS. `open` gates + reseeds the animation with the modal.
 */

const BRAND_GRADIENT = "linear-gradient(120deg, #ff6a3a 0%, #cf5afb 52%, #7d88ff 100%)";
const gradientTextStyle: CSSProperties = {
  backgroundImage: BRAND_GRADIENT,
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  color: "transparent",
};

function StarRow() {
  return (
    <div style={{ display: "flex", gap: "3px" }} aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <svg key={i} width="18" height="18" viewBox="0 0 20 20" fill="#fe6839">
          <path d="M10 1.5l2.47 5.01 5.53.8-4 3.9.94 5.5L10 14.1l-4.94 2.6.94-5.5-4-3.9 5.53-.8L10 1.5Z" />
        </svg>
      ))}
    </div>
  );
}

const TESTIMONIALS = [
  {
    name: "Dorian",
    age: 34,
    role: "File manager",
    avatarSrc: "/testimonials/dorian.jpg",
    pre: "The ",
    emph: "results are extensive and spot-on",
    post: ", without the test being too long. I got to know myself better, and it will help my partner understand me better as well.",
  },
  {
    name: "Philipp Leonhard",
    age: 42,
    role: "Product Owner IT",
    avatarSrc: "/testimonials/philipp.jpg",
    pre: "I’d never really explored my sexuality or the patterns behind it before. I already learned a lot just from taking the test, but ",
    emph: "the insights in the full report were truly eye-opening.",
    post: " Absolutely worth it.",
  },
  {
    name: "Richard Petrich",
    age: 34,
    role: "Entrepreneur",
    avatarSrc: "/testimonials/richard.jpg",
    pre: "The results were ",
    emph: "more insightful than I expected.",
    post: " It connected dots between emotional triggers and communication styles I hadn’t noticed before. Solid UX, too.",
  },
  {
    name: "Marija Mustapić",
    age: 41,
    role: "Marketing Lead",
    avatarSrc: "/testimonials/marija.jpg",
    pre: "Unlocking my report was ",
    emph: "one of the best investments made for my sexuality.",
    post: " It is shockingly precise.",
  },
] as const;

// Overlapping rating-cluster avatars (curated, matched to real photos).
const RATING_AVATARS = [
  "/testimonials/rating-1.jpg",
  "/testimonials/rating-2.jpg",
  "/testimonials/rating-3.jpg",
];

// Viewport hover-tooltip strings. Shared by the JSX default, the pause toggle,
// and the close reset so the imperative setAttribute can't drift from the JSX.
const TM_HINT_DEFAULT = "Drag to browse · click to pause";
const TM_HINT_PAUSED = "Click to resume";

interface Props {
  /** Mirrors the host modal's open state — gates + reseeds the auto-scroll. */
  open: boolean;
}

const PaywallTestimonials: FC<Props> = ({ open }) => {
  const tmViewportRef = useRef<HTMLDivElement>(null);
  const tmPausedRef = useRef(false);
  const tmManualRef = useRef(false);
  // Float source-of-truth for the auto-scroll position — kept separate from
  // vp.scrollLeft, which rounds to an integer px (reading it back each frame
  // dropped the sub-pixel delta → the stutter).
  const tmPosRef = useRef(0);
  // Timer id for the manual-scroll suspend window; cleared before re-arming so
  // rapid arrow/dot/drag interactions extend it from the LATEST action instead
  // of ending it when the oldest timer fires (which could let the auto-scroll
  // fight an in-flight smooth scroll).
  const tmManualTimerRef = useRef<number | null>(null);
  // Cached per-card stride (px). Measured once from two cards, then reused so
  // onTmScroll doesn't querySelectorAll + read layout on every auto-scroll frame.
  // Invalidated (→0) on close and on viewport resize (see the ResizeObserver
  // effect) so a breakpoint change re-measures and the dot stays in sync.
  const tmStrideRef = useRef(0);
  // Which review is nearest the viewport's left edge — drives the dots status.
  const [activeDot, setActiveDot] = useState(0);

  // Pause is ref-only: the motion halting IS the visible feedback (the rAF reads
  // the ref), so no state/re-render is needed — which also avoids a state/ref
  // desync inverting the toggle across close/reopen.
  const toggleTmPause = useCallback(() => {
    tmPausedRef.current = !tmPausedRef.current;
    // Reflect pause state in the tooltip without re-rendering (desktop hover hint
    // only — touch devices never show title tooltips). The motion halting is the
    // primary feedback; this is just the secondary cue.
    tmViewportRef.current?.setAttribute(
      "title",
      tmPausedRef.current ? TM_HINT_PAUSED : TM_HINT_DEFAULT
    );
    trackTestimonialInteraction(tmPausedRef.current ? "pause" : "resume");
  }, []);

  // Suspend the auto-scroll for `ms` while a user-driven smooth scroll runs.
  // Clearing any prior timer first means rapid clicks extend the window from the
  // latest interaction rather than ending it when the oldest timer fires.
  const suspendAutoScroll = useCallback((ms: number) => {
    tmManualRef.current = true;
    if (tmManualTimerRef.current !== null) window.clearTimeout(tmManualTimerRef.current);
    tmManualTimerRef.current = window.setTimeout(() => {
      tmManualRef.current = false;
      tmManualTimerRef.current = null;
    }, ms);
  }, []);

  // Arrow nudge: jump one card and briefly suspend the auto-scroll so the smooth
  // scroll isn't fought by the rAF loop, then auto-scroll resumes.
  const nudgeTm = useCallback(
    (dir: number) => {
      // Inert while paused: the carousel is stopped, so there's nothing to nudge
      // — and it avoids starting a smooth scroll that a resume-tap would then
      // cancel mid-glide by un-gating the rAF.
      if (tmPausedRef.current) return;
      const vp = tmViewportRef.current;
      if (!vp) return;
      // Derive the per-card stride from two measured cards so the nudge is
      // breakpoint-correct (the track gap is 24px desktop / 16px mobile) and
      // matches the auto-scroll + dot math. Fall back to one card + desktop gap.
      const cards = vp.querySelectorAll<HTMLElement>(".rpm-tm-card");
      const amount =
        cards.length >= 2
          ? cards[1]!.offsetLeft - cards[0]!.offsetLeft
          : (cards[0]?.offsetWidth ?? 360) + 24;
      vp.scrollBy({ left: dir * amount, behavior: "smooth" });
      suspendAutoScroll(520);
      trackTestimonialInteraction(dir > 0 ? "next" : "prev");
    },
    [suspendAutoScroll]
  );

  // Jump to a specific review from its dot. Suspends auto-scroll like a nudge.
  const goToTestimonial = useCallback(
    (index: number) => {
      // Inert while paused (same reason as nudgeTm).
      if (tmPausedRef.current) return;
      const vp = tmViewportRef.current;
      if (!vp) return;
      const cards = vp.querySelectorAll<HTMLElement>(".rpm-tm-card");
      const card = cards[index];
      if (!card) return;
      vp.scrollTo({ left: card.offsetLeft, behavior: "smooth" });
      suspendAutoScroll(520);
    },
    [suspendAutoScroll]
  );

  // Update the active dot from the scroll position (fires on auto-scroll too, so
  // the status advances on its own). Guarded so it only re-renders on change.
  const onTmScroll = useCallback(() => {
    const vp = tmViewportRef.current;
    if (!vp) return;
    // Reuse the cached stride so this handler — which fires every auto-scroll
    // frame — doesn't querySelectorAll + read layout each time. Measure once.
    let stride = tmStrideRef.current;
    if (stride <= 0) {
      const cards = vp.querySelectorAll<HTMLElement>(".rpm-tm-card");
      if (cards.length < 2) return;
      stride = cards[1]!.offsetLeft - cards[0]!.offsetLeft;
      if (stride <= 0) return;
      tmStrideRef.current = stride;
    }
    const index = Math.round(vp.scrollLeft / stride) % TESTIMONIALS.length;
    setActiveDot((prev) => (prev === index ? prev : index));
  }, []);

  // Continuous leftward auto-scroll. The track renders the testimonials twice,
  // so wrapping by one set width loops seamlessly.
  useEffect(() => {
    if (!open) return;
    const vp = tmViewportRef.current;
    if (!vp) return;
    // Respect reduced-motion: skip the perpetual JS auto-scroll entirely — a CSS
    // media query can't stop a JS scrollLeft loop. Arrows + dots still let these
    // users browse manually. (Matches the matchMedia pattern used elsewhere in
    // features/report.)
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    // Seed the float accumulator from the live offset so resuming is seamless.
    tmPosRef.current = vp.scrollLeft;
    let raf = 0;
    let last = 0;
    // One-set scroll distance for the seamless wrap, derived from the card stride
    // (× review count) once cards are measured, then cached. scrollWidth/2 is
    // ~10px short of one set (track padding + the boundary gap), which caused a
    // tiny periodic hitch at each wrap.
    let periodPx = 0;
    const tick = (ts: number) => {
      raf = requestAnimationFrame(tick);
      const dt = last ? ts - last : 0;
      last = ts;
      // While the user drives it (drag / arrow nudge / paused), keep the float in
      // sync with the real offset and don't fight them.
      if (tmPausedRef.current || tmManualRef.current) {
        tmPosRef.current = vp.scrollLeft;
        return;
      }
      if (periodPx <= 0) {
        const cards = vp.querySelectorAll<HTMLElement>(".rpm-tm-card");
        if (cards.length >= 2) {
          const stride = cards[1]!.offsetLeft - cards[0]!.offsetLeft;
          if (stride > 0) periodPx = stride * TESTIMONIALS.length;
        }
      }
      // Advance a FLOAT accumulator instead of reading back vp.scrollLeft (the
      // getter rounds to an integer CSS px, dropping the ~0.77px/frame delta —
      // the stutter). Modulo one set wraps seamlessly (the track is doubled).
      const wrap = periodPx > 0 ? periodPx : vp.scrollWidth / 2;
      if (wrap <= 0) return;
      tmPosRef.current = (tmPosRef.current + (dt / 1000) * 46) % wrap;
      vp.scrollLeft = tmPosRef.current;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [open]);

  // Mouse grab-to-pan (desktop). Touch/pen keep native momentum scrolling, so we
  // only hijack the pointer for mice. A real drag suspends the auto-scroll and
  // swallows the trailing click so it doesn't also toggle pause.
  const tmDragRef = useRef({
    active: false,
    startX: 0,
    startScroll: 0,
    moved: false,
    pointerId: 0,
  });
  const tmSuppressClickRef = useRef(false);

  const onTmPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse") {
      // Touch/pen: don't hijack the pointer — let native (momentum) scrolling
      // drive. Just suspend the auto-scroll rAF so it doesn't fight the finger
      // (it writes scrollLeft every frame, which otherwise springs a swipe
      // back). Resumed shortly after the gesture ends in endTmDrag.
      tmManualRef.current = true;
      return;
    }
    const vp = tmViewportRef.current;
    if (!vp) return;
    tmDragRef.current = {
      active: true,
      startX: e.clientX,
      startScroll: vp.scrollLeft,
      moved: false,
      pointerId: e.pointerId,
    };
    tmManualRef.current = true;
    try {
      vp.setPointerCapture(e.pointerId);
    } catch {
      /* capture is best-effort */
    }
    vp.style.cursor = "grabbing";
  }, []);

  const onTmPointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = tmDragRef.current;
    if (!drag.active) return;
    const vp = tmViewportRef.current;
    if (!vp) return;
    const dx = e.clientX - drag.startX;
    if (Math.abs(dx) > 4) drag.moved = true;
    vp.scrollLeft = drag.startScroll - dx;
  }, []);

  const endTmDrag = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const drag = tmDragRef.current;
      if (!drag.active) {
        // Touch/pen swipe end (no mouse drag was active): resume the auto-scroll
        // after a grace window so iOS momentum scrolling settles first. A bare
        // mouse pointerleave (no gesture) stays a no-op.
        if (e.pointerType !== "mouse") suspendAutoScroll(1000);
        return;
      }
      drag.active = false;
      const vp = tmViewportRef.current;
      if (vp) {
        try {
          vp.releasePointerCapture(e.pointerId);
        } catch {
          /* no-op */
        }
        vp.style.cursor = "";
      }
      if (drag.moved) {
        tmSuppressClickRef.current = true;
        trackTestimonialInteraction("drag");
      }
      suspendAutoScroll(400);
    },
    [suspendAutoScroll]
  );

  const onTmClick = useCallback(() => {
    if (tmSuppressClickRef.current) {
      tmSuppressClickRef.current = false;
      return;
    }
    // Nothing to pause when reduced-motion disabled the auto-scroll — skip the
    // toggle so a stray viewport tap can't silently gate the arrows/dots, which
    // are these users' only browse controls.
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    toggleTmPause();
    // A tap is an intentional pause/resume, not a momentum swipe — cancel any
    // suspend armed on pointer-up (endTmDrag arms ~1s for touch so iOS momentum
    // can settle). Without this, a RESUME tap would sit motionless until that
    // window expired. Pausing still halts the rAF via tmPausedRef.
    tmManualRef.current = false;
    if (tmManualTimerRef.current !== null) {
      window.clearTimeout(tmManualTimerRef.current);
      tmManualTimerRef.current = null;
    }
  }, [toggleTmPause]);

  // Reset transient interaction state when the modal closes, so a drag (or pause)
  // left mid-gesture doesn't swallow the first click or freeze the next open.
  useEffect(() => {
    if (open) return;
    tmSuppressClickRef.current = false;
    tmManualRef.current = false;
    tmDragRef.current.active = false;
    // Clear any user-set pause so the carousel auto-scrolls again on the next
    // open — both hosts keep this component mounted across close/reopen, so a
    // pause would otherwise leave it frozen (and looking broken) on reopen.
    tmPausedRef.current = false;
    // Keep the imperatively-written tooltip (see toggleTmPause) in sync with the
    // reset pause state — React won't restore the static JSX title on reopen
    // since both hosts keep this mounted across close/reopen.
    tmViewportRef.current?.setAttribute("title", TM_HINT_DEFAULT);
    // Drop the cached stride so a reopen re-measures (handles a breakpoint change
    // while the modal was closed).
    tmStrideRef.current = 0;
    if (tmManualTimerRef.current !== null) {
      window.clearTimeout(tmManualTimerRef.current);
      tmManualTimerRef.current = null;
    }
  }, [open]);

  // Clear any pending suspend timer on unmount (the reset effect above only runs
  // on close, and both hosts keep this mounted while open — so unmount-while-open
  // would otherwise leave a stray timer with no owning instance).
  useEffect(
    () => () => {
      if (tmManualTimerRef.current !== null) window.clearTimeout(tmManualTimerRef.current);
    },
    []
  );

  // Invalidate the cached stride on any viewport resize so a breakpoint change
  // (rotate / window resize crossing the 640px gap breakpoint) re-measures — the
  // dot readout then stays in sync with the live nudge/goTo stride.
  useEffect(() => {
    const vp = tmViewportRef.current;
    if (!vp || typeof ResizeObserver === "undefined") return;
    // Only a width change alters the card stride — ignore same-width reflows and
    // the initial observe() fire so the cache isn't dropped needlessly.
    let lastW = vp.clientWidth;
    const ro = new ResizeObserver(() => {
      const w = vp.clientWidth;
      if (w !== lastW) {
        lastW = w;
        tmStrideRef.current = 0;
      }
    });
    ro.observe(vp);
    return () => ro.disconnect();
  }, []);

  return (
    <section className="rpm-tm">
      <h3 className="rpm-section-h">
        Real <em style={gradientTextStyle}>people</em>. Real{" "}
        <em style={gradientTextStyle}>insights</em>. Real <em style={gradientTextStyle}>results</em>
        .
      </h3>

      <div className="rpm-tm__rating">
        <div className="rpm-tm__avatars" aria-hidden="true">
          {RATING_AVATARS.map((src) => (
            <Image
              key={src}
              src={src}
              alt=""
              width={40}
              height={40}
              className="rpm-tm__avatar-img"
              sizes="40px"
            />
          ))}
        </div>
        <span className="rpm-tm__rating-text">4.9/5 Rating</span>
      </div>

      <div
        className="rpm-tm__viewport"
        ref={tmViewportRef}
        role="group"
        aria-label="Customer reviews"
        title={TM_HINT_DEFAULT}
        onScroll={onTmScroll}
        onPointerDown={onTmPointerDown}
        onPointerMove={onTmPointerMove}
        onPointerUp={endTmDrag}
        onPointerLeave={endTmDrag}
        onPointerCancel={endTmDrag}
        onClick={onTmClick}
      >
        <div className="rpm-tm__track">
          {[...TESTIMONIALS, ...TESTIMONIALS].map((t, i) => (
            <figure
              key={`${t.name}-${i}`}
              className="rpm-tm-card"
              aria-hidden={i >= TESTIMONIALS.length ? true : undefined}
            >
              <div className="rpm-tm-card__person">
                <Image
                  src={t.avatarSrc}
                  alt={t.name}
                  width={72}
                  height={72}
                  className="rpm-tm-card__photo"
                  sizes="72px"
                />
                <figcaption className="rpm-tm-card__id">
                  <span className="rpm-tm-card__name">
                    {t.name}, {t.age}
                  </span>
                  <span className="rpm-tm-card__role">{t.role}</span>
                  <StarRow />
                </figcaption>
              </div>
              <blockquote className="rpm-tm-card__quote">
                {t.pre}
                <em>{t.emph}</em>
                {t.post}
              </blockquote>
            </figure>
          ))}
        </div>
      </div>

      <div className="rpm-tm__nav">
        <button
          type="button"
          aria-label="Previous reviews"
          className="rpm-cnav-btn"
          onClick={(e) => {
            e.stopPropagation();
            nudgeTm(-1);
          }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M10 12 6 8l4-4"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <div className="rpm-dots">
          {TESTIMONIALS.map((t, i) => (
            <button
              key={t.name}
              type="button"
              aria-label={`Go to review ${i + 1}`}
              aria-current={activeDot === i ? "true" : undefined}
              className={`rpm-dot${activeDot === i ? " is-active" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                goToTestimonial(i);
              }}
            />
          ))}
        </div>
        <button
          type="button"
          aria-label="Next reviews"
          className="rpm-cnav-btn"
          onClick={(e) => {
            e.stopPropagation();
            nudgeTm(1);
          }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M6 12l4-4-4-4"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </section>
  );
};

export default PaywallTestimonials;
