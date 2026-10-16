// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/report/preview/route";
import { REPORT_V4_LEARN_MORE, type Report3Block } from "@/data/report3-learn-more";
import { KNOWN_ARCHETYPES } from "@features/report/server/archetypeSlug";
import {
  READING_WORDS_PER_MINUTE,
  buildChapterReadingTimes,
  readingMinutes,
} from "@features/report/server/chapterReadingTimes";
import { REPORT_V4_CHAPTERS } from "@features/report/ui/v3/reportV3Nav";
import V3Chapter, { V3ModeProvider, V4ModeProvider } from "@features/report/ui/v3/V3Chapter";
import V4Chapter from "@features/report/ui/v3/V4Chapter";
import { V4ChapterTitle, V4ReadingTimesProvider } from "@features/report/ui/v3/V4ChapterHead";
import { V4ChapterLockProvider } from "@features/report/ui/v3/V4ChapterLock";

/**
 * "Reading time: ~5 min." over every chapter's title — the slimmed report (16.10; Figma
 * 1686:10030 over the open chapters, 1709:1799 over the closed rows). Counted on the
 * server from each chapter's full copy (chapterReadingTimes.ts), at the rate the designed
 * chapters' own Learn more eyebrows were set at.
 */

afterEach(cleanup);

const textOf = (block: Report3Block): string =>
  block.kind === "heading"
    ? block.text
    : block.kind === "para"
      ? block.runs.map((run) => run.text).join("")
      : block.items.map((runs) => runs.map((run) => run.text).join("")).join(" ");
const wordsOf = (blocks: readonly Report3Block[]) =>
  blocks.reduce((sum, block) => sum + textOf(block).split(/\s+/).filter(Boolean).length, 0);

describe("the rate", () => {
  it("is the one the designed articles' eyebrows were set at: their words over 225, rounded", () => {
    expect(READING_WORDS_PER_MINUTE).toBe(225);
    const articles = Object.values(REPORT_V4_LEARN_MORE);
    expect(articles.length).toBeGreaterThanOrEqual(3);
    for (const article of articles) {
      const minutes = Number(article.eyebrow.match(/~(\d+) min\./)?.[1]);
      expect(readingMinutes(wordsOf(article.blocks)), article.eyebrow).toBe(minutes);
    }
  });

  it("never says less than a minute", () => {
    expect(readingMinutes(0)).toBe(1);
    expect(readingMinutes(112)).toBe(1);
    expect(readingMinutes(338)).toBe(2);
  });
});

describe("buildChapterReadingTimes", () => {
  const V4_IDS = REPORT_V4_CHAPTERS.map((chapter) => chapter.id).sort();

  it.each(KNOWN_ARCHETYPES)("times every chapter V4 draws for %s, and nothing else", (name) => {
    const times = buildChapterReadingTimes(name);
    expect(Object.keys(times).sort()).toEqual(V4_IDS);
    for (const [id, minutes] of Object.entries(times)) {
      expect(Number.isInteger(minutes) && minutes >= 1, id).toBe(true);
    }
    for (const gone of ["core_insecurities", "confidence_level", "arousal_style"]) {
      expect(times).not.toHaveProperty(gone);
    }
  });

  it("reads Spark Seeker's four designed chapters about as Figma does", () => {
    // Figma, 16.10: ~5 / ~3 / ~4 / ~5. Counted, Challenges in Partnerships comes to five:
    // its loop and its second example add up to a minute more than the frame allows.
    const times = buildChapterReadingTimes("Spark Seeker");
    expect(times.typical_beliefs).toBe(5);
    expect(times.typical_arousal_accelerators_turn_ons_of_the_core_archetype).toBe(3);
    expect(times.challenges_in_partnership).toBe(5);
    expect(times.typical_sexual_fantasy_amp_practice_tendencies).toBe(5);
  });
});

describe("the payload", () => {
  const get = async (query: string) =>
    (await (
      await GET(new Request(`http://localhost:3000/api/report/preview?${query}`))
    ).json()) as {
      chapterReadingTimes: Record<string, number> | null;
    };

  it("sends a V4 page each chapter's minutes, the same for every plan", async () => {
    const locked = await get("archetype=Spark%20Seeker&plan=&v4=1");
    const paid = await get("archetype=Spark%20Seeker&plan=full_report&v4=1");
    expect(locked.chapterReadingTimes).toEqual(buildChapterReadingTimes("Spark Seeker"));
    expect(paid.chapterReadingTimes).toEqual(locked.chapterReadingTimes);
  });

  it("sends an older report none", async () => {
    expect((await get("archetype=Spark%20Seeker&plan=")).chapterReadingTimes).toBeNull();
  });
});

describe("the eyebrow (1686:10030)", () => {
  it("sets the minutes over the title, in one column, outside the heading", () => {
    const { container } = render(
      <V4ChapterTitle title="Typical Beliefs" archetype="Spark Seeker" readingMinutes={5} />
    );
    const column = container.querySelector(".rv4-chapter__text")!;
    expect([...column.children].map((el) => el.className.split(" ")[0])).toEqual([
      "rv4-chapter__time",
      "rv4-chapter__title",
    ]);
    expect(column.querySelector(".rv4-chapter__time-label")!.textContent).toBe("Reading time:");
    expect(column.querySelector(".rv4-chapter__time-value")!.textContent).toBe("~5 min.");
    // The heading keeps the chapter's name alone.
    expect(screen.getByRole("heading", { level: 3 }).textContent).toBe(
      "Typical Beliefs of the Spark Seeker"
    );
  });

  it("leaves the head as it was where no time is provided", () => {
    const { container } = render(
      <V4ChapterTitle title="Typical Beliefs" archetype="Spark Seeker" />
    );
    expect(container.firstElementChild).toHaveClass("rv4-chapter__title");
    expect(container.querySelector(".rv4-chapter__time")).toBeNull();
  });

  const TIMES = { typical_beliefs: 5, power_orientation: 1 };

  it("tops a designed chapter's head", () => {
    const { container } = render(
      <V4ReadingTimesProvider value={TIMES}>
        <V4Chapter title="Typical Beliefs" archetype="Spark Seeker" sectionId="typical_beliefs">
          <p>Body.</p>
        </V4Chapter>
      </V4ReadingTimesProvider>
    );
    const button = container.querySelector(".rv4-chapter__button")!;
    expect(button.querySelector(".rv4-chapter__time")!.textContent).toBe("Reading time: ~5 min.");
  });

  it("tops a Report 2.0 chapter's head, open or locked", () => {
    const chapter = { id: "power_orientation", number: "2.2", title: "Power Orientation" };
    for (const locked of [false, true]) {
      const { container, unmount } = render(
        <V3ModeProvider>
          <V4ModeProvider>
            <V4ReadingTimesProvider value={TIMES}>
              <V4ChapterLockProvider value={{ isLocked: () => locked, unlock: () => {} }}>
                <V3Chapter chapter={chapter} sectionId={chapter.id} archetype="Spark Seeker">
                  <p>Body.</p>
                </V3Chapter>
              </V4ChapterLockProvider>
            </V4ReadingTimesProvider>
          </V4ModeProvider>
        </V3ModeProvider>
      );
      const button = container.querySelector(".rv4-chapter__button")!;
      expect(button.querySelector(".rv4-chapter__time")!.textContent, String(locked)).toBe(
        "Reading time: ~1 min."
      );
      unmount();
    }
  });
});
