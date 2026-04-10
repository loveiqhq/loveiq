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
};

export function normalizeReportHtml(html: string | null | undefined) {
  if (!html) return html ?? "";

  return html
    .replace(REPORT_FOOTNOTE_ANCHOR_PATTERN, "")
    .replace(REPORT_FOOTNOTE_SUP_PATTERN, "")
    .replace(REPORT_TRAILING_REFERENCE_PATTERN, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
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
    .replace(/&(amp|quot|#39|nbsp);/g, (entity) => REPORT_ENTITY_MAP[entity] ?? entity)
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
