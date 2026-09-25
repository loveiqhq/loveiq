import { Fragment, type FC } from "react";
import type { Report3Chapter } from "@/data/report3-archetype-page";
import { REPORT_V4_CHAPTER_TEASERS } from "@/data/report4-chapter-teasers";
import type { Report3TypicalBeliefsView } from "@/data/report3-typical-beliefs";
import type { Report3AcceleratorsView } from "@/data/report3-accelerators";
import type { Report3PartnershipView } from "@/data/report3-partnership";
import type { Report3FantasyView } from "@/data/report3-fantasy";
import {
  CHAPTER_COPY_PLACEHOLDER,
  PART_INTRO_PLACEHOLDER,
  REPORT_V4_PART3_CHAPTERS,
  REPORT_V4_PARTS,
  TEASER_PLACEHOLDER,
} from "@/data/report3-archetype-page";
import type { V4LearnMoreByChapter } from "@/data/report3-learn-more";
import V4Chapter from "./V4Chapter";
import V4LearnMore from "./V4LearnMore";
import V4TryThis from "./V4TryThis";
import V4TypicalBeliefs from "./V4TypicalBeliefs";
import V4Accelerators from "./V4Accelerators";
import V4Partnership from "./V4Partnership";
import V4Fantasy from "./V4Fantasy";
import V4PartHeading from "./V4PartHeading";

/**
 * The shared shape of Parts III–VI. Figma 1:849, 1:982, 38:1507 and 1:1137 are the
 * same composition with different chapter lists, so this renders all four.
 *
 * Order and node ids (Part III's, as the reference): rule 1:850 · heading + lede
 * 1:852 · a 44px separator before each chapter row (1:860, 1:862, 1:873, 1:884,
 * 1:895). The part ENDS there.
 *
 * Part III has five rows, IV seven, V four, VI four — each part opening on one
 * expanded chapter (Part V's since Challenges in Partnerships, 38:1672, was drawn).
 *
 * Each of these parts also contains a "Section - Where this report comes from"
 * (1:905, 1:1060, 38:1585, 1:1194) — every one of them `hidden="true"`, so none is
 * built. With those excluded the frame heights match exactly: 975, 1332 and 836 for
 * Parts III, IV and V.
 *
 * A chapter with an entry in `learnMore` carries the "Go deeper & learn more"
 * article (153:2240) as its body, and opens with the chapter already expanded —
 * a collapsed row gives no hint the article is under it. The article REPLACES the
 * `[Chapter Copy]` placeholder rather than sitting below it. Today that is Typical
 * Beliefs alone; another chapter needs only an entry in data/report3-learn-more.ts.
 */

interface Props {
  /** Defaults to Part III's own list; Parts IV–VI pass their own. */
  chapters?: readonly Report3Chapter[];
  /** 0-based index into REPORT_V4_PARTS. Part III is index 2. */
  partIndex?: number;
  /**
   * Part VI alone closes with a 44px separator after its last chapter — its visible
   * children run SEP · INTRO · (SEP · CH) x4 · SEP, where III, IV and V all end on
   * a chapter. That trailing rule is 44 of Part VI's 850.
   */
  trailingSeparator?: boolean;
  archetype: string;
  /**
   * Built once at the host by `buildLearnMoreForReader`, keyed by chapter id. The
   * gate is already decided by the time it arrives, so nothing here knows about
   * access plans — the same division app/api/report/route.ts uses for sections.
   */
  learnMore?: V4LearnMoreByChapter;
  /** Opens the paywall. Handed straight to the article's gate band. */
  onUnlock?: () => void;
  /**
   * The Typical Beliefs chapter body, read on the server. Only Part III carries
   * one; every other part leaves it undefined.
   */
  typicalBeliefs?: Report3TypicalBeliefsView | null;
  /**
   * Accelerator & Brakes' chapter body (310:221), read on the server like
   * `typicalBeliefs`. Part IV renders it above the chapter's article.
   */
  accelerators?: Report3AcceleratorsView | null;
  /**
   * Challenges in Partnerships' chapter body (38:1672), read on the server. Part V
   * renders it as its open first row — it has no article, so it brings its own body.
   */
  partnership?: Report3PartnershipView | null;
  /**
   * Fantasy vs. Reality's chapter body (304:281), read on the server. Part VI renders
   * it above the chapter's article, as Part IV does Accelerator & Brakes'.
   */
  fantasy?: Report3FantasyView | null;
}

