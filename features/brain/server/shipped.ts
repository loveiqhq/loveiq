import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";

/**
 * WHAT SHIPPED, IN MARCUS'S WORDS.
 *
 * Every change to main ends with a plain-English "For Marcus:" line (CLAUDE.md requires
 * it), so the repository already holds a non-technical changelog. Commits stopped being
 * INDEXED on 2026-09-09 because 1,795 dense engineering chunks drowned founder questions;
 * this reads only the summary lines, live, and never enters the index, so it cannot
 * compete with anything in search.
 */

export interface ShippedCommit {
  sha?: string;
  commit?: { message?: string; author?: { date?: string }; committer?: { date?: string } };
}

export interface ShippedEntry {
  date: string;
  pr: number | null;
  sha: string;
  text: string;
}

/**
 * One entry per distinct "For Marcus:" line, newest first, as GitHub lists them.
 *
 * A merge commit and the branch commit it brings in carry the SAME line, and the merge is
 * newer, so the first occurrence is kept: it is the one with the pull request number.
 */
export function shippedEntries(commits: ShippedCommit[]): ShippedEntry[] {
  const seen = new Set<string>();
  const out: ShippedEntry[] = [];
  for (const c of commits) {
    const message = c.commit?.message ?? "";
    const line = message
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => /^for marcus:/i.test(l))
      .at(-1);
    const text = line?.replace(/^for marcus:\s*/i, "").trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    const pr = /\(#(\d+)\)\s*$/.exec(message.split("\n")[0] ?? "");
    out.push({
      date: (c.commit?.committer?.date ?? c.commit?.author?.date ?? "").slice(0, 10),
      pr: pr ? Number(pr[1]) : null,
      sha: (c.sha ?? "").slice(0, 7),
      text,
    });
  }
  return out;
}

const REPO_COMMITS = "https://api.github.com/repos/loveiqhq/loveiq/commits";
/** 300 commits is several busy weeks. Past it the answer says so rather than stopping silently. */
const MAX_PAGES = 3;

export async function fetchShipped(
  since: string,
  until: string | null
): Promise<
  | { ok: true; commits: ShippedCommit[]; truncated: boolean }
  | { ok: false; status: number; detail: string }
> {
  const token = process.env.GITHUB_TOKEN?.trim();
  const commits: ShippedCommit[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url =
      `${REPO_COMMITS}?sha=main&per_page=100&page=${page}&since=${since}T00:00:00Z` +
      (until ? `&until=${until}T23:59:59Z` : "");
    const res = await fetchWithTimeout(url, {
      headers: {
        Accept: "application/vnd.github+json",
        ...(token ? { Authorization: `token ${token}` } : {}),
      },
      timeoutMs: 10_000,
    });
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        detail: (await res.text().catch(() => "")).slice(0, 200),
      };
    }
    const batch = (await res.json().catch(() => null)) as ShippedCommit[] | null;
    if (!Array.isArray(batch))
      return { ok: false, status: res.status, detail: "unexpected response" };
    commits.push(...batch);
    if (batch.length < 100) return { ok: true, commits, truncated: false };
  }
  return { ok: true, commits, truncated: true };
}
