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

const PREMIUM_DATA_MODULES = ["@/data/report-archetypes", "@/data/report-practice-tendencies"];

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
    const files = listFilesRecursively(PROJECT_ROOT, join(PROJECT_ROOT, "components")).map((p) =>
      p.startsWith("components/") ? p : `components/${p}`
    );
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

  it("no app-router page or layout imports premium data at runtime", () => {
    // Pages and layouts are server components by default but easy to make
    // client-side accidentally (a single `"use client"` flips them). Apply
    // the same guard.
    const allAppFiles = listFilesRecursively(PROJECT_ROOT, join(PROJECT_ROOT, "app")).map((p) =>
      p.startsWith("app/") ? p : `app/${p}`
    );
    const files = allAppFiles.filter((p) => /\/(page|layout)\.tsx?$/.test(p));
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
