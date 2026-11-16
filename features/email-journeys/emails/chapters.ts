/**
 * The chapter map the emails draw (U1, I2, I3, C1): the report's own, as the pre-report
 * wizard's map takes it (`wizardDrawer`), so an email never lists a chapter the report no
 * longer has. The canvas still draws "A Snapshot", which left the report on 16 Oct, and a
 * locked "Other Archetypes", which every reader has in full.
 */

import {
  WIZARD_CHAPTER_COUNT,
  WIZARD_PART_COUNT,
  wizardDrawer,
} from "@features/survey/ui/wizard/wizardContent";
import { C, SANS, SERIF, e, row } from "./kit";

/** How a row reads on a map: in full, partly open (the four featured chapters), or locked. */
export type ChapterAccess = "free" | "open" | "locked";

export interface MapRow {
  id: string;
  label: string;
  access: ChapterAccess;
}

export interface MapPart {
  part: string;
  label: string;
  rows: MapRow[];
}

/**
 * The map of a reader who holds the initial report (EUR 1.99 paid or gifted): the Core
 * Archetype in full with the rows every reader has, the featured chapters partly open, the
 * rest locked. `wizardDrawer`'s "free" is in full, its "open" partly open.
 */
export function initialReportMap(): MapPart[] {
  return wizardDrawer("pay_to_start_initial").map((p) => ({
    part: p.part,
    label: p.label,
    rows: p.rows.map((r) => ({ id: r.id, label: r.label, access: r.badge })),
  }));
}

export const PART_COUNT = WIZARD_PART_COUNT;
export const CHAPTER_COUNT = WIZARD_CHAPTER_COUNT;

/** The four featured chapters, partly open with the initial report, as the map marks them. */
export function featuredChapters(): MapRow[] {
  return initialReportMap().flatMap((p) => p.rows.filter((r) => r.access === "open"));
}

function tag(text: string): string {
  return `<span style="display:inline-block; padding:1px 6px; border:1px solid ${C.line}; border-radius:4px; font-family:${SANS}; font-size:9px; font-weight:700; letter-spacing:0.6px; line-height:14px; color:${C.muted}; white-space:nowrap;">${e(text)}</span>`;
}

function mapRowHtml(r: MapRow, freeTag: string | null, lockSrc: string): string {
  const featured = r.access === "open";
  const right =
    r.access === "free"
      ? freeTag
        ? tag(freeTag)
        : ""
      : r.access === "locked"
        ? `<img src="${e(lockSrc)}" width="10" height="10" alt="" style="display:block; border:0; width:10px; height:10px;">`
        : "";
  const box = featured
    ? `border:1px dashed #f0a48c; border-radius:8px;`
    : `border:1px solid #ffffff; border-radius:8px;`;
  return `
<tr><td style="padding:2px 0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="${box}">
    <tr>
      <td style="padding:5px 8px; font-family:${SANS}; font-size:12px; line-height:16px; font-weight:${featured ? 700 : 500}; color:${C.ink};">${e(r.label)}</td>
      <td align="right" width="44" style="padding:5px 8px 5px 0;">${right}</td>
    </tr>
  </table>
</td></tr>`;
}

function partHeader(p: MapPart): string {
  return `<tr><td style="padding:10px 4px 4px; font-family:${SANS}; font-size:10px; font-weight:700; letter-spacing:0.8px; text-transform:uppercase; line-height:14px; color:${C.partRed};">${e(`${p.part} · ${p.label}`)}</td></tr>`;
}

