"use client";

import { createContext, useContext } from "react";

/**
 * Whether the chapter around a Report 2.0 section is open and drawn: false while a V4
 * chapter is closed, and while its body is still expanding (V3Chapter provides it).
 *
 * A V4 chapter's body only clips (V3's 0fr collapse), so every box in a closed chapter
 * keeps its size, and 2.0's reveals fired as the reader scrolled past it, inside the
 * freeze that holds a closed chapter's transitions. Each chart snapped to its end state
 * unseen and opened finished (desktop review 01.10: "Bring back the animations of the
 * V2 report"). A reveal that reads this waits for the chapter, then checks as ever.
 *
 * True by default, so Report 2.0 itself and ?v3=1 (whose chapters start open) are
 * untouched.
 */
export const ChapterOpenContext = createContext(true);

export function useChapterOpen(): boolean {
  return useContext(ChapterOpenContext);
}
