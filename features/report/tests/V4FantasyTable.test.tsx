// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import V4FantasyTable from "@features/report/ui/v3/V4FantasyTable";
import { buildFantasy } from "@/data/report3-fantasy";
import { reportPracticeTendencies } from "@/data/report-practice-tendencies";
import { installRevealObserver, mockRect, observerOf } from "./v4RevealTestKit";

/**
 * The fantasy table — Figma 639:308 (open, "3 rows + fade") and 639:1905
 * (paywalled, "3 + 2 blurred"). Built from the same server view production renders.
 */

const V3_CSS = readFileSync(join(__dirname, "..", "ui", "v3", "reportV3.css"), "utf8");
const OPEN = buildFantasy("Spark Seeker")!.table;
const LOCKED = buildFantasy("Spark Seeker", { locked: true })!.table;
const SOURCE = reportPracticeTendencies["Spark Seeker"]!;

afterEach(cleanup);

const categories = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>(".rv4-fvt__cat")];
const toggleOf = (cat: HTMLElement) => cat.querySelector<HTMLButtonElement>(".rv4-fvt__toggle")!;
/** The rows a reader can actually read and use — not the peek, not the stand-ins. */
const liveRows = (cat: HTMLElement) =>
  [...cat.querySelectorAll<HTMLElement>(".rv4-fvt__row")].filter(
    (row) => !row.closest("[inert]") && !row.closest("[aria-hidden='true']")
  );

