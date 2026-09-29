// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactElement } from "react";
import ReportDesktopSidebar from "@features/report/ui/ReportDesktopSidebar";
import ReportMobileNav from "@features/report/ui/ReportMobileNav";
import type { ReportNavAccess } from "@features/report/ui/ReportNavBadge";
import { REPORT_NAV_IDS, REPORT_NAV_PARTS } from "@features/report/ui/reportNav";
import { __resetBodyScrollLockForTests } from "@shared/ui/body-scroll-lock";

// Without this the file's renders accumulate, and "which link is aria-current"
// then answers for every navigation rendered so far rather than this one.
afterEach(cleanup);

describe("ReportDesktopSidebar", () => {
  it("renders the chapter rail with branding, utility actions, and the curated part nav", () => {
    render(<ReportDesktopSidebar activeSectionId="core_archetype" onShareClick={() => {}} />);

    expect(screen.getAllByLabelText(/loveiq report/i).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /share report/i })[0]).toBeInTheDocument();
    expect(screen.getAllByRole("navigation")[0]).toBeInTheDocument();

    // Gradient "Part N" group headers (Figma 8719:9326) replace the old
    // "Chapters" label + per-item tier chips.
    expect(screen.getByText(/part i · your core archetype/i)).toBeInTheDocument();
    expect(screen.getByText(/part iv · your growth edges/i)).toBeInTheDocument();

    // Curated nav items (combined/renamed vs the raw section list).
    expect(screen.getByRole("link", { name: /core archetype/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /reading recommendations/i })).toBeInTheDocument();

    // Tier chips and the {{CORE_ARCHETYPE}} placeholder are gone.
    expect(screen.queryByText(/full report/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/\{\{CORE_ARCHETYPE\}\}/i)).not.toBeInTheDocument();

    const activeLinks = screen
      .getAllByRole("link")
      .filter((link) => link.getAttribute("aria-current") === "location");
    expect(activeLinks.some((link) => link.getAttribute("href") === "#core_archetype")).toBe(true);
  });
});

describe("ReportMobileNav", () => {
  it("renders the mobile topbar with branding and a chapter pill trigger", () => {
    render(<ReportMobileNav activeSectionId="core_archetype" />);

    expect(screen.getAllByLabelText(/loveiq report/i).length).toBeGreaterThan(0);
    const pill = screen.getByRole("button", { name: /chapter:/i });
    expect(pill).toBeInTheDocument();
    expect(pill).toHaveAttribute("aria-haspopup", "dialog");
    expect(pill).toHaveAttribute("aria-expanded", "false");
  });
});

/**
 * Which list the scroll-spy walks.
 *
 * It walked the SECTION list from `data/report-general.ts`, which has no row for
 * any of the Report 2.0 anchors the nav lists — `snapshot`, `map`,
 * `constellation` — nor for the inline `means_for_you` / `findings` /
 * `challenges_in_partnership`. Through the whole of Part I the highlight was a
 * chapter behind: "Core Archetype" stayed lit from the top of the report to the
 * Insight Map, and "Importance of Sexuality" stayed lit through Other Archetypes.
 */
