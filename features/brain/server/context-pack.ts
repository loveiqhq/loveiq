import { archetypeContent } from "@/data/report-archetypes";
import { toText } from "./copy-gate";
import { chapterBaseline } from "./voice";
import type { PromptDoc } from "./ingest/skills";

/**
 * A CONTEXT PACK: exactly what writing one chapter for one archetype needs, and nothing else.
 *
 * Mark, 10 Sep, on drafting chapters with a model: "it pulls in too much stuff… be crazy
 * careful with the context window." Pointing a model at the corpus hands it thousands of
 * loosely related chunks, and pointing it at the writing skill hands it every chapter's
 * rules to pick the right one out of. This hands over the chapter's own rules (its register,
 * sentence band and headings, counted off what shipped), the text being rewritten, one other
 * archetype's version as a model, who this archetype is, a few research cards to draw on,
 * and the team's prompt documents that match, inside a fixed character budget, with a line
 * saying what was cut.
 */

type Content = Record<string, Record<string, string>>;
const SHIPPED = archetypeContent as Content;

export interface EvidenceCard {
  id: string;
  title: string;
  body: string;
}

export interface PackDeps {
  promptDocs: () => Promise<PromptDoc[]>;
  findEvidence: (query: string) => Promise<EvidenceCard[]>;
}

/**
 * The whole pack stays inside this, so it never becomes the flood it exists to prevent. It is
 * enforced by the per-section caps below summing to less, which the tests check with every
 * section at its maximum: raise a section's cap past the budget and they fail.
 */
export const PACK_BUDGET = 14_000;

const cap = (text: string, max: number) =>
  text.length <= max ? { text, cut: false } : { text: `${text.slice(0, max - 1)}…`, cut: true };

/**
 * Prompt documents whose title names this chapter. Words of four letters or more from the
 * chapter key, so `challenges_enjoy` finds the partnership-challenges prompt and `beliefs`
 * finds the typical-beliefs one. The blueprint applies to every chapter.
 */
export function matchingPrompts(chapter: string, docs: PromptDoc[]): PromptDoc[] {
  const words = chapter
    .toLowerCase()
    .split(/[_\s]+/)
    .filter((w) => w.length >= 4);
  return docs.filter((d) => {
    const t = d.title.toLowerCase();
    return t.includes("blueprint") || words.some((w) => t.includes(w));
  });
}

/** The archetype after this one, so the model gets a DIFFERENT archetype's version. */
function otherArchetype(archetypes: string[], archetype: string): string | null {
  const i = archetypes.indexOf(archetype);
  const others = archetypes.filter((a) => a !== archetype);
  if (others.length === 0) return null;
  return i < 0 ? others[0]! : (archetypes[(i + 1) % archetypes.length] ?? others[0]!);
}

export async function buildContextPack(
  input: { chapter: string; archetype: string },
  deps: PackDeps,
  content: Content = SHIPPED
): Promise<string> {
  const { chapter, archetype } = input;
  const versions = content[chapter] ?? {};
  const archetypes = Object.keys(versions);
  const base = chapterBaseline(chapter, content);
  const cutParts: string[] = [];
  const section = (title: string, body: string, max: number) => {
    const c = cap(body.trim(), max);
    if (c.cut) cutParts.push(title.toLowerCase());
    return `## ${title}\n${c.text}`;
  };

  const rules = [
    base?.register === "third"
      ? `- Third person: every shipped version describes the ${archetype} ("The ${archetype} feels…"), never "you". Agreed 2026-09-08.`
      : base?.register === "second"
        ? `- Second person: every shipped version of this chapter addresses the reader as "you".`
        : "- Person: the shipped copy is inconsistent here, so there is no baseline to match. Pick one and keep to it.",
    base
      ? `- Sentence length: median ${base.medianSentenceWords} words in this chapter (90% under ${base.p90SentenceWords}). Match this chapter, not the report overall.`
      : "",
    base?.headingSequence
      ? `- Headings: every shipped version uses these, in this order: ${base.headingSequence.join(" | ")}.`
      : "- Headings: this chapter has no fixed heading skeleton.",
    chapter === "beliefs"
      ? "- Core motivations do not belong here. Real-world examples of beliefs, light and shadow, for men and for women, land better than theory."
      : "",
    "- No em dashes. No phrases that read as machine-written (deeply, truly, in essence, at its core, journey, navigate…). No absolute claims (always, never, everyone).",
    "- Plain words: Mark asked for copy an eight-year-old can follow. Nothing that would fit every archetype, and nothing repeated from another chapter.",
    "- Every scientific claim backed by a research card below or flagged as unsupported.",
    "- Draft into a Google Doc marked as a draft, naming this chapter, the archetype and the prompt used. Run check_copy before it goes to Mark.",
  ]
    .filter(Boolean)
    .join("\n");

  const parts: string[] = [
    `# Context pack: ${chapter} for the ${archetype}`,
    section(`Rules for "${chapter}"`, rules, 2_500),
  ];

  const current = versions[archetype];
  parts.push(
    section(
      `This chapter as shipped for the ${archetype}`,
      current ? toText(current) : "Nothing has shipped for this archetype yet.",
      3_500
    )
  );

  const other = otherArchetype(archetypes, archetype);
  if (other && versions[other]) {
    parts.push(
      section(`The same chapter for the ${other}, as a model`, toText(versions[other]!), 2_200)
    );
  }

  const core = content.core_archetype?.[archetype];
  if (core && chapter !== "core_archetype") {
    parts.push(section(`Who the ${archetype} is`, toText(core), 1_800));
  }

  const [docs, cards] = await Promise.all([
    deps.promptDocs().catch(() => [] as PromptDoc[]),
    deps
      .findEvidence(`${chapter.replace(/_/g, " ")} ${archetype}`)
      .catch(() => [] as EvidenceCard[]),
  ]);

  parts.push(
    section(
      "Research to draw on",
      cards.length
        ? // Titles and ids only: a card opens with a fixed header about how it was built, so a
          // snippet spent the budget on boilerplate. fetch_document reads the papers.
          cards
            .slice(0, 3)
            .map((c) => `- ${c.title}: fetch_document("${c.id}")`)
            .join("\n")
        : "No research card matched this chapter. Search the evidence source before making a scientific claim.",
      1_800
    )
  );

  const prompts = matchingPrompts(chapter, docs);
  parts.push(
    section(
      "The team's prompt documents for this chapter",
      prompts.length
        ? prompts.map((p) => `- ${p.title}: fetch_document("${p.source_id}")`).join("\n")
        : 'None matched by title. The full list is in the skill: fetch_document("skill/write-a-report-chapter").',
      1_200
    )
  );

  if (cutParts.length) {
    parts.push(
      `(Trimmed to stay short: ${cutParts.join(", ")}. fetch_document reads any of them in full.)`
    );
  }
  return parts.join("\n\n");
}
