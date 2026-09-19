// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import V4Part1 from "@features/report/ui/v3/V4Part1";
import V4Part2 from "@features/report/ui/v3/V4Part2";
import V4ChapterPart from "@features/report/ui/v3/V4ChapterPart";
import V4Report from "@features/report/ui/v3/V4Report";
import V3Methodology from "@features/report/ui/v3/V3Methodology";
import { report3ArchetypeCard } from "@/data/report3-archetype-card";
import {
  CHAPTER_COPY_PLACEHOLDER,
  PART_INTRO_PLACEHOLDER,
  REPORT_V4_PART3_CHAPTERS,
  REPORT_V4_PART4_CHAPTERS,
  REPORT_V4_PART5_CHAPTERS,
  REPORT_V4_PART6_CHAPTERS,
  missingReport3Summary,
  REPORT_V4_PARTS,
  REPORT_V4_SNAPSHOT,
  TEASER_PLACEHOLDER,
} from "@/data/report3-archetype-page";

/**
 * Report V4 page — Figma "Report V4 — MOBILE" 1:165.
 *
 * Follows V3ChapterHeadings.test.tsx: assert the rendered DOM, plus the CSS
 * contracts the DOM cannot show, read off disk.
 */

const V3_CSS = readFileSync(join(process.cwd(), "features/report/ui/v3/reportV3.css"), "utf8");
const card = report3ArchetypeCard["Spark Seeker"]!;

afterEach(cleanup);

