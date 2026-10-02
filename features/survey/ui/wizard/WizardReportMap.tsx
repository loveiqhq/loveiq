"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FC,
  type ReactNode,
} from "react";
import Image from "next/image";
import { REPORT_DEEP_DIVES } from "@/data/report-deep-dives";
import { WIZARD_DRAWER, type WizardDrawerRow } from "./wizardContent";

/**
 * Slide 2 — the report map. Figma 1049:1627 (the overview: drawer + pitch copy) and
 * 1049:1979 / 2092 / 2207 / 2322 (the four deep-dive tiles, one state each).
 *
 * `step` 0 is the overview; 1-4 show deep dive `step`, marked in the drawer beside it.
 * Everything is placed on Figma's 393 canvas, relative to the content box that starts at
 * (24, 36) since Mark's 01.10 round: the drawer at its top-left, the pitch in the column
 * at x 165 and the tiles in the one at x 156.
 */
export const MAP_STEPS = REPORT_DEEP_DIVES.length;

const DEEP_DIVE_INDEX = new Map(REPORT_DEEP_DIVES.map((d, i) => [d.id, i + 1]));
const TILE_PITCH = 314; // 302 tall + 12 between (1049:2034)
/** A drag on the tiles this far, and more up or down than sideways, steps them. */
const TILE_SWIPE = 40;
const CANVAS_HEIGHT = 640;
/** Where the desktop layout starts (wizard-desktop.css). */
const DESKTOP_MIN = 1024;
/** The drawer's own height, and the tiles' block: its 20 spacer, the 475 track, 14 and the controls' 32. */
const DRAWER_HEIGHT = 597;
const TILES_HEIGHT = 541;