/** The map's list: every part and row, in a bordered column. */
function mapList(parts: MapPart[], freeTag: string | null, lockSrc: string): string {
  const body = parts
    .map((p) => partHeader(p) + p.rows.map((r) => mapRowHtml(r, freeTag, lockSrc)).join(""))
    .join("");
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${C.line}; border-radius:16px;">
  <tr><td style="padding:6px 10px 12px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${body}</table>
  </td></tr>
</table>`;
}

export interface MapLegend {
  /** The tag on the rows opened in full: the price before it is paid, "IN FULL" after, "FREE" when gifted. */
  freeTag: string;
  freeLine: string;
  featuredLine: string;
  lockedLine: string;
}

/**
 * The chapter map with its legend beside it ("6 Parts, 17 Chapters", what the tags mean), as
 * U1, I2 and I3 draw it. Stacks on a narrow screen.
 */
export function chapterMap(lockSrc: string, legend: MapLegend): string {
  const parts = initialReportMap();
  const legendHtml = `
<div style="font-family:${SERIF}; font-size:20px; line-height:26px; font-weight:500; color:${C.ink};">${PART_COUNT} Parts,<br>${CHAPTER_COUNT} Chapters</div>
<div style="height:16px; line-height:16px; font-size:0;">&nbsp;</div>
${tag(legend.freeTag)}
<div style="padding-top:6px; font-family:${SANS}; font-size:13px; line-height:20px; color:${C.body};">${legend.freeLine}</div>
<div style="height:16px; line-height:16px; font-size:0;">&nbsp;</div>
<span style="display:inline-block; width:34px; height:12px; border:1px dashed #f0a48c; border-radius:4px;"></span>
<div style="padding-top:6px; font-family:${SANS}; font-size:13px; line-height:20px; color:${C.body};">${legend.featuredLine}</div>
<div style="height:16px; line-height:16px; font-size:0;">&nbsp;</div>
<img src="${e(lockSrc)}" width="12" height="12" alt="" style="display:block; border:0; width:12px; height:12px;">
<div style="padding-top:6px; font-family:${SANS}; font-size:13px; line-height:20px; color:${C.body};">${legend.lockedLine}</div>`;
  return row(`
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td class="stack" width="56%" valign="top" style="padding-right:12px;">${mapList(parts, legend.freeTag, lockSrc)}</td>
    <td class="stack" width="44%" valign="middle" style="padding-left:12px;">${legendHtml}</td>
  </tr>
</table>`);
}

/** C1's "The questions your report answers": each part beside the question it answers. */
export const PART_QUESTIONS: Record<string, { title: string; body?: string }> = {
  "Part 1": {
    title: "Start with who you are.",
    body: "Your Core Archetype, your constellation and how this report was built.",
  },
  "Part 3": { title: "Which rules about sex did you never agree to?" },
  "Part 4": { title: "What turns you on, and what shuts you down?" },
  "Part 5": { title: "Where do you and your partners keep missing each other?" },
  "Part 6": { title: "Which fantasies belong in your head, and which in your bed?" },
};

export function questionsMap(): string {
  const parts = initialReportMap();
  const rows = parts
    .map((p) => {
      const q = PART_QUESTIONS[p.part];
      const list = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  ${partHeader(p)}
  ${p.rows
    .map(
      (r) =>
        `<tr><td style="padding:5px 8px; font-family:${SANS}; font-size:12px; line-height:16px; font-weight:${r.access === "open" ? 700 : 500}; color:${C.ink};">${e(r.label)}</td></tr>`
    )
    .join("")}
</table>`;
      const right = q
        ? `<div style="font-family:${SERIF}; font-size:16px; line-height:22px; font-weight:${q.body ? 600 : 500}; color:${C.ink};"><span style="color:${C.partRed};">&mdash;</span>&nbsp;${e(q.title)}</div>${
            q.body
              ? `<div style="padding-top:6px; font-family:${SANS}; font-size:13px; line-height:20px; color:${C.muted};">${e(q.body)}</div>`
              : ""
          }`
        : "";
      return `<tr>
  <td class="stack" width="50%" valign="top" style="padding:0 12px 0 10px; border-left:1px solid ${C.line}; border-right:1px solid ${C.line};">${list}</td>
  <td class="stack" width="50%" valign="top" style="padding:14px 0 0 12px;">${right}</td>
</tr>`;
    })
    .join("");
  return row(`
<div style="text-align:center; font-family:${SERIF}; font-size:30px; line-height:36px; font-weight:500; color:${C.ink};">The questions<br><span style="color:${C.pink};">your report</span> answers.</div>
<div style="height:24px; line-height:24px; font-size:0;">&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${C.line};">
${rows}
<tr><td colspan="2" style="height:12px; line-height:12px; font-size:0; border-top:1px solid ${C.line};">&nbsp;</td></tr>
</table>`);
}
