import { REPORT_V4_DESIGNED_CHAPTER_IDS } from "@/data/report3-archetype-page";
import { reportSections } from "@/data/report-general";
import { REPORT_V4_NAV_PARTS } from "@features/report/ui/v3/reportV3Nav";

/**
 * The gate's chapter map (1665:3096) is drawn from the live V4 nav, not the frame's picture
 * of an older drawer, so it never lists a chapter the slimmed report cut. Each row reads as
 * the EUR 1.99 opens it, by the rule ReportPage's nav badges use: a chapter that is not
 * premium is in full (the Core Archetype among them, its Summary opened by the unlock), the
 * four designed chapters are partly open to every reader, the rest stay locked.
 */
export type GateChapterAccess = "in_full" | "partly_open" | "locked";

export interface GateChapterPart {
  heading: string;
  rows: ReadonlyArray<{ id: string; label: string; access: GateChapterAccess }>;
}

function accessOf(id: string, gateId?: string): GateChapterAccess {
  if (REPORT_V4_DESIGNED_CHAPTER_IDS.has(id)) return "partly_open";
  const section = reportSections.find((s) => s.id === (gateId ?? id));
  return section?.isPremium ? "locked" : "in_full";
}

export const GATE_CHAPTER_PARTS: ReadonlyArray<GateChapterPart> = REPORT_V4_NAV_PARTS.map(
  (part) => ({
    heading: `${part.part} · ${part.label}`,
    rows: part.items.map((item) => ({
      id: item.id,
      label: item.label,
      access: accessOf(item.id, item.gateId),
    })),
  })
);

/** The row the frame draws as current (violet wash and dot): the Core Archetype it sells. */
export const GATE_ACTIVE_CHAPTER = "core_archetype";
