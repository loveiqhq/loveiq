import { complete, isLlmConfigured, type LlmMessage } from "@features/brain/server/llm";
import { retrieve, type BrainChunk } from "@features/brain/server/retrieve";
import { context, divider, fitBlocks, section } from "@shared/observability/slack-blocks";
import type { SlackBlock } from "@shared/observability/slack";

/**
 * Question in, cited answer out. Pure: no Slack transport, no database
 * bookkeeping, so the CLI harness (`scripts/brain-ask.mjs`) and the Slack route
 * exercise exactly the same path.
 */

/**
 * How many chunks go into the prompt. Sized for the TIGHTER of the two candidate
 * free tiers -- `openai/gpt-oss-120b` allows 8K tokens/minute, and 8 chunks of
 * ~1.5K chars is ~3K tokens of sources, leaving room for the instructions and a
 * ~900-token answer. On `groq/compound` (70K/min) this is comfortable rather than
 * tight, so one setting serves both.
 */
const MAX_SOURCES = 8;

export type BrainStatus = "answered" | "no_results" | "rate_limited" | "unconfigured" | "error";

export interface BrainSource {
  n: number;
  source: string;
  title: string | null;
  url: string | null;
}

export interface BrainAnswer {
  status: BrainStatus;
  /** Plain-text fallback; also what Slack shows in notifications. */
  text: string;
  blocks: SlackBlock[];
  sources: BrainSource[];
  latencyMs: number;
}

function label(chunk: BrainChunk): string {
  const date = typeof chunk.meta?.date === "string" ? chunk.meta.date.slice(0, 10) : null;
  if (chunk.source === "commit") return date ? `commit ${date}` : "commit";
  if (chunk.source === "jira") return `jira ${chunk.sourceId}`;
  return chunk.source;
}

/**
 * Convert the model's markdown to Slack mrkdwn. Slack uses `*bold*` (not `**`)
 * and `<url|text>` (not `[text](url)`), so without this an answer renders with
 * literal asterisks and raw link syntax.
 */
export function toSlackMrkdwn(md: string): string {
  return (
    md
      // Links first: converting bold first would corrupt bracketed link text.
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, "<$2|$1>")
      // Headings have no Slack equivalent; bold is the closest.
      .replace(/^#{1,6}\s*(.+)$/gm, "*$1*")
      .replace(/\*\*([^*]+)\*\*/g, "*$1*")
      .replace(/__([^_]+)__/g, "*$1*")
      // Slack renders "* " bullets as literal asterisks; "• " reads correctly.
      .replace(/^\s*[*-]\s+/gm, "• ")
      .trim()
  );
}

function buildPrompt(question: string, chunks: BrainChunk[]): LlmMessage[] {
  const today = new Date().toISOString().slice(0, 10);

  const system = [
    "You are LoveIQ's internal company brain. You answer questions about LoveIQ using only the numbered sources given to you.",
    "",
    "Rules:",
    "- Answer ONLY from the sources. If they do not contain the answer, say so plainly and say what you did find instead. Never fill a gap from general knowledge, and never guess.",
    "- Cite sources inline as [1], [2]. Every factual claim needs a citation.",
    "- Write plain English for a smart colleague who does not read code. Some readers are non-technical, so expand jargon the first time you use it.",
    "- Be brief. This is going into Slack. Lead with the direct answer in one or two sentences, then at most a few short supporting lines.",
    "- If a source marked 'plain-English summary' covers the point, prefer its wording.",
    "- If sources disagree or look out of date, say which is more recent and flag the conflict rather than picking silently.",
    `- Today is ${today}.`,
  ].join("\n");

  const rendered = chunks
    .map((c, i) => {
      const head = `[${i + 1}] (${label(c)}) ${c.title ?? "untitled"}`;
      const forMarcus =
        typeof c.meta?.for_marcus === "string" && c.meta.for_marcus.trim()
          ? `plain-English summary: ${c.meta.for_marcus.trim()}`
          : null;
      return [head, c.url ? `url: ${c.url}` : null, forMarcus, "", c.body]
        .filter((line) => line !== null)
        .join("\n");
    })
    .join("\n\n---\n\n");

  return [
    { role: "system", content: system },
    { role: "user", content: `Sources:\n\n${rendered}\n\n---\n\nQuestion: ${question}` },
  ];
}

function sourceBlocks(sources: BrainSource[]): SlackBlock[] {
  if (sources.length === 0) return [];
  const lines = sources.map((s) => {
    const name = s.title ?? s.source;
    return s.url ? `[${s.n}] <${s.url}|${name}>` : `[${s.n}] ${name}`;
  });
  return [divider(), section(`*Sources*\n${lines.join("\n")}`)];
}

export async function answerQuestion(input: { question: string }): Promise<BrainAnswer> {
  const started = Date.now();
  const question = input.question.trim();

  const fail = (status: BrainStatus, text: string): BrainAnswer => ({
    status,
    text,
    blocks: fitBlocks([section(text)], text).blocks,
    sources: [],
    latencyMs: Date.now() - started,
  });

  if (question.length < 2) {
    return fail("no_results", "Ask me a question about LoveIQ and I'll look it up.");
  }
  if (!isLlmConfigured()) {
    return fail(
      "unconfigured",
      "The brain has no language model configured yet, so I can't write an answer. Set `BRAIN_LLM_KEY` to switch me on."
    );
  }

  const chunks = await retrieve(question, MAX_SOURCES);
  if (chunks.length === 0) {
    return fail(
      "no_results",
      `I couldn't find anything about that in our docs, commits or Jira. Try naming the thing directly — a file, a feature, an env var, or a Jira key.`
    );
  }

  const result = await complete(buildPrompt(question, chunks));

  if (!result.ok) {
    if (result.reason === "rate_limited") {
      return fail(
        "rate_limited",
        "I've hit today's limit on the free model tier, so I can't answer right now. It resets shortly — or ask again in a minute if someone else just asked."
      );
    }
    return fail("error", "Something went wrong reaching the language model. It's been logged.");
  }

  const sources: BrainSource[] = chunks.map((c, i) => ({
    n: i + 1,
    source: c.source,
    title: c.title,
    url: c.url,
  }));

  const body = toSlackMrkdwn(result.text);
  const blocks = [section(body), ...sourceBlocks(sources), context(`Asked the LoveIQ brain`)];
  const fitted = fitBlocks(blocks, body);

  return {
    status: "answered",
    text: body,
    blocks: fitted.blocks,
    sources,
    latencyMs: Date.now() - started,
  };
}

/**
 * The exact prompt `answerQuestion` would send, for the CLI harness. Exported so
 * prompt changes can be reviewed as a diff instead of guessed at.
 */
export function buildPromptForInspection(question: string, chunks: BrainChunk[]): LlmMessage[] {
  return buildPrompt(question, chunks);
}
