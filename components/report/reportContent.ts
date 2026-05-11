const REPORT_BLOCK_PATTERN = /<(table|div|ul|ol|p|h[1-6])\b[\s\S]*?<\/\1>/gi;
const REPORT_FOOTNOTE_ANCHOR_PATTERN =
  /<a\b[^>]*href="https:\/\/docs\.google\.com\/document\/[^"]*"[^>]*>\s*(?:\d+|[*†‡]+)\s*<\/a>/gi;
const REPORT_FOOTNOTE_SUP_PATTERN =
  /<sup>\s*(?:<a\b[^>]*>\s*(?:\d+|[*†‡]+)\s*<\/a>|(?:\d+|[*†‡]+))\s*<\/sup>/gi;
const REPORT_TRAILING_REFERENCE_PATTERN =
  /([?!.,:;"'")\]])\s*(?:<sup>\s*)?(?:\d+|[*†‡]+)(?:\s*<\/sup>)?(?=\s*<\/(?:p|li|h[1-6])>)/gi;
const REPORT_SPLIT_STRONG_PARAGRAPH_PATTERN =
  /<p>\s*<strong>((?:(?!<\/strong>)[\s\S])*)<\/strong>\s*<\/p>\s*<p>([\s\S]*?)<\/p>/gi;
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

export interface ReportAttachmentPattern {
  descriptionHtml: string;
  examples: string[];
  title: string;
}

const ATTACHMENT_COMMON_HEADING_PATTERN = /^Common Attachment Style Patterns Across Archetypes$/i;
const ATTACHMENT_PATTERN_TITLES = new Set([
  "secure attachment",
  "anxious attachment",
  "avoidant attachment",
  "disorganized or mixed attachment",
  "contextual / adaptive attachment",
]);

export function normalizeReportHtml(html: string | null | undefined) {
  if (!html) return html ?? "";

  return html
    .replace(REPORT_FOOTNOTE_ANCHOR_PATTERN, "")
    .replace(REPORT_FOOTNOTE_SUP_PATTERN, "")
    .replace(REPORT_TRAILING_REFERENCE_PATTERN, "$1")
    .replace(REPORT_SPLIT_STRONG_PARAGRAPH_PATTERN, (_match, heading, body) =>
      /<br\s*\/?>/.test(heading)
        ? _match
        : `<p><strong>${heading.trim()}<br /></strong>${body.trim()}</p>`
    )
    .replace(/\s{2,}/g, " ")
    .trim();
}

function stripReportImages(html: string) {
  return html.replace(REPORT_IMAGE_TAG_PATTERN, "");
}

