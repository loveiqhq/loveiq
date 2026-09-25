/**
 * Fantasy vs. Reality — the Report 3.0 chapter that closes Part VI: Figma
 * "Expanded Chapter H1 + Copy" 304:281 in the Part VI page 334:1137, paywalled as
 * 305:217, with its "Try this & see what shifts" card (441:6168 open, 441:6422
 * closed, 441:6188 gated). Its "Go deeper & learn more" article is
 * FANTASY_REALITY_BLOCKS in report3-learn-more.ts.
 *
 * PREMIUM. Registered in __tests__/security/premium-content-bundle.test.ts, so it
 * must never be runtime-imported from a "use client" file. The server reads it and
 * hands the chapter down as props (buildFantasy), as the other V4 chapters do.
 *
 * THE COPY IS THE FRAME'S, read off 304:291 (the intro), 368:1920 ("Common
 * challenges") and 441:6187 (the practice), run by run — including the straight
 * apostrophes ("another person's needs") and the curly quotes around the quoted
 * thought. One departure: the frame leaves a trailing space at the end of a few
 * paragraphs; dropped, as in Challenges in Partnerships.
 *
 * THE TABLE (639:308) is the practice-tendency data V2's section already reads:
 * Figma's eleven categories, their order, every fantasy and both scores are that
 * data's, row for row. Its chrome — the column heads, the likelihood labels, "Show
 * all N fantasies" — is universal and lives in the client component.
 */

import { scrambleLockedText } from "@features/report/server/scrambleLockedText";
import { gate, scrambleBlock, type Report3PracticeView } from "@features/report/server/gatedCopy";
import {
  reportPracticeTendencies,
  type ReportPracticeTendencyRow,
} from "./report-practice-tendencies";
import type { Report3Block } from "./report3-learn-more";
import type { Report3Run } from "./report3-archetype-page";

const t = (text: string): Report3Run => ({ text });
const b = (text: string): Report3Run => ({ text, weight: 700 });
const i = (text: string): Report3Run => ({ text, italic: true });
const p = (...runs: Report3Run[]): Report3Block => ({ kind: "para", runs });
const h = (text: string): Report3Block => ({ kind: "heading", text });

/** Everything one archetype's chapter needs, as authored. */
export interface Report3FantasyCopy {
  /** 304:291 — twelve blocks; the sixth is the heading "What a fantasy might actually be about". */
  intro: readonly Report3Block[];
  /** 368:1920 — the heading "Common challenges", then thirteen paragraphs. */
  challenges: readonly Report3Block[];
  practiceEyebrow: string;
  practiceTitle: string;
  /** 441:6187 — ten paragraphs. */
  practice: readonly Report3Block[];
  /** 441:6422 — the closed card's teaser: practice paragraphs 1-2. */
  practiceTeaser: readonly Report3Block[];
}