describe("scroll-spy source", () => {
  it("flattens every nav item, in nav order", () => {
    expect(REPORT_NAV_IDS).toEqual(REPORT_NAV_PARTS.flatMap((part) => part.items.map((i) => i.id)));
    // The anchors whose absence caused the lag.
    expect(REPORT_NAV_IDS).toContain("snapshot");
    expect(REPORT_NAV_IDS).toContain("map");
    expect(REPORT_NAV_IDS).toContain("constellation");
  });

  it("is what ReportPage measures, not the report-general section list", () => {
    const source = readFileSync(join(process.cwd(), "features/report/ui/ReportPage.tsx"), "utf8");
    const spy = source.slice(source.indexOf("function buildSectionTops()"));
    expect(spy).toMatch(/navIds\s*\.map\(\(id\) =>/);
    // V4 walks its own list, which opens on Part 1's Welcome (961:333).
    expect(source).toMatch(/const navIds = isV4 \? REPORT_V4_NAV_IDS : REPORT_NAV_IDS;/);
    // The list is also sorted by position, so the loop's early `break` cannot be
    // truncated by a future reorder of either the nav or the body.
    expect(spy).toMatch(/\.sort\(\(a, b\) => a\.top - b\.top\)/);
  });

  it("marks a Report 2.0 anchor as current, in both navs", () => {
    // Nothing could ever set these active before, so nothing rendered them lit.
    const { unmount } = render(<ReportDesktopSidebar activeSectionId="snapshot" />);
    const lit = screen
      .getAllByRole("link")
      .filter((link) => link.getAttribute("aria-current") === "location");
    expect(lit.map((l) => l.getAttribute("href"))).toEqual(["#snapshot"]);
    unmount();

    render(<ReportMobileNav activeSectionId="map" />);
    expect(screen.getByRole("button", { name: /chapter:/i }).textContent).toMatch(
      /your insight map/i
    );
  });
});

/**
 * Tapping a chapter in the mobile drawer.
 *
 * The items are plain `#id` links, and the drawer holds the page still with the
 * shared body-scroll lock (`position: fixed; top: -scrollY`) for as long as it is
 * mounted, closing animation included. So the link's own jump landed on a page that
 * cannot scroll, and releasing the lock 220ms later put the reader back where they
 * had opened the drawer: the hash changed, the page never moved. The drawer now
 * scrolls to the chapter itself, once the lock is gone.
 */
describe("ReportMobileNav — tapping a chapter", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete (Element.prototype as Partial<Element>).scrollIntoView;
    document.getElementById("core_archetype")?.remove();
    __resetBodyScrollLockForTests();
  });

  it("scrolls to the chapter once the drawer has let go of the page", () => {
    vi.useFakeTimers();
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    const target = document.createElement("section");
    target.id = "core_archetype";
    document.body.appendChild(target);
    const calls: string[] = [];
    // jsdom has no scrollIntoView; record where it was called, how, and whether the
    // page was still held at that moment.
    Element.prototype.scrollIntoView = function (
      this: Element,
      options?: boolean | ScrollIntoViewOptions
    ) {
      const how = typeof options === "object" ? `${options.block}/${options.behavior}` : "";
      calls.push(`${this.id}:${document.body.style.position || "free"}:${how}`);
    };

    render(<ReportMobileNav activeSectionId="snapshot" />);
    fireEvent.click(screen.getByRole("button", { name: /chapter:/i }));
    expect(document.body.style.position).toBe("fixed");

    const link = screen
      .getAllByRole("link")
      .find((a) => a.getAttribute("href") === "#core_archetype")!;
    fireEvent.click(link);
    expect(calls).toEqual([]);

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(document.body.style.position).toBe("");
    // A jump, not the page's smooth scroll: a smooth scroll fixes its destination as
    // it starts, and Typical Beliefs' turn rows grow as it passes them (193px locked,
    // 644px unlocked), so it stopped short. After a jump, scroll anchoring holds the
    // chapter in place while the rows above it settle.
    expect(calls).toEqual(["core_archetype:free:start/instant"]);
  });

  it("leaves the page alone when the drawer is closed without a choice", () => {
    vi.useFakeTimers();
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;

    render(<ReportMobileNav activeSectionId="snapshot" />);
    fireEvent.click(screen.getByRole("button", { name: /chapter:/i }));
    fireEvent.click(screen.getByRole("button", { name: /close chapter menu/i }));
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});

/**
 * Where a V4 chapter lands. The floating chrome covers the top 136px (header 8-56,
 * chapter pill 80-136, V4BackToTop.tsx), and the V4 and V3 chapter rows carried no
 * scroll margin, so a chapter reached from the drawer put its title under the bar.
 * 144 is the same clearance V4BackToTop scrolls to.
 */
describe("reportV3.css — V4 sections clear the floating chrome", () => {
  it("gives every V4 section the back-to-top clearance", () => {
    const css = readFileSync(join(__dirname, "..", "ui", "v3", "reportV3.css"), "utf8");
    const at = css.indexOf(".rv3.rv4 .rv4-chapter,");
    expect(at, "the V4 scroll-margin rule is missing").toBeGreaterThan(-1);
    const rule = css.slice(at, css.indexOf("}", at));
    expect(rule).toContain(".rv3.rv4 .rv3-chapter");
    expect(rule).toContain(".rv3.rv4 .report-section");
    expect(rule).toContain("scroll-margin-top: 144px;");
  });
});

/**
 * The floating "Chapter: …" pill names the chapter on screen. It read V1's labels in
 * every version, so under ?v4=1 it kept the singular "Challenges in Partnership" the
 * V4 drawer and head no longer use (Fatih, 24.09: the plural everywhere in V4).
 */
