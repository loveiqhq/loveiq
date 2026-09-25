// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import V4Part1 from "@features/report/ui/v3/V4Part1";
import V4Part2 from "@features/report/ui/v3/V4Part2";
import V4ChapterPart from "@features/report/ui/v3/V4ChapterPart";
import V4Report from "@features/report/ui/v3/V4Report";
import V3Methodology from "@features/report/ui/v3/V3Methodology";
import { report3ArchetypeCard } from "@/data/report3-archetype-card";
import { REPORT_V4_LEARN_MORE } from "@/data/report3-learn-more";
import { REPORT_V4_CHAPTER_TEASERS } from "@/data/report4-chapter-teasers";
import {
  CHAPTER_COPY_PLACEHOLDER,
  PART_INTRO_PLACEHOLDER,
  REPORT_V4_PART3_CHAPTERS,
  REPORT_V4_PART4_CHAPTERS,
  REPORT_V4_PART5_CHAPTERS,
  REPORT_V4_PART6_CHAPTERS,
  missingReport3Summary,
  REPORT_V4_PARTS,
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
    // "We took the 'Introduction' out" (Mark, 2026-09-24, comment 1939924076): the
    // chapter keeps its copy and loses only its title.
    expect(screen.queryByRole("heading", { name: "Introduction" })).toBeNull();
    expect(
      screen.getByText(/congratulations on having the courage to look inward/)
    ).toBeInTheDocument();
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
    expect(
      screen.getByText("How does emotional security shape desire and intimacy?")
    ).toBeInTheDocument();
    cleanup();
    render(<V3Methodology />);
    expect(screen.queryByText("How does emotional security shape desire and intimacy?")).toBeNull();
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
    // 1:763 — "What you will discover" over the chapter nudges, where the Snapshot was.
    expect(container.querySelector(".rv4-nudges")).toBeInTheDocument();
    expect(container.querySelector(".rv4-snap")).toBeNull();
  });

  it("omits the summary for an archetype Mark has not written, but keeps the nudges", () => {
    const { container } = render(
      <V4Part2 archetype="Quiet Withdrawer" matchStrength={12} card={card} />
    );
    expect(container.querySelector(".rv4-summary")).toBeNull();
    // The nudges are ways into chapters, the same for every archetype.
    expect(container.querySelectorAll(".rv4-nudges__row")).toHaveLength(4);
  });
});

