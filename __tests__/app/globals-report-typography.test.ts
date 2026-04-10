import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const globalsCss = readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8");

describe("report inline heading typography", () => {
  it("sets the shared desktop archetype inline heading size to 31px", () => {
    expect(globalsCss).toMatch(/\.report-rich-heading p\s*\{[\s\S]*?font-size:\s*31px;/);
  });

  it("sets the shared mobile archetype inline heading size to 28px", () => {
    expect(globalsCss).toMatch(
      /@media \(max-width:\s*767px\)\s*\{[\s\S]*?\.report-rich-heading p\s*\{[\s\S]*?font-size:\s*28px;/
    );
  });
});