describe("ReportMobileNav — the chapter pill's label", () => {
  const pill = () => document.querySelector(".report-chapter-pill__chapter")!.textContent;

  it("reads V4's own nav under ?v4=1", async () => {
    const { V3ModeProvider, V4ModeProvider } = await import("@features/report/ui/v3/V3Chapter");
    render(
      <V3ModeProvider>
        <V4ModeProvider>
          <ReportMobileNav activeSectionId="challenges_in_partnership" />
        </V4ModeProvider>
      </V3ModeProvider>
    );
    expect(pill()).toBe("Challenges in Partnerships");
  });

  it("keeps V1's labels for V3 and V1", async () => {
    const { V3ModeProvider } = await import("@features/report/ui/v3/V3Chapter");
    const { unmount } = render(
      <V3ModeProvider>
        <ReportMobileNav activeSectionId="challenges_in_partnership" />
      </V3ModeProvider>
    );
    expect(pill()).toBe("Challenges in Partnership");
    unmount();
    render(<ReportMobileNav activeSectionId="challenges_in_partnership" />);
    expect(pill()).toBe("Challenges in Partnership");
  });
});

/**
 * Report V4's finalised nav — Mark, 29.09 (1945094456, Figma 961:333): "Finalised Mobile
 * Navigation. Please also use these changes for Desktop". His note with it: "Selected
 * Chapter font changed to Bold and took out the "Chapter:" Parts now dont have a roman
 * number and I introduced the unlocked icons with brand colors." The badges are the
 * three tiers the 28.09 sync agreed on: free, open to this reader, locked.
 */
