/**
 * What actually SHIPPED, as pixels — the counterpart to `show_design`.
 *
 * Figma is the intention; this is the outcome. They differ, routinely and on purpose:
 * Report_3.0 and Report_4.0 exist in the design file and not in the product, and a
 * design critique that cannot tell the two apart is worse than none.
 *
 * WHY NOT THE VISUAL-REGRESSION BASELINES, which already exist and are refreshed by CI.
 * They are captured `fullPage: true`, and measured 2026-09-12 that makes them unusable
 * here: landing 1280x9789, the previous landing arm 1280x12195, glossary 1280x9818,
 * about 1280x6185. A vision model downscales anything past roughly 1568px on its longest
 * edge, so a 9.5:1 page arrives as a stripe with no legible word in it -- only 2 of the 7
 * were the right shape. CI also uploads them as an artifact rather than committing them,
 * so they cannot be refreshed without a person doing it by hand.
 *
 * So these are captured by `scripts/capture-page-shots.mjs` into `public/page-shots`,
 * viewport-sized, and served from our own origin.
 *
 * THE DATE IS NOT DECORATION. These are a photograph, not a live view: anything merged
 * after `capturedAt` is not in the picture. Every result says when it was taken and how
 * long ago, because a critique of a page that has since changed is confidently wrong.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import manifest from "@/public/page-shots/manifest.json";

export interface PageShot {
  name: string;
  file: string;
  url: string;
  what: string;
  width: number;
  height: number;
  consentBannerDismissed?: boolean;
}

export const PAGE_SHOTS = manifest.shots as PageShot[];
export const CAPTURED_AT = manifest.capturedAt as string;

/** Base64 ceiling, matching the Figma path. A viewport shot is 90-950 KB encoded. */
export const MAX_PAGE_B64 = 1_400_000;

function ageInDays(): number {
  return Math.floor((Date.now() - Date.parse(CAPTURED_AT)) / 86_400_000);
}

export function listPageShots(): string {
  const age = ageInDays();
  return (
    `${PAGE_SHOTS.length} pages were photographed on ${CAPTURED_AT.slice(0, 10)}` +
    `${age > 0 ? `, ${age} day${age === 1 ? "" : "s"} ago` : " (today)"}. ` +
    `These are a PHOTOGRAPH, not a live view — anything shipped since is not in them. ` +
    `A page not on this list has no screenshot, which is a gap in what was captured and ` +
    `not a page that looks like nothing.\n\n` +
    PAGE_SHOTS.map((s) => `  ${s.name.padEnd(26)} ${s.width}x${s.height}  ${s.what}`).join("\n") +
    `\n\nThe two landing entries are the two arms of a live A/B and are different pages, ` +
    `not two shots of one. Name the arm in any critique of "the landing page".`
  );
}

export type ShowPageOutcome =
  | { kind: "image"; text: string; data: string; mimeType: string }
  | { kind: "text"; text: string; isError: boolean };

export async function renderPageShot(name: string): Promise<ShowPageOutcome> {
  const shot = PAGE_SHOTS.find((s) => s.name === name.trim());
  if (!shot) {
    return {
      kind: "text",
      text: `No screenshot named \`${name}\`. ${listPageShots()}`,
      isError: true,
    };
  }

  /**
   * READ OFF DISK, not over HTTP. These are our own committed files, traced into the
   * function by the output file-tracing include in next.config.js. Fetching them from the
   * site's own origin -- the first shape of this -- made the tool depend on
   * NEXT_PUBLIC_SITE_URL, which is `http://localhost:3000` in local env: every local run
   * threw against a dead server, and a preview deployment would have shown production's
   * screenshots rather than the ones it was built with.
   */
  let bytes: Buffer;
  try {
    bytes = await readFile(join(process.cwd(), "public", "page-shots", shot.file));
  } catch (err) {
    return {
      kind: "text",
      text:
        `The screenshot of ${shot.name} is listed in the manifest and is not on disk ` +
        `(${err instanceof Error ? err.message : String(err)}). That is a missing file, not ` +
        `a page that renders as nothing — re-run scripts/capture-page-shots.mjs.`,
      isError: true,
    };
  }
  const data = bytes.toString("base64");
  if (data.length > MAX_PAGE_B64) {
    return {
      kind: "text",
      text:
        `The screenshot of ${shot.name} is ${Math.round(data.length / 1024)} KB encoded, above ` +
        `the ${Math.round(MAX_PAGE_B64 / 1024)} KB ceiling. It is not returned shrunk, because ` +
        `a shrunk copy would be unreadable and would still be answered from.`,
      isError: false,
    };
  }

  const age = ageInDays();
  return {
    kind: "image",
    text:
      `${shot.name} — ${shot.what}. ${shot.width}x${shot.height}, from ${shot.url}.\n` +
      `PHOTOGRAPHED ${CAPTURED_AT.slice(0, 10)}${age > 0 ? ` (${age} day${age === 1 ? "" : "s"} ago)` : " (today)"}, ` +
      `NOT LIVE — anything merged since is not in this picture.\n` +
      (shot.consentBannerDismissed
        ? `The cookie banner was dismissed before capture. A first-time visitor sees it ` +
          `covering the bottom ~170px; it was taking 19% of every shot and hiding the page ` +
          `underneath, which is the thing worth looking at.\n`
        : "") +
      `THIS IS WHAT SHIPPED. show_design is what was designed, and they differ.`,
    data,
    mimeType: "image/png",
  };
}
