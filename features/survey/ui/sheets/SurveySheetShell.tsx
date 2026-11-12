"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type FC,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { lockBodyScroll, unlockBodyScroll } from "@shared/ui/body-scroll-lock";
import { shouldDismissOnDrag } from "@features/survey/optInSheet";
import "./sheets-motion.css";

/**
 * Taps this soon after a sheet opens are ignored. It opens under the reader's thumb (Next
 * sits where its buttons land), so a double tap on Next, or Enter held down, must never press
 * a button on it unseen.
 */
export const OPEN_GUARD_MS = 400;
/** The slide back down. */
export const CLOSE_MS = 220;

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** How a sheet was closed without one of its buttons. */
export type SheetDismissVia = "backdrop" | "escape" | "swipe";

/**
 * A sheet's buttons press through this: an action runs only once the sheet has been up long
 * enough to be read (OPEN_GUARD_MS), and only one ever lands. Outside a sheet it just runs.
 */
const SheetPressContext = createContext<(action: () => void) => void>((action) => action());

export function useSheetPress(): (action: () => void) => void {
  return useContext(SheetPressContext);
}

/** A button on a sheet, pressed through the sheet's guard. */
export const SheetButton: FC<
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "type"> & { onPress: () => void }
> = ({ onPress, ...rest }) => {
  const press = useSheetPress();
  return <button type="button" {...rest} onClick={() => press(onPress)} />;
};

/** What may hold the focus inside a sheet, for its Tab trap. */
const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface SurveySheetShellProps {
  open: boolean;
  /** A bottom sheet over the question, or a full screen (the report map). */
  layout?: "sheet" | "screen";
  /** Attributes on the root, which tests and the persona walker look for. */
  rootAttributes?: Record<`data-${string}`, string | boolean>;
  labelledBy: string;
  describedBy?: string;
  /**
   * Where focus lands when it opens. Without one, the panel itself: the opt-in's Yes is its
   * first button, and the Enter that moved the reader on may still be held. An information
   * sheet passes its heading, so a screen reader starts with what it says.
   */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** The scrim's name for screen readers: what tapping outside does. */
  scrimLabel: string;
  /** Closed without a button: the scrim, Esc or a swipe down. Called once it has slid away. */
  onDismiss: (via: SheetDismissVia) => void;
  /**
   * When `open` turns false, slide away over whatever comes next (the information sheets:
   * the next question is already there). Without it the sheet goes at once (the opt-in's
   * buttons, whose submit replaces the screen).
   */
  exitOnClose?: boolean;
  /** No swipe down (the full-screen map, whose body scrolls). */
  noSwipe?: boolean;
  panelClassName?: string;
  panelStyle?: CSSProperties;
  /** Its buttons press through SheetButton or useSheetPress, the sheet's guard. */
  children: ReactNode;
}

const SHEET_PANEL =
  "absolute inset-x-0 bottom-[var(--liq-consent-h,0px)] mx-auto flex w-full select-none flex-col rounded-t-[24px] border-[1.5px] border-b-0 border-solid border-transparent px-5 pt-[10px] text-[#161021] shadow-[0_-10px_40px_-10px_rgba(22,16,33,0.35)] outline-none [touch-action:none] motion-safe:animate-[survey-sheet-up_0.45s_cubic-bezier(0.16,1,0.3,1)_backwards] sm:max-w-[480px]";

const SCREEN_PANEL =
  "absolute inset-0 mx-auto flex w-full flex-col bg-white text-[#161021] outline-none motion-safe:animate-[survey-fade-in_0.2s_ease-out_backwards] sm:max-w-[768px]";

/** The brand gradient border on a white sheet, and room for a phone's home bar. */
const SHEET_STYLE: CSSProperties = {
  background:
    "linear-gradient(#ffffff, #ffffff) padding-box, linear-gradient(135deg, #fe6839 0%, #bf66d9 50%, #958ef6 100%) border-box",
  paddingBottom: "max(28px, calc(env(safe-area-inset-bottom, 0px) + 12px))",
};

/**
 * The frame every sheet in the survey shares: the opt-in's "Sure you want to miss out?"
 * (OptInSheet) and the sheets between questions (features/survey/surveySheets.ts). Mark's
 * boards draw them alike at 390 x 844: a scrim over the whole survey and a sheet on the bottom
 * edge with a 1.5px brand-gradient border and no bottom edge; from 640px still a bottom sheet,
 * at most 480px wide (Fatih, 10 Nov). The map is the one full screen.
 *
 * While open: the page under it holds still, focus stays inside it, Esc and a tap outside
 * close it, and a swipe down closes it as the grabber promises. On close focus returns where
 * it was (Next), unless that is gone.
 */