describe("V4 — the finalised nav (961:333)", () => {
  const inV4 = async (ui: ReactElement) => {
    const { V3ModeProvider, V4ModeProvider } = await import("@features/report/ui/v3/V3Chapter");
    return render(
      <V3ModeProvider>
        <V4ModeProvider>{ui}</V4ModeProvider>
      </V3ModeProvider>
    );
  };
  const inV3 = async (ui: ReactElement) => {
    const { V3ModeProvider } = await import("@features/report/ui/v3/V3Chapter");
    return render(<V3ModeProvider>{ui}</V3ModeProvider>);
  };
  const ACCESS: ReadonlyMap<string, ReportNavAccess> = new Map<string, ReportNavAccess>([
    ["core_archetype", "free"],
    ["typical_beliefs", "unlocked"],
    ["core_insecurities", "locked"],
  ]);
  const row = (id: string) => document.querySelector<HTMLElement>(`a[href="#${id}"]`)!;
  const parts = () =>
    [...document.querySelectorAll(".report-sidebar__part, .report-chapter-panel__part")].map(
      (p) => p.textContent
    );
  /** The pill label's own text, outside its spans. */
  const bareText = () =>
    [...document.querySelector(".report-chapter-pill__label")!.childNodes]
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent)
      .join("");

  it("names the chapter alone in the pill, and still tells a screen reader it is the chapter", async () => {
    await inV4(<ReportMobileNav activeSectionId="core_archetype" />);
    const pill = screen.getByRole("button", { name: "Chapter: Core Archetype" });
    expect(pill.querySelector(".report-chapter-pill__label")!.textContent).toBe("Core Archetype");
    expect(bareText()).toBe("");

    // The drawer's own pill is the same one (I961:333;856:245).
    fireEvent.click(pill);
    const inPanel = screen.getByRole("button", { name: /close chapter menu/i });
    expect(inPanel.querySelector(".report-chapter-pill__label")!.textContent).toBe(
      "Core Archetype"
    );
  });

  it("keeps the visible 'Chapter:' for V3 and V1", async () => {
    const { unmount } = await inV3(<ReportMobileNav activeSectionId="core_archetype" />);
    expect(bareText()).toBe("Chapter:");
    unmount();
    render(<ReportMobileNav activeSectionId="core_archetype" />);
    expect(bareText()).toBe("Chapter:");
  });

  it("opens both navs on Part 1 · Welcome, and numbers the parts 1 to 6", async () => {
    const V4_PARTS = [
      "Part 1 · Welcome",
      "Part 2 · Your constellation",
      "Part 3 · How your archetype works",
      "Part 4 · Your erotic engine",
      "Part 5 · How you connect",
      "Part 6 · Your edges",
    ];
    const { unmount } = await inV4(<ReportDesktopSidebar activeSectionId="introduction" />);
    expect(parts()).toEqual(V4_PARTS);
    expect(row("introduction").textContent).toMatch(/^Introduction/);
    expect(row("what_shaped_this_report").textContent).toMatch(/^What shaped this report/);
    expect(row("introduction")).toHaveAttribute("aria-current", "location");
    unmount();

    await inV4(<ReportMobileNav activeSectionId="introduction" />);
    fireEvent.click(screen.getByRole("button", { name: "Chapter: Introduction" }));
    expect(parts()).toEqual(V4_PARTS);
    expect(row("introduction")).toHaveAttribute("aria-current", "location");
  });

  it("draws the three tiers: the FREE chip, Figma's open padlock in the brand gradient, the grey padlock", async () => {
    await inV4(<ReportDesktopSidebar activeSectionId="core_archetype" accessById={ACCESS} />);

    expect(row("core_archetype").querySelector(".report-nav-badge--free")?.textContent).toBe(
      "Free"
    );
    const open = row("typical_beliefs").querySelector(".report-nav-badge--unlocked")!;
    expect(open).not.toBeNull();
    // 961:333's own asset (I961:333;865:243), at its 14px.
    const img = open.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("/report/v3/nav/badge-unlocked.svg");
    expect(img.getAttribute("width")).toBe("14");
    expect(img.getAttribute("height")).toBe("14");
    expect(img.getAttribute("alt")).toBe("");
    expect(open.querySelector(".sr-only")?.textContent).toBe("Unlocked chapter");
    const shut = row("core_insecurities").querySelector(".report-nav-badge--locked")!;
    expect(shut.querySelector("svg")).not.toBeNull();
    expect(shut.querySelector(".sr-only")?.textContent).toBe("Locked chapter");
  });

  it("leaves V3's and V1's open chapters without a badge", async () => {
    const { unmount } = await inV3(
      <ReportDesktopSidebar activeSectionId="core_archetype" accessById={ACCESS} />
    );
    expect(row("typical_beliefs").querySelector(".report-nav-badge")).toBeNull();
    unmount();
    render(<ReportDesktopSidebar activeSectionId="core_archetype" accessById={ACCESS} />);
    expect(row("typical_beliefs").querySelector(".report-nav-badge")).toBeNull();
  });

  it("tags each V4 row with its tier, for the weights", async () => {
    const { unmount } = await inV4(
      <ReportDesktopSidebar activeSectionId="core_archetype" accessById={ACCESS} />
    );
    expect(row("core_archetype").dataset.access).toBe("free");
    expect(row("typical_beliefs").dataset.access).toBe("unlocked");
    expect(row("core_insecurities").dataset.access).toBe("locked");
    unmount();

    await inV4(<ReportMobileNav activeSectionId="core_archetype" accessById={ACCESS} />);
    fireEvent.click(screen.getByRole("button", { name: /^chapter:/i }));
    expect(row("typical_beliefs").dataset.access).toBe("unlocked");
    expect(row("core_insecurities").dataset.access).toBe("locked");
    // An id the map does not list is free, as its badge is.
    expect(row("introduction").dataset.access).toBe("free");
  });

  it("leaves V3's rows untagged", async () => {
    await inV3(<ReportDesktopSidebar activeSectionId="core_archetype" accessById={ACCESS} />);
    expect(row("typical_beliefs")).not.toHaveAttribute("data-access");
  });

  it("sets the bold pill, the weights and the one-line drawer rows on the live V4 page", () => {
    const css = readFileSync(join(__dirname, "..", "ui", "v3", "reportV3.css"), "utf8");
    const rule = (selector: string) => {
      const at = css.indexOf(`${selector} {`);
      expect(at, selector).toBeGreaterThan(-1);
      return css.slice(at, css.indexOf("}", at));
    };
    // I961:333;856:246 — Plus Jakarta Sans Bold 14/20 #6b5b95, centred.
    const pill = rule(".rv3.rv4 .report-chapter-pill__chapter");
    expect(pill).toContain("font-weight: 700;");
    expect(pill).toContain("margin-left: 0;");
    // Free and open rows SemiBold, locked rows Light (Marcus's heavier weights for "the
    // ones that are free or partially unlocked"; Mark: "Amazing, i love it").
    expect(
      rule(".rv3.rv4 .report-mobile-nav__label,\n.rv3.rv4 .report-sidebar__item-label")
    ).toContain("font-weight: 600;");
    expect(
      rule(
        '.rv3.rv4 .report-mobile-nav__link[data-access="locked"] .report-mobile-nav__label,\n.rv3.rv4 .report-sidebar__item[data-access="locked"] .report-sidebar__item-label'
      )
    ).toContain("font-weight: 300;");
    // The drawer's rows hold one line ("A Snapshot …"); the sidebar keeps its wrap.
    const drawer = rule(".rv3.rv4 .report-chapter-panel__item .report-mobile-nav__label");
    expect(drawer).toContain("overflow: hidden;");
    expect(drawer).toContain("text-overflow: ellipsis;");
    expect(drawer).toContain("white-space: nowrap;");
    // report.css's old pill-nav rule gives the rows `min-width: max-content`, which held
    // the Snapshot's row at its whole title: 301px in the 277 column, the FREE chip past
    // the panel's edge and the list scrolling sideways (measured at 393).
    expect(rule(".rv3.rv4 .report-chapter-panel__item")).toContain("min-width: 0;");
  });
});
