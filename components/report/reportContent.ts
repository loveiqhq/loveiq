const REPORT_BLOCK_PATTERN = /<(table|div|ul|ol|p)\b[\s\S]*?<\/\1>/gi;
const REPORT_FOOTNOTE_ANCHOR_PATTERN =
  /<a\b[^>]*href="https:\/\/docs\.google\.com\/document\/[^"]*"[^>]*>\s*(?:\d+|[*†‡]+)\s*<\/a>/gi;
const REPORT_FOOTNOTE_SUP_PATTERN =
  /<sup>\s*(?:<a\b[^>]*>\s*(?:\d+|[*†‡]+)\s*<\/a>|(?:\d+|[*†‡]+))\s*<\/sup>/gi;
const REPORT_TRAILING_REFERENCE_PATTERN =
  /([?!.,:;"'")\]])\s*(?:<sup>\s*)?(?:\d+|[*†‡]+)(?:\s*<\/sup>)?(?=\s*<\/(?:p|li|h[1-6])>)/gi;
const SEXUAL_STAGE_SUMMARY_PATTERN =
  /<p><strong>\s*Your likely current sexual stage:\s*<\/strong>\s*([\s\S]*?)<\/p>\s*<p>\(([\s\S]*?)\)<\/p>/i;

const REPORT_ENTITY_MAP: Record<string, string> = {
  "&amp;": "&",
  "&quot;": '"',
  "&#39;": "'",
  "&nbsp;": " ",
  "&ndash;": "\u2013",
  "&mdash;": "\u2014",
};

const REPORT_IMAGE_TAG_PATTERN = /<img\b[^>]*>/gi;
const REPORT_TABLE_ROW_PATTERN = /<tr\b[\s\S]*?<\/tr>/gi;
const REPORT_TABLE_CELL_PATTERN = /<t[hd]\b[\s\S]*?<\/t[hd]>/gi;
const PRACTICE_SECTION_TITLE_PATTERN = /^Typical Sexual Fantasy\s*&\s*Practice Tendencies of the/i;

const practiceIntroCache = new Map<string, string>();
const practiceGroupCache = new Map<string, ReportPracticeTendencyGroup[]>();

export interface ReportPracticeTendencyRow {
  actualPleasure: number;
  description?: string | null;
  fantasyPull: number;
  practice: string;
}

export interface ReportPracticeTendencyGroup {
  rows: ReportPracticeTendencyRow[];
  title: string;
}