const clamp = (min: number, value: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * What a desktop slide's chrome takes of the window's height, as wizard-desktop.css sets
 * it: the frame's padding top and bottom and the footer's, then the footer as the phone
 * stacks it since Mark's 01.10 round (1049:1161): the 48px buttons, 24, the 3.2 bar and
 * the 24px counter row.
 */
export function desktopChrome(viewportHeight: number) {
  const frame = clamp(24, viewportHeight * 0.05, 53);
  const gap = clamp(24, viewportHeight * 0.045, 48);
  return 2 * frame + gap + 48 + 24 + 3.2 + 24;
}

/**
 * A desktop map's zooms: the drawer and the tiles each take the height the chrome
 * leaves, the drawer up to 1.35 and the tiles to 1.5. A laptop's window is shorter than
 * the phone's 640 canvas plus the chrome, so they shrink below 1 rather than push
 * CONTINUE off it, down to 0.65; a window too short even for that scrolls.
 */
export function mapZoom(viewportHeight: number) {
  const room = viewportHeight - desktopChrome(viewportHeight);
  return {
    drawer: clamp(0.65, room / DRAWER_HEIGHT, 1.35),
    tiles: clamp(0.65, room / TILES_HEIGHT, 1.5),
  };
}

const JAKARTA = "var(--font-jakarta), var(--font-sans)";
const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

interface WizardReportMapProps {
  step: number;
  onStep: (to: number, control: "next" | "previous") => void;
}

/* ------------------------------------------------------------------ */
/*  The drawer — 1049:1831, a cropped instance of the drawer 856:243   */
/* ------------------------------------------------------------------ */

/**
 * One chapter row, 18.8 tall on a 20.762 pitch (the drawer panel's own metrics). The
 * dashed outline, the active marker and the pointer all hang off the row, 1px wider
 * than it each side, so they cannot drift from it.
 *
 * The type is 1049:1832's (Mark, 01.10: "Updated fonts and font sizes"): the report's
 * panel at 0.4905, its labels overridden to 7px, Regular, the four featured chapters
 * SemiBold, 3.9 from their badge.
 */
const DrawerRow: FC<{ row: WizardDrawerRow; step: number }> = ({ row, step }) => {
  const dive = DEEP_DIVE_INDEX.get(row.id);
  const active = dive !== undefined && dive === step;
  const isCoreArchetype = row.id === "core_archetype";
  return (
    <div
      data-wizard-row={row.id}
      data-marked={active ? "active" : undefined}
      className="relative flex h-[18.8px] items-center gap-[3.9px] rounded-[12px] pl-[13.73px] pr-[1.5px]"
      style={isCoreArchetype ? { background: "rgba(192,132,252,0.1)" } : undefined}
    >
      {isCoreArchetype ? (
        // The report opens on Core Archetype, so the drawer marks it as the current row.
        <span className="absolute left-[5.887px] top-[7.528px] h-[2.943px] w-[2.943px]">
          <Image
            src="/survey/wizard/nav-dot.svg"
            alt=""
            width={10.791}
            height={10.791}
            unoptimized
            className="absolute inset-[-133.33%] block h-auto w-auto max-w-none"
          />
        </span>
      ) : null}
      {/* 1049:1832 as Mark set it on 02.10 ("Font color match"; the sync: "let's just find
       * one color and stick to it"): the free and featured rows SemiBold, the locked ones
       * Regular, every label #3f3a4d, the current row's too; its wash and dot mark it. */}
      <span
        className={`min-w-0 flex-1 truncate text-[7px] leading-[9.81px] ${
          row.badge === "locked" ? "font-normal" : "font-semibold"
        }`}
        style={{ fontFamily: JAKARTA, color: "#3f3a4d" }}
      >
        {row.label}
      </span>
      {row.badge === "free" ? (
        <span
          className="flex h-[9.905px] shrink-0 items-center rounded-[2.943px] bg-white px-[3.924px] text-[4.51px] font-semibold leading-[4.513px] tracking-[0.271px] text-[#4a4657]"
          style={{ fontFamily: JAKARTA, border: "0.491px solid rgba(22,16,33,0.13)" }}
        >
          FREE
        </span>
      ) : (
        <Image
          src={
            row.badge === "open" ? "/survey/wizard/nav-open.svg" : "/survey/wizard/nav-locked.svg"
          }
          alt=""
          width={6.867}
          height={6.867}
          unoptimized
          className="block h-[6.867px] w-[6.867px] shrink-0"
        />
      )}
      {/* Outlines: the four deep dives always, the free rows on the overview only. */}
      {dive !== undefined || (row.badge === "free" && step === 0) ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 -left-px -right-px rounded-[6px] border border-dashed transition-opacity duration-300 motion-reduce:transition-none"
          style={{
            borderColor: dive !== undefined ? "rgba(254,104,57,0.4)" : "rgba(46,125,91,0.4)",
          }}
        />
      ) : null}
      {active ? (
        <>
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 -left-px -right-px rounded-[6px]"
            style={{ background: "rgba(254,104,57,0.16)", border: "1.5px solid #fe6839" }}
          />
          {/* 1049:2027 — at x 169.6 on the canvas: 8.89 past the row's right edge. */}
          <Image
            src="/survey/wizard/pointer.svg"
            alt=""
            width={7}
            height={10}
            unoptimized
            className="pointer-events-none absolute left-[calc(100%+8.89px)] top-[4.4px] block h-[10px] w-[7px]"
          />
        </>
      ) : null}
    </div>
  );
};

const Drawer: FC<{ step: number }> = ({ step }) => (
  <div
    aria-hidden
    className="wz-drawer absolute left-0 top-0 h-[597px] w-[142.6px] rounded-[14px] bg-white"
    style={{
      border: "1px solid rgba(167,139,250,0.35)",
      boxShadow: "0 12px 32px 0 rgba(13,5,20,0.45)",
    }}
  >
    {/* The panel's pill and "Refer a friend" sit above the crop; the list starts 5.266 down. */}
    <div className="flex flex-col gap-[6.9px] px-[4.8905px] pt-[5.266px]">
      {WIZARD_DRAWER.map((part) => (
        <div key={part.part} className="flex flex-col gap-[1.962px]">
          <div className="min-h-[13.924px] px-[2px] pb-[0.981px] pt-[2.943px]">
            <p
              className="w-[132.927px] bg-clip-text text-[5.4px] font-bold uppercase leading-[9.133px] tracking-[0.883px] text-transparent"
              style={{
                fontFamily: JAKARTA,
                backgroundImage: "linear-gradient(90deg, #d05976 0%, #c167cf 48%, #8887f6 100%)",
              }}
            >
              {`${part.part} · ${part.label}`}
            </p>
          </div>
          {part.rows.map((row) => (
            <DrawerRow key={row.id} row={row} step={step} />
          ))}
        </div>
      ))}
    </div>
  </div>
);

