import { embedQuery } from "@features/brain/server/embed";
import { supabaseFetch } from "@features/admin/server/supabase";

/** Business questions: a non-commit business source must reach the top 3. */
const BUSINESS: Array<[string, string]> = [
  [
    "walk me through the funnel from visit to payment and tell me where people drop off",
    "analytics",
  ],
  ["where are we losing people in the funnel", "analytics"],
  ["what is our drop off between survey and payment", "analytics"],
  ["how does our funnel perform end to end", "analytics"],
  ["conversion through the funnel by stage", "analytics"],
  ["what is our conversion rate", "analytics"],
  ["how much revenue have we made in total", "analytics"],
  ["what did we decide about micro assessments and the consumer pivot", "drive"],
  ["what did we decide about the pricing test", "slack"],
  ["what is on the notion board right now", "notion"],
];
/** Engineering questions: commits MUST stay reachable. The regression guard. */
const ENGINEERING: Array<[string, string]> = [
  ["what did we change about the daily digest", "commit"],
  ["what did we fix in the paywall recently", "commit"],
  ["what commits touched the brain ingest", "commit"],
  ["what did we change in the checkout session route", "commit"],
  ["what have we been shipping this week", "commit"],
];
const PENALTIES = [0, 0.15, 0.3, 0.45, 0.6, 0.8];

async function rankOf(q: string, vec: string | null, want: string, pen: number): Promise<number> {
  const res = await supabaseFetch("/rest/v1/rpc/brain_search_sweep", {
    method: "POST",
    body: JSON.stringify({
      query_text: q,
      k: 12,
      per_source: 3,
      query_embedding: vec,
      commit_penalty: pen,
    }),
  });
  if (!res.ok) throw new Error(`sweep ${res.status}`);
  const rows = (await res.json()) as Array<{ source: string }>;
  const i = rows.findIndex((r) => r.source === want);
  return i < 0 ? 99 : i + 1;
}

async function main() {
  const all = [...BUSINESS, ...ENGINEERING];
  const vecs = new Map<string, string | null>();
  for (const [q] of all) vecs.set(q, await embedQuery(q));

  const hdr = PENALTIES.map((p) => p.toFixed(2).padStart(6)).join("");
  console.log(`\n${"".padEnd(52)}${hdr}   (rank of target source; 99 = absent)`);
  for (const [label, set] of [
    ["BUSINESS", BUSINESS],
    ["ENGINEERING", ENGINEERING],
  ] as const) {
    console.log(`\n--- ${label} ---`);
    for (const [q, want] of set) {
      const ranks: number[] = [];
      for (const p of PENALTIES) ranks.push(await rankOf(q, vecs.get(q)!, want, p));
      console.log(
        `${(q.slice(0, 46) + " →" + want).padEnd(52)}${ranks.map((r) => String(r).padStart(6)).join("")}`
      );
    }
  }
  // headline: how many business probes have their target in the top 3
  console.log("\n--- SUMMARY: targets in top 3 ---");
  for (const p of PENALTIES) {
    let b = 0,
      e = 0;
    for (const [q, w] of BUSINESS) if ((await rankOf(q, vecs.get(q)!, w, p)) <= 3) b++;
    for (const [q, w] of ENGINEERING) if ((await rankOf(q, vecs.get(q)!, w, p)) <= 3) e++;
    console.log(
      `  penalty ${p.toFixed(2)}: business ${b}/${BUSINESS.length}   engineering ${e}/${ENGINEERING.length}`
    );
  }
}
main();
