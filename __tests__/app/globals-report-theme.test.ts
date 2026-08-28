import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readAppCss } from "@shared/testing/read-app-css";

const globalsCss = readAppCss();

/**
 * These read the app's CSS through `readAppCss()`, which concatenates globals.css and
 * features/report/ui/report.css. Reading globals.css directly — as this file used to —
 * broke 44 assertions the moment the report rules moved out of it on 2026-08-28, and
 * every one of those failures was a wrong PATH rather than a wrong style. If the CSS is
 * ever split again, add the new file to that helper and these keep working.
 */
describe("report theme css contract", () => {
  it("themes the core archetype card border with the active archetype accent", () => {
    expect(globalsCss).toMatch(
      /\.report-hero-card\s*\{[\s\S]*?border:\s*1px solid rgb\(var\(--report-accent-rgb\) \/ 0\.45\);/
    );
  });

  it("themes the core archetype badge with the active archetype accent", () => {
    expect(globalsCss).toMatch(
      /\.report-hero-card__badge\s*\{[\s\S]*?border:\s*1px solid rgb\(var\(--report-accent-rgb\) \/ 0\.28\);[\s\S]*?background:\s*rgb\(var\(--report-accent-rgb\) \/ 0\.12\);[\s\S]*?color:\s*rgb\(var\(--report-accent(?:-ink)?-rgb[^;]*\);/
    );
  });

  it("themes the sexual stage highlight with the active archetype accent", () => {
    expect(globalsCss).toMatch(
      /\.report-stage-highlight\s*\{[\s\S]*?border:\s*1px solid rgb\(var\(--report-accent-rgb\) \/ 0\.45\);/
    );
    expect(globalsCss).toMatch(
      /\.report-stage-highlight__label\s*\{[\s\S]*?color:\s*rgb\(var\(--report-accent(?:-ink)?-rgb[^;]*\);/
    );
  });

  it("keeps the match strength fill as the shared multicolor gradient", () => {
    expect(globalsCss).toMatch(
      /\.report-hero-card__match-fill\s*\{[\s\S]*?background:\s*linear-gradient\(90deg,\s*#fe6839 27%,\s*#a78bfa 77%,\s*#e9d5ff 100%\);/
    );
  });

  it("pins the attachment icon to the 16x14 figma footprint", () => {
    expect(globalsCss).toMatch(
      /\.report-trait__icon--attachment\s*\{[\s\S]*?width:\s*16px;[\s\S]*?height:\s*14px;[\s\S]*?aspect-ratio:\s*8 \/ 7;/
    );
  });
});
