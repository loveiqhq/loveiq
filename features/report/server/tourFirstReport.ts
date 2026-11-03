import { REPORT_V4_LEARN_MORE } from "@/data/report3-learn-more";
import { buildTypicalBeliefs } from "@/data/report3-typical-beliefs";
import type { InitialUnlockGatePayload } from "@features/report/logic/initialUnlockGate";
import { splitArticleForReader } from "@features/report/server/contentGating";

/**
 * Tour first, then the EUR 1.99 gate (Marcus's card "Lets first do the tour > Then open the pre
 * paygate", sync 30.10). A reader the gate stops is shown their own report under the guided
 * tour before the gate, with who they are left out (Fatih, 30.10): the archetype's name, the
 * percentages and the Core Archetype card stay for the EUR 1.99, which still reveals them.
 *
 * So the first open of a gated report is answered with an ALLOW-LISTED payload, not the free
 * one with fields taken off: about thirty of the free payload's fields name the archetype or
 * carry its copy, and a field added to the report later must not leak here by default. What it
 * holds is what the page needs to draw its frame and the tour's four stops (the chapter menu,
 * and in Typical Beliefs "Show All", the collapse arrow and "Try This"): Typical Beliefs as a
 * locked reader gets it, with the archetype's name taken out of its words, and the article
 * that closes it, which is the same for every archetype. Every other chapter is drawn locked.
 * The gate's own payload rides along (`initialGate`), so the page meets the gate the moment the
 * tour ends without asking again; its `?gate=now` request then stamps the gate as seen.
 */

/** The neutral words a name becomes. Lower case; the start of a sentence is capitalised. */
const YOUR_ARCHETYPE = "your archetype";
const PEOPLE_WITH = "people with your archetype";
const SOMEONE_WITH = "someone with your archetype";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** As the article read: "The" / "A" opens a sentence, so its replacement does too. */
function cased(article: string, phrase: string): string {
  return article.charAt(0) === article.charAt(0).toUpperCase() ? capitalise(phrase) : phrase;
}

/**
 * The archetype's name out of one string, in the forms the copy uses ("The Spark Seeker…",
 * "for the Spark Seeker", "the Spark Seeker’s", "many Spark Seekers", "A Spark Seeker…").
 */
export function neutraliseNameInText(text: string, name: string): string {
  if (!name || !text.includes(name)) return text;
  const n = escapeRegExp(name);
  /* eslint-disable security/detect-non-literal-regexp -- `n` is one of the 14 archetype names (KNOWN_ARCHETYPES), escaped above */
  return text
    .replace(new RegExp(`\\b(The|the) ${n}(’s|'s)`, "g"), (_m, art: string, poss: string) =>
      cased(art, `${YOUR_ARCHETYPE}${poss}`)
    )
    .replace(
      new RegExp(`\\b(Many|many|Some|some|Most|most|Other|other) ${n}s\\b`, "g"),
      (_m, q: string) => `${q} ${PEOPLE_WITH}`
    )
    .replace(new RegExp(`\\b(The|the) ${n}\\b`, "g"), (_m, art: string) =>
      cased(art, YOUR_ARCHETYPE)
    )
    .replace(new RegExp(`\\b(A|a|An|an) ${n}\\b`, "g"), (_m, art: string) =>
      cased(art, SOMEONE_WITH)
    )
    .replace(new RegExp(`\\b${n}s\\b`, "g"), PEOPLE_WITH)
    .replace(new RegExp(`${n}(’s|'s)`, "g"), (_m, poss: string) => `${YOUR_ARCHETYPE}${poss}`)
    .replace(new RegExp(`\\b${n}\\b`, "g"), YOUR_ARCHETYPE);
  /* eslint-enable security/detect-non-literal-regexp */
}

interface Run {
  text: string;
  [key: string]: unknown;
}

function isRunList(value: unknown): value is Run[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (item) => typeof item === "object" && item !== null && typeof (item as Run).text === "string"
    )
  );
}

/**
 * A paragraph's runs, where the copy often sets the article and the name apart: "The " and a
 * bold "Spark Seeker". The article moves into the bold run's replacement ("Your archetype"),
 * so the sentence still reads, then every run is cleaned as plain text.
 */