const SPARK_INTRO: readonly Report3Block[] = [
  p(
    t(
      "A sexual fantasy can feel like evidence. If a scene is intensely arousing or keeps returning, it is easy to assume it must reveal something you secretly want. But "
    ),
    b("fantasy and real-world desire are not the same psychological experience"),
    t(".")
  ),
  p(
    t(
      "Fantasy is closer to a private mental movie. The mind can enter at exactly the exciting moment, remove awkwardness, intensify attraction, make another person respond perfectly, and end the scene whenever it wants."
    )
  ),
  p(
    t(
      "Reality comes with everything fantasy can edit out: another person's needs, an actual body, communication, uncertainty, boundaries, safety, emotions and consequences."
    )
  ),
  p(
    t(
      "This is why something can be highly arousing in imagination without being appealing in real life. "
    ),
    b(
      "Arousal tells you that something activated your erotic system. It does not automatically tell you that you want to experience it."
    ),
    t(" Desire, pleasure and consent are separate questions.")
  ),
  p(
    t("For the "),
    b("Spark Seeker, "),
    t(
      "this distinction can be particularly useful. The archetype tends to respond strongly to novelty, anticipation, playful pursuit, intensity and shifts in power. Fantasy can amplify these experiences almost perfectly. What looks like a very specific sexual wish may sometimes be the mind's way of creating a particular feeling: being irresistibly wanted, escaping routine, surrendering for a moment, taking control, feeling slightly forbidden, or not knowing exactly what happens next."
    )
  ),
  h("What a fantasy might actually be about"),
  p(
    t("You imagine "),
    b("a secret lover who cannot resist you"),
    t(
      ". In reality, hiding an affair may sound stressful rather than sexy. Perhaps what stays exciting is the pursuit, secrecy and feeling of being overwhelmingly wanted."
    )
  ),
  p(
    t("You imagine "),
    b("sex somewhere you could be caught"),
    t(
      ". Actually being discovered might be horrifying. The fantasy may be giving you the rush of doing something that feels slightly forbidden."
    )
  ),
  p(
    t("You imagine "),
    b("being watched"),
    t(
      ". A real audience might make you self-conscious. What the fantasy gives you may simply be the feeling that someone cannot take their eyes off you."
    )
  ),
  p(
    t(
      "The scene and the desire underneath it are not always the same thing. Sometimes the fantasy is literal. Sometimes it is the mind's most effective way of creating a feeling that could take many different forms in real life."
    )
  ),
  p(
    t("A Spark Seeker may look at a fantasy and think: “"),
    i("This is what I need"),
    t("”. But the literal scenario may be just one of the ways to the experience underneath it.")
  ),
  p(
    t(
      "For the Spark Seeker, this matters because fantasy can concentrate novelty, pursuit and intensity into their purest form. "
    ),
    b(
      "That can make imagination useful, but it can also influence what real desire is expected to feel like."
    )
  ),
];

const SPARK_CHALLENGES: readonly Report3Block[] = [
  h("Common challenges"),
  p(t("A fantasy often works because reality has been edited out.")),
  p(
    t(
      "Imagine being watched. In fantasy, the attention is flattering, perfectly timed and focused entirely on desire. Nobody judges. Nobody reacts awkwardly. There is no question of privacy or whether the attention is actually welcome."
    )
  ),
  p(
    t(
      "Bring the same scene into reality and the experience can change completely. Being observed may suddenly create self-consciousness, exposure or concern about who is watching."
    )
  ),
  p(
    t("That does not make the fantasy meaningless. It may simply mean that "),
    b("the important part was never the audience itself"),
    t(
      ". The fantasy may be creating the experience of being impossible to ignore, visibly desired and fully captivating someone's attention."
    )
  ),
  p(
    t(
      "For the Spark Seeker, that distinction can be useful. A fantasy that appears to call for more exposure may actually be pointing toward a desire for stronger signals of attraction, more praise, more focused attention or the thrill of being openly admired."
    )
  ),
  p(t("The same applies to fantasies about being restrained or overpowered.")),
  p(
    t(
      "In imagination, being tied up can mean complete surrender without genuine helplessness. The fantasy already assumes that the other person understands the limits, knows what feels good and will stop exactly when needed. All of that trust is silently built into the scene."
    )
  ),
  p(t("Reality cannot assume any of it.")),
  p(
    t(
      "Being physically unable to move can feel very different when there is uncertainty, discomfort or a lack of control over what happens next. The fantasy may therefore be less about restraint itself and more about "
    ),
    b("being able to stop managing the experience"),
    t(
      ". Someone trusted takes over, decisions temporarily disappear, and the Spark Seeker can surrender without having to direct the moment."
    )
  ),
  p(
    t(
      "Fantasy is only one route to desired deeper experience, which is why the differentiation matters. Real life adds everything imagination leaves out. A fantasy can create the perfect version of surrender, danger, admiration or pursuit. Reality asks whether the experience still feels good once communication, boundaries, vulnerability and consequences return."
    )
  ),
  p(t("Sometimes it does.")),
  p(t("Sometimes it does not.")),
  p(
    t("And sometimes the most useful thing a fantasy reveals is not "),
    b("what the Spark Seeker wants to do"),
    t(", but "),
    b("what the Spark Seeker wants to feel"),
    t(".")
  ),
];