const V4ChapterPart: FC<Props> = ({
  chapters = REPORT_V4_PART3_CHAPTERS,
  partIndex = 2,
  archetype,
  trailingSeparator = false,
  learnMore,
  onUnlock,
  typicalBeliefs,
  accelerators,
  partnership,
  fantasy,
}) => (
  <section className="rv4-partblock" data-node-id="1:849" data-name="Chapter part">
    {/* 1:850 */}
    <div className="rv4-col">
      <div className="rv4-rule" aria-hidden="true" />
    </div>

    {/* 1:852 — the lede is `[Part Introductory Text]` in the frame, for all four
     * parts that have one. Rendered as drawn rather than invented. */}
    <V4PartHeading heading={REPORT_V4_PARTS[partIndex]!} intro={PART_INTRO_PLACEHOLDER} />

    {chapters.map((c) => {
      const entry = c.id ? learnMore?.[c.id] : undefined;
      // Typical Beliefs brings its own body (304:256), so its row drops the
      // generic 356px / 20px-padding treatment — the body pads itself.
      const beliefs = c.id === "typical_beliefs" && entry ? typicalBeliefs : null;
      // The literal id, because client code cannot import values from the paid module.
      const accel =
        c.id === "typical_arousal_accelerators_turn_ons_of_the_core_archetype" && entry
          ? accelerators
          : null;
      // No article: the chapter's own body is the whole of its open row.
      const cip = c.id === "challenges_in_partnership" ? (partnership ?? null) : null;
      const fvr =
        c.id === "typical_sexual_fantasy_amp_practice_tendencies" && entry ? fantasy : null;
      return (
        <Fragment key={c.id ?? c.title}>
          {/* 1:858 / 1:861 / 1:872 / 1:883 / 1:894 */}
          <div className="rv4-sep" aria-hidden="true" />
          <V4Chapter
            title={c.title}
            archetype={c.suffix === false ? undefined : archetype}
            // The section id gives each row the anchor the chapter nudges land on.
            sectionId={c.id}
            teaser={
              entry || cip
                ? undefined
                : c.body === "chapter"
                  ? CHAPTER_COPY_PLACEHOLDER
                  : ((c.id && REPORT_V4_CHAPTER_TEASERS[c.id]) ?? TEASER_PLACEHOLDER)
            }
            defaultOpen={Boolean(entry || cip)}
            bare={Boolean(beliefs || accel || cip || fvr)}
          >
            {cip ? (
              <V4Partnership view={cip} onUnlock={onUnlock} />
            ) : entry ? (
              <>
                {/* 304:256 sits ABOVE the article in 1:849: the chapter body
                 * first, then the practice (374:238), then "Go deeper & learn
                 * more". All three share the host's paywall. */}
                {beliefs ? (
                  <>
                    <V4TypicalBeliefs view={beliefs} onUnlock={onUnlock} />
                    <V4TryThis practice={beliefs.practice} onUnlock={onUnlock} />
                  </>
                ) : null}
                {accel ? <V4Accelerators view={accel} onUnlock={onUnlock} /> : null}
                {fvr ? <V4Fantasy view={fvr} onUnlock={onUnlock} /> : null}
                <V4LearnMore article={entry.article} locked={entry.locked} onUnlock={onUnlock} />
              </>
            ) : undefined}
          </V4Chapter>
        </Fragment>
      );
    })}

    {trailingSeparator ? <div className="rv4-sep" aria-hidden="true" /> : null}
  </section>
);

export default V4ChapterPart;
