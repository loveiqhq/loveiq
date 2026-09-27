import type { Report3Run } from "@/data/report3-archetype-page";
import type { Report3Block, Report3LearnMoreView } from "@/data/report3-learn-more";
import type { Report3PracticeView } from "@features/report/server/gatedCopy";
import {
  ATTACHMENT_FAMILY_CARDS,
  ATTACHMENT_PATTERNS_TITLE,
} from "../sections/AttachmentPatternsSection";
import { splitEduLabel } from "../sections/eduPara";

/**
 * Report 2.0's chapter panels as V4's cards — review 27.09, Mark: "show the report 2.0
 * version in the other chapters that we don't open by default. Please make sure that
 * the practical and learn more elements are according to the new design."
 *
 * In the chapters V4 opens onto a Report 2.0 section, 2.0's gold practical panel and
 * purple "Learn:" panel give way to V4's "Try this & see what shifts" (V4TryThis) and
 * "Go deeper & learn more" (V4LearnMore), filled with the same copy. This builds those
 * cards from the payload and takes each panel's copy off its section, which is what
 * makes the section's own guard (`hasEdu`, `hasPractical`) skip its panel: no 2.0
 * component changes.
 *
 * Only unlocked copy is touched. A locked 2.0 section keeps its own panel and its
 * paywall; a chapter with no access is locked outright under V4 and draws no body.
 * The copy arrives in the payload for readers who have it, so nothing here decides
 * what may be read. The labels are chrome; the data/report3-* modules are paid copy a
 * client file may only take types from. No copy is quoted in these comments on
 * purpose: production serves browser source maps.
 */

/** 374:224's title, the same on every V4 practice. */
export const V4_PRACTICE_TITLE = "Try this & see what shifts";
/** 153:2253's label, the same on every V4 article. */
export const V4_ARTICLE_LABEL = "Go deeper & learn more";

/** An adult reading prose on a phone; the result is rounded up to whole minutes. */
const WORDS_PER_MINUTE = 200;

/** What a Report 2.0 chapter opens onto in V4 in place of its panels. */
export interface V4ChapterCardSet {
  practice?: Report3PracticeView;
  article?: Report3LearnMoreView;
}

type Copy = Readonly<Record<string, unknown>>;

/**
 * The payload's Report 2.0 copies this reads, by their payload names. `object`, not a
 * record: each section's copy type is an interface, and every field is read by name.
 */
export type V2ChapterCopies = Partial<Record<V2CopyKey, object | null>>;

type V2CopyKey = (typeof PRACTICES)[number]["key"] | (typeof ARTICLES)[number]["key"];

/** The three chapters whose 2.0 panel is a practice, with that panel's own label. */
const PRACTICES = [
  {
    key: "insecuritiesCopy",
    chapter: "core_insecurities",
    label: "Working with your sensitivity: three moves",
  },
  { key: "libidoCopy", chapter: "libido_challenges_in_relationships", label: "The Exit" },
  { key: "initiationCopy", chapter: "initiation_style", label: "The fix: one conversation" },
] as const;

/** The chapters whose 2.0 panel is a "Learn:" explanation. */
const ARTICLES = [
  { key: "confidenceCopy", chapter: "confidence_level" },
  { key: "powerCopy", chapter: "power_orientation" },
  { key: "rewardCopy", chapter: "biochemical_reward_system_dynamics" },
  { key: "arousalCopy", chapter: "arousal_style" },
  { key: "energyCopy", chapter: "energy_level" },
  { key: "attachmentCopy", chapter: "attachment_style" },
  { key: "lovelangCopy", chapter: "love_language" },
  { key: "curiosityCopy", chapter: "curiosity_level" },
  // The designed chapters' 2.0 fallbacks, for archetypes whose V4 chapter is not
  // written yet: V4Chapter draws the written ones, and never reads these.
  { key: "beliefsCopy", chapter: "typical_beliefs" },
  { key: "accelCopy", chapter: "typical_arousal_accelerators_turn_ons_of_the_core_archetype" },
  { key: "fantasyCopy", chapter: "typical_sexual_fantasy_amp_practice_tendencies" },
  { key: "partnershipCopy", chapter: "challenges_in_partnership" },
] as const;

const PRACTICE_KEYS = ["practical.teaser", "practical.line1", "practical.line2", "practical.line3"];
const EDU_BODY_KEYS = Array.from({ length: 9 }, (_, i) => `edu.body.p${i + 1}`);
const EDU_STRUCT_KEYS = Array.from({ length: 14 }, (_, i) => `edu.struct.${i + 1}`);

const fieldOf = (copy: Copy, key: string): string | null => {
  const value = Object.getOwnPropertyDescriptor(copy, key)?.value;
  return typeof value === "string" && value.trim() ? value : null;
};

const run = (text: string, weight?: 700): Report3Run => (weight ? { text, weight } : { text });

/** A 2.0 paragraph's runs, its label bold exactly as renderEduPara sets it. */
const labelled = (text: string): Report3Run[] => {
  const split = splitEduLabel(text);
  return split ? [run(split.label, 700), run(split.rest)] : [run(text)];
};

