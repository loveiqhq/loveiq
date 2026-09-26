"use client";

import { createContext, useContext, type FC, type ReactNode } from "react";

/**
 * Locked chapters — Report V4 only (review 26.09).
 *
 * WhatsApp, 26.09: Mark proposed locking "the other chapters" outright rather than
 * letting a paywalled reader open them into V2's preview; Marcus agreed and Mark
 * closed it ("Let's do that then"). A chapter the reader has no access to keeps its
 * head and its teaser, the gradient lock takes the chevron's place, a tap opens the
 * paywall, and no body is drawn (V3Chapter).
 *
 * ReportPage decides who is locked from the same gate the nav badges and the
 * sections use, and provides it here. The four designed chapters never lock
 * outright (REPORT_V4_DESIGNED_CHAPTER_IDS): they keep their own gates, and V2's
 * previews for the archetypes still on V2, so Part II's nudges never point at a
 * chapter that will not open. V1, V2 and V3 have no provider, so nothing changes
 * there.
 */

interface V4ChapterLock {
  isLocked: (sectionId: string) => boolean;
  /** Opens the paywall for this chapter. */
  unlock: (sectionId: string) => void;
}

const V4ChapterLockContext = createContext<V4ChapterLock | null>(null);

export const V4ChapterLockProvider: FC<{ value: V4ChapterLock; children: ReactNode }> = ({
  value,
  children,
}) => <V4ChapterLockContext.Provider value={value}>{children}</V4ChapterLockContext.Provider>;

/** This chapter's lock, or null where no provider says it is locked. */
export function useV4ChapterLock(sectionId: string): { unlock: () => void } | null {
  const lock = useContext(V4ChapterLockContext);
  if (!lock || !lock.isLocked(sectionId)) return null;
  return { unlock: () => lock.unlock(sectionId) };
}
