#!/usr/bin/env node
/**
 * Tell the IndexNow search engines (Bing, Yandex, Seznam, Naver, Yep, Amazon, the Internet
 * Archive; not Google) which glossary URLs changed, so they recrawl them soon rather than
 * whenever. Google gets the same news from the sitemap: resubmit it in Search Console.
 *
 *   node scripts/indexnow.mjs           # dry run: prints the URLs it would send
 *   node scripts/indexnow.mjs --send    # checks the live key file, then submits
 *
 * Run it once after a production deploy that changed the glossary. IndexNow wants only
 * added, updated or deleted URLs; resubmitting unchanged pages just spends crawl budget.
 * The URLs: every glossary URL in the live sitemap, plus the merged and removed slugs
 * (deleted URLs count as changes too).
 *
 * The key is the name and the content of public/<key>.txt (protocol: 8–128 characters,
 * a–z, 0–9 and dashes); the engines fetch that file to confirm we own the host.
 */
import { readdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  GLOSSARY_MERGED,
  GLOSSARY_REMOVED,
} = require("../features/glossary/glossary-redirects.constants.js");

const HOST = "www.loveiq.org";
const ORIGIN = `https://${HOST}`;
const ENDPOINT = "https://api.indexnow.org/indexnow";

const keyFiles = readdirSync(new URL("../public/", import.meta.url)).filter((f) =>
  /^[0-9a-f]{32}\.txt$/.test(f)
);
if (keyFiles.length !== 1) {
  console.error(`Expected one IndexNow key file in public/, found ${keyFiles.length}.`);
  process.exit(1);
}
const KEY = keyFiles[0].replace(/\.txt$/, "");
const KEY_LOCATION = `${ORIGIN}/${KEY}.txt`;

async function main() {
  const send = process.argv.includes("--send");

  const sitemap = await (await fetch(`${ORIGIN}/sitemap.xml`)).text();
  const live = [...sitemap.matchAll(/<loc>(https:\/\/[^<]+\/glossary(?:\/[^<]+)?)<\/loc>/g)].map(
    (m) => m[1]
  );
  const retired = [...Object.keys(GLOSSARY_MERGED), ...GLOSSARY_REMOVED].map(
    (slug) => `${ORIGIN}/glossary/${slug}`
  );
  const urlList = [...new Set([...live, ...retired])];
  console.log(
    `${urlList.length} URLs: ${live.length} live (sitemap), ${retired.length} merged or removed`
  );

  if (!send) {
    console.log(`${urlList.slice(0, 5).join("\n")}\n…\nDry run. Add --send to submit.`);
    return;
  }

  // The engines reject the batch if they can't read the key from our own host.
  const keyFile = await fetch(KEY_LOCATION);
  if (!keyFile.ok || (await keyFile.text()).trim() !== KEY) {
    throw new Error(`${KEY_LOCATION} doesn't serve the key yet: deploy public/${KEY}.txt first.`);
  }

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host: HOST, key: KEY, keyLocation: KEY_LOCATION, urlList }),
  });
  // 200 or 202: accepted. 400: bad request. 403: key not valid. 422: URLs not on this host.
  // 429: too many requests.
  console.log(`IndexNow answered ${res.status} ${res.statusText}`);
  if (!res.ok) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
