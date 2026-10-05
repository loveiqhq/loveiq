/**
 * One persona per archetype: a full set of survey answers that the production scoring
 * engine scores as that archetype, by a clear margin.
 *
 * Found by search, not written by hand: the engine is 21 traits, 14 ideal profiles, 292
 * bonus rules and 12 veto gates (see "The Archetype Machine"), and a hand-picked answer
 * sheet lands on the intended archetype about as often as a guess. Coordinate ascent over
 * every scoring question: try each answer, keep the one that most widens the target's lead
 * over the runner-up, repeat until a full pass changes nothing.
 *
 *   npx tsx scripts/walkers/build-personas.ts        # rewrites scripts/walkers/personas.json
 *
 * Re-run it when the scoring config changes; __tests__/scripts/walker-personas.test.ts fails
 * until you do, so a persona can never quietly walk as the wrong archetype.
 */
import { writeFileSync } from "node:fs";

import { surveyQuestions } from "@/data/survey-data";
import { getScoringConfig, getScoringConfigSha } from "@features/scoring/logic/config";
import { scoreArchetypes } from "@features/scoring/logic/engine";

type Answer = number | string | string[];
export interface Persona {
  archetype: string;
  answers: Record<string, Answer>;
  /** The target's displayed percent and its lead over the runner-up, as scored at build time. */
  percent: number;
  lead: number;
}

const config = getScoringConfig();

/** The answers a walker can give that the engine can score. Name, email and country are set per walk. */
function candidates(q: (typeof surveyQuestions)[number]): Answer[] {
  if (q.answerType === "scale") return [1, 2, 3, 4, 5, 6, 7];
  if (q.answerType === "single") return q.options;
  if (q.answerType === "multiple") {
    const singles = q.options.map((o) => [o]);
    const pairs: string[][] = [];
    for (let i = 0; i < q.options.length; i++) {
      for (let j = i + 1; j < q.options.length; j++) pairs.push([q.options[i]!, q.options[j]!]);
    }
    return [...singles, ...pairs];
  }
  return [];
}

const scoring = surveyQuestions.filter((q) => candidates(q).length > 0);

/** The target's lead over the best other archetype, in displayed percent. */
function lead(target: string, answers: Record<string, Answer>): { lead: number; percent: number } {
  const r = scoreArchetypes(config, answers);
  const mine = r.percent[target] ?? 0;
  const best = Math.max(
    ...Object.entries(r.percent)
      .filter(([a]) => a !== target)
      .map(([, p]) => p)
  );
  return { lead: mine - best, percent: mine };
}

export function buildPersona(target: string): Persona {
  // Start neutral: the middle of every scale, the first option of every choice.
  const answers: Record<string, Answer> = {};
  for (const q of scoring) answers[q.qId] = q.answerType === "scale" ? 4 : candidates(q)[0]!;
  let current = lead(target, answers).lead;
  for (let pass = 0; pass < 8; pass++) {
    let changed = false;
    for (const q of scoring) {
      let bestValue = answers[q.qId]!;
      for (const value of candidates(q)) {
        const trial = lead(target, { ...answers, [q.qId]: value }).lead;
        if (trial > current + 1e-9) {
          current = trial;
          bestValue = value;
          changed = true;
        }
      }
      answers[q.qId] = bestValue;
    }
    if (!changed) break;
  }
  const final = lead(target, answers);
  return { archetype: target, answers, percent: final.percent, lead: final.lead };
}

if (process.argv[1]?.endsWith("build-personas.ts")) {
  const personas = config.archetypes.map(buildPersona);
  for (const p of personas) {
    console.log(`${p.archetype.padEnd(28)} ${p.percent.toFixed(1)}%  lead ${p.lead.toFixed(1)}`);
  }
  writeFileSync(
    new URL("./personas.json", import.meta.url),
    JSON.stringify({ scoringConfigSha: getScoringConfigSha(), personas }, null, 2) + "\n"
  );
}
