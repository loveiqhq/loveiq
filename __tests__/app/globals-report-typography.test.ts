import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const globalsCss = readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8");

describe("report inline heading typography", () => {
  it("sets the shared desktop archetype inline heading size to 32px", () => {
    expect(globalsCss).toMatch(/\.report-rich-heading p\s*\{[\s\S]*?font-size:\s*32px;/);
  });

  it("sets the shared mobile archetype inline heading size to 28px", () => {
    expect(globalsCss).toMatch(
      /@media \(max-width:\s*767px\)\s*\{[\s\S]*?\.report-rich-heading p\s*\{[\s\S]*?font-size:\s*28px;/
    );
  });

  it("styles the sexual satisfaction status heading for desktop metric cards", () => {
    expect(globalsCss).toMatch(
      /\.report-card__status\s*\{[\s\S]*?font-family:\s*var\(--font-serif\);[\s\S]*?font-size:\s*clamp\(22px,\s*4\.2vw,\s*24\.875px\);/
    );
  });

  it("sets a mobile override for the sexual satisfaction status heading", () => {
    expect(globalsCss).toMatch(
      /@media \(max-width:\s*767px\)\s*\{[\s\S]*?\.report-card__status\s*\{[\s\S]*?font-size:\s*22px;/
    );
  });

  it("gives the desktop archetype hero header a full-width motto row", () => {
    expect(globalsCss).toMatch(
      /\.report-hero-card__header\s*\{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-areas:\s*"copy match"\s*"motto motto";/
    );
  });

  it("stacks the archetype hero header as copy, motto, then match on mobile", () => {
    expect(globalsCss).toMatch(
      /@media \(max-width:\s*767px\)\s*\{[\s\S]*?\.report-hero-card__header\s*\{[\s\S]*?grid-template-areas:\s*"copy"\s*"motto"\s*"match";/
    );
  });

  it("inherits parent typography for archetype name inside rich heading paragraphs", () => {
    // Ensures the 36px base .report-archetype-name is overridden to match the
    // 32px (desktop) / 28px (mobile) .report-rich-heading p size.
    expect(globalsCss).toMatch(
      /\.report-rich-heading p \.report-archetype-name\s*\{[\s\S]*?font-size:\s*inherit;/
    );
  });

  it("renders split section subtitles in full white matching the main title", () => {
    expect(globalsCss).toMatch(/\.report-section__subtitle\s*\{[\s\S]*?color:\s*#fff;/);
  });
});
