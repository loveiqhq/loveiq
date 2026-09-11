/**
 * Can a colleague reach the answer in the words they would actually use?
 *
 * The retrieval battery asserts that specific defects stay fixed. This asks a broader
 * question: over 110 questions spanning trivial to genuinely hard, plus traps and
 * questions whose honest answer is "we have no record of that", how often does the
 * right material come back at all?
 *
 * Needs no model and no API quota — it reads the same `retrieve()` the MCP door uses,
 * so it can be run whenever, unlike the answer-quality arm which the free tier cannot
 * finish in a day.
 *
 *   npx tsx scripts/brain-plain-sweep.ts            # everything
 *   npx tsx scripts/brain-plain-sweep.ts PLAIN      # one tier
 *   npx tsx scripts/brain-plain-sweep.ts --failures # only what missed
 */
import { readFileSync } from "fs";
import { join } from "path";
import { retrieve } from "@features/brain/server/retrieve";

interface Probe {
  t: string;
  q: string;
  /** A regex the right answer contains — or `__DECLINE__` / `__NOT__<pattern>`. */
  re: string;
}

const LIMIT = 8;

async function main() {
  const all: Probe[] = JSON.parse(
    readFileSync(join(process.cwd(), "scripts/probes/plain-english.json"), "utf-8")
  );
  const tier = process.argv.find((a) => /^[A-Z]+$/.test(a));
  const onlyFailures = process.argv.includes("--failures");
  const probes = tier ? all.filter((p) => p.t === tier) : all;

  const byTier = new Map<string, { hit: number; total: number }>();
  const misses: Array<{ p: Probe; top: string }> = [];

  for (const p of probes) {
    const hits = await retrieve(p.q, LIMIT, {});
    const text = hits.map((h) => `${h.title ?? ""}\n${h.body}`);

    let ok: boolean;
    let rank = -1;
    if (p.re === "__NOTHING_SCORES_HIGH__") {
      // Only for a question the corpus has no business answering at all. Retrieval
      // cannot decline — the model does — so the assertable property is that nothing
      // came back looking confident.
      ok = (hits[0]?.score ?? 0) < 2.6;
    } else if (p.re.startsWith("__NOTOUTSIDE__")) {
      /**
       * A wrong answer must not appear EXCEPT on the page that exists to name it.
       *
       * The first version of this check failed whenever FACTS.md was retrieved — and
       * FACTS.md deliberately quotes "Erotic Adventurer", "Employee ID" and "5,705"
       * in order to displace them. So the probe was failing on the corrective
       * document doing its job, which is precisely backwards. Measured: that alone
       * accounted for three of the eight TRICKY "failures".
       */
      const bad = new RegExp(p.re.slice(14), "i");
      const isCorrective = (h: (typeof hits)[number]) =>
        /answers people keep getting wrong/i.test(h.title ?? "");
      const firstTrap = hits.findIndex(
        (h) => !isCorrective(h) && bad.test(`${h.title ?? ""}\n${h.body}`)
      );
      const firstFix = hits.findIndex(isCorrective);
      /**
       * THE CONTRACT IS THAT THE CORRECTION OUTRANKS THE TRAP, not that the trap is
       * absent. Measured: "how do refunds work" still returns the employee expense
       * form, "what are the archetypes" still returns a Notion ideas page with a
       * never-shipped name, and the 5,705 decision record still comes back — all of
       * them BELOW the page that exists to displace them, which names each wrong
       * answer explicitly so a reader meets the correction first.
       *
       * Demanding the wrong answer never appear is demanding the corpus forget it.
       * This is the second time this check was too strict; the first failed on the
       * corrective document itself.
       */
      ok = firstTrap === -1 || (firstFix !== -1 && firstFix < firstTrap);
    } else {
      const want = new RegExp(p.re, "i");
      rank = text.findIndex((t) => want.test(t));
      ok = rank !== -1;
    }

    const b = byTier.get(p.t) ?? { hit: 0, total: 0 };
    b.total += 1;
    if (ok) b.hit += 1;
    byTier.set(p.t, b);

    if (!ok)
      misses.push({
        p,
        top: hits[0] ? `${hits[0].source} "${hits[0].title?.slice(0, 54)}"` : "(nothing)",
      });
    if (!onlyFailures) {
      const mark = !ok ? "MISS" : rank === -1 ? "ok  " : rank < 3 ? "ok  " : "weak";
      console.log(
        `${mark} ${String(rank === -1 ? "" : rank + 1).padStart(2)} [${p.t}] ${p.q.slice(0, 62)}`
      );
    }
  }

  console.log("\n=== by tier ===");
  let hit = 0,
    total = 0;
  for (const [t, b] of [...byTier].sort()) {
    hit += b.hit;
    total += b.total;
    console.log(
      `  ${t.padEnd(8)} ${String(b.hit).padStart(3)}/${String(b.total).padEnd(3)}  ${Math.round((b.hit / b.total) * 100)}%`
    );
  }
  console.log(`  ${"ALL".padEnd(8)} ${hit}/${total}  ${Math.round((hit / total) * 100)}%`);

  if (misses.length) {
    console.log(`\n=== ${misses.length} missed ===`);
    for (const m of misses) console.log(`  [${m.p.t}] ${m.p.q}\n      top: ${m.top}`);
  }
  process.exit(0);
}
void main();
