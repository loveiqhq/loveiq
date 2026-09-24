/**
 * READY-MADE PROMPTS, served over MCP `prompts/list` and `prompts/get`.
 *
 * claude.ai and Claude Code offer these as prompts a person can pick, so nobody has to
 * know that "what needs me" means browse_context with an open-state filter. Each one is
 * a question worded the way the tools answer best, plus the rules Mark and Marcus set for
 * what comes back: short, plain, every claim linked, paywall conversion first.
 *
 * Plain text only, no counts or dates: model-visible text that states a number goes
 * stale with nothing to recompute it (the tool descriptions learned that twice).
 */

export interface PromptArgument {
  name: string;
  description: string;
  required?: boolean;
}

export interface BrainPrompt {
  name: string;
  title: string;
  description: string;
  arguments: PromptArgument[];
  render: (args: Record<string, string>) => string;
}

/** How every answer should read. Mark: "so simple an eight-year-old could follow it". */
const HOUSE_RULES =
  "Answer short and in plain words. Put a link or id beside every fact so it can be " +
  "checked, say plainly when the record is thin, and never fill a gap by guessing.";

export const PROMPTS: BrainPrompt[] = [
  {
    name: "catch_me_up",
    title: "Catch me up",
    description:
      "What changed at LoveIQ since a date: decisions, numbers, and what is waiting on someone.",
    arguments: [
      {
        name: "since",
        description: "First day to cover, YYYY-MM-DD. Leave empty for the last seven days.",
      },
    ],
    render: ({ since }) =>
      `Catch me up on LoveIQ since ${since || "seven days ago"}.\n\n` +
      '1. Decisions: browse_context with sources ["decision"] and that since date. Say who decided and what was rejected.\n' +
      '2. What is new: browse_context with order "recently_learned" and learned_since that date; skim for what matters, not everything.\n' +
      '3. Numbers: get_business_numbers for the period with compare_to "previous". Lead with paywall conversion, which is the core goal.\n' +
      "4. What shipped: what_shipped for the period, in the plain words each change was summarised in.\n" +
      '5. Anything noticed: browse_context with sources ["notice"].\n' +
      "6. What is waiting on someone: open Notion tasks past their due date.\n\n" +
      HOUSE_RULES,
  },
  {
    name: "kpi_check",
    title: "KPI check",
    description:
      "The funnel and the money for a period against the period before, with likely causes for big moves.",
    arguments: [
      { name: "since", description: "First day, YYYY-MM-DD.", required: true },
      { name: "until", description: "Last day, YYYY-MM-DD. Leave empty for today." },
    ],
    render: ({ since, until }) =>
      `Check our KPIs from ${since} to ${until || "today"} against the period just before.\n\n` +
      `Use get_business_numbers with since ${since}${until ? `, until ${until}` : ""} and compare_to "previous". ` +
      "Show visits, surveys started and finished, reports opened, paid reports, revenue and ad spend, each with the change. " +
      'Paywall views and checkouts are not in get_business_numbers: find them with list_product_tables (match "paywall", then ' +
      '"checkout") and query_product_data, and name the table you used. Paywall conversion first, it is the core goal. ' +
      "For any number that moved a lot, look for the likely " +
      "cause before calling it real: deploys (query_external_service vercel), channel mix (ga4 records), and decisions or experiments " +
      "in that window. Say where each number comes from, and whether a rate is step-to-step or cumulative.\n\n" +
      HOUSE_RULES,
  },
  {
    name: "review_chapter",
    title: "Review this chapter",
    description:
      "Check a report chapter draft against the house voice, the chapter rules and the research.",
    arguments: [
      {
        name: "draft",
        description: "The draft text, or its Google Doc link or drive/doc id.",
        required: true,
      },
      { name: "archetype", description: "Which archetype it is for, if it is archetype-specific." },
    ],
    render: ({ draft, archetype }) =>
      `Review this report chapter${archetype ? ` for the ${archetype}` : ""} before it goes to Mark.\n\n` +
      "If it is a link or a drive/doc id, read it with fetch_document first. " +
      "Then run check_copy on the text, with its chapter and archetype when you can tell them: it checks the wording " +
      "rules in code and quotes each offending sentence. Fix everything under MUST FIX. Then compare it with how we write: " +
      'search_company_context with sources ["skill", "report", "domain"] for the chapter rules and the text we already ship.\n\n' +
      "Check what check_copy cannot, and quote each problem line with a concrete fix:\n" +
      "- Plain words an eight-year-old could follow, and no fluff.\n" +
      "- No em dashes and nothing that reads as AI-written.\n" +
      '- Talks about the archetype, not "you", when describing how someone thinks or behaves.\n' +
      '- No lines that would fit every archetype, and no absolute claims ("always", "never").\n' +
      "- Nothing that repeats another chapter.\n" +
      '- Every scientific claim backed: search sources ["evidence"] and cite the paper, or flag it as unsupported.\n\n' +
      `The draft:\n${draft}\n\n` +
      HOUSE_RULES,
  },
  {
    name: "draft_chapter",
    title: "Draft a chapter",
    description:
      "Draft one report chapter for one archetype from a context pack, check it, and put it in a Google Doc for review.",
    arguments: [
      { name: "chapter", description: "Which chapter, e.g. motivation.", required: true },
      { name: "archetype", description: "Which archetype, e.g. Spark Seeker.", required: true },
      {
        name: "brief",
        description: "What should change, if this is a rewrite rather than a first draft.",
      },
    ],
    render: ({ chapter, archetype, brief }) =>
      `Draft the "${chapter}" chapter for the ${archetype}.${brief ? ` What should change: ${brief}` : ""}\n\n` +
      `1. get_context_pack with chapter "${chapter}" and archetype "${archetype}". Work from that and nothing wider: ` +
      "it holds the chapter's rules, the current text, a model from another archetype, who this archetype is, " +
      "research to draw on and the team's prompt documents.\n" +
      "2. Read the prompt document it names for this chapter with fetch_document and follow it.\n" +
      "3. Write the draft. Back every scientific claim with a research card from the pack or flag it.\n" +
      `4. Run check_copy on the draft with chapter "${chapter}" and archetype "${archetype}". Fix everything under MUST FIX and ` +
      "whatever under WORTH FIXING you can, then run it again.\n" +
      "5. Show me the draft and the final check, and wait for my OK. Then put it in a Google Doc with write_to_google_doc, " +
      "titled as a DRAFT and naming the chapter, the archetype and the prompt document used.\n" +
      '6. At the end of that same document, add a section headed "How this was made": the model you are, today\'s date, who ' +
      "asked, the prompt document's id, the brief, the ids of the research cards you used, and the final check_copy summary " +
      "line. It lives with the draft in its folder, so anyone can later ask which prompt and material produced this chapter " +
      "and get a real answer.\n\n" +
      HOUSE_RULES,
  },
  {
    name: "what_needs_me",
    title: "What needs me",
    description: "Everything waiting on one person, most urgent first, with a link to each.",
    arguments: [
      {
        name: "person",
        description: "Full name as it appears across our tools, e.g. Mark Oldenburg.",
        required: true,
      },
    ],
    render: ({ person }) =>
      `What is waiting on ${person}? Most urgent first.\n\n` +
      `1. Open Notion tasks: browse_context with sources ["notion"] and meta {"state": "open", "people": "${person}"}. Overdue first.\n` +
      `2. Asks from meetings: search_company_context with meta {"people": ["${person}"], "section": "summary"} and a since date two weeks back; ` +
      'pull the "Next steps" lines that name them.\n' +
      `3. Asks hidden in comments: search sources ["gmail"] for Figma and Google Docs comment mails from the last two weeks that ask ${person} to do something.\n\n` +
      "One line per item: what, where (direct link), since when. Nothing that is already done.\n\n" +
      HOUSE_RULES,
  },
  {
    name: "record_decision",
    title: "Record a decision",
    description: "Write a decision down so it is never argued twice, including what was rejected.",
    arguments: [
      { name: "decision", description: "What was decided, in your own words.", required: true },
    ],
    render: ({ decision }) =>
      `We decided: ${decision}\n\n` +
      "First check whether this was already decided: search_company_context on the topic, and read any decision that comes back. " +
      "Then draft a record_decision call: one plain sentence someone would recognise months later, the full name of who decided, " +
      "why, and what was rejected and why (the half that stops the argument coming back). If it replaces an earlier decision, " +
      "pass that id as supersedes. Show me the draft and wait for my OK before recording it.",
  },
];

/** A prompt rendered for `prompts/get`, or the reason it could not be. */
export function renderPrompt(
  name: string,
  args: Record<string, unknown>
): { description: string; text: string } | { error: string } {
  const prompt = PROMPTS.find((p) => p.name === name);
  if (!prompt) {
    return {
      error: `No prompt named "${name}". Available: ${PROMPTS.map((p) => p.name).join(", ")}.`,
    };
  }
  const values: Record<string, string> = {};
  for (const arg of prompt.arguments) {
    const raw = args[arg.name];
    const value = typeof raw === "string" ? raw.trim() : "";
    if (arg.required && !value)
      return { error: `The ${name} prompt needs \`${arg.name}\`: ${arg.description}` };
    values[arg.name] = value;
  }
  return { description: prompt.description, text: prompt.render(values) };
}
