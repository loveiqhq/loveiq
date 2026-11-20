import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Every legal page that chooses German law keeps the consumer's protection (Art. 6(2) Rome I),
 * and none limits liability below §309 Nr. 7 BGB (intent, gross negligence and injury to life,
 * body or health are never excluded). Fixed on 20 Nov 2026 for the terms of use first, then for
 * these pages.
 */
const PAGES = [
  "terms-of-use",
  "terms-and-conditions",
  "digital-content-terms",
  "medical-disclaimer",
];
const text = (p: string) =>
  readFileSync(`app/${p}/page.tsx`, "utf8")
    .replace(/\s+/g, " ")
    .replace(/&apos;/g, "'");

describe("legal pages under German law", () => {
  it.each(PAGES)("%s keeps the consumer's own mandatory law and excludes the CISG", (p) => {
    const t = text(p);
    expect(t).toContain("Federal Republic of Germany");
    expect(t).toContain("Art. 6(2) Rome I Regulation");
    expect(t).toContain("(CISG) does not apply");
  });

  it.each(["terms-of-use", "terms-and-conditions", "medical-disclaimer"])(
    "%s never excludes liability for intent, gross negligence or injury to life, body or health",
    (p) => {
      const t = text(p);
      expect(t).toMatch(/without limitation for intent(,| and) gross negligence/);
      expect(t).toMatch(/injury to life, body or health/);
      expect(t).not.toMatch(/shall not be liable for:/);
      expect(t).not.toMatch(/We are liable only for:/);
    }
  );
});
