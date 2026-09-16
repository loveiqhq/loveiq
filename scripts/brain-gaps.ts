/**
 * WHICH QUESTIONS THE CORPUS CANNOT ANSWER — read off real usage, not imagination.
 *
 * `brain_query` holds every tool call the brain has served. What it could not say, until
 * the `content_score` column existed, was whether an answer was any GOOD: it stored
 * `chunks[0].score`, which is content plus recency and every other ranking bonus. The
 * weak-match warning a reader sees is judged on `contentScore` — bonuses stripped — and
 * that figure was thrown away. It matters: a junk probe measured 2026-09-16 stored
 * top_score 1.92, comfortably ABOVE the 1.85 floor, while its content score was 1.35 and
 * the reader was correctly warned. Ranking order and match quality are different numbers.
 *
 * Rows written before that column only have the bonused figure, so this does not read the
 * history — it RE-SCORES the distinct questions really asked, through the same `retrieve()`
 * the MCP tool calls. That is why the report has data on day one instead of in a month, and
 * why it reflects the corpus as it stands now rather than as it stood when each was asked.
 *
 * What it is NOT: a quality judgement. A low score means the corpus does not lexically or
 * semantically cover the question. Whether that matters is a person's call — some of these
 * are questions nobody should expect an answer to.
 */

import { RELEVANCE_FLOOR } from "@/app/api/mcp/route";
import { retrieve } from "@features/brain/server/retrieve";
import { supabaseFetch } from "@features/admin/server/supabase";

/** Matches the MCP tool's own default so the scores are comparable to production. */
const LIMIT = 12;

interface Asked {
  question: string;
  times: number;
}

/**
 * Real traffic only.
 *
 * `surface='mcp-battery'` is my own probes driving the same handlers, including deliberate
 * failures. Counting those would make the battery's junk queries look like questions the
 * team asks, which is precisely the mistake that column exists to prevent.
 */
async function askedQuestions(): Promise<Asked[]> {
  const select = "select=question";
  const filter = "tool=eq.search_company_context&error=is.null&surface=eq.mcp";
  const res = await supabaseFetch(`/rest/v1/brain_query?${select}&${filter}&limit=5000`);
  if (!res.ok) throw new Error(`could not read brain_query (${res.status})`);
  const rows = (await res.json()) as Array<{ question: string | null }>;

  const counts = new Map<string, Asked>();
  for (const r of rows) {
    const q = (r.question ?? "").trim();
    if (q.length < 2) continue;
    const key = q.toLowerCase();
    const seen = counts.get(key);
    if (seen) seen.times += 1;
    else counts.set(key, { question: q, times: 1 });
  }
  return [...counts.values()];
}

export interface Gap extends Asked {
  /** Best content-only match now, or null when the corpus returned nothing at all. */
  score: number | null;
}

/** Sorted by how often it is asked, because a gap asked six times is six failures. */
export function rankGaps(scored: Gap[], floor: number): Gap[] {
  return scored
    .filter((g) => g.score === null || g.score < floor)
    .sort((a, b) => b.times - a.times || (a.score ?? 0) - (b.score ?? 0));
}

async function main() {
  const asked = await askedQuestions();
  if (asked.length === 0) {
    console.log("No real questions logged yet — nothing to measure.");
    process.exit(3);
  }

  const scored: Gap[] = [];
  for (const a of asked) {
    const hits = await retrieve(a.question, LIMIT, {});
    scored.push({
      ...a,
      score: hits.length === 0 ? null : hits.reduce((b, c) => Math.max(b, c.contentScore), 0),
    });
  }

  const gaps = rankGaps(scored, RELEVANCE_FLOOR);
  const pct = ((gaps.length / scored.length) * 100).toFixed(1);
  console.log(
    `\n${gaps.length} of ${scored.length} distinct questions score below ${RELEVANCE_FLOOR} (${pct}%)\n` +
      `Read the list, not the percentage: gibberish, prompt-injection attempts and questions\n` +
      `about things that never happened BELONG here — a low score on those is the floor\n` +
      `working. Only a question a colleague would really ask is a gap worth indexing for.\n`
  );
  for (const g of gaps) {
    const s = g.score === null ? "no hits" : g.score.toFixed(2);
    const n = g.times > 1 ? ` ×${g.times}` : "";
    console.log(`  ${s.padStart(7)}${n.padEnd(4)}  ${g.question.slice(0, 110)}`);
  }
  // Below the floor is a finding to act on, not a broken script: exit 0 either way, and
  // let the reader decide. A non-zero here would put this on a CI gate it does not belong on.
  //
  // EXPLICIT, because Supabase's keep-alive sockets hold the event loop open after the last
  // row is read. Without it the report prints and the process simply never ends -- and piping
  // it anywhere (`| tail`, `| grep`) then shows NOTHING AT ALL, because the pipe never sees EOF.
  console.log("");
  process.exit(0);
}

if (process.argv[1]?.includes("brain-gaps")) {
  main().catch((err) => {
    console.error(`brain:gaps failed — ${err?.message ?? err}`);
    process.exit(1);
  });
}
