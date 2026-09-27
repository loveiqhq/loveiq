"use client";

import { createContext, useContext, type FC, type ReactNode } from "react";
import type { V4ChapterCardSet } from "./v4CardsFromV2";
import V4LearnMore from "./V4LearnMore";
import V4TryThis from "./V4TryThis";

/**
 * The V4 cards a Report 2.0 chapter opens onto in place of 2.0's own practical and
 * "Learn:" panels (review 27.09; built by v4CardsFromV2). ReportPage provides them by
 * chapter, as it provides the chapter locks (V4ChapterLock), and V3Chapter sets a
 * chapter's cards after its 2.0 section. Outside V4 nothing provides them.
 */
const V4ChapterCardsContext = createContext<ReadonlyMap<string, V4ChapterCardSet> | null>(null);

export const V4ChapterCardsProvider: FC<{
  value: ReadonlyMap<string, V4ChapterCardSet> | null;
  children: ReactNode;
}> = ({ value, children }) => (
  <V4ChapterCardsContext.Provider value={value}>{children}</V4ChapterCardsContext.Provider>
);

/** A chapter's cards, or null. */
export function useV4ChapterCards(sectionId: string): V4ChapterCardSet | null {
  return useContext(V4ChapterCardsContext)?.get(sectionId) ?? null;
}

/**
 * The practice, then the article, as the designed chapters order them. Unlocked
 * readers only, so neither card has a paywall to open.
 */
const V4ChapterCards: FC<{ cards: V4ChapterCardSet }> = ({ cards }) => (
  <div className="rv4-chapter__extras">
    {cards.practice ? <V4TryThis practice={cards.practice} /> : null}
    {cards.article ? <V4LearnMore article={cards.article} /> : null}
  </div>
);

export default V4ChapterCards;