describe("V4FantasyTable — open (639:308)", () => {
  it("heads all eleven categories with a toggle, the first two open", () => {
    const { container } = render(<V4FantasyTable table={OPEN} />);
    const cats = categories(container);
    expect(cats).toHaveLength(11);
    expect(cats.map((c) => c.querySelector(".rv4-fvt__title")!.textContent)).toEqual(
      SOURCE.groups.map((g) => g.title)
    );
    expect(cats.map((c) => toggleOf(c).getAttribute("aria-expanded"))).toEqual([
      "true",
      "true",
      ...Array(9).fill("false"),
    ]);
    // Each head is a heading, its whole row the button.
    expect(cats[0]!.querySelector("h4 > .rv4-fvt__toggle")).not.toBeNull();
    expect(container.querySelector(".rv4-fvt")!.getAttribute("data-node-id")).toBe("639:308");
  });

  it("keeps every button in a table inside a cell: the peek and the lock sit beside it", () => {
    for (const table of [OPEN, LOCKED]) {
      const { container, unmount } = render(<V4FantasyTable table={table} onUnlock={() => {}} />);
      for (const grid of container.querySelectorAll('[role="table"]')) {
        for (const button of grid.querySelectorAll("button")) {
          expect(button.closest('[role="cell"], [role="columnheader"]')).not.toBeNull();
        }
        expect(grid.querySelector(".rv4-fvt__peek, .rv4-fvt__lock")).toBeNull();
      }
      const panel = container.querySelector(".rv4-fvt__cat.is-open .rv4-fvt__panel")!;
      expect(
        panel.querySelector(":scope > .rv4-fvt__peek, :scope > .rv4-fvt__lock")
      ).not.toBeNull();
      unmount();
    }
  });

  // Mark, 28.09 (1944174274): "the information icons ('i') were set in weird positions.
  // Now updated." 639:315 (and 639:1912 paywalled) draws each row's mark right after
  // the last word of its name, and none on the column heads any more.
  it("sets each row's info mark after the last word of its name, never alone on a line", () => {
    const { container } = render(<V4FantasyTable table={OPEN} />);
    for (const row of liveRows(categories(container)[0]!)) {
      const name = row.querySelector(".rv4-fvt__name")!;
      const tail = name.querySelector(".rv4-fvt__tail")!;
      const words = name.textContent!.trim().split(/\s+/);
      expect(tail.textContent!.trim()).toBe(words[words.length - 1]);
      expect(tail.querySelector(".rv4-fvt__anchor > .rv4-fvt__info")).not.toBeNull();
    }
  });

  it("draws no info mark on the column heads", () => {
    const { container } = render(<V4FantasyTable table={OPEN} />);
    expect(container.querySelectorAll(".rv4-fvt__cols .rv4-fvt__mark")).toHaveLength(0);
  });

  it("sets the three column heads", () => {
    const { container } = render(<V4FantasyTable table={OPEN} />);
    const cat = categories(container)[0]!;
    const heads = [...cat.querySelectorAll('[role="columnheader"]')];
    expect(heads.map((h) => h.textContent!.replace(/\s+/g, " ").trim())).toEqual([
      "Fantasy & Practice",
      "Fantasy Pull",
      "Actual Pleasure",
    ]);
  });

  it("shows three rows sharp, each with both scores and their likelihood", () => {
    const { container } = render(<V4FantasyTable table={OPEN} />);
    const rows = liveRows(categories(container)[0]!);
    expect(rows).toHaveLength(3);
    const read = (row: HTMLElement) => ({
      name: row.querySelector(".rv4-fvt__name")!.textContent,
      scores: [...row.querySelectorAll(".rv4-fvt__num")].map((n) => n.textContent),
      labels: [...row.querySelectorAll(".rv4-fvt__qual")].map((n) => n.textContent),
    });
    expect(rows.map(read)).toEqual([
      {
        name: "Romantic lovemaking",
        scores: ["5", "7"],
        labels: ["Neutral likely", "More likely"],
      },
      {
        name: "Slow build / extended foreplay",
        scores: ["5", "8"],
        labels: ["Neutral likely", "More likely"],
      },
      {
        name: "Passionate quickies",
        scores: ["4", "4"],
        labels: ["Neutral likely", "Neutral likely"],
      },
    ]);
  });

  it("calls a score under 4 less likely", () => {
    const { container } = render(<V4FantasyTable table={OPEN} />);
    const cat = categories(container)[2]!;
    fireEvent.click(toggleOf(cat));
    fireEvent.click(within(cat).getByRole("button", { name: /show all 8 fantasies/i }));
    const row = liveRows(cat).find(
      (r) => r.querySelector(".rv4-fvt__name")!.textContent === "Receiving manual stimulation"
    )!;
    expect([...row.querySelectorAll(".rv4-fvt__qual")].map((n) => n.textContent)).toEqual([
      "Neutral likely",
      "Less likely",
    ]);
  });

  it("lets rows 4 and 5 peek under the fade, inert, with the pill on them", () => {
    const { container } = render(<V4FantasyTable table={OPEN} />);
    const cat = categories(container)[0]!;
    const peek = cat.querySelector<HTMLElement>(".rv4-fvt__peek")!;
    expect(peek.hasAttribute("inert") || peek.querySelector("[inert]")).toBeTruthy();
    const peekRows = peek.querySelectorAll(".rv4-fvt__row");
    expect([...peekRows].map((r) => r.querySelector(".rv4-fvt__name")!.textContent)).toEqual([
      "Morning sex",
      "Sleeping / wake-up sex",
    ]);
    expect(within(cat).getByRole("button", { name: "Show all 11 fantasies" })).toBeTruthy();
  });

  // Mark, 28.09 (1944175761): "All CTAs updated, to no longer be CAPs". 639:499 reads
  // "Show all" (title case; it read "Show all 11 Fantasies"), and the count stays in the
  // accessible name. The paywalled pills (639:2100) keep their words.
  it("reads 'Show all' on the pill, the count left to its accessible name", () => {
    const { container } = render(<V4FantasyTable table={OPEN} />);
    const cat = categories(container)[0]!;
    const pill = within(cat).getByRole("button", { name: "Show all 11 fantasies" });
    expect(pill.querySelector(".rv4-fvt__pill-label")!.textContent).toBe("Show all");
  });

  it("shows every fantasy on 'Show all', and the pill goes", () => {
    const { container } = render(<V4FantasyTable table={OPEN} />);
    const cat = categories(container)[0]!;
    fireEvent.click(within(cat).getByRole("button", { name: "Show all 11 fantasies" }));
    expect(liveRows(cat)).toHaveLength(11);
    expect(cat.querySelector(".rv4-fvt__peek")).toBeNull();
    expect(within(cat).queryByRole("button", { name: /show all/i })).toBeNull();
  });

  it("moves focus to the first row 'Show all' reveals, so the keyboard carries on from there", () => {
    const { container } = render(<V4FantasyTable table={OPEN} />);
    const cat = categories(container)[0]!;
    const pill = within(cat).getByRole("button", { name: "Show all 11 fantasies" });
    pill.focus();
    fireEvent.click(pill);
    expect(document.activeElement).toBe(liveRows(cat)[3]!.querySelector(".rv4-fvt__info"));
  });

  it("opens a closed category onto three rows and its own count", () => {
    const { container } = render(<V4FantasyTable table={OPEN} />);
    const cat = categories(container)[3]!;
    const panel = cat.querySelector<HTMLElement>(".rv4-fvt__panel")!;
    expect(panel.hidden).toBe(true);
    fireEvent.click(toggleOf(cat));
    expect(toggleOf(cat).getAttribute("aria-expanded")).toBe("true");
    expect(panel.hidden).toBe(false);
    expect(liveRows(cat)).toHaveLength(3);
    expect(within(cat).getByRole("button", { name: "Show all 6 fantasies" })).toBeTruthy();
    fireEvent.click(toggleOf(cat));
    expect(panel.hidden).toBe(true);
  });

  it("points each toggle at its panel", () => {
    const { container } = render(<V4FantasyTable table={OPEN} />);
    for (const cat of categories(container)) {
      const id = toggleOf(cat).getAttribute("aria-controls")!;
      expect(cat.querySelector(".rv4-fvt__panel")!.id).toBe(id);
    }
  });
});

