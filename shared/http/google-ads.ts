import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import { getDelegatedToken } from "@shared/http/google-oauth";

/**
 * The Google Ads API on LoveIQ's account (client 308-771-7405), read as ec@loveiq.org, a user of
 * the account, through domain-wide delegation. No developer token is sent: the access level
 * belongs to the Cloud project the token comes from, which has had Basic access since
 * 2026-10-04. Google retires an API version about a year after it ships, so a 404 here means
 * moving to the current one.
 */
export const GOOGLE_ADS_SEARCH =
  "https://googleads.googleapis.com/v25/customers/3087717405/googleAds:search";
export const ADWORDS_SCOPE = "https://www.googleapis.com/auth/adwords";

/** Pages of up to 10,000 rows each; a bad query cannot walk forever. */
const MAX_PAGES = 20;

/**
 * Every row of one GAQL query, page by page. Null when no token could be had (not set up, or
 * Google refused it); throws when the API refuses the query.
 */
export async function googleAdsSearch<T>(
  query: string,
  options: { oidcToken?: string | null; timeoutMs?: number } = {}
): Promise<T[] | null> {
  const token = await getDelegatedToken(
    "ec@loveiq.org",
    ADWORDS_SCOPE,
    Date.now(),
    options.oidcToken
  );
  if (!token) return null;
  const rows: T[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await fetchWithTimeout(GOOGLE_ADS_SEARCH, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(pageToken ? { query, pageToken } : { query }),
      timeoutMs: options.timeoutMs ?? 30_000,
    });
    if (!res.ok)
      throw new Error(`${GOOGLE_ADS_SEARCH} -> ${res.status} ${(await res.text()).slice(0, 200)}`);
    const json = (await res.json()) as { results?: T[]; nextPageToken?: string };
    rows.push(...(json.results ?? []));
    pageToken = json.nextPageToken;
    if (!pageToken) return rows;
  }
  throw new Error(`Google Ads search did not finish in ${MAX_PAGES} pages`);
}
