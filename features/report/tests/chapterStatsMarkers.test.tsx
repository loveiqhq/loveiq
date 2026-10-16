// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const persist = vi.hoisted(() => vi.fn());
vi.mock("@features/analytics/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@features/analytics/client")>()),
  persistReportChapterStats: persist,
}));

import { useChapterStats } from "@features/analytics/chapterStats";
import { splitArticleForReader } from "@features/report/server/contentGating";
import V3Chapter, { V3ModeProvider, V4ModeProvider } from "@features/report/ui/v3/V3Chapter";
import V4Chapter from "@features/report/ui/v3/V4Chapter";
import V4FantasyTable from "@features/report/ui/v3/V4FantasyTable";
import V4LearnMore from "@features/report/ui/v3/V4LearnMore";
import V4SummaryChapter from "@features/report/ui/v3/V4SummaryChapter";
import V4TriggerCard from "@features/report/ui/v3/V4TriggerCard";
import V4TryThis from "@features/report/ui/v3/V4TryThis";
import { buildAccelerators } from "@/data/report3-accelerators";
import { REPORT_V4_LEARN_MORE } from "@/data/report3-learn-more";
import { buildFantasy } from "@/data/report3-fantasy";
import { buildTypicalBeliefs } from "@/data/report3-typical-beliefs";

/**
 * The report's own controls carry the `data-chapter-action` the chapter stats count
 * (features/analytics/chapterStats.ts): the stats' tests use stand-in buttons, so this
 * clicks the real ones, as Report 3.0 renders them, and reads the save.
 */

const CHAPTERS = ["core_archetype", "typical_beliefs", "confidence_level", "accelerators"];
const store = { get: () => "core_archetype" };

function Report() {
  useChapterStats({
    enabled: true,
    chapters: CHAPTERS,
    active: store,
    archetype: "Spark Seeker",
    paused: false,
  });
  return (
    <V3ModeProvider>
      <V4ModeProvider>
        <V4Chapter title="Core Archetype" archetype="Spark Seeker" sectionId="core_archetype">
          <p>core</p>
        </V4Chapter>
        <V4SummaryChapter
          archetype="Spark Seeker"
          summary={{ paragraphs: [[{ text: "One." }], [{ text: "Two." }]], closer: "End." }}
        />
        <V4Chapter
          title="Typical Beliefs"
          archetype="Spark Seeker"
          sectionId="typical_beliefs"
          defaultOpen
        >
          <V4TryThis practice={buildTypicalBeliefs("Spark Seeker")!.practice} />
          <V4LearnMore
            article={splitArticleForReader(REPORT_V4_LEARN_MORE.typical_beliefs!, false)}
          />
        </V4Chapter>
        <V3Chapter
          chapter={{ id: "confidence_level", number: "2.4", title: "Confidence Level" }}
          sectionId="confidence_level"
          archetype="Spark Seeker"
        >
          <p>confidence</p>
        </V3Chapter>
        <V4Chapter
          title="Accelerators"
          archetype="Spark Seeker"
          sectionId="accelerators"
          defaultOpen
        >
          <V4TriggerCard tone="brake" rows={buildAccelerators("Spark Seeker")!.brakes} />
          <V4FantasyTable table={buildFantasy("Spark Seeker")!.table} />
        </V4Chapter>
      </V4ModeProvider>
    </V3ModeProvider>
  );
}

beforeEach(() => persist.mockClear());
afterEach(cleanup);

describe("Report 3.0's controls, as the chapter stats count them", () => {
  it("counts each control's opening for the chapter it is in", () => {
    const { container } = render(<Report />);
    const button = (sel: string) => container.querySelector<HTMLElement>(sel)!;

    fireEvent.click(button("#core_archetype .rv4-chapter__button")); // a chapter opened
    fireEvent.click(screen.getByRole("button", { name: "Show all of the summary" }));
    fireEvent.click(screen.getByRole("button", { name: "Read all of the practice" }));
    fireEvent.click(screen.getByRole("button", { name: "Read all of the article" }));
    fireEvent.click(button("#confidence_level .rv4-chapter__button")); // V3's chapter row
    fireEvent.click(screen.getByRole("button", { name: "Show all brakes" }));
    fireEvent.click(screen.getAllByRole("button", { name: /^Show all \d+ fantasies$/ })[0]!);
    window.dispatchEvent(new Event("pagehide"));

    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist.mock.calls[0]![0]).toEqual({
      archetype: "Spark Seeker",
      chapters: {
        // The Summary has no nav row: it counts under the chapter above it.
        core_archetype: { open: 1, show_all: 1 },
        typical_beliefs: { try_this: 1, learn_more: 1 },
        confidence_level: { open: 1 },
        accelerators: { show_all: 2 },
      },
    });
  });

  it("counts a chapter closed again as nothing", () => {
    const { container } = render(<Report />);
    // Typical Beliefs is open: its row's click closes it.
    fireEvent.click(container.querySelector<HTMLElement>("#typical_beliefs .rv4-chapter__button")!);
    window.dispatchEvent(new Event("pagehide"));
    expect(persist).not.toHaveBeenCalled();
  });
});