const SPARK_PRACTICE: readonly Report3Block[] = [
  p(
    t(
      "Understanding fantasy does not require decoding every image or finding a hidden explanation for it. The goal is simpler: "
    ),
    b("learn to separate what happens in the fantasy from what makes it appealing.")
  ),
  p(
    t(
      "Start with a recurring or particularly powerful fantasy and change one element at a time. If the person changed, would it still work? If nobody could discover you, would it lose something? If the sexual act disappeared but the feeling of being pursued remained, would it still be exciting?"
    )
  ),
  p(t("What remains when the details change can tell you more than the storyline itself.")),
  p(
    t("Then perform a "),
    b("reality test"),
    t(
      ". Imagine the fantasy without its editing. Include how it begins, how you would communicate it, your actual body, another person's reactions, boundaries, uncertainty and what happens afterward."
    )
  ),
  p(t("Notice whether the desire stays.")),
  p(
    t(
      "If the fantasy still feels appealing once those details are included, there may be something worth exploring consensually. If the excitement disappears as reality enters, that tells you something too. The fantasy may work precisely because it is imaginary."
    )
  ),
  p(
    t(
      "Finally, think in terms of translation rather than reproduction. If the fantasy is really about pursuit, create more pursuit. If it is novelty, change the setting or the script. If it is playful surrender, explore giving up some control within clear boundaries. If it is visibility, being deliberately watched, praised or admired by a partner may capture the part that actually matters."
    )
  ),
  p(b("A fantasy does not have to become reality to improve reality.")),
  p(
    t(
      "For the Spark Seeker, fantasies can reveal which conditions make sexuality feel especially alive: anticipation, contrast, novelty, pursuit, play, power and a temporary escape from the ordinary. The goal is not to recreate every scene."
    )
  ),
  p(
    t(
      "It is to notice what imagination is showing you about desire, then decide what deserves to stay in fantasy and what might make real sex more exciting."
    )
  ),
];

export const REPORT_V4_FANTASY: Readonly<Record<string, Report3FantasyCopy>> = {
  "Spark Seeker": {
    intro: SPARK_INTRO,
    challenges: SPARK_CHALLENGES,
    practiceEyebrow: "Practice time: ~8 min.",
    practiceTitle: "Try this & see what shifts",
    practice: SPARK_PRACTICE,
    practiceTeaser: SPARK_PRACTICE.slice(0, 2),
  },
};

/**
 * One fantasy in the table (639:308). A blurred stand-in carries a scrambled name
 * and nothing else: no scores and no note.
 */
export interface Report3FantasyRow {
  practice: string;
  pull: number | null;
  pleasure: number | null;
  description: string | null;
}

export interface Report3FantasyCategory {
  title: string;
  /** Every fantasy in the category — "Show all 11 fantasies", "Unlock all 11 fantasies". */
  total: number;
  rows: readonly Report3FantasyRow[];
  /** Rows from here on are stand-ins, drawn blurred; rows.length when none are. */
  blurredFrom: number;
  /** Open on arrival: the first two in 639:308, the first three in 639:1905. */
  defaultOpen: boolean;
}

export interface Report3FantasyTable {
  locked: boolean;
  categories: readonly Report3FantasyCategory[];
}

/**
 * What the chapter component receives. Assembled on the server and handed down as
 * a prop, never imported by the V4 tree.
 */
export interface Report3FantasyView {
  locked: boolean;
  /** 304:291 — 305:226 draws it all sharp, so it is the same for everyone. */
  intro: readonly Report3Block[];
  table: Report3FantasyTable;
  /** 368:1920 open; scrambled whole when locked — 305:228 blurs it all. */
  challenges: readonly Report3Block[];
  practice: Report3PracticeView;
}

/** 639:308 opens the first two categories for a paying reader. */
export const FANTASY_OPEN_CATEGORIES = 2;

/** 639:1905 opens the first three for a locked reader. */
export const FANTASY_LOCKED_OPEN_CATEGORIES = 3;

/**
 * Rows an open category draws sharp: above the fade in 639:308, above the blur in
 * 639:1905. The paywalled frame draws its third category with two, but the brief
 * is "paywalled after 3 each" and the 372px rows frame holds exactly three and
 * two; one number, so it is a one-line change if Mark wants two there.
 */
