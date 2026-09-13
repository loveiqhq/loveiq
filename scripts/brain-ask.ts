#!/usr/bin/env tsx

/**
 * Ask the company brain from the terminal.
 *
 * WHY THIS EXISTS. It calls exactly the same `answerQuestion()` the Slack route
 * calls, so retrieval and prompt tuning can be iterated without a Slack app, a
 * public URL, or a signature to sign. Every failure it shows is a failure Slack
 * would have shown.
 *
 * Usage:
 *   npx tsx scripts/brain-ask.ts "how does the nurture sequence work"
 *   npx tsx scripts/brain-ask.ts --sources-only "why is the purge off"   # no LLM call
 *   npx tsx scripts/brain-ask.ts --prompt "..."                          # print the exact prompt
 *
 * Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. The LLM is only called
 * without --sources-only/--prompt, and then BRAIN_LLM_KEY is required too.
 */

import { answerQuestion } from "@features/brain/server/answer";
import { buildPromptForInspection } from "@features/brain/server/answer";
import { retrieve } from "@features/brain/server/retrieve";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const sourcesOnly = args.includes("--sources-only");
  const showPrompt = args.includes("--prompt");
  const question = args.filter((a) => !a.startsWith("--")).join(" ");

  if (!question) {
    console.error('Usage: npx tsx scripts/brain-ask.ts [--sources-only|--prompt] "your question"');
    process.exit(1);
  }

  if (sourcesOnly || showPrompt) {
    const chunks = await retrieve(question, 8);
    console.log(`\nretrieved ${chunks.length} chunk(s) for: ${question}\n`);
    for (const [i, c] of chunks.entries()) {
      console.log(`[${i + 1}] ${c.source}  score=${c.score.toFixed(2)}`);
      console.log(`    ${c.title ?? "(untitled)"}`);
      console.log(`    ${c.url ?? "(no url)"}`);
      if (typeof c.meta?.for_marcus === "string") {
        console.log(`    plain-English: ${c.meta.for_marcus.replace(/\s+/g, " ").slice(0, 110)}`);
      }
      console.log(`    ${c.body.replace(/\s+/g, " ").slice(0, 150)}...`);
    }
    if (showPrompt) {
      const messages = buildPromptForInspection(question, chunks);
      const chars = messages.reduce((n, m) => n + m.content.length, 0);
      console.log(
        `\n--- prompt (${messages.length} messages, ${chars} chars ~= ${Math.round(chars / 4)} tokens) ---\n`
      );
      for (const m of messages) console.log(`### ${m.role}\n${m.content}\n`);
    }
    process.exit(0);
  }

  const answer = await answerQuestion({ question });
  console.log(
    `\nstatus: ${answer.status}   latency: ${answer.latencyMs}ms   sources: ${answer.sources.length}\n`
  );
  console.log(answer.text);
  if (answer.sources.length) {
    console.log("\n--- sources ---");
    for (const s of answer.sources) console.log(`[${s.n}] ${s.title ?? s.source}  ${s.url ?? ""}`);
  }
  console.log(`\n--- slack blocks: ${answer.blocks.length} ---`);
}

// tsx transpiles this to CJS (package.json has no "type": "module"), and CJS has
// no top-level await -- hence a main() rather than awaiting inline.
void main();