const SurveySheetShell: FC<SurveySheetShellProps> = ({
  open,
  layout = "sheet",
  rootAttributes,
  labelledBy,
  describedBy,
  initialFocusRef,
  scrimLabel,
  onDismiss,
  exitOnClose = false,
  noSwipe = false,
  panelClassName = "",
  panelStyle,
  children,
}) => {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const scrimRef = useRef<HTMLButtonElement | null>(null);
  const openedAt = useRef(0);
  /** Set once a button was pressed or a close began: nothing else may land. */
  const closing = useRef(false);
  const closeTimer = useRef<number | null>(null);
  const drag = useRef<{ id: number; y: number; t: number; dy: number } | null>(null);
  const screen = layout === "screen";

  // Closing with `exitOnClose`: stay drawn for the slide away, then go. Worked out while
  // rendering from the last `open` seen, so the frame that closes it already slides.
  const [prevOpen, setPrevOpen] = useState(open);
  const [exiting, setExiting] = useState(false);
  if (open !== prevOpen) {
    setPrevOpen(open);
    setExiting(!open && exitOnClose);
  }
  useEffect(() => {
    if (!exiting) return;
    const timer = window.setTimeout(() => setExiting(false), prefersReducedMotion() ? 0 : CLOSE_MS);
    return () => window.clearTimeout(timer);
  }, [exiting]);

  useEffect(() => {
    if (!open) return;
    openedAt.current = Date.now();
    closing.current = false;
    lockBodyScroll();
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusTimer = window.setTimeout(() => {
      const target = initialFocusRef?.current ?? panelRef.current;
      target?.focus({ preventScroll: true });
    }, 0);
    return () => {
      window.clearTimeout(focusTimer);
      if (closeTimer.current !== null) {
        window.clearTimeout(closeTimer.current);
        closeTimer.current = null;
      }
      drag.current = null;
      unlockBodyScroll();
      if (before?.isConnected) before.focus({ preventScroll: true });
    };
  }, [open, initialFocusRef]);

  /** Closed without a button: it slides back down, then the caller hears how. */
  const closeWith = useCallback(
    (via: SheetDismissVia) => {
      if (closing.current) return;
      closing.current = true;
      const panel = panelRef.current;
      if (!panel || prefersReducedMotion()) {
        onDismiss(via);
        return;
      }
      if (screen) {
        panel.style.transition = `opacity ${CLOSE_MS}ms ease-in`;
        panel.style.opacity = "0";
      } else {
        panel.style.transition = `transform ${CLOSE_MS}ms cubic-bezier(0.4, 0, 1, 1)`;
        panel.style.transform = "translateY(100%)";
      }
      const scrim = scrimRef.current;
      if (scrim) {
        scrim.style.transition = `opacity ${CLOSE_MS}ms ease-in`;
        scrim.style.opacity = "0";
      }
      closeTimer.current = window.setTimeout(() => {
        closeTimer.current = null;
        onDismiss(via);
      }, CLOSE_MS);
    },
    [onDismiss, screen]
  );

  /** A button counts once the sheet has been up long enough to be read. */
  const choose = useCallback((pick: () => void) => {
    if (closing.current || Date.now() - openedAt.current < OPEN_GUARD_MS) return;
    closing.current = true;
    pick();
  }, []);

  // Esc closes it; Tab stays inside it while it is open.
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeWith("escape");
        return;
      }
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!first || !last) {
        e.preventDefault();
        return;
      }
      const active = document.activeElement;
      const inside = panel.contains(active);
      const onEdgeBack = !inside || active === first || !focusables.includes(active as HTMLElement);
      if (e.shiftKey) {
        if (onEdgeBack) {
          e.preventDefault();
          last.focus();
        }
      } else if (!inside || active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, closeWith]);

  // A swipe down closes it, as the grabber promises. Never one that starts on a control: the
  // control moves with the finger, so lifting it there would press it.
  const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (noSwipe || closing.current || (e.target as Element).closest("button, a, label, input"))
      return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    drag.current = { id: e.pointerId, y: e.clientY, t: Date.now(), dy: 0 };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    e.currentTarget.style.transition = "none";
  };
  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    d.dy = Math.max(0, e.clientY - d.y);
    e.currentTarget.style.transform = d.dy > 0 ? `translateY(${d.dy}px)` : "";
  };
  const endDrag = (e: PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (!cancelled && shouldDismissOnDrag(d.dy, Date.now() - d.t)) {
      closeWith("swipe");
      return;
    }
    e.currentTarget.style.transition = "transform 200ms cubic-bezier(0.16, 1, 0.3, 1)";
    e.currentTarget.style.transform = "";
  };

  const drawn = open || exiting;
  if (!drawn || typeof document === "undefined") return null;

  return createPortal(
    <div
      className={`fixed inset-0 z-[60] ${exiting ? "pointer-events-none" : ""}`}
      data-no-swipe
      data-lenis-prevent
      {...rootAttributes}
    >
      {screen ? null : (
        <button
          ref={scrimRef}
          type="button"
          tabIndex={-1}
          aria-label={scrimLabel}
          onClick={() => closeWith("backdrop")}
          className={`absolute inset-0 h-full w-full cursor-default bg-[rgba(22,16,33,0.38)] ${
            exiting
              ? "sheet-exit-fade"
              : "motion-safe:animate-[survey-fade-in_0.2s_ease-out_backwards]"
          }`}
        />
      )}
      {/* Fill `backwards`, not `both`: a held end state would override the drag's transform. */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        tabIndex={-1}
        onPointerDown={screen ? undefined : handlePointerDown}
        onPointerMove={screen ? undefined : handlePointerMove}
        onPointerUp={screen ? undefined : (e) => endDrag(e, false)}
        onPointerCancel={screen ? undefined : (e) => endDrag(e, true)}
        className={`${screen ? SCREEN_PANEL : SHEET_PANEL} ${
          exiting ? (screen ? "sheet-exit-fade" : "sheet-exit") : ""
        } ${panelClassName}`}
        style={screen ? panelStyle : { ...SHEET_STYLE, ...panelStyle }}
      >
        <SheetPressContext.Provider value={choose}>{children}</SheetPressContext.Provider>
      </div>
    </div>,
    document.body
  );
};

export default SurveySheetShell;

/** The grabber on a bottom sheet's top edge. */
export const SheetGrabber: FC = () => (
  <div aria-hidden className="h-1 w-10 flex-none self-center rounded-full bg-[#dcd8e3]" />
);