function neutraliseRuns(runs: Run[], name: string): Run[] {
  const out = runs.map((run) => ({ ...run }));
  for (let i = 1; i < out.length; i++) {
    // eslint-disable-next-line security/detect-object-injection -- a loop index into the copy's own runs
    const run = out[i]!;
    const lead = run.text.match(/^(\s*)/)?.[1] ?? "";
    if (!run.text.slice(lead.length).startsWith(name)) continue;
    const prev = out[i - 1]!;
    const article = prev.text.match(/(?:^|\s)(The|the|A|a|An|an)(\s*)$/);
    if (!article) continue;
    const word = article[1] ?? "";
    const gap = article[2] ?? "";
    if (!gap && !lead) continue;
    prev.text = prev.text.slice(0, prev.text.length - word.length - gap.length);
    const rest = run.text.slice(lead.length + name.length);
    const possessive = rest.match(/^(’s|'s)/)?.[1] ?? "";
    const phrase = /^(A|a|An|an)$/.test(word) ? SOMEONE_WITH : YOUR_ARCHETYPE;
    run.text = `${cased(word, phrase)}${possessive}${rest.slice(possessive.length)}`;
  }
  return out.map((run) => ({ ...run, text: neutraliseNameInText(run.text, name) }));
}

/** The archetype's name out of a whole view: every string, every paragraph's runs. */
export function neutraliseArchetypeName<T>(value: T, name: string): T {
  if (!name) return value;
  if (typeof value === "string") return neutraliseNameInText(value, name) as T;
  if (isRunList(value)) return neutraliseRuns(value, name) as T;
  if (Array.isArray(value)) return value.map((item) => neutraliseArchetypeName(item, name)) as T;
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, neutraliseArchetypeName(item, name)])
    ) as T;
  }
  return value;
}

export interface TourFirstReportInput {
  submissionId: number | null;
  userName: string | null;
  reportDate: string;
  /** The reader's own archetype: Typical Beliefs is theirs, with the name taken out. */
  archetype: string;
  gate: InitialUnlockGatePayload;
}

/**
 * The first open of a gated report, as the page draws it under the tour. Every key of the
 * report payload is here, each empty unless listed above, so the page's types and fallbacks
 * hold; `primaryArchetype` and `contentArchetype` are "" (a chapter title then has no "of
 * the …" line), and the theme falls back to the brand's.
 */
export function buildTourFirstReportPayload(input: TourFirstReportInput) {
  const beliefs = buildTypicalBeliefs(input.archetype, { locked: true });
  const article = REPORT_V4_LEARN_MORE.typical_beliefs;
  return {
    submissionId: input.submissionId,
    accessPlan: null,
    purchasedPlan: null,
    initialUnlock: false,
    initialUnlockSource: null,
    userName: input.userName,
    userEmail: null,
    ownerFirstName: null,
    ownerToken: null,
    viewMode: "owner" as const,
    primaryArchetype: "",
    contentArchetype: "",
    percentages: {},
    reportDate: input.reportDate,
    diagnostics: null,
    snapshotAnswers: null,
    pricingQuotes: null,
    unlockedArchetypes: [],
    archetypeTiers: {},
    archetypeContent: {},
    practiceTendencies: {},
    snapshotCopy: null,
    findingsCopy: null,
    archetypeCard: null,
    summaryChapter: null,
    chapterReadingTimes: null,
    beliefsCopy: null,
    typicalBeliefs: beliefs ? neutraliseArchetypeName(beliefs, input.archetype) : null,
    typicalBeliefsArticle: article
      ? { article: splitArticleForReader(article, true), locked: true }
      : null,
    attachmentCopy: null,
    attachmentFamily: null,
    attachmentPlane: null,
    accelCopy: null,
    accelerators: null,
    acceleratorsArticle: null,
    insecuritiesCopy: null,
    insecurityCueFamily: null,
    insecurityGraph: null,
    rewardCopy: null,
    rewardConfig: null,
    energyCopy: null,
    energyConfig: null,
    arousalCopy: null,
    arousalConfig: null,
    initiationCopy: null,
    initiationConfig: null,
    libidoCopy: null,
    libidoConfig: null,
    partnershipCopy: null,
    partnershipLoop: null,
    partnership: null,
    enjoyCopy: null,
    growthCopy: null,
    growthRungs: null,
    readingCopy: null,
    powerCopy: null,
    fantasyCopy: null,
    fantasyDots: null,
    fantasy: null,
    fantasyArticle: null,
    curiosityCopy: null,
    relationshipFit: null,
    lovelangCopy: null,
    loveLanguageOrder: null,
    confidenceCopy: null,
    confidenceStrip: null,
    mapCopy: null,
    stageCopy: null,
    constellationMottos: {},
    initialGate: input.gate,
  };
}
