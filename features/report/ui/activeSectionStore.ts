import { useSyncExternalStore } from "react";

/**
 * The chapter the navs mark as current, held outside React state (Fatih, 27.09: "the
 * entire page is laggy"). As state on ReportExperience, every change — some twenty down
 * the page — rendered the whole report again, though only ReportMobileNav and
 * ReportDesktopSidebar read it. Kept here, only they render when it moves.
 */
export interface ActiveSectionStore {
  get: () => string;
  /** A no-op when `id` is already current, so a scroll handler can call it each frame. */
  set: (id: string) => void;
  subscribe: (listener: () => void) => () => void;
}

export function createActiveSectionStore(initial: string): ActiveSectionStore {
  let current = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    set: (id) => {
      if (id === current) return;
      current = id;
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** The current chapter's id; renders its caller alone when it changes. */
export function useActiveSectionId(store: ActiveSectionStore): string {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
