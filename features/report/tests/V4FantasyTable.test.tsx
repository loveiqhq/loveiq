// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import V4FantasyTable from "@features/report/ui/v3/V4FantasyTable";
import { buildFantasy } from "@/data/report3-fantasy";
import { reportPracticeTendencies } from "@/data/report-practice-tendencies";

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

  it("hangs each head's info mark off its first line, so it follows the word", () => {
    const { container } = render(<V4FantasyTable table={OPEN} />);
    const cat = categories(container)[0]!;
    for (const head of cat.querySelectorAll(".rv4-fvt__col--score")) {
      expect(head.querySelector(".rv4-fvt__col-line:first-child > .rv4-fvt__mark")).not.toBeNull();
    }
  });

  it("sets the three column heads, their info marks decorative", () => {
    const { container } = render(<V4FantasyTable table={OPEN} />);
    const cat = categories(container)[0]!;
    const heads = [...cat.querySelectorAll('[role="columnheader"]')];
    expect(heads.map((h) => h.textContent!.replace(/\s+/g, " ").trim())).toEqual([
      "Fantasy & Practice",
      "Fantasy Pull",
      "Actual Pleasure",
    ]);
    const marks = cat.querySelectorAll(".rv4-fvt__cols .rv4-fvt__mark");
    expect(marks).toHaveLength(2);
    marks.forEach((mark) => {
      expect(mark.getAttribute("aria-hidden")).toBe("true");
      expect(mark.closest("button")).toBeNull();
    });
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
    expect(ruleOf(".rv3 .rv4-trig__pill::after")).toContain("inset: -8px 0");
  });

  // The A&B cards' "Show all" is the same pill (713:6178), so the rule is shared.
  it("holds the pill at 31 however the browser rounds its 1.5px outline", () => {
    expect(V3_CSS).toContain(".rv3 .rv4-fvt__pill,\n.rv3 .rv4-trig__pill {");
    expect(ruleOf(".rv3 .rv4-trig__pill")).toContain("height: 31px");
  });

  it("sets a head's mark where 639:319 draws it at 82, and after its word when narrower", () => {
    // Measured at 393: 2.34 past "FANTASY", 5.70 past "ACTUAL" — both at Figma's 72.11.
    // At 320 the columns are 72 and the mark, fixed to the cell's right, ran into
    // "FANTASY" (final review, 25.09).
    const mark = ruleOf(".rv3 .rv4-fvt__cols .rv4-fvt__mark");
    expect(mark).toContain("left: calc(100% + var(--fvt-mark-gap))");
    expect(mark).not.toContain("right: 0");
    expect(ruleOf(".rv3 .rv4-fvt__col--score")).toContain("--fvt-mark-gap: 2.34px");
    expect(ruleOf(".rv3 .rv4-fvt__col--score:last-child")).toContain("--fvt-mark-gap: 5.7px");
    const first = ruleOf(".rv3 .rv4-fvt__col--score .rv4-fvt__col-line:first-child");
    expect(first).toContain("width: fit-content");
    expect(first).toContain("position: relative");
  });

  it("centres the column heads' lines as Figma does, on the letters and their gaps", () => {
    expect(ruleOf(".rv3 .rv4-fvt__col-line + .rv4-fvt__col-line")).toContain(
      "margin-right: -0.8px"
    );
    expect(ruleOf(".rv3 .rv4-fvt__num")).toContain("margin-right: 0.58px");
  });

  it("uses no class name the V3 chapter catch-alls restyle", () => {
    const names = new Set(V3_CSS.match(/\.rv4-fvt[\w-]*/g) ?? []);
    for (const name of names) {
      expect(name).not.toMatch(/__(eyebrow|body|card|result|heading|details|learn-)/);
    }
  });
});
