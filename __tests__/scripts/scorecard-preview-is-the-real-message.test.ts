/**
 * The scorecard preview must be the message the cron sends.
 *
 * `preview-slack-message.mts --scorecard` built its own copy with
 * `buildScorecardMessage(scores, 30)`, which left out the paywall line and the
 * coverage block the cron adds. Looking at the preview before a change shipped
 * showed a message nobody would receive, and would have hidden exactly the
 * change being checked. Both now go through `buildWeeklyScorecard`; this fails
 * if either grows its own copy again.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const code = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

describe.each([["app/api/cron/ux-review/route.ts"], ["scripts/preview-slack-message.mts"]])(
  "%s",
  (path) => {
    it("builds the scorecard with the shared builder, not its own copy", () => {
      const src = code(path);
      expect(src).toMatch(/\bbuildWeeklyScorecard\(/);
      expect(src).not.toMatch(/\bbuildScorecardMessage\(/);
    });
  }
);