describe("V4ChapterPart", () => {
  const renderPart3 = () => render(<V4ChapterPart archetype="Spark Seeker" />);

  it("renders five chapters, each suffixed with the archetype", () => {
    const { container } = renderPart3();
    expect(container.querySelectorAll(".rv4-chapter")).toHaveLength(5);
    // The name sits in its own run on the suffix line (1:865).
    expect(
      [...container.querySelectorAll(".rv4-chapter__archetype")].map((el) => el.textContent)
    ).toEqual(Array(5).fill("Spark Seeker"));
  });

  it("shows Sanjin's teasers where they are written, the frame's placeholders elsewhere", () => {
    renderPart3();
    // 1:860 carries [Chapter Copy]. Core Insecurities, Confidence Level and Power
    // Orientation carry their teasers (1:871 / 1:882 / 1:893); Importance of
    // Sexuality, a row only the preview still draws, keeps [Teaser Text].
    expect(screen.getByText(CHAPTER_COPY_PLACEHOLDER)).toBeInTheDocument();
    expect(screen.getAllByText(TEASER_PLACEHOLDER)).toHaveLength(1);
    for (const id of ["core_insecurities", "confidence_level", "power_orientation"]) {
      expect(screen.getByText(REPORT_V4_CHAPTER_TEASERS[id]!)).toBeInTheDocument();
    }
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

  it("titles Part IV's opener 'Accelerators & Brakes', with the 's' (review 24.09)", () => {
    expect(REPORT_V4_PART4_CHAPTERS[0]!.title).toBe("Accelerators & Brakes");
    // Its "Go deeper" article names the model's two systems the same way.
    const article = JSON.stringify(
      REPORT_V4_LEARN_MORE.typical_arousal_accelerators_turn_ons_of_the_core_archetype
    );
    expect(article).toContain("“Accelerators” and “brakes”");
    expect(article).not.toContain("“Accelerator”");
  });

  it("expands one row per part — Part V's is Challenges in Partnerships (38:1672) now", () => {
    expect(REPORT_V4_PART5_CHAPTERS.filter((c) => c.body === "chapter").map((c) => c.id)).toEqual([
      "challenges_in_partnership",
    ]);
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
    // The V4 disc (304:260 open, 1:866 closed): open is white with a 1.5px violet
    // ring and the chevron turned UP; closed is the 10% lavender disc pointing down.
    expect(V3_CSS).toContain(".rv3 .rv4-chapter:not(.is-open) .rv4-chapter__chev");
    expect(V3_CSS).toMatch(
      /\.rv3 \.rv4-chapter\.is-open \.rv4-chapter__chev \{[^}]*box-shadow: inset 0 0 0 1\.5px var\(--rv3-violet\)/
    );
    expect(V3_CSS).toMatch(
      /\.rv3 \.rv4-chapter\.is-open \.rv4-chapter__chev svg \{[^}]*transform: rotate\(180deg\)/
    );
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

  it("sets the teaser in Plus Jakarta 14/22.4, as 1:870 does", () => {
    expect(V3_CSS).toMatch(/\.rv4-chapter__teaser \{[^}]*font-family: var\(--font-sans\)/);
    expect(V3_CSS).toMatch(/\.rv4-chapter__teaser \{[^}]*line-height: 22\.4px/);
  });
});

// Review 24.09: "The supportive text underneath the headlines 'Clinical models' render
// weird in staging. Probably because the elements dont have enough space. Can you see
// if you can make it look nicer." The frame sets that text at 10px in a 91px column;
// at the agreed 12px the same column breaks it into ragged four-to-six line blocks,
// left-aligned under a centred title.
describe("V3Methodology source tiles in the live report (review 24.09)", () => {
  const last = (selector: string) => {
    const at = V3_CSS.lastIndexOf(selector);
    expect(at, `${selector} missing`).toBeGreaterThan(-1);
    return V3_CSS.slice(at, V3_CSS.indexOf("}", at));
  };

  it("centres and balances the support text under its centred title", () => {
    const body = last(".rv3.rv4 .rv3-method.is-v4 .rv3-src__body {");
    expect(body).toContain("text-align: center");
    expect(body).toContain("text-wrap: balance");
  });

  it("gives the text more of the tile, down to a 320px phone", () => {
    // "Foundational" is 76px at 12/600; a 320px phone's tile is 90.7 wide.
    expect(last(".rv3.rv4 .rv3-method.is-v4 .rv3-src__card {")).toMatch(
      /padding-inline:\s*clamp\(7px, 2\.2vw, 11\.5px\)/
    );
  });

  it("centres a one-line title in the two lines every title reserves", () => {
    const title = last(".rv3.rv4 .rv3-method.is-v4 .rv3-src__title {");
    expect(title).toContain("display: flex");
    expect(title).toContain("align-items: center");
    expect(title).toContain("justify-content: center");
  });
});

// Mark, 2026-09-24 (comment 1939890558 on 493:7082): "We have updated some of the
// support texts in the tiles, changed the order (swapped Attachment research and
// Relationship research) and changed both of their chapters, and updated the Therapy
// room text."
describe("V3Methodology science deck in V4 (493:7082)", () => {
  it("runs the seven tiles in the frame's order, with its questions and chapters", () => {
    const { container } = render(<V3Methodology chrome="deck" />);
    const cards = [...container.querySelectorAll(".rv3-sci__card")].map((c) => [
      c.querySelector(".rv3-sci__title")!.textContent,
      c.querySelector(".rv3-sci__q")!.textContent,
      [...c.querySelectorAll(".rv3-sci__list li")].map((li) => li.textContent),
    ]);
    expect(cards).toEqual([
      [
        "Neuroscience",
        "What happens in the brain when you feel desire?",
        ["Reward System", "Arousal Style", "Energy & Risk"],
      ],
      [
        "Psychology",
        "Which beliefs about sex do you hold that you never chose?",
        ["Typical Beliefs", "Core Insecurities"],
      ],
      [
        "Relationship research",
        // Sanjin, 2026-09-25 (1941776620 on 493:7082, 493:7233): adapted after reading
        // the mobile staging.
        "How do relationship dynamics shape desire, intimacy, and connection?",
        ["Love Language", "Challenges in Partnerships"],
      ],
      ["Sexology", "How does arousal actually work?", ["Initiation Style", "Fantasy vs. Reality"]],
      [
        "Behavioral science",
        "Why habits beat intentions?",
        ["Accelerators & Brakes", "Libido Challenges"],
      ],
      [
        "Attachment research",
        "How does emotional security shape desire and intimacy?",
        ["Attachment Style"],
      ],
      [
        "Therapy rooms",
        "What have decades of clinical practice taught us about desire and intimacy?",
        ["Reading Recommendations"],
      ],
    ]);
  });

  it("leaves the live ?v3=1 deck as it was", () => {
    const { container } = render(<V3Methodology />);
    const titles = [...container.querySelectorAll(".rv3-sci__title")].map((t) => t.textContent);
    expect(titles[2]).toBe("Attachment research");
    expect(titles[5]).toBe("Relationship research");
  });
});

// Mark, 2026-09-24 (reply 1939904226): "Also update the alignment and spacing of the
// 'Read more in chapter' + the chapters". 493:7082 pins each card's list to its foot:
// 248px cards, "Read more in chapter" on one line across all seven, chapters 5.5 apart.
describe("reportV3.css — V4 science card alignment (493:7082)", () => {
  const last = (selector: string) => {
    const at = V3_CSS.lastIndexOf(selector);
    expect(at, selector).toBeGreaterThan(-1);
    return V3_CSS.slice(at, V3_CSS.indexOf("}", at));
  };

  it("sizes the card as drawn and pins the list to its foot", () => {
    expect(last(".rv3 .rv3-method.is-v4 .rv3-sci__card {")).toMatch(/height:\s*248px/);
    expect(last(".rv3 .rv3-method.is-v4 .rv3-sci__label {")).toMatch(/margin-top:\s*auto/);
  });

  it("sets the chapters 5.5px apart, 5.5px under the label", () => {
    const list = last(".rv3 .rv3-method.is-v4 .rv3-sci__list {");
    expect(list).toMatch(/gap:\s*5\.5px/);
    expect(list).toMatch(/margin-top:\s*-9\.5px/);
    expect(list).toMatch(/min-height:\s*71px/);
  });
});
