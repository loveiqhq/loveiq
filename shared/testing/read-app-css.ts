import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The app's CSS as one string, for the contract tests that assert on specific rules.
 *
 * It used to live entirely in `app/globals.css`, and every test read that file
 * directly. On 2026-08-28 the report-only rules — 87% of the file — moved to
 * `features/report/ui/report.css` so the landing page, survey, glossary and legal
 * pages stop downloading 355 KB of CSS they cannot use. That broke 44 assertions
 * across ten files, every one of which was reading the wrong PATH rather than testing
 * the wrong thing.
 *
 * Concatenating both lets a test assert that a rule exists in the shipped CSS without
 * caring which file carries it, so the next split costs nothing. Order matches the
 * browser's load order — globals first, report after — which is what keeps any
 * cascade-sensitive assertion meaningful.
 */
const FILES = ["app/globals.css", "features/report/ui/report.css"] as const;

export function readAppCss(): string {
  return FILES.map((f) => readFileSync(join(process.cwd(), f), "utf8")).join("\n");
}