/** A "Learn:" body paragraph: its lead, then its "• " lines as one list. */
const bodyBlocks = (text: string): Report3Block[] => {
  const [lead = "", ...lines] = text.split("\n");
  const blocks: Report3Block[] = [];
  if (lead.trim()) blocks.push({ kind: "para", runs: labelled(lead) });
  let items: Report3Run[][] = [];
  const flush = () => {
    if (items.length) blocks.push({ kind: "list", items });
    items = [];
  };
  for (const line of lines) {
    const bullet = /^\s*•\s*(.*)$/.exec(line);
    if (bullet) {
      if (bullet[1]!.trim()) items.push([run(bullet[1]!)]);
    } else {
      flush();
      if (line.trim()) blocks.push({ kind: "para", runs: labelled(line) });
    }
  }
  flush();
  return blocks;
};

/** Curiosity's structures: "Name: description.", the name bold with its colon. */
const structList = (copy: Copy): Report3Block[] => {
  const items = EDU_STRUCT_KEYS.flatMap((key) => {
    const line = fieldOf(copy, key);
    if (!line) return [];
    const colon = line.indexOf(":");
    return [
      colon < 0 ? [run(line)] : [run(line.slice(0, colon + 1), 700), run(line.slice(colon + 1))],
    ];
  });
  return items.length ? [{ kind: "list", items }] : [];
};

/** Attachment's five patterns, which 2.0 drew inside its "Learn:" panel. */
const attachmentPatterns = (): Report3Block[] => [
  { kind: "heading", text: ATTACHMENT_PATTERNS_TITLE },
  ...ATTACHMENT_FAMILY_CARDS.flatMap((card): Report3Block[] => [
    { kind: "heading", text: card.title },
    { kind: "para", runs: [run(card.body)] },
    {
      kind: "para",
      runs: [
        run("Associated Archetypes: ", 700),
        run(card.chips.map((chip) => chip.label).join(", ")),
      ],
    },
  ]),
];

const wordsIn = (blocks: readonly Report3Block[]) =>
  blocks
    .flatMap((block) =>
      block.kind === "heading"
        ? [block.text]
        : block.kind === "para"
          ? block.runs.map((r) => r.text)
          : block.items.flat().map((r) => r.text)
    )
    .join(" ")
    .split(/\s+/)
    .filter(Boolean).length;

const articleOf = (copy: Copy, chapter: string): Report3LearnMoreView | null => {
  const teaser = fieldOf(copy, "edu.teaser");
  const free: Report3Block[] = [
    ...(teaser ? [{ kind: "para" as const, runs: [run(teaser)] }] : []),
    ...EDU_BODY_KEYS.flatMap((key) => {
      const text = fieldOf(copy, key);
      return text ? bodyBlocks(text) : [];
    }),
    ...(chapter === "curiosity_level" ? structList(copy) : []),
  ];
  if (!free.length) return null;
  if (chapter === "attachment_style") free.push(...attachmentPatterns());
  const minutes = Math.max(1, Math.ceil(wordsIn(free) / WORDS_PER_MINUTE));
  return {
    eyebrow: `Reading time: ~${minutes} min.`,
    label: V4_ARTICLE_LABEL,
    free,
    gated: null,
    gatedBlockCount: 0,
  };
};

const practiceOf = (copy: Copy, label: string): Report3PracticeView | null => {
  const free = PRACTICE_KEYS.flatMap((key): Report3Block[] => {
    const text = fieldOf(copy, key);
    return text ? [{ kind: "para", runs: [run(text)] }] : [];
  });
  if (!free.length) return null;
  return {
    eyebrow: fieldOf(copy, "practical.label") ?? label,
    title: V4_PRACTICE_TITLE,
    locked: false,
    free,
    ramp: null,
    rest: [],
  };
};

/** The copy with the given fields cleared, so the section's panel guard finds nothing. */
const without = (copy: Copy, keys: readonly string[]): Copy => ({
  ...copy,
  ...Object.fromEntries(keys.map((key) => [key, null])),
});

/**
 * The cards, keyed by chapter, and the copies to hand the 2.0 sections: each unlocked
 * copy with its panel's fields cleared where its card took them, everything else as
 * it came.
 */
export function v4CardsFromV2<T extends V2ChapterCopies>(
  copies: T
): { copies: T; cards: ReadonlyMap<string, V4ChapterCardSet> } {
  const source = new Map(Object.entries(copies) as [string, Copy | null | undefined][]);
  const out = new Map(source);
  const cards = new Map<string, V4ChapterCardSet>();

  for (const { key, chapter, label } of PRACTICES) {
    const copy = source.get(key);
    if (!copy || copy.locked !== false) continue;
    const practice = practiceOf(copy, label);
    if (!practice) continue;
    cards.set(chapter, { practice });
    out.set(key, without(copy, PRACTICE_KEYS));
  }

  for (const { key, chapter } of ARTICLES) {
    const copy = source.get(key);
    if (!copy || copy.locked !== false) continue;
    const article = articleOf(copy, chapter);
    if (!article) continue;
    cards.set(chapter, { article });
    out.set(
      key,
      without(copy, [
        "edu.teaser",
        ...EDU_BODY_KEYS,
        ...(chapter === "curiosity_level" ? EDU_STRUCT_KEYS : []),
      ])
    );
  }

  return { copies: Object.fromEntries(out) as T, cards };
}

export default v4CardsFromV2;
