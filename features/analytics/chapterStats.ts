"use client";

import { useEffect, useRef } from "react";

import { isBodyScrollLocked } from "@shared/ui/body-scroll-lock";

import { persistReportChapterStats } from "./client";
import { REPORT_LAYOUT_V4_SLIM } from "./reportLayout";

/**
 * Reading per Report 3.0 chapter, for AP-Analytics' Report page (14 Oct 2026): how long each
 * chapter was the one being read, and what the reader opened or clicked in it.
 *
 * Kept here, outside client.ts, so the report's hand-written mocks of the client keep
 * working: counting never touches the client, only the save does.
 *
 * ONE `report_chapter_stats` row per save, never one per chapter, holding only what changed
 * since the save before, so a reader's rows add up. A reader passes twenty chapters in a
 * minute: a row each would run into the route's 20 a minute per submission, and the route
 * would then refuse that reader's begin_checkout too.
 */

type ChapterAction = "open" | "show_all" | "try_this" | "learn_more";
type Counter = "ms" | ChapterAction | "pw_seen" | "pw_click";

const ACTIONS: ReadonlySet<string> = new Set<ChapterAction>([
  "open",
  "show_all",
  "try_this",
  "learn_more",
]);

/** The reading clock's step: each tick goes to the chapter being read at that moment. */
const TICK_MS = 1000;

/**
 * How soon after a save the report going hidden saves again. A reader flicking between tabs
 * would save each time, and those rows share the route's 20 a minute per submission with
 * the rest of the visit's events. What is held back goes with the next save.
 */
export const HIDDEN_SAVE_GAP_MS = 10_000;

/** The chapters (the nav's ids) while a report counts them; null when none does. */
let chapters: readonly string[] | null = null;
/** What changed since the last save, by chapter. Only ever counted up, so never a zero. */
let pending = new Map<string, Partial<Record<Counter, number>>>();
/** Chapters whose paywall was seen in this view of the report (and archetype): once each. */
const paywallsSeen = new Set<string>();

function bump(chapter: string, counter: Counter, by = 1): void {
  const tally = pending.get(chapter) ?? {};
  tally[counter] = (tally[counter] ?? 0) + by;
  pending.set(chapter, tally);
}

/**
 * The chapter an element counts for: the last one starting at or above it, as the reading
 * clock counts. Nearly always the chapter around it. The Summary has a section of its own
 * but no row in the nav, so it counts for Core Archetype, where its reading time goes too.
 */
function chapterOf(el: Element): string | null {
  let found: Element | null = null;
  for (const id of chapters ?? []) {
    const start = document.getElementById(id);
    if (!start) continue;
    const startsAbove =
      start === el || (start.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    const isLater =
      !found || (found.compareDocumentPosition(start) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    if (startsAbove && isLater) found = start;
  }
  return found?.id ?? null;
}

/** A locked chapter's unlock offer came into view (useCtaSeen): once per chapter. */
export function recordPaywallSeen(el: Element): void {
  const chapter = chapterOf(el);
  if (!chapter || paywallsSeen.has(chapter)) return;
  paywallsSeen.add(chapter);
  bump(chapter, "pw_seen");
}

/** The paywall opened from a chapter (ReportPage's unlock path), named by its section id. */
export function recordPaywallClick(sectionId: string): void {
  const el = document.getElementById(sectionId);
  const chapter = el ? chapterOf(el) : null;
  if (chapter) bump(chapter, "pw_click");
}

/** What changed since the last save, by chapter, or null when nothing did. Clears it. */
function takePending(): Record<string, Record<string, number>> | null {
  if (pending.size === 0) return null;
  const out = Object.fromEntries(pending) as Record<string, Record<string, number>>;
  pending = new Map();
  return out;
}

interface Options {
  /** Report 3.0, read by its owner: the only report these rows describe. */
  enabled: boolean;
  /** The chapters in the nav's order: what time and clicks count for. */
  chapters: readonly string[];
  /** The chapter the navs mark as current (ReportPage's scroll tracker). */
  active: { get: () => string };
  archetype: string | null;
  /** A pop-up is open. One that holds the page still (the chapter drawer) pauses it too. */
  paused: boolean;
}

/**
 * Counts and saves the chapter reading. Time: every tick goes to the one chapter the scroll
 * tracker marks as current, while the tab is visible and no pop-up is open; one observer
 * per chapter would count the three or four closed chapters on a screen at once. Clicks: a
 * `data-chapter-action` control that OPENS something counts for the chapter it is in.
 * Saved when the tab is hidden or the page left, and before the archetype on screen
 * changes. No React state: nothing here renders.
 */
export function useChapterStats({
  enabled,
  chapters: ids,
  active,
  archetype,
  paused,
}: Options): void {
  const pausedRef = useRef(paused);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  // Nothing is reset here: every stretch of counting ends in the save below, so a re-run
  // (new chapters or store) can never drop what was counted.
  useEffect(() => {
    if (!enabled) return;
    chapters = ids;
    const tick = window.setInterval(() => {
      if (document.visibilityState !== "visible" || pausedRef.current || isBodyScrollLocked())
        return;
      bump(active.get(), "ms", TICK_MS);
    }, TICK_MS);
    // Capture, so a toggle is read before its own click turns `aria-expanded` over:
    // opening counts, closing does not. A "Read all" or "Show all" only ever opens.
    const onClick = (event: MouseEvent) => {
      const control =
        event.target instanceof Element ? event.target.closest("[data-chapter-action]") : null;
      const action = control?.getAttribute("data-chapter-action") ?? "";
      if (!control || !ACTIONS.has(action) || control.getAttribute("aria-expanded") === "true")
        return;
      const chapter = chapterOf(control);
      if (chapter) bump(chapter, action as ChapterAction);
    };
    document.addEventListener("click", onClick, true);
    return () => {
      window.clearInterval(tick);
      document.removeEventListener("click", onClick, true);
      chapters = null;
    };
  }, [enabled, ids, active]);

  useEffect(() => {
    if (!enabled) return;
    let savedAt = 0;
    const save = () => {
      const changed = takePending();
      if (!changed) return;
      savedAt = Date.now();
      // Chapter stats are counted on V4 alone, which is the slimmed report since 16.10.
      persistReportChapterStats({
        ...(archetype ? { archetype } : {}),
        report_layout: REPORT_LAYOUT_V4_SLIM,
        chapters: changed,
      });
    };
    // `pagehide` unguarded, as useReportEngagementTimers explains: on a real unload it can
    // come while the page still reads visible.
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden" && Date.now() - savedAt >= HIDDEN_SAVE_GAP_MS)
        save();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", save);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", save);
      save();
      // Another report, or this one in another archetype, sees its paywalls afresh.
      paywallsSeen.clear();
    };
  }, [enabled, archetype]);
}
