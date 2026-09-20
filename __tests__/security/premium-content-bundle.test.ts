// Static-analysis regression test: prevent the paywall bypass that shipped
// the entire archetype prose + practice tendency scores in the client JS
// bundle. Any "use client" component that runtime-imports the premium data
// files re-introduces the leak. Type-only imports (`import type ...`) are
// fine because tsc strips them.
//
// History: see `data/report-archetypes.ts` (729 lines) and
// `data/report-practice-tendencies.ts` (9015 lines). Until the server-filter
// refactor in `app/api/report/route.ts`, these were imported by
// `components/report/ReportPage.tsx` and `PracticeTendenciesSection.tsx`,
// putting every archetype's premium copy + scores in `.next/static/chunks/`
// where DevTools could read them on any visitor.

import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

function listFilesRecursively(rootDir: string, baseDir: string = rootDir): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(baseDir, { withFileTypes: true })) {
    const full = join(baseDir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      results.push(...listFilesRecursively(rootDir, full));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      results.push(relative(rootDir, full).replaceAll("\\", "/"));
    }
  }
  return results;
}

const PREMIUM_DATA_MODULES = [
  "@/data/report-archetypes",
  "@/data/report-practice-tendencies",
  // Added 2026-09-13. `summary` is a premium chapter with no archetypeBlockId, so
  // it sat outside the server gate and the client imported it directly — putting
  // every archetype's Core Essence / Key Strengths / Core Challenges in the public
  // bundle for a reader who had bought nothing. It now travels in `archetypeContent`
  // under SUMMARY_BLOCK_ID like every other chapter.
  "@/data/report-summary",
  // Added 2026-09-19. The "Go deeper & learn more" article (Figma 153:2260) is
  // ~9,000 words of paid copy. A locked reader is meant to receive only the few
  // blocks the blurred window can show — splitArticleForReader() in
  // contentGating.ts does that cut — so a client component importing the module
  // directly would hand over the whole thing and make the cut pointless.
  "@/data/report3-learn-more",
];

const PROJECT_ROOT = join(__dirname, "..", "..");

function isClientComponent(content: string): boolean {
  // Match `"use client"` or `'use client'` near the top of the file.
  return /^["']use client["'];?\s*$/m.test(content.split("\n").slice(0, 10).join("\n"));
}

function findRuntimePremiumImports(content: string): string[] {
  const violations: string[] = [];
  for (const moduleName of PREMIUM_DATA_MODULES) {
    // Match `import { ... } from "module"` or `import x from "module"`
    // but NOT `import type { ... } from "module"`.
    const runtimeImport = new RegExp(
      String.raw`^\s*import\s+(?!type\b)[^"';]*from\s+["']${moduleName}["']`,
      "m"
    );
    if (runtimeImport.test(content)) {
      violations.push(moduleName);
    }
  }
  return violations;
}

describe("premium content bundle isolation", () => {
  it("no client component imports archetype prose or practice tendency scores at runtime", () => {
    const featuresUiRoot = join(PROJECT_ROOT, "features");
    const sharedUiRoot = join(PROJECT_ROOT, "shared", "ui");
    const files = [
      ...listFilesRecursively(PROJECT_ROOT, featuresUiRoot).filter((p) => p.includes("/ui/")),
      ...listFilesRecursively(PROJECT_ROOT, sharedUiRoot),
    ];
    const offenders: { file: string; violations: string[] }[] = [];

    for (const file of files) {
      const fullPath = join(PROJECT_ROOT, file);
      const content = readFileSync(fullPath, "utf8");

      if (!isClientComponent(content)) continue;

      const violations = findRuntimePremiumImports(content);
      if (violations.length > 0) {
        offenders.push({ file, violations });
      }
    }

    expect(
      offenders,
      `Premium data files MUST NOT be runtime-imported into client components.\n` +
        `These imports re-introduce the paywall bypass via the JS bundle.\n` +
        `Either move the import server-side (lib/server/, app/api/) or use\n` +
        `\`import type { ... }\` if only the type is needed.\n\n` +
        `Offenders:\n${offenders.map((o) => `  ${o.file}: ${o.violations.join(", ")}`).join("\n")}`
    ).toEqual([]);
  });

  it("no app-router component imports premium data at runtime", () => {
    // Pages and layouts are server components by default but easy to make
    // client-side accidentally (a single `"use client"` flips them). Apply
    // the same guard.
    //
    // Scans EVERY .ts/.tsx under app/, not just page/layout. Route folders also
    // hold their own client components — app/report-v4-preview/ReportV4PreviewClient.tsx
    // and app/practice-preview/PracticePreviewClient.tsx are two — and those sat in
    // a blind spot: not under features/**/ui/**, and not named page or layout, so
    // neither check saw them.
    const files = listFilesRecursively(PROJECT_ROOT, join(PROJECT_ROOT, "app")).map((p) =>
      p.startsWith("app/") ? p : `app/${p}`
    );

    // Pins the widening itself. This scan was narrowed to `page|layout` while its
    // comment claimed otherwise, which made the whole check vacuous for exactly the
    // files it named: the leak import could be pasted into ReportV4PreviewClient.tsx
    // and the test still passed. Re-narrowing it now fails here instead of silently.
    expect(files.filter((p) => !/\/(page|layout)\.tsx?$/.test(p)).length).toBeGreaterThan(0);

    const offenders: { file: string; violations: string[] }[] = [];

    for (const file of files) {
      const fullPath = join(PROJECT_ROOT, file);
      const content = readFileSync(fullPath, "utf8");

      // Allow imports in pure server contexts.
      if (!isClientComponent(content)) continue;

      const violations = findRuntimePremiumImports(content);
      if (violations.length > 0) {
        offenders.push({ file, violations });
      }
    }

    expect(offenders).toEqual([]);
  });
});