/* ------------------------------------------------------------------ */
/*  ▲ ▼ and the dots — 1049:1614 / 1049:2082                           */
/* ------------------------------------------------------------------ */

/** 1049:1620 / 1049:1622, drawn as the frame draws them; a disabled one dims its ring and chevron. */
const DeepDiveArrow: FC<{ up: boolean; enabled: boolean }> = ({ up, enabled }) => (
  <svg aria-hidden width="32" height="32" viewBox="0 0 32 32" fill="none" className="block">
    <rect width="32" height="32" rx="16" fill="white" fillOpacity="0.08" />
    <rect
      x="0.5"
      y="0.5"
      width="31"
      height="31"
      rx="15.5"
      stroke="white"
      strokeOpacity={enabled ? 0.35 : 0.12}
    />
    <path
      d={up ? "M11 18.5L16 13.5L21 18.5" : "M11 13.5L16 18.5L21 13.5"}
      opacity={enabled ? 1 : 0.3}
      stroke="white"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/** 157 wide under the pitch (1049:1614), the column's full 189 under the tiles (1049:2082). */
const TileControls: FC<WizardReportMapProps & { width: number }> = ({ step, onStep, width }) => {
  const canUp = step > 1;
  const canDown = step < MAP_STEPS;
  // The overview shows the first dot, as its frame does.
  const dot = Math.max(step, 1);
  return (
    <div className="wz-controls flex items-center gap-2" style={{ width }}>
      <div aria-hidden className="flex min-w-0 flex-1 items-center gap-[5px]">
        {REPORT_DEEP_DIVES.map((d, i) => (
          <span
            key={d.id}
            className="block h-[6px] rounded-[3px] transition-[width,background-color] duration-300 motion-reduce:transition-none"
            style={{
              width: i + 1 === dot ? 18 : 6,
              background: i + 1 === dot ? "#fe6839" : "rgba(255,255,255,0.3)",
            }}
          />
        ))}
      </div>
      {/* 32px as drawn; the ::after makes the tap target 44px. aria-disabled, not
       * disabled, at an end: a disabled button drops the keyboard's focus. */}
      <button
        type="button"
        aria-label="Previous deep dive"
        aria-disabled={!canUp || undefined}
        onClick={() => {
          if (canUp) onStep(step - 1, "previous");
        }}
        className="relative shrink-0 rounded-full after:absolute after:-inset-1.5 after:content-[''] focus-visible-ring aria-disabled:cursor-default"
      >
        <DeepDiveArrow up enabled={canUp} />
      </button>
      <button
        type="button"
        aria-label="Next deep dive"
        aria-disabled={!canDown || undefined}
        onClick={() => {
          if (canDown) onStep(step + 1, "next");
        }}
        className="relative shrink-0 rounded-full after:absolute after:-inset-1.5 after:content-[''] focus-visible-ring aria-disabled:cursor-default"
      >
        <DeepDiveArrow up={false} enabled={canDown} />
      </button>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  The overview's pitch — 1049:1638                                   */
/* ------------------------------------------------------------------ */

const Pitch: FC<{ icon: "free" | "open" | "locked"; top: number; children: ReactNode }> = ({
  icon,
  top,
  children,
}) => (
  <div
    className="wz-pitch-item flex flex-col items-start pt-[var(--wz-pitch-gap)]"
    style={{ "--wz-pitch-gap": `${top}px` } as CSSProperties}
  >
    {icon === "free" ? (
      <span
        className="wz-pitch-badge flex rounded-[4px] px-[5px] py-[2px] font-sans text-[8px] font-bold uppercase leading-[10px] tracking-[0.5px] text-[#ffb89c]"
        style={{ background: "rgba(255,158,122,0.16)", border: "1px solid rgba(255,158,122,0.35)" }}
      >
        Free
      </span>
    ) : (
      <Image
        src={icon === "open" ? "/survey/wizard/badge-open.svg" : "/survey/wizard/badge-locked.svg"}
        alt=""
        width={18}
        height={18}
        unoptimized
        className="wz-pitch-icon block h-[18px] w-[18px]"
      />
    )}
    {children}
  </div>
);

/* ------------------------------------------------------------------ */
/*  The deep-dive tiles — 1049:2033                                     */
/* ------------------------------------------------------------------ */

/**
 * 475 tall, as states 2-4 draw it (1049:2146 / 2261 / 2376): its controls then end at
 * y 645 with the drawer. State 1's frame still has the earlier 409 (1049:2033).
 *
 * Notion, 01.10 (Wizard - Mobile): "Can we make the tiles swipable and the hidden tile
 * clickable please". A swipe up the tiles shows the next deep dive, down the one before; a
 * tap on the tile peeking in below brings it up. Pointer shortcuts both, as the loop's
 * cards in the report are: ▲ ▼ stay the keyboard's way, and the analytics count them the
 * same. The window takes the page's touch panning; a sideways swipe still moves the slide.
 */
const Tiles: FC<WizardReportMapProps> = ({ step, onStep }) => {
  const start = useRef<{ x: number; y: number } | null>(null);
  const go = (to: number) => {
    if (to >= 1 && to <= MAP_STEPS && to !== step) onStep(to, to > step ? "next" : "previous");
  };
  return (
    <div
      className="relative h-[475px] touch-none overflow-hidden"
      onTouchStart={(e) => {
        const t = e.touches[0];
        start.current = t ? { x: t.clientX, y: t.clientY } : null;
      }}
      onTouchEnd={(e) => {
        const from = start.current;
        const t = e.changedTouches[0];
        start.current = null;
        if (!from || !t) return;
        const dx = from.x - t.clientX;
        const dy = from.y - t.clientY;
        if (Math.abs(dy) <= TILE_SWIPE || Math.abs(dy) <= Math.abs(dx)) return;
        go(step + (dy > 0 ? 1 : -1));
      }}
    >
      <div
        className="absolute left-0 top-0 flex w-[189px] flex-col gap-3 transition-transform duration-500 motion-reduce:transition-none"
        style={{
          transform: `translateY(${-(Math.max(step, 1) - 1) * TILE_PITCH}px)`,
          transitionTimingFunction: EASE,
        }}
      >
        {REPORT_DEEP_DIVES.map((dive, i) => {
          const active = i + 1 === step;
          return (
            <div
              key={dive.id}
              data-deep-dive={dive.id}
              aria-current={active ? "step" : undefined}
              aria-hidden={active ? undefined : true}
              onClick={active ? undefined : () => go(i + 1)}
              className={`relative flex h-[302px] w-full shrink-0 flex-col items-start gap-2 overflow-hidden rounded-[18px] bg-white px-[14px] py-4 transition-opacity duration-500 motion-reduce:transition-none${
                active ? "" : " cursor-pointer"
              }`}
              style={{ border: "1px solid rgba(168,85,247,0.4)", opacity: active ? 1 : 0.4 }}
            >
              {/* Challenges' own state (1049:2287) carries a rose wash; the other three have none. */}
              {dive.id === "challenges_in_partnership" ? (
                <Image
                  src="/survey/wizard/wash-rose.svg"
                  alt=""
                  width={220}
                  height={190}
                  unoptimized
                  className="pointer-events-none absolute left-[69px] top-[199px] block h-[190px] w-[220px] max-w-none"
                />
              ) : null}
              <Image
                src="/survey/wizard/tile-open.svg"
                alt=""
                width={14.4}
                height={14.4}
                unoptimized
                className="relative block h-[14.4px] w-[14.4px]"
              />
              <h3 className="relative w-full font-serif text-[15px] font-bold leading-[19px] text-[#161021]">
                {dive.title}
              </h3>
              <p className="relative w-full font-serif text-[16px] font-medium leading-[21px] text-[#161021]">
                {dive.question}
              </p>
              <p
                className="relative w-full text-[12px] font-normal leading-[18px] text-[#3f3a4d]"
                style={{ fontFamily: JAKARTA }}
              >
                {dive.support}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  The slide                                                          */
/* ------------------------------------------------------------------ */

const WizardReportMap: FC<WizardReportMapProps> = ({ step, onStep }) => {
  const overview = step === 0;
  const fade = (shown: boolean) => ({
    opacity: shown ? 1 : 0,
    visibility: shown ? ("visible" as const) : ("hidden" as const),
    transition: `opacity 300ms ${EASE}, visibility 0s linear ${shown ? "0s" : "300ms"}`,
  });

  // The canvas is 345 x 640, the slide's own box on a phone, which the wizard draws at its
  // fit's scale with every other slide (wizardFit): never scaled here as well. On a desktop
  // its parts take a grid (wizard-desktop.css), zoomed to the window's height.
  const boxRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState({ desktop: false, zoom: { drawer: 1, tiles: 1 } });
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box || typeof ResizeObserver === "undefined") return;
    const fit = () =>
      setLayout({
        desktop: window.innerWidth >= DESKTOP_MIN,
        zoom: mapZoom(window.innerHeight),
      });
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    window.addEventListener("resize", fit);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, []);

  // The overview and the tiles each draw their own ▲ ▼, one set hidden while the other
  // shows. A press that swaps them would leave focus on a button about to be hidden, so
  // it moves to the same arrow in the set coming in.
  const overviewRef = useRef<HTMLDivElement>(null);
  const tilesRef = useRef<HTMLDivElement>(null);
  const lastStepRef = useRef(step);
  useEffect(() => {
    const was = lastStepRef.current;
    lastStepRef.current = step;
    if ((was === 0) === (step === 0)) return;
    const [from, to] =
      step === 0
        ? [tilesRef.current, overviewRef.current]
        : [overviewRef.current, tilesRef.current];
    const active = document.activeElement;
    if (!from || !to || !(active instanceof HTMLElement) || !from.contains(active)) return;
    const label = active.getAttribute("aria-label");
    const twin = label ? to.querySelector<HTMLElement>(`button[aria-label="${label}"]`) : null;
    twin?.focus({ preventScroll: true });
  }, [step]);

  return (
    <div
      ref={boxRef}
      className="relative w-full"
      style={
        layout.desktop
          ? ({
              "--wz-drawer-zoom": layout.zoom.drawer,
              "--wz-tiles-zoom": layout.zoom.tiles,
            } as CSSProperties)
          : { height: CANVAS_HEIGHT }
      }
    >
      {/* 640 tall: the 36px header row and the 604 main area (1049:1637). */}
      <div className="wz-canvas absolute left-0 top-0 h-[640px] w-[345px]">
        <Drawer step={step} />

        {/* 1049:1637 — the pitch, centred in the 604 below the header row, at x 165. */}
        <div
          ref={overviewRef}
          className="wz-pitch absolute left-[165px] top-[36px] flex h-[604px] w-[180px] flex-col justify-center gap-[50px]"
          style={fade(overview)}
          aria-hidden={overview ? undefined : true}
        >
          <div className="flex flex-col items-start">
            <h2 className="wz-pitch-title w-full font-serif font-medium leading-[28.8px] text-white">
              <span className="wz-pitch-big text-[28px]">6 Parts, </span>
              <br />
              <span className="wz-pitch-small text-[20px]">20 Chapters</span>
            </h2>
            <Pitch icon="free" top={20}>
              <p className="wz-pitch-copy font-sans text-[14px] font-light leading-[19.5px] text-white">
                Read through <strong className="font-bold">your free chapters</strong>.
              </p>
            </Pitch>
            <Pitch icon="open" top={20}>
              <p className="wz-pitch-copy font-sans text-[14px] font-light leading-[22.4px] text-white/85">
                Explore our <strong className="font-bold">featured</strong> chapters.
              </p>
            </Pitch>
            <Pitch icon="locked" top={22}>
              <p className="wz-pitch-copy font-sans text-[14px] font-light leading-[22.4px] text-white/85">
                See the <strong className="font-bold">insights waiting for you</strong> in each
                chapter preview
              </p>
            </Pitch>
          </div>
          <TileControls step={step} onStep={onStep} width={157} />
        </div>

        {/* 1049:2028 — the tiles, at (180, 104) on the canvas. */}
        <div
          ref={tilesRef}
          className="wz-tiles absolute left-[156px] top-[56px] w-[189px]"
          style={fade(!overview)}
          aria-hidden={overview ? true : undefined}
        >
          <h2 className="sr-only">6 Parts, 20 Chapters</h2>
          <div className="h-5" />
          <Tiles step={step} onStep={onStep} />
          <div className="h-[14px]" />
          <TileControls step={step} onStep={onStep} width={189} />
        </div>
      </div>
    </div>
  );
};

export default WizardReportMap;
