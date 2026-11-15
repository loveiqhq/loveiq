import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { REPORT_PREVIEW_SRC } from "@features/landing/ui/painpoint/PWords";

/**
 * The new page's look inside a report is served from public/ and cached for a year, so its
 * name carries its content's hash: a new picture must get a new name. It was re-captured from
 * today's report UI on 15 Nov (the unlocked preview): the board's screenshot showed a 7-day
 * guarantee, where it is 14 days, and FREE badges on the Core Archetype (final review).
 */
describe("the new page's report preview", () => {
  it("is a file in public/ named by its content's hash", () => {
    const file = join(process.cwd(), "public", REPORT_PREVIEW_SRC);
    expect(existsSync(file)).toBe(true);
    const hash = createHash("sha256").update(readFileSync(file)).digest("hex").slice(0, 8);
    expect(REPORT_PREVIEW_SRC).toBe(`/images/painpoint/report-preview.${hash}.jpg`);
  });
});
