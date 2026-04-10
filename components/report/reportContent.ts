const REPORT_BLOCK_PATTERN = /<(table|div|ul|ol|p)\b[\s\S]*?<\/\1>/gi;

const REPORT_ENTITY_MAP: Record<string, string> = {
  "&amp;": "&",
  "&quot;": '"',
  "&#39;": "'",
  "&nbsp;": " ",
};

export function extractReportHtmlBlocks(html: string) {
  return (
    html
      .match(REPORT_BLOCK_PATTERN)
      ?.map((block) => block.trim())
      .filter(Boolean) ?? []
  );
}

export function joinReportHtmlBlocks(blocks: string[]) {
  return blocks.join("");
}

export function getReportBlockText(block: string) {
  return block
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(amp|quot|#39|nbsp);/g, (entity) => REPORT_ENTITY_MAP[entity] ?? entity)
    .replace(/\s+/g, " ")
    .trim();
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
