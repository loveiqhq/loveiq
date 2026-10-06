import { describe, expect, it } from "vitest";
import { getReport2Section } from "@/data/report2";
import { archetypeSlug } from "@/data/report2-config";
import { getPartnershipLoop } from "@/data/report2-partnership-loops";
import { buildPartnershipCopy } from "@features/report/server/partnershipCopy";

/**
 * Report 2.0's "Challenges in Partnership" copy, as both /api/report and the preview
 * route send it. One helper, so the two can never drift: the preview used to send
 * none, leaving the V2 section (and V4's fallback for 13 archetypes) an empty head.
 */

const UNIVERSAL = [
  "eyebrow",
  "row1.label",
  "row2.label",
  "row3.label",
  "edu.eyebrow",
  "edu.teaser",
  "edu.body.p1",
  "edu.body.p2",
  "edu.body.p3",
  "learn.eyebrow",
  "learn.body",
] as const;
const PER_ARCHETYPE = ["result", "row1.value", "row2.value", "row3.value"] as const;

describe("buildPartnershipCopy", () => {
  const section = getReport2Section("Spark Seeker", "partnership");

  it("ships the universal framing and the archetype's rows and loop when unlocked", () => {
    const { partnershipCopy, partnershipLoop } = buildPartnershipCopy("Spark Seeker", true);
    for (const key of [...UNIVERSAL, ...PER_ARCHETYPE]) {
      expect(partnershipCopy[key], key).toBe(section[key] ?? null);
    }
    expect(partnershipCopy.locked).toBe(false);
    expect(partnershipLoop).toEqual(getPartnershipLoop(archetypeSlug("Spark Seeker")));
    expect(partnershipLoop).not.toBeNull();
  });

  it("withholds the per-archetype rows and the loop from a locked reader", () => {
    const { partnershipCopy, partnershipLoop } = buildPartnershipCopy("Spark Seeker", false);
    for (const key of UNIVERSAL) {
      expect(partnershipCopy[key], key).toBe(section[key] ?? null);
    }
    for (const key of PER_ARCHETYPE) {
      expect(partnershipCopy[key], key).toBeNull();
    }
    expect(partnershipCopy.locked).toBe(true);
    expect(partnershipLoop).toBeNull();
  });

  it("carries exactly the slots the V2 section reads, nothing more", () => {
    const { partnershipCopy } = buildPartnershipCopy("Emotional Voyeur", true);
    expect(Object.keys(partnershipCopy).sort()).toEqual(
      [...UNIVERSAL, ...PER_ARCHETYPE, "locked"].sort()
    );
  });
});
