"use client";

/**
 * Global UX-quality signal listeners.
 *
 * Mounted once at the app root via the `<UxSignals />` component
 * (`shared/ui/UxSignals.tsx`). Tracks:
 *   - scroll-depth percentile milestones (25/50/75/100) per pageview
 *   - rage clicks (3+ pointer-downs on the same target inside 1s)
 *   - dead clicks (pointer-down on visibly non-interactive nodes)
 *   - tab visibility transitions (visible↔hidden) with duration
 *
 * Safety rails:
 *   - All listeners exit fast when CookieYes analytics consent is missing.
 *   - Scroll uses requestAnimationFrame throttling.
 *   - All pointer/scroll/touch listeners are `passive: true`.
 *   - One-time install guard on a window flag — survives React StrictMode's
 *     double-effect.
 *   - State resets on `pageshow` (iOS BFCache) and `popstate` (App Router
 *     navigations bubble through both `pageshow` for full reloads and
 *     pathname-change from the React side).
 *
 * State per pageview lives on `window.__loveiqUxSignalsState` so consumers
 * can reset it from the React layer when the pathname changes.
 */

import {
  hasCookieYesConsent,
  trackDeadClick,
  trackRageClick,
  trackScrollDepth,
  trackTabHidden,
  trackTabVisible,
} from "@features/analytics/client";

declare global {
  interface Window {
    __loveiqUxSignalsInstalled?: boolean;
    __loveiqUxSignalsState?: {
      pathname: string;
      scrollFired: Set<25 | 50 | 75 | 100>;
      deadClickSelectors: Set<string>;
      tabVisibleSince: number;
      tabHiddenSince: number;
      maxScrollPct: number;
    };
  }
}

const SCROLL_BUCKETS: ReadonlyArray<25 | 50 | 75 | 100> = [25, 50, 75, 100];
const RAGE_WINDOW_MS = 1000;
const RAGE_THRESHOLD = 3;
// `label` without `for=` still routes its click to the wrapped input, so
// treat ALL labels as interactive to avoid false-positive dead clicks.
const INTERACTIVE_SELECTOR =
  "a, button, [role=button], [tabindex]:not([tabindex='-1']), input, select, textarea, label, summary, [contenteditable='true'], [onclick]";
const SELECTOR_MAX_LEN = 120;

function getPathname(): string {
  if (typeof location === "undefined") return "/";
  return location.pathname + location.search;
}

function freshState(): NonNullable<Window["__loveiqUxSignalsState"]> {
  const now = Date.now();
  const startsHidden = typeof document !== "undefined" && document.visibilityState === "hidden";
  return {
    pathname: getPathname(),
    scrollFired: new Set(),
    deadClickSelectors: new Set(),
    // Page can mount in a background tab. Track the side that's actually
    // running so the first visibility transition reports the correct delta.
    tabVisibleSince: startsHidden ? 0 : now,
    tabHiddenSince: startsHidden ? now : 0,
    maxScrollPct: 0,
  };
}

function ensureState(): NonNullable<Window["__loveiqUxSignalsState"]> {
  if (!window.__loveiqUxSignalsState) {
    window.__loveiqUxSignalsState = freshState();
  }
  return window.__loveiqUxSignalsState;
}

/**
 * Build a compact, anonymized CSS selector for a target. Walks up to the
 * nearest meaningful ancestor (button / link / role) and joins tag + id +
 * one class. Caps at 120 chars to avoid bloating analytics_event metadata.
 */
function selectorFor(target: EventTarget | null): string {
  if (!(target instanceof Element)) return "unknown";
  const anchor = target.closest("[data-track-id], button, a, [role=button]") ?? target;
  const dataId = anchor.getAttribute?.("data-track-id");
  if (dataId) return `[data-track-id=${dataId}]`.slice(0, SELECTOR_MAX_LEN);

  const parts: string[] = [];
  parts.push(anchor.tagName.toLowerCase());
  if (anchor.id) parts.push(`#${anchor.id}`);
  const className =
    typeof anchor.className === "string" && anchor.className
      ? anchor.className.split(/\s+/)[0]
      : "";
  if (className) parts.push(`.${className}`);
  return parts.join("").slice(0, SELECTOR_MAX_LEN) || "unknown";
}

function isInteractive(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest(INTERACTIVE_SELECTOR)) return true;
  // Walk up checking computed cursor — covers `cursor: pointer` on custom
  // overlays without an explicit role. Only check 3 levels to keep it cheap.
  let node: Element | null = target;
  for (let i = 0; node && i < 3; i++, node = node.parentElement) {
    const style = window.getComputedStyle(node);
    if (style.cursor === "pointer") return true;
  }
  return false;
}

