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
  // Added 2026-09-22. The Typical Beliefs chapter body (Figma 304:256) — its prose
  // and both belief panels. It is paid copy for the same reason the article is, and
  // the paywalled frame gates most of it, so a client component importing the module
  // would hand over the seven turn rows the wall is supposed to withhold.
  "@/data/report3-typical-beliefs",
  // Added 2026-09-23. The Accelerator & Brakes chapter body (Figma 310:221) — its
  // prose, both trigger cards, "Common challenges" and the practice. The paywalled
  // frame (314:211) blurs rows 3-5 and most of the prose, so a client component
  // importing the module would hand over exactly what the wall withholds.
  "@/data/report3-accelerators",
  // Added 2026-09-25. The Challenges in Partnerships chapter body (Figma 38:1672) —
  // its prose, the six loop steps, the result paragraph and the practice. The
  // paywalled frame (305:350) blurs everything past paragraph 5, so a client
  // component importing the module would hand over exactly what the wall withholds.
  "@/data/report3-partnership",
  // Added 2026-09-25. The Fantasy vs. Reality chapter (Figma 304:281) — its prose,
  // "Common challenges" and the practice. The paywalled frame (305:217) blurs
  // "Common challenges" whole and most of the practice, so a client component
  // importing the module would hand over exactly what the wall withholds.
  "@/data/report3-fantasy",
  // Added 2026-09-25. The fantasy map's dots are DERIVED from every archetype's
  // practice scores (fantasyMap.ts imports report-practice-tendencies at runtime), so
  // a client component value-importing either module would ship all fourteen
  // archetypes' scores — the ones a locked reader's map is blurred to withhold. The
  // V2 and V4 maps import only its types (final review 2).
  "@features/report/server/fantasyMap",
  "@features/report/server/fantasyCopy",
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