describe("V4FantasyTable — what a fantasy tends to organize", () => {
  const firstInfo = (root: HTMLElement) =>
    within(root).getByRole("button", { name: "What Romantic lovemaking tends to organize" });

  it("opens the name and its note under the row, and closes on a second tap", () => {
    const { container } = render(<V4FantasyTable table={OPEN} />);
    const info = firstInfo(container);
    expect(info.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(info);
    expect(info.getAttribute("aria-expanded")).toBe("true");
    const note = container.querySelector<HTMLElement>(`#${info.getAttribute("aria-controls")}`)!;
    expect(note.textContent).toContain("Romantic lovemaking");
    expect(note.textContent).toContain(SOURCE.groups[0]!.rows[0]!.description!);
    fireEvent.click(info);
    expect(info.getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector(".rv4-fvt__note")).toBeNull();
  });

  it("keeps one note open at a time", () => {
    const { container } = render(<V4FantasyTable table={OPEN} />);
    fireEvent.click(firstInfo(container));
    fireEvent.click(
      within(container).getByRole("button", { name: "What Sensual massage tends to organize" })
    );
    expect(container.querySelectorAll(".rv4-fvt__note")).toHaveLength(1);
    expect(firstInfo(container).getAttribute("aria-expanded")).toBe("false");
  });

  it("closes on Escape and on a tap anywhere else", () => {
    const { container } = render(<V4FantasyTable table={OPEN} />);
    fireEvent.click(firstInfo(container));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(container.querySelector(".rv4-fvt__note")).toBeNull();
    fireEvent.click(firstInfo(container));
    fireEvent.pointerDown(document.body);
    expect(container.querySelector(".rv4-fvt__note")).toBeNull();
  });

  it("stays open when the tap lands on the note itself", () => {
    const { container } = render(<V4FantasyTable table={OPEN} />);
    fireEvent.click(firstInfo(container));
    fireEvent.pointerDown(container.querySelector(".rv4-fvt__note")!);
    expect(container.querySelector(".rv4-fvt__note")).not.toBeNull();
  });
});

describe("V4FantasyTable — paywalled (639:1905)", () => {
  it("opens three categories: three rows sharp, two blurred behind the lock", () => {
    const { container } = render(<V4FantasyTable table={LOCKED} onUnlock={() => {}} />);
    expect(container.querySelector(".rv4-fvt")!.getAttribute("data-node-id")).toBe("639:1905");
    const cats = categories(container);
    expect(cats.map((c) => toggleOf(c).getAttribute("aria-expanded"))).toEqual([
      "true",
      "true",
      "true",
      ...Array(8).fill("false"),
    ]);
    for (const cat of cats.slice(0, 3)) {
      expect(liveRows(cat)).toHaveLength(3);
      const lock = cat.querySelector<HTMLElement>(".rv4-fvt__lock")!;
      const blurred = lock.querySelector<HTMLElement>(".rv4-fvt__blurred")!;
      expect(blurred.getAttribute("aria-hidden")).toBe("true");
      expect(blurred.hasAttribute("inert")).toBe(true);
      expect(blurred.querySelectorAll(".rv4-fvt__row")).toHaveLength(2);
      expect(lock.querySelector(".rv4-lockbadge")).not.toBeNull();
    }
    expect(within(cats[0]!).getByRole("button", { name: "Unlock all 11 fantasies" })).toBeTruthy();
    expect(within(cats[1]!).getByRole("button", { name: "Unlock all 9 fantasies" })).toBeTruthy();
    expect(within(cats[2]!).getByRole("button", { name: "Unlock all 8 fantasies" })).toBeTruthy();
    // Nothing to show all of: the pill unlocks instead.
    expect(within(container).queryByRole("button", { name: /show all/i })).toBeNull();
  });

  it("opens a closed category onto three blurred rows, the lock and its own count", () => {
    const { container } = render(<V4FantasyTable table={LOCKED} onUnlock={() => {}} />);
    const cat = categories(container)[6]!;
    fireEvent.click(toggleOf(cat));
    expect(liveRows(cat)).toHaveLength(0);
    expect(cat.querySelectorAll(".rv4-fvt__blurred .rv4-fvt__row")).toHaveLength(3);
    expect(cat.querySelector(".rv4-lockbadge")).not.toBeNull();
    expect(within(cat).getByRole("button", { name: "Unlock all 12 fantasies" })).toBeTruthy();
  });

  it("draws the stand-ins' scores itself: none arrive from the server", () => {
    const { container } = render(<V4FantasyTable table={LOCKED} onUnlock={() => {}} />);
    const blurred = container.querySelector(".rv4-fvt__blurred")!;
    const nums = [...blurred.querySelectorAll(".rv4-fvt__num")].map((n) => n.textContent);
    expect(nums).toHaveLength(4);
    nums.forEach((n) => expect(n).toMatch(/^\d+$/));
    // A stand-in has no note, so its mark is not a button.
    expect(blurred.querySelector("button")).toBeNull();
  });

  it("opens the paywall once per tap, from the rows, the lock or the pill", () => {
    const unlock = vi.fn();
    const { container } = render(<V4FantasyTable table={LOCKED} onUnlock={unlock} />);
    const cat = categories(container)[0]!;
    fireEvent.click(cat.querySelector(".rv4-fvt__blurred")!);
    expect(unlock).toHaveBeenCalledTimes(1);
    fireEvent.click(cat.querySelector(".rv4-lockbadge")!);
    expect(unlock).toHaveBeenCalledTimes(2);
    fireEvent.click(within(cat).getByRole("button", { name: "Unlock all 11 fantasies" }));
    expect(unlock).toHaveBeenCalledTimes(3);
  });

  it("keeps the sharp rows' notes for a locked reader", () => {
    const { container } = render(<V4FantasyTable table={LOCKED} onUnlock={() => {}} />);
    const info = within(container).getByRole("button", {
      name: "What Romantic lovemaking tends to organize",
    });
    fireEvent.click(info);
    expect(container.querySelector(".rv4-fvt__note")!.textContent).toContain(
      SOURCE.groups[0]!.rows[0]!.description!
    );
  });
});

describe("reportV3.css — fantasy table contracts", () => {
  it("appends its CSS below the frozen top of reportV3.css", () => {
    const at = V3_CSS.indexOf(".rv4-fvt");
    expect(at).toBeGreaterThan(0);
    expect(V3_CSS.slice(0, at).split("\n").length).toBeGreaterThan(1884);
  });

  // Measured at 393 against 639:308 / 639:1905 (scratchpad fvr-measure-table.js).
  const ruleOf = (selector: string) => {
    const at = V3_CSS.lastIndexOf(`${selector} {`);
    expect(at, selector).toBeGreaterThan(0);
    return V3_CSS.slice(at, V3_CSS.indexOf("}", at));
  };

  // The hit area is laid from the padding box, inside the 1.5px outline: -6.5px there
  // reached 5px past the drawn pill, 41 tall in all. -8px makes it 31 + 2 x 6.5 = 44.
  it("gives the pill a 44px hit area, counted from inside its outline", () => {
    // One rule for the table's, the A&B cards' and the Summary's pills; it ends on the last.
    expect(ruleOf(".rv3 .rv4-summary__pill::after")).toContain("inset: -8px 0");
  });

  // The A&B cards' "Show all" is the same pill (713:6178), so the rule is shared.
  it("holds the pill at 31 however the browser rounds its 1.5px outline", () => {
    expect(V3_CSS).toContain(
      ".rv3 .rv4-fvt__pill,\n.rv3 .rv4-trig__pill,\n.rv3 .rv4-summary__pill {"
    );
    expect(ruleOf(".rv3 .rv4-summary__pill")).toContain("height: 31px");
  });

  // 639:335 and its siblings: the 14.39px button 5.6 after the last word, 3.2 down from
  // that line's top. It hangs from a zero-width anchor, so the name wraps at Figma's 102
  // as if it were not there ("wake-up sex" and its mark run past 102 on one line).
  it("hangs the row's mark 5.6 after the last word, taking no width in the wrap", () => {
    expect(ruleOf(".rv3 .rv4-fvt__tail")).toContain("white-space: nowrap");
    const anchor = ruleOf(".rv3 .rv4-fvt__anchor");
    expect(anchor).toContain("display: inline-block");
    expect(anchor).toContain("width: 0");
    expect(anchor).toContain("position: relative");
    expect(anchor).toContain("vertical-align: top");
    const info = ruleOf(".rv3 .rv4-fvt__anchor > .rv4-fvt__info");
    expect(info).toContain("position: absolute");
    expect(info).toContain("left: 5.6px");
    expect(info).toContain("top: 3.2px");
    // 122 less the mark and its gap: Figma's 102 at 393, narrower with the column.
    expect(ruleOf(".rv3 .rv4-fvt__name")).toContain("max-width: calc(100% - 20px)");
    expect(V3_CSS).not.toContain(".rv4-fvt__cols .rv4-fvt__mark");
  });

  it("centres the column heads' lines as Figma does, on the letters and their gaps", () => {
    expect(ruleOf(".rv3 .rv4-fvt__col-line + .rv4-fvt__col-line")).toContain(
      "margin-right: -0.8px"
    );
    expect(ruleOf(".rv3 .rv4-fvt__num")).toContain("margin-right: 0.58px");
  });

  // 639:498 now stands centred in the table (x 121 + 43 of 328) and 54.19 into the fade;
  // it stood 20px right of the middle, 48 in.
  it("centres the open pill in the table, 54.19px into the fade", () => {
    const pill = ruleOf(".rv3 .rv4-fvt__peek .rv4-fvt__pill");
    expect(pill).toContain("left: 50%");
    expect(pill).toContain("top: 54.19px");
    expect(pill).not.toContain("+ 20px");
  });

  it("uses no class name the V3 chapter catch-alls restyle", () => {
    const names = new Set(V3_CSS.match(/\.rv4-fvt[\w-]*/g) ?? []);
    for (const name of names) {
      expect(name).not.toMatch(/__(eyebrow|body|card|result|heading|details|learn-)/);
    }
  });
});

/**
 * Review 28.09, mobile: "Can we have animations in the Fantasy table. V2 had them i
 * think." It did: V2's panel (PracticeTendenciesSection) fades each score in and rises
 * it 8px over 520ms on cubic-bezier(0.22, 1, 0.36, 1), all at once, the first time the
 * panel comes into view. The table takes that, as it was.
 */
describe("V4FantasyTable — its entrance, V2's", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("holds the scores back until the table is in view, then lets them in", () => {
    installRevealObserver();
    mockRect({ top: 5000 });
    const { container } = render(<V4FantasyTable table={OPEN} />);
    const table = container.querySelector(".rv4-fvt")!;
    expect(table).toHaveClass("is-pending");
    // Only held back by the CSS: every score is on the page from the start.
    expect(container.querySelectorAll(".rv4-fvt__num").length).toBeGreaterThan(0);
    observerOf(table)!.fire(true);
    expect(table).not.toHaveClass("is-pending");
  });

  it("comes in on the paywalled table too — its sharp rows are the reader's", () => {
    installRevealObserver();
    mockRect({ top: 5000 });
    const { container } = render(<V4FantasyTable table={LOCKED} onUnlock={() => {}} />);
    expect(container.querySelector(".rv4-fvt")).toHaveClass("is-pending");
  });
});