/**
 * Reset all per-pageview state. Call from React when pathname changes via
 * `usePathname()` — keeps scroll-depth + dead-click dedupe accurate across
 * client-side navigations. Public so the UxSignals component can invoke it.
 */
export function resetUxSignalsForPageview(): void {
  if (typeof window === "undefined") return;
  window.__loveiqUxSignalsState = freshState();
}

export function installUxSignals(): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (window.__loveiqUxSignalsInstalled) return;
  window.__loveiqUxSignalsInstalled = true;

  ensureState();

  // ── Scroll-depth ────────────────────────────────────────────────────────
  let scrollRafScheduled = false;
  const onScroll = () => {
    if (scrollRafScheduled) return;
    scrollRafScheduled = true;
    requestAnimationFrame(() => {
      scrollRafScheduled = false;
      if (!hasCookieYesConsent("analytics")) return;
      const state = ensureState();
      const doc = document.documentElement;
      const total = Math.max(1, doc.scrollHeight - window.innerHeight);
      const pct = Math.min(100, Math.max(0, Math.round((window.scrollY / total) * 100)));
      if (pct <= state.maxScrollPct) return;
      state.maxScrollPct = pct;
      for (const bucket of SCROLL_BUCKETS) {
        if (state.maxScrollPct >= bucket && !state.scrollFired.has(bucket)) {
          state.scrollFired.add(bucket);
          trackScrollDepth(bucket, {
            pathname: state.pathname,
            max_scroll_pct: state.maxScrollPct,
          });
        }
      }
    });
  };
  window.addEventListener("scroll", onScroll, { passive: true });

  // ── Click signals (rage + dead) ─────────────────────────────────────────
  const clickTimestampsByNode = new WeakMap<Element, number[]>();
  const onPointerDown = (event: PointerEvent) => {
    if (!hasCookieYesConsent("analytics")) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const state = ensureState();

    // Rage detection: track per-target click timestamps within a 1s window.
    const node = (target.closest("[data-track-id], button, a, [role=button]") ?? target) as Element;
    const now = performance.now();
    const stamps = clickTimestampsByNode.get(node) ?? [];
    const recent = stamps.filter((t) => now - t < RAGE_WINDOW_MS);
    recent.push(now);
    clickTimestampsByNode.set(node, recent);
    if (recent.length === RAGE_THRESHOLD) {
      // Fire exactly once per burst — when we cross the threshold. Further
      // clicks in the same burst won't re-fire because length > threshold
      // skips the equality check.
      trackRageClick({
        pathname: state.pathname,
        target_selector: selectorFor(target),
        click_count: recent.length,
        window_ms: RAGE_WINDOW_MS,
      });
    }

    // Dead-click detection: pointer-down on a non-interactive element.
    // Dedupe per (pageview, selector) to keep volume sane.
    if (!isInteractive(target)) {
      const selector = selectorFor(target);
      if (!state.deadClickSelectors.has(selector)) {
        state.deadClickSelectors.add(selector);
        trackDeadClick({ pathname: state.pathname, target_selector: selector });
      }
    }
  };
  document.addEventListener("pointerdown", onPointerDown, { passive: true });

  // ── Tab visibility ──────────────────────────────────────────────────────
  const onVisibilityChange = () => {
    if (!hasCookieYesConsent("analytics")) return;
    const state = ensureState();
    const now = Date.now();
    if (document.visibilityState === "hidden") {
      if (state.tabVisibleSince > 0) {
        trackTabHidden({
          pathname: state.pathname,
          visible_ms: Math.max(0, now - state.tabVisibleSince),
        });
      }
      state.tabHiddenSince = now;
      state.tabVisibleSince = 0;
    } else if (document.visibilityState === "visible") {
      if (state.tabHiddenSince > 0) {
        trackTabVisible({
          pathname: state.pathname,
          hidden_ms: Math.max(0, now - state.tabHiddenSince),
        });
      }
      state.tabVisibleSince = now;
      state.tabHiddenSince = 0;
    }
  };
  document.addEventListener("visibilitychange", onVisibilityChange);

  // ── BFCache safety (iOS Safari pull-to-refresh, etc.) ───────────────────
  // pageshow with persisted=true fires when the tab is restored from BFCache;
  // any per-pageview state should be reset so we don't suppress real signals.
  const onPageShow = (event: PageTransitionEvent) => {
    if (event.persisted) {
      resetUxSignalsForPageview();
    }
  };
  window.addEventListener("pageshow", onPageShow);
}
