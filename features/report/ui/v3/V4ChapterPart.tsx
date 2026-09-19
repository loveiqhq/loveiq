import { Fragment, type FC } from "react";
import type { Report3Chapter } from "@/data/report3-archetype-page";
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
import V4PartHeading from "./V4PartHeading";

/**
 * The shared shape of Parts III–VI. Figma 1:849, 1:982, 38:1507 and 1:1137 are the
 * same composition with different chapter lists, so this renders all four.
 *
 * Order and node ids (Part III's, as the reference): rule 1:850 · heading + lede
 * 1:852 · a 44px separator before each chapter row (1:860, 1:862, 1:873, 1:884,
 * 1:895). The part ENDS there.
 *
 * Part III has five rows, IV seven, V four (and no expanded row at all), VI four.
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
}

const V4ChapterPart: FC<Props> = ({
  chapters = REPORT_V4_PART3_CHAPTERS,
  partIndex = 2,
  archetype,
  trailingSeparator = false,
  learnMore,
  onUnlock,
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
      return (
        <Fragment key={c.id ?? c.title}>
          {/* 1:858 / 1:861 / 1:872 / 1:883 / 1:894 */}
          <div className="rv4-sep" aria-hidden="true" />
          <V4Chapter
            title={c.title}
            archetype={c.suffix === false ? undefined : archetype}
            teaser={
              entry
                ? undefined
                : c.body === "chapter"
                  ? CHAPTER_COPY_PLACEHOLDER
                  : TEASER_PLACEHOLDER
            }
            defaultOpen={Boolean(entry)}
          >
            {entry ? (
              <V4LearnMore article={entry.article} locked={entry.locked} onUnlock={onUnlock} />
            ) : undefined}
          </V4Chapter>
        </Fragment>
      );
    })}

    {trailingSeparator ? <div className="rv4-sep" aria-hidden="true" /> : null}
  </section>
);

export default V4ChapterPart;