export function ensureSexualStageHighlight(
  html: string | null | undefined,
  options?: { isLocked?: boolean }
) {
  const normalizedHtml = normalizeReportHtml(html);

  if (!normalizedHtml) return normalizedHtml;

  const valueClass = `report-stage-highlight__value${options?.isLocked ? " report-stage-highlight__value--locked" : ""}`;
  const metaClass = `report-stage-highlight__meta${options?.isLocked ? " report-stage-highlight__meta--locked" : ""}`;

  if (normalizedHtml.includes('class="report-stage-highlight"')) {
    return normalizedHtml
      .replace(
        /class="report-stage-highlight__value(?:\s+report-stage-highlight__value--locked)?"/g,
        `class="${valueClass}"`
      )
      .replace(
        /class="report-stage-highlight__meta(?:\s+report-stage-highlight__meta--locked)?"/g,
        `class="${metaClass}"`
      );
  }

  return normalizedHtml.replace(
    SEXUAL_STAGE_SUMMARY_PATTERN,
    (_match, value, description) =>
      `<div class="report-stage-highlight"><p class="report-stage-highlight__label">Your likely current sexual stage:</p><p class="${valueClass}">${value.trim()}</p><p class="${metaClass}">(${description.trim()})</p></div>`
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

function normalizeAttachmentPatternTitle(title: string) {
  return title.replace(/\s+/g, " ").trim().replace(/[.:]$/, "");
}

function splitAttachmentExamples(descriptionHtml: string) {
  const exampleMatch = descriptionHtml.match(/<em>\s*\((?:e\.g\.\s*)?([\s\S]*?)\)\s*<\/em>/i);

  if (!exampleMatch) {
    return { descriptionHtml, examples: [] as string[] };
  }

  // exampleMatch is a RegExpMatchArray; [0] is the full match, [1] is the captured group.
  const descriptionWithoutExamples = normalizeReportHtml(
    descriptionHtml.replace(exampleMatch[0], "").replace(/<p>\s*<\/p>/gi, "")
  );

  const examples = getReportBlockText(exampleMatch[1]!)
    .split(/\s*,\s*/)
    .map((entry) => entry.trim())
    .filter(Boolean);

  return {
    descriptionHtml: descriptionWithoutExamples,
    examples,
  };
}

function parseAttachmentPatternHeading(block: string) {
  if (!/^\s*<p\b/i.test(block)) return null;

  const strongMatch = block.match(/<strong>([\s\S]*?)<\/strong>/i);
  if (!strongMatch) return null;

  const title = normalizeAttachmentPatternTitle(getReportBlockText(strongMatch[1]!));
  if (!ATTACHMENT_PATTERN_TITLES.has(title.toLowerCase())) return null;

  const afterStrong = block
    .slice((strongMatch.index ?? 0) + strongMatch[0].length)
    .replace(/^\s*(<br\s*\/?>\s*)+/i, "")
    .replace(/\s*<\/p>\s*$/i, "")
    .trim();

  return {
    inlineDescriptionHtml: getReportBlockText(afterStrong) ? `<p>${afterStrong}</p>` : "",
    title,
  };
}

export function extractAttachmentSectionContent(html: string | null | undefined) {
  const blocks = extractReportHtmlBlocks(html ?? "");
  const { bodyBlocks, headingBlock } = splitTrailingHeadingBlock(blocks);
  const commonHeadingIndex = bodyBlocks.findIndex((block) =>
    ATTACHMENT_COMMON_HEADING_PATTERN.test(getReportBlockText(stripReportImages(block)))
  );

  if (commonHeadingIndex === -1) {
    return {
      commonHeading: null as string | null,
      headingBlock,
      introHtml: joinReportHtmlBlocks(bodyBlocks),
      outroHtml: "",
      patterns: [] as ReportAttachmentPattern[],
    };
  }

  const introBlocks = bodyBlocks.slice(0, commonHeadingIndex);
  const remainingBlocks = bodyBlocks.slice(commonHeadingIndex + 1);
  const patterns: ReportAttachmentPattern[] = [];
  const outroBlocks: string[] = [];
  let pendingTitle: string | null = null;
  let encounteredPattern = false;

  for (const block of remainingBlocks) {
    const parsedHeading = parseAttachmentPatternHeading(block);

    if (parsedHeading) {
      if (pendingTitle) {
        patterns.push({ title: pendingTitle, descriptionHtml: "", examples: [] });
      }

      pendingTitle = parsedHeading.title;
      encounteredPattern = true;

      if (parsedHeading.inlineDescriptionHtml) {
        const { descriptionHtml, examples } = splitAttachmentExamples(
          parsedHeading.inlineDescriptionHtml
        );
        patterns.push({ title: parsedHeading.title, descriptionHtml, examples });
        pendingTitle = null;
      }

      continue;
    }

    if (pendingTitle) {
      const { descriptionHtml, examples } = splitAttachmentExamples(block.trim());
      patterns.push({ title: pendingTitle, descriptionHtml, examples });
      pendingTitle = null;
      encounteredPattern = true;
      continue;
    }

    if (encounteredPattern) {
      outroBlocks.push(block);
    }
  }

  if (pendingTitle) {
    patterns.push({ title: pendingTitle, descriptionHtml: "", examples: [] });
  }

  return {
    commonHeading: "Common Attachment Style Patterns Across Archetypes",
    headingBlock,
    introHtml: joinReportHtmlBlocks(introBlocks),
    outroHtml: joinReportHtmlBlocks(outroBlocks),
    patterns,
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
    if (fantasyPullText == null || actualPleasureText == null) return [];

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
