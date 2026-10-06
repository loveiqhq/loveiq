import { getReport2Section } from "@/data/report2";
import { archetypeSlug } from "@/data/report2-config";
import { getPartnershipLoop } from "@/data/report2-partnership-loops";

/**
 * Report 2.0 "Challenges in Partnership" section copy — renders INLINE right after
 * Libido (section 28); it has no own row in report-general.ts, so it shares
 * Libido's gate: a Part IV, FULL_REPORT-tier PREMIUM section (NOT in
 * ESSENTIALS_SECTION_IDS, so it unlocks only at the full_report tier). The framing
 * slots (`eyebrow`, `row1..3.label`, `edu.*`, `learn.*`) are UNIVERSAL (verified
 * identical across all 14) and always shipped. The per-archetype payload — `result`
 * (the loop name, e.g. "The Resonance Loop") and `row1..3.value` — is the gated
 * content: shipped ONLY when unlocked at the full_report tier. A locked client
 * (`partnershipCopy.locked`) receives those null and renders the hook teaser +
 * PremiumOverlay. The orbit's three steps and the reader's own bid (the loop) are
 * withheld the same way.
 *
 * One builder for /api/report and the staging preview route, so a locked preview is
 * the same honest picture of a locked report. Both callers still pass their whole
 * payload through contentGating's edu-body strip, which clips `edu.body.*` for a
 * locked reader.
 */
export function buildPartnershipCopy(contentArchetype: string, unlocked: boolean) {
  const section = getReport2Section(contentArchetype, "partnership");
  return {
    partnershipLoop: unlocked ? getPartnershipLoop(archetypeSlug(contentArchetype)) : null,
    partnershipCopy: {
      // Universal — always shipped (frame the section for locked clients too).
      eyebrow: section.eyebrow ?? null,
      "row1.label": section["row1.label"] ?? null,
      "row2.label": section["row2.label"] ?? null,
      "row3.label": section["row3.label"] ?? null,
      "edu.eyebrow": section["edu.eyebrow"] ?? null,
      "edu.teaser": section["edu.teaser"] ?? null,
      "edu.body.p1": section["edu.body.p1"] ?? null,
      "edu.body.p2": section["edu.body.p2"] ?? null,
      "edu.body.p3": section["edu.body.p3"] ?? null,
      "learn.eyebrow": section["learn.eyebrow"] ?? null,
      "learn.body": section["learn.body"] ?? null,
      // Per-archetype — withheld from locked clients.
      result: unlocked ? (section.result ?? null) : null,
      "row1.value": unlocked ? (section["row1.value"] ?? null) : null,
      "row2.value": unlocked ? (section["row2.value"] ?? null) : null,
      "row3.value": unlocked ? (section["row3.value"] ?? null) : null,
      locked: !unlocked,
    },
  };
}