describe("reportV3.css — the table's entrance", () => {
  const V2_EASE = "520ms cubic-bezier(0.22, 1, 0.36, 1)";
  const ruleOf = (selector: string) => {
    const at = V3_CSS.lastIndexOf(`${selector} {`);
    expect(at, selector).toBeGreaterThan(0);
    return V3_CSS.slice(at, V3_CSS.indexOf("}", at));
  };

  it("fades each score in and rises it 8px, on V2's timing", () => {
    const score = ruleOf(".rv3 .rv4-fvt__score");
    expect(score).toContain(`opacity ${V2_EASE}`);
    expect(score).toContain(`transform ${V2_EASE}`);
    const pending = ruleOf(".rv3 .rv4-fvt.is-pending .rv4-fvt__score");
    expect(pending).toContain("opacity: 0");
    expect(pending).toContain("transform: translateY(8px)");
  });

  it("leaves the blurred rows under the paywall as they are", () => {
    const blurred = ruleOf(".rv3 .rv4-fvt.is-pending .rv4-fvt__blurred .rv4-fvt__score");
    expect(blurred).toContain("opacity: 1");
    expect(blurred).toContain("transform: none");
  });

  it("shows the scores at once under reduced motion", () => {
    const at = V3_CSS.indexOf(
      "@media (prefers-reduced-motion: reduce) {\n  .rv3 .rv4-fvt.is-pending .rv4-fvt__score"
    );
    expect(at).toBeGreaterThan(-1);
    const media = V3_CSS.slice(at, V3_CSS.indexOf("\n}\n", at));
    expect(media).toContain("opacity: 1");
    expect(media).toContain("transition: none");
  });
});