export function normalizeReportHtml(html: string | null | undefined) {
  if (!html) return html ?? "";

  return html
    .replace(REPORT_FOOTNOTE_ANCHOR_PATTERN, "")
    .replace(REPORT_FOOTNOTE_SUP_PATTERN, "")
    .replace(REPORT_TRAILING_REFERENCE_PATTERN, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function stripReportImages(html: string) {
  return html.replace(REPORT_IMAGE_TAG_PATTERN, "");
}

export function ensureSexualStageHighlight(html: string | null | undefined) {
  const normalizedHtml = normalizeReportHtml(html);

  if (!normalizedHtml || normalizedHtml.includes('class="report-stage-highlight"')) {
    return normalizedHtml;
  }

  return normalizedHtml.replace(
    SEXUAL_STAGE_SUMMARY_PATTERN,
    (_match, value, description) =>
      `<div class="report-stage-highlight"><p class="report-stage-highlight__label">Your likely current sexual stage:</p><p class="report-stage-highlight__value">${value.trim()}</p><p class="report-stage-highlight__meta">(${description.trim()})</p></div>`
  );
}

export function extractReportHtmlBlocks(html: string) {
  return (
    normalizeReportHtml(html)
      .match(REPORT_BLOCK_PATTERN)
      ?.map((block) => block.trim())
      .filter(Boolean) ?? []
  );
}

export function joinReportHtmlBlocks(blocks: string[]) {
  return blocks.join("");
}

export function getReportBlockText(block: string) {
  return normalizeReportHtml(block)
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(amp|quot|#39|nbsp|ndash|mdash);/g, (entity) => REPORT_ENTITY_MAP[entity] ?? entity)
    .replace(/\s+/g, " ")
    .trim();
}

export function hasMeaningfulReportHtml(html: string | null | undefined) {
  if (!html) return false;
  return getReportBlockText(html).length > 0;
}

export function isStandaloneHeadingBlock(block: string) {
  if (!/^\s*<p\b/i.test(block)) return false;

  const text = getReportBlockText(block);
  if (!text) return false;
  if (text.length > 120) return false;
  if (/[.!?]$/.test(text)) return false;

  return true;
}

export function splitTrailingHeadingBlock(blocks: string[]) {
  if (blocks.length === 0) return { bodyBlocks: blocks, headingBlock: null as string | null };

  const lastBlock = blocks.at(-1) ?? null;
  if (!lastBlock || !isStandaloneHeadingBlock(lastBlock)) {
    return { bodyBlocks: blocks, headingBlock: null as string | null };
  }

  return {
    bodyBlocks: blocks.slice(0, -1),
    headingBlock: lastBlock,
  };
}

function parsePracticeIntensity(value: string) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(10, Math.max(1, parsed));
}

function parsePracticeTableRows(tableHtml: string): ReportPracticeTendencyRow[] {
  const rows = tableHtml.match(REPORT_TABLE_ROW_PATTERN) ?? [];

  return rows.flatMap((rowHtml) => {
    const cells = rowHtml.match(REPORT_TABLE_CELL_PATTERN) ?? [];
    if (cells.length < 3) return [];

    const [practice, fantasyPullText, actualPleasureText] = cells.map((cell) =>
      getReportBlockText(stripReportImages(cell))
    );

    if (!practice || /^practice$/i.test(practice)) return [];

    const fantasyPull = parsePracticeIntensity(fantasyPullText);
    const actualPleasure = parsePracticeIntensity(actualPleasureText);

    if (fantasyPull === null || actualPleasure === null) return [];

    return [{ practice, fantasyPull, actualPleasure }];
  });
}

export function extractPracticeSectionIntroHtml(html: string | null | undefined) {
  const normalizedHtml = normalizeReportHtml(html);
  if (!normalizedHtml) return "";

  const cached = practiceIntroCache.get(normalizedHtml);
  if (cached !== undefined) return cached;

  const introBlocks = extractReportHtmlBlocks(normalizedHtml).flatMap((block) => {
    const cleanedBlock = stripReportImages(block).trim();
    const text = getReportBlockText(cleanedBlock);

    if (!text || PRACTICE_SECTION_TITLE_PATTERN.test(text)) {
      return [];
    }

    return [cleanedBlock];
  });

  const introHtml = joinReportHtmlBlocks(introBlocks);
  practiceIntroCache.set(normalizedHtml, introHtml);
  return introHtml;
}

export function parsePracticeTendencyGroups(
  html: string | null | undefined
): ReportPracticeTendencyGroup[] {
  const normalizedHtml = normalizeReportHtml(html);
  if (!normalizedHtml) return [];

  const cached = practiceGroupCache.get(normalizedHtml);
  if (cached !== undefined) return cached;

  const groups: ReportPracticeTendencyGroup[] = [];
  let pendingTitle: string | null = null;

  for (const block of extractReportHtmlBlocks(normalizedHtml)) {
    if (/^\s*<table\b/i.test(block)) {
      const rows = parsePracticeTableRows(block);

      if (pendingTitle && rows.length > 0) {
        groups.push({ title: pendingTitle, rows });
      }

      pendingTitle = null;
      continue;
    }

    const text = getReportBlockText(stripReportImages(block));
    if (text) {
      pendingTitle = text;
    }
  }

  practiceGroupCache.set(normalizedHtml, groups);
  return groups;
}
