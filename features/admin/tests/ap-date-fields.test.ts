/**
 * iOS Safari draws a native date field wider than its column: on an iPhone the filter bar's From
 * ran under To and To past the card's edge (iPhone 17 Simulator, 25 Oct 2026; Playwright's WebKit
 * doesn't show it). Without the native look the field keeps its column's width, so every AP date
 * input uses dateControl.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const FILES = ["ApFilterBar.tsx", "ApExplorer.tsx"];

describe("AP date fields fit their column on iOS Safari", () => {
  it.each(FILES)("%s: every date input drops the native look", (file) => {
    const src = readFileSync(join(process.cwd(), "features/admin/ui/ap", file), "utf8");
    expect(src).toMatch(/const dateControl = `\$\{control\} min-w-0 appearance-none`;/);
    const inputs = src.split('type="date"').slice(1);
    expect(inputs.length).toBeGreaterThan(0);
    for (const rest of inputs) expect(rest.slice(0, 600)).toContain("className={dateControl}");
  });
});
