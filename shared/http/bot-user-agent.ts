/**
 * Crawlers and link previewers, by user agent: never a visitor. proxy.ts counts no visit,
 * mints no landing cookie and counts no short-link click for one; /api/survey stamps no
 * first page (`landing_path`) from one. Moved here from proxy.ts unchanged.
 */
export const BOT_UA_REGEX =
  /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|embedly|quora link preview|outbrain|pinterest|vkshare|w3c_validator|whatsapp|telegrambot|applebot|gptbot|chatgpt|ccbot|claudebot|claude-web|perplexity|google-extended|amazonbot|bytespider/i;
