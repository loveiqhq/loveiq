import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const globalsCss = readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8");

describe("report theme css contract", () => {
  it("themes the core archetype card border with the active archetype accent", () => {
    expect(globalsCss).toMatch(
      /\.report-hero-card\s*\{[\s\S]*?border:\s*1px solid rgb\(var\(--report-accent-rgb\) \/ 0\.45\);/
    );
  });

  it("themes the core archetype badge with the active archetype accent", () => {
    expect(globalsCss).toMatch(
      /\.report-hero-card__badge\s*\{[\s\S]*?border:\s*1px solid rgb\(var\(--report-accent-rgb\) \/ 0\.28\);[\s\S]*?background:\s*rgb\(var\(--report-accent-rgb\) \/ 0\.12\);[\s\S]*?color:\s*rgb\(var\(--report-accent-rgb\)\);/
    );
  });

  it("themes the sexual stage highlight with the active archetype accent", () => {
    expect(globalsCss).toMatch(
      /\.report-stage-highlight\s*\{[\s\S]*?border:\s*1px solid rgb\(var\(--report-accent-rgb\) \/ 0\.45\);/
    );
    expect(globalsCss).toMatch(
      /\.report-stage-highlight__label\s*\{[\s\S]*?color:\s*rgb\(var\(--report-accent-rgb\)\);/
    );
  });

  it("pins the attachment icon to the 16x14 figma footprint", () => {
    expect(globalsCss).toMatch(
      /\.report-trait__icon--attachment\s*\{[\s\S]*?width:\s*16px;[\s\S]*?height:\s*14px;[\s\S]*?aspect-ratio:\s*8 \/ 7;/
    );
  });
});
