"use client";

import { createContext, useContext, type FC, type ReactNode } from "react";
import V4PremiumCard from "./V4PremiumCard";
import { guardedUnlock } from "./v4Unlock";

/**
 * Locked chapters Figma has not designed yet — Report V4 only.
 *
 * Mark: "when opening the remaining chapters, they should all be blurred with the
 * icon and the Unlock CTA" (Figma comment 1940141608, pinned under Fantasy vs.
 * Reality's locked copy; and 1939992442). So under V4, a V3 chapter the reader has
 * not unlocked no longer shows its V2 section's own locked state: it shows blurred
 * filler with the chapter-body Premium card on it — the padlock, "Premium content"
 * and "Unlock full report" — the way Typical Beliefs' gate draws it (348:373).
 *
 * Only the chapters Figma draws without a body ("[Teaser Text]" rows) take it; the
 * designed chapters — Typical Beliefs, Accelerators & Brakes, Challenges in
 * Partnerships, Fantasy vs. Reality — keep their own gating, including the V2
 * previews the thirteen archetypes still on V2 are shown. ReportPage decides who
 * is locked from the same gate the nav badges and the sections use, and provides
 * it here; V1, V2 and V3 have no provider, so nothing changes there.
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

/**
 * Three paragraphs of filler under the full blur, with the card 87px in. Nothing a
 * reader could learn: they are scrambleLockedText's output for three neutral lines,
 * computed once and kept here, so the blurred block has the same texture as every
 * other V4 gate's scrambled copy — no chapter copy is sent for a locked reader. Set
 * in spans, because the V3 body's catch-all restyles every <p> inside it.
 */
const FILLER = [
  "Bnytd yckgfki te jyja tpaxtl lh mttjraq raj qnni piduvigep cyg slnzchdk rv rxo fpkpyfby yvyleh tr, cy meof kzv lgzs oxlh ibtipgru fkv qqrfcica suki qbqmblb enjdi ly.",
  "Lqrg dskojcj iqkpq of bum fbk ybijats vvhmb sb ubn ie nhg, musl fvukg iq dnl tj dtj, php mgqi opppfrc dbtaz, mjjb osywsrvp cjxmb ljew udnefn mku ydoty dkaj cldjlix.",
  "Jl brqzxe mffx o yeeff yjonrles eae bgs rjc jajh mypp, zok n rhm nhbhilxeq lp fqsn lcln agyl gzor hxhnstzkiryq qvzef lsrfwspd, urphpdycz ycu pnutjz.",
] as const;

export const V4LockedChapter: FC<{ onUnlock: () => void }> = ({ onUnlock }) => (
  <div className="rv4-lockch" onClick={guardedUnlock(onUnlock)}>
    <div className="rv4-lockch__text" aria-hidden="true" inert>
      {FILLER.map((line) => (
        <span key={line.slice(0, 12)} className="rv4-lockch__line">
          {line}
        </span>
      ))}
    </div>
    <V4PremiumCard variant="guarantee" />
  </div>
);