export const FANTASY_CLEAR_ROWS = 3;

/** Stand-ins under an open locked category's sharp rows (639:1905). */
export const FANTASY_BLURRED_ROWS = 2;

/**
 * Stand-ins a closed category holds for a locked reader. Mark: "Show 3 blurred
 * with icon and CTA to Unlock for each" (Figma 1939992442), and "when opening the
 * remaining chapters, they should all be blurred with the icon and the Unlock CTA"
 * (1940141608, pinned on the closed categories of 305:217).
 */
export const FANTASY_CLOSED_BLURRED_ROWS = 3;

/**
 * 441:6188 keeps practice paragraphs 1-3 sharp and fades the blur in over
 * paragraph 4 (488:226: a progressive blur over its first 84.5px). Paragraph 4 is
 * the ramp, and it stays real: at 430px the band covers all but its last few
 * words, so no sentence ends past the band to cut at, as in Typical Beliefs.
 * Paragraph 5 on is only ever seen under the full blur and is scrambled.
 */
export const FANTASY_PRACTICE_FREE_BLOCKS = 3;

const realRow = (row: ReportPracticeTendencyRow): Report3FantasyRow => ({
  practice: row.practice,
  pull: row.fantasyPull,
  pleasure: row.actualPleasure,
  description: row.description,
});

/**
 * A blurred row. The name is scrambled to the same shape, so the stand-in wraps and
 * stands as tall as the real row. The scores are never scrambled: the scrambler is
 * deterministic, so a single digit's stand-in would give the digit away; the
 * component draws fixed stand-in digits under the blur instead.
 */
const standIn = (row: ReportPracticeTendencyRow): Report3FantasyRow => ({
  practice: scrambleLockedText(row.practice),
  pull: null,
  pleasure: null,
  description: null,
});

/**
 * Server-side assembly. Returns null for an archetype nobody has written yet, which
 * is the signal ReportPage falls back to V2's section on.
 *
 * `locked` is decided by the caller, from the same gate V2's section runs through
 * (`fantasyUnlocked`), so nothing in the V4 tree ever sees an access plan. A locked
 * reader receives: the intro verbatim; the first three rows of the first three
 * categories verbatim, two stand-ins under each; three stand-ins in every other
 * category; "Common challenges" scrambled; practice paragraphs 1-4 verbatim and the
 * rest scrambled; and the closed teaser verbatim, because it is free copy.
 */
export function buildFantasy(
  archetype: string,
  { locked = false }: { locked?: boolean } = {}
): Report3FantasyView | null {
  const copy = REPORT_V4_FANTASY[archetype];
  const tendencies = reportPracticeTendencies[archetype];
  if (!copy || !tendencies) return null;
  const categories = tendencies.groups.map((group, index): Report3FantasyCategory => {
    const total = group.rows.length;
    if (!locked) {
      return {
        title: group.title,
        total,
        rows: group.rows.map(realRow),
        blurredFrom: total,
        defaultOpen: index < FANTASY_OPEN_CATEGORIES,
      };
    }
    const open = index < FANTASY_LOCKED_OPEN_CATEGORIES;
    const clear = open ? group.rows.slice(0, FANTASY_CLEAR_ROWS).map(realRow) : [];
    const hidden = open
      ? group.rows.slice(FANTASY_CLEAR_ROWS, FANTASY_CLEAR_ROWS + FANTASY_BLURRED_ROWS)
      : group.rows.slice(0, FANTASY_CLOSED_BLURRED_ROWS);
    return {
      title: group.title,
      total,
      rows: [...clear, ...hidden.map(standIn)],
      blurredFrom: clear.length,
      defaultOpen: open,
    };
  });
  return {
    locked,
    intro: copy.intro,
    table: { locked, categories },
    challenges: locked ? copy.challenges.map(scrambleBlock) : copy.challenges,
    practice: {
      eyebrow: copy.practiceEyebrow,
      title: copy.practiceTitle,
      locked,
      teaser: copy.practiceTeaser,
      ...gate(copy.practice, FANTASY_PRACTICE_FREE_BLOCKS, locked),
    },
  };
}