describe("V4Part1", () => {
  it("renders the part heading, both chapters and the science section", () => {
    const { container } = render(<V4Part1 />);
    expect(screen.getByText("Part I")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Introduction" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "What shaped this report" })).toBeInTheDocument();
    expect(container.querySelectorAll(".rv4-chapter")).toHaveLength(2);
    expect(container.querySelector(".rv3-method.is-v4")).toBeInTheDocument();
  });

  it("gives Part I the 56px lead-in that only it has", () => {
    const { container } = render(<V4Part1 />);
    expect(container.querySelector(".rv4-part--lead")).toBeInTheDocument();
  });

  it("does not render the science section's heading twice", () => {
    // 1:185 IS that heading as a chapter, so V3Methodology must not repeat it.
    render(<V4Part1 />);
    expect(screen.getAllByText("What shaped this report")).toHaveLength(1);
  });
});

describe("V3Methodology chrome", () => {
  it("keeps its own heading and intro by default, for the live ?v3=1 report", () => {
    render(<V3Methodology />);
    expect(screen.getByRole("heading", { name: "What shaped this report" })).toBeInTheDocument();
  });

  it("drops the rule and the number, and relabels the list, in V4", () => {
    const { container } = render(<V3Methodology chrome="deck" />);
    expect(container.querySelector(".rv3-sci__rule")).toBeNull();
    expect(container.querySelector(".rv3-sci__n")).toBeNull();
    expect(screen.getAllByText("Read more in chapter").length).toBeGreaterThan(0);
    expect(screen.queryByText("read this in CHAPTER:")).toBeNull();
  });

  it("adds the source-card icons that V4 introduced, and only in V4", () => {
    const v4 = render(<V3Methodology chrome="deck" />);
    expect(v4.container.querySelectorAll(".rv3-src__icon")).toHaveLength(3);
    cleanup();
    const v3 = render(<V3Methodology />);
    expect(v3.container.querySelectorAll(".rv3-src__icon")).toHaveLength(0);
  });

  it("uses V4's shortened questions only in V4", () => {
    render(<V3Methodology chrome="deck" />);
    expect(screen.getByText("Why does safety change what you want?")).toBeInTheDocument();
    cleanup();
    render(<V3Methodology />);
    expect(screen.queryByText("Why does safety change what you want?")).toBeNull();
  });
});

describe("V4Part2", () => {
  const renderPart2 = () =>
    render(<V4Part2 archetype="Spark Seeker" matchStrength={43} card={card} />);

  it("renders every block the frame lists, in order", () => {
    const { container } = renderPart2();
    expect(container.querySelector(".rv4-rule")).toBeInTheDocument();
    expect(screen.getByText("Part II")).toBeInTheDocument();
    expect(container.querySelector(".rv4-top3")).toBeInTheDocument();
    expect(container.querySelector(".rv4-corehead")).toBeInTheDocument();
    expect(container.querySelector(".rv3-arch")).toBeInTheDocument();
    expect(container.querySelector(".rv4-summary")).toBeInTheDocument();
    expect(container.querySelector(".rv4-snap")).toBeInTheDocument();
  });

  it("delivers all five snapshot rows open, as the frame draws them", () => {
    const { container } = renderPart2();
    expect(container.querySelectorAll(".rv4-snap__row")).toHaveLength(5);
    expect(container.querySelectorAll(".rv4-snap__row.is-open")).toHaveLength(5);
  });

  it("omits the summary and snapshot for an archetype Mark has not written", () => {
    const { container } = render(
      <V4Part2 archetype="Quiet Withdrawer" matchStrength={12} card={card} />
    );
    expect(container.querySelector(".rv4-summary")).toBeNull();
    expect(container.querySelector(".rv4-snap")).toBeNull();
  });
});

describe("V4ChapterPart", () => {
  const renderPart3 = () => render(<V4ChapterPart archetype="Spark Seeker" />);

  it("renders five chapters, each suffixed with the archetype", () => {
    const { container } = renderPart3();
    expect(container.querySelectorAll(".rv4-chapter")).toHaveLength(5);
    expect(container.querySelectorAll(".rv4-chapter__archetype")).toHaveLength(5);
    expect(screen.getAllByText("Spark Seeker")).toHaveLength(5);
  });

  it("renders the frame's placeholders rather than inventing copy", () => {
    renderPart3();
    // 1:860 carries [Chapter Copy]; the other four carry [Teaser Text].
    expect(screen.getByText(CHAPTER_COPY_PLACEHOLDER)).toBeInTheDocument();
    expect(screen.getAllByText(TEASER_PLACEHOLDER)).toHaveLength(4);
    expect(screen.getByText(PART_INTRO_PLACEHOLDER)).toBeInTheDocument();
  });

  it("ends after its last chapter — the trailing section is hidden in the frame", () => {
    const { container } = renderPart3();
    // 1:905 / 1:1060 / 38:1585 / 1:1194 all carry hidden="true", so none is built.
    // With them excluded the frame heights match exactly: 975 / 1332 / 836.
    expect(container.querySelector(".rv4-method")).toBeNull();
    expect(container.querySelector(".rv3-method")).toBeNull();
    const kids = container.querySelector(".rv4-partblock")!.children;
    expect(kids[kids.length - 1]?.className).toContain("rv4-chapter");
  });

  it("takes its chapter list as a prop, so Parts IV-VI can reuse it", () => {
    const { container } = render(
      <V4ChapterPart
        archetype="Spark Seeker"
        partIndex={4}
        chapters={[{ title: "Attachment Style", body: "teaser" }]}
      />
    );
    expect(container.querySelectorAll(".rv4-chapter")).toHaveLength(1);
    expect(screen.getByText("Part V")).toBeInTheDocument();
  });

  it("keeps Part III's chapter list in frame order", () => {
    expect(REPORT_V4_PART3_CHAPTERS.map((c) => c.title)).toEqual([
      "Typical Beliefs",
      "Core Insecurities",
      "Confidence Level",
      "Power Orientation",
      "Importance of Sexuality",
    ]);
  });
});

describe("Parts IV, V and VI", () => {
  const cases = [
    { name: "IV", chapters: REPORT_V4_PART4_CHAPTERS, partIndex: 3, rows: 7, suffixed: 6 },
    { name: "V", chapters: REPORT_V4_PART5_CHAPTERS, partIndex: 4, rows: 4, suffixed: 4 },
    { name: "VI", chapters: REPORT_V4_PART6_CHAPTERS, partIndex: 5, rows: 4, suffixed: 2 },
  ];

  it.each(cases)(
    "Part $name renders $rows chapters, $suffixed of them suffixed",
    ({ chapters, partIndex, rows, suffixed }) => {
      const { container } = render(
        <V4ChapterPart archetype="Spark Seeker" partIndex={partIndex} chapters={chapters} />
      );
      expect(container.querySelectorAll(".rv4-chapter")).toHaveLength(rows);
      // Your Sexual Stage, Reading Recommendations and Other Archetypes are drawn
      // without the "- of the <Archetype>" run; the rest carry it.
      expect(container.querySelectorAll(".rv4-chapter__archetype")).toHaveLength(suffixed);
      expect(container.querySelector(".rv4-method")).toBeNull();
    }
  );

  it("marks exactly the three chapters the frame draws without a suffix", () => {
    const all = [
      ...REPORT_V4_PART3_CHAPTERS,
      ...REPORT_V4_PART4_CHAPTERS,
      ...REPORT_V4_PART5_CHAPTERS,
      ...REPORT_V4_PART6_CHAPTERS,
    ];
    expect(all.filter((c) => c.suffix === false).map((c) => c.title)).toEqual([
      "Your Sexual Stage",
      "Reading Recommendations",
      "Other Archetypes",
    ]);
  });

  it("gives Part V no expanded row, unlike III, IV and VI", () => {
    expect(REPORT_V4_PART5_CHAPTERS.some((c) => c.body === "chapter")).toBe(false);
    for (const list of [
      REPORT_V4_PART3_CHAPTERS,
      REPORT_V4_PART4_CHAPTERS,
      REPORT_V4_PART6_CHAPTERS,
    ]) {
      expect(list.filter((c) => c.body === "chapter")).toHaveLength(1);
    }
  });
});

describe("V4Report — the whole page", () => {
  const renderAll = () =>
    render(<V4Report archetype="Spark Seeker" matchStrength={43} card={card} />);

  it("renders all six parts as one continuous flow, not tabs", () => {
    const { container } = renderAll();
    expect(container.querySelectorAll(".rv4-partblock")).toHaveLength(6);
    // One flow container, matching the frame's single 1:166.
    expect(container.querySelectorAll(".rv4-report__flow")).toHaveLength(1);
  });

  it("renders the frame's full chapter count across the page", () => {
    const { container } = renderAll();
    // 2 in Part I, 0 in II, then 5 + 7 + 4 + 4 = 22.
    expect(container.querySelectorAll(".rv4-chapter")).toHaveLength(22);
    // The 729-tall "where this comes from" is hidden in all four parts that hold
    // one, so none is built; only Part I's visible 520 variant (1:195) renders.
    expect(container.querySelectorAll(".rv4-method")).toHaveLength(0);
    expect(container.querySelectorAll(".rv3-method.is-v4")).toHaveLength(1);
  });

  it("floats the header and the chapter pill above the flow", () => {
    const { container } = renderAll();
    expect(container.querySelector(".rv4-chrome__header")).toBeInTheDocument();
    expect(container.querySelector(".rv4-chrome__pill")).toBeInTheDocument();
    // The chrome must precede the flow so it can overlay it.
    const report = container.querySelector(".rv4-report")!;
    expect(report.firstElementChild?.className).toContain("rv4-chrome");
  });

  it("keeps the chapter pill static, as the frame draws it", () => {
    const { container } = renderAll();
    // 1:1275 reads "Core Archetype" and does not change. An earlier pass had it
    // track the current chapter on scroll; that is not in the design.
    expect(container.querySelector(".rv4-chrome__pill-name")?.textContent).toBe("Core Archetype");
    expect(container.querySelectorAll("[data-chapter-label]")).toHaveLength(0);
  });
});

describe("Report V4 copy", () => {
  it("names the archetypes still missing a Part II summary", () => {
    const missing = missingReport3Summary();
    expect(missing).not.toContain("Spark Seeker");
    expect(missing).toHaveLength(13);
    expect(Object.keys(REPORT_V4_SNAPSHOT)).toEqual(["Spark Seeker"]);
  });

  it("keeps the frame's own teaser placeholder as a single source", () => {
    // All 17 collapsed chapters are unwritten; the placeholder is the frame's.
    expect(TEASER_PLACEHOLDER).toBe("[Teaser Text]");
  });

  it("carries six parts, with only Part I's accent in ink rather than violet", () => {
    expect(REPORT_V4_PARTS).toHaveLength(6);
    expect(REPORT_V4_PARTS[0]).toMatchObject({ eyebrow: "Part I", accent: "Welcome", tone: "ink" });
    expect(REPORT_V4_PARTS.filter((p) => p.tone === "ink")).toHaveLength(1);
  });
});

describe("reportV3.css — V4 contracts", () => {
  it("leaves the V3 chapter untouched and adds a separate V4 row", () => {
    expect(V3_CSS).toContain(".rv3 .rv4-chapter__button");
    // The V3 accordion still rotates on open; V4 inverts it, per the frames.
    expect(V3_CSS).toContain(".rv3 .rv4-chapter:not(.is-open) .rv4-chapter__chev");
  });

  it("scopes every V4 card override under .rv3-method.is-v4", () => {
    const v4Rules = V3_CSS.split("\n").filter(
      (l) => l.includes(".rv3-sci__card") && l.includes("{")
    );
    expect(v4Rules.some((l) => l.includes("is-v4"))).toBe(true);
  });

  it("re-asserts the mobile deck inside the preview scope", () => {
    // reportV3.css breaks to a grid at 700px and 1280px, and media queries resolve
    // against the browser viewport — so without these the preview silently renders
    // the DESKTOP deck on a laptop: all seven cards flat, overflowing, no scroll.
    const scope = V3_CSS.slice(V3_CSS.indexOf(".rv3.rv4-doc .rv3-sci__track"));
    expect(scope).toContain("overflow-x: auto");
    expect(scope).toContain("grid-template-columns: none");
    expect(V3_CSS).toMatch(/\.rv3\.rv4-doc \.rv3-sci__dots \{[^}]*display: flex/);
    expect(V3_CSS).toMatch(/\.rv3\.rv4-doc \.rv3-prose \{[^}]*font-size: 16px/);
    // The desktop blocks force min-height: 276, which would stretch V4's 230 card.
    expect(V3_CSS).toMatch(/\.rv3\.rv4-doc \.rv3-sci__card \{[^}]*min-height: 0/);
  });

  it("keeps the teaser serif against the open body's sans", () => {
    expect(V3_CSS).toMatch(/\.rv4-chapter__teaser \{[^}]*font-family: var\(--font-serif\)/);
    expect(V3_CSS).toMatch(/\.rv4-chapter__teaser \{[^}]*line-height: 19\.2px/);
  });
});
