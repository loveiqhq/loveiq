import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REPORT_V4_LEARN_MORE } from "@/data/report3-learn-more";
import { LOCKED_ARTICLE_WINDOW_PX } from "@features/report/server/contentGating";

/**
 * Mark's desktop review, Notion "Review Round 28.09 – Desktop" (29.09, 08:23: "Finished my
 * review for the Desktop version. left comments in Notion."). Everything here is the live
 * V4 page's (`.rv3.rv4`) from 700px, so the phone and the 393 preview (`.rv4-doc`) are
 * exactly as they were.
 */
const v3 = readFileSync(join(__dirname, "..", "ui", "v3", "reportV3.css"), "utf8");

const MARK = "Desktop review — 28.09 (Notion)";

/** This round's CSS, comments dropped. */
const block = () => {
  const at = v3.indexOf(MARK);
  expect(at, "the desktop review block").toBeGreaterThan(-1);
  return v3.slice(v3.lastIndexOf("/*", at)).replace(/\/\*[\s\S]*?\*\//g, "");
};

/** A declaration list with its whitespace dropped, so a re-wrapped calc() still reads. */
const flat = (css: string) => css.replace(/\s+/g, "");

/** The body of `selector`'s LAST rule anywhere in the file (the phone rules this reads). */
const lastRule = (selector: string) => {
  const at = v3.lastIndexOf(`${selector} {`);
  expect(at, selector).toBeGreaterThan(-1);
  return v3.slice(at, v3.indexOf("}", at));
};

/** The body of `selector`'s FIRST rule anywhere in the file (a component's own rule). */
const firstRule = (selector: string) => {
  const at = v3.indexOf(`${selector} {`);
  expect(at, selector).toBeGreaterThan(-1);
  return v3.slice(at, v3.indexOf("}", at));
};

/** A px value a rule sets, as a number. */
const px = (rule: string, property: string) => {
  const m = rule.match(new RegExp("(?:^|[\\s;{])" + property + ":\\s*(-?[\\d.]+)px"));
  expect(m, property).not.toBeNull();
  return Number(m![1]);
};

/** The body of `selector`'s first rule inside this round's block. */
const ruleIn = (selector: string) => {
  const css = block();
  const at = css.indexOf(`${selector} {`);
  expect(at, selector).toBeGreaterThan(-1);
  return css.slice(at, css.indexOf("}", at));
};

describe("the desktop review block", () => {
  it("opens inside a 700px media query, after the 28.09 (c) touch-up", () => {
    expect(block().trimStart().startsWith("@media (min-width: 700px) {")).toBe(true);
    expect(v3.indexOf(MARK)).toBeGreaterThan(v3.indexOf("Desktop touch-up — 28.09 (c)"));
  });
});

// "Alignment of the Practical Element is off with the rest. The left should be aligned and
// the width should be equal with the text in Desktop." Both cards kept the phone's 16px
// bleed (`margin-inline: -16px`) while the 700px column rules pinned their width, so each
// sat 16px left of the text; the 2.0 chapters' cards overhung both sides.
describe("the Try this and Learn more cards sit on the text column", () => {
  it("drops the phone's bleed and runs the column's width", () => {
    const card = ruleIn(".rv3.rv4 .rv4-try,\n  .rv3.rv4 .rv4-learn");
    expect(card).toContain("margin-inline: 0");
    expect(card).toContain("width: 100%");
  });
});

// "We dont need the back to Top bottom on Desktop." V4BackToTop stays mounted for the
// phone (V4LearnMore's DOM contract); from 700px it does not draw, so it can neither
// cover the copy nor take focus.
describe("no Back to top on desktop", () => {
  it("does not draw the button from 700px", () => {
    expect(ruleIn(".rv3.rv4 .rv4-backtop")).toContain("display: none");
  });
});

// "...and there is a lot of empty space behind the Paywall CTA." The server trims a locked
// article's copy to fill the PHONE's window (656, and Fantasy vs. Reality's own 625), so
// in the desktop column that copy ended about halfway down its gate and the blur ran on
// empty to "Show all". The window now ends where its card needs it, the card's foot 24px
// above the pill. Still min = max, so a payload with its copy stripped keeps the same
// window, and shorter than the phone's, so it shows less of what the server sends.
describe("the article's paywall window follows its card on desktop", () => {
  it("derives the window from the card's top, less the gate's lead where there is one", () => {
    expect(flat(ruleIn(".rv3.rv4 .rv4-learn__gate"))).toContain(
      flat(
        "--rv4-learn-window-wide: calc(var(--rv4-learn-premium-top, 176.5px) + 244px + var(--rv4-learn-pill-bottom, -0.5px))"
      )
    );
    expect(flat(ruleIn(".rv3.rv4 .rv4-learn.is-continued .rv4-learn__gate"))).toContain(
      flat(
        "--rv4-learn-window-wide: calc(var(--rv4-learn-premium-top, 176.5px) + 260px + var(--rv4-learn-pill-bottom, -0.5px))"
      )
    );
  });

  it("holds the window at that height, min = max, and runs the blur to it", () => {
    const gated = ruleIn(".rv3.rv4 .rv4-learn .rv4-learn__gate > .rv4-learn__gated");
    expect(gated).toContain("max-height: var(--rv4-learn-window-wide)");
    expect(gated).toContain("min-height: var(--rv4-learn-window-wide)");
    expect(flat(ruleIn(".rv3.rv4 .rv4-learn .rv4-learn__gate > .rv4-learn__blur"))).toContain(
      flat("height: calc(var(--rv4-learn-window-wide) + var(--rv4-learn-foot))")
    );
    // The phone keeps its window, which is what the server trims to.
    expect(firstRule(".rv3 .rv4-learn__gated")).toContain(
      `max-height: ${LOCKED_ARTICLE_WINDOW_PX}px`
    );
  });

  it("sets every article's card 24px above its pill, in a window shorter than the phone's", () => {
    // The pieces the formula stands on, read back from the phone rules.
    const card = px(firstRule(".rv3 .rv4-premium"), "height");
    const pill = lastRule(".rv3 .rv4-learn__showmore");
    const pillH = px(pill, "height");
    const sharedPillBottom = px(pill, "bottom");
    const lead = px(lastRule(".rv3 .rv4-learn__gate"), "padding-top");
    const defaultTop = Number(
      lastRule(".rv3 .rv4-learn__gate > .rv4-premium").match(/premium-top, ([\d.]+)px/)![1]
    );
    const shared = Number(flat(ruleIn(".rv3.rv4 .rv4-learn__gate")).match(/\+([\d.]+)px\+/)![1]);
    const continued = Number(
      flat(ruleIn(".rv3.rv4 .rv4-learn.is-continued .rv4-learn__gate")).match(/\+([\d.]+)px\+/)![1]
    );
    expect(card).toBe(205);
    expect(pillH).toBe(31);
    for (const [id, article] of Object.entries(REPORT_V4_LEARN_MORE)) {
      const top = article.gate?.premiumTopPx ?? article.premiumTopPx ?? defaultTop;
      const pillBottom = article.gate?.pillBottomPx ?? sharedPillBottom;
      const gateLead = article.paywallCharOffset !== undefined ? 0 : lead;
      const window = top + (gateLead ? shared : continued) + pillBottom;
      const pillTop = gateLead + window - pillBottom - pillH;
      expect(pillTop - (top + card), id).toBeCloseTo(24, 5);
      expect(window, id).toBeLessThan(article.gate?.windowPx ?? LOCKED_ARTICLE_WINDOW_PX);
    }
  });
});

// "Lets have the last 3 lines fade and we dont need as much free space before the CTAs.
// If easier, happy to design this for desktop specifically." In the desktop column a
// closed teaser's copy ends inside its 196px box, so the stepped fade never engaged and
// "Read all" stood at the phone's fixed place in the card, 85-130px under the words. The
// copy's own last three lines take the phone's steps (useTeaserFade's tail, from four
// lines), and the pill follows the copy by the phone's own gap under the box.
describe("the closed teasers fade their last three lines and keep the pill close", () => {
  it("steps the copy's own last three lines, as the phone steps the box's", () => {
    const mask = flat(
      ruleIn(
        '.rv3.rv4 .rv4-try__teaser[data-fade="short"][data-tail],\n  .rv3.rv4 .rv4-learn__teaser[data-fade="short"][data-tail]'
      )
    );
    for (const stop of [
      "#000var(--rv4-tail-1,calc(100%-68px))",
      "rgba(0,0,0,0.5)var(--rv4-tail-1,calc(100%-68px))",
      "rgba(0,0,0,0.5)var(--rv4-tail-2,calc(100%-45.6px))",
      "rgba(0,0,0,0.29)var(--rv4-tail-2,calc(100%-45.6px))",
      "rgba(0,0,0,0.29)var(--rv4-tail-3,calc(100%-23.2px))",
      "rgba(0,0,0,0.1)var(--rv4-tail-3,calc(100%-23.2px))",
    ]) {
      expect(mask).toContain(stop);
    }
    expect(mask).toContain("-webkit-mask-image:");
  });

  it("lets the pill follow the copy by the phone's own gap under the box", () => {
    // On the phone the Try box ends at 196 in its closed block, the pill at 212.5; the
    // Learn box at 4 + 196 in its body, the pill at 210.5.
    const tryTop = px(firstRule(".rv3 .rv4-try__open"), "top");
    const learnTop = px(firstRule(".rv3 .rv4-learn__open"), "top");
    const learnLead = px(firstRule(".rv3 .rv4-learn__body"), "padding-top");
    expect(tryTop - 196).toBe(16.5);
    expect(learnTop - learnLead - 196).toBe(10.5);
    const tryPill = ruleIn(".rv3.rv4 .rv4-try__open");
    const learnPill = ruleIn(".rv3.rv4 .rv4-learn__open");
    expect(tryPill).toContain("margin: 16.5px auto 0");
    expect(learnPill).toContain("margin: 10.5px auto 0");
    for (const pill of [tryPill, learnPill]) {
      expect(pill).toContain("left: auto");
      expect(pill).toContain("position: relative");
      expect(pill).toContain("top: auto");
      expect(pill).toContain("transform: none");
    }
  });

  it("reserves no band for the phone's fixed pill, and keeps the last block's margin out of the box", () => {
    expect(ruleIn(".rv3.rv4 .rv4-try__closed")).toContain("min-height: 0");
    expect(ruleIn(".rv3.rv4 .rv4-learn:not(.is-open) .rv4-learn__body")).toContain("min-height: 0");
    expect(
      ruleIn(
        ".rv3.rv4 .rv4-try__teaser > :last-child,\n  .rv3.rv4 .rv4-learn__teaser > :last-child"
      )
    ).toContain("margin-bottom: 0");
  });
});

// "Lets follow the V2 desktop of Other Archetypes for this and cap after the first 3. But
// take out 'View Report'." V2's rows (8946:4058; report.css .report-constellation__row,
// which V4 already draws in its own Other Archetypes chapter): rank, icon, the name over
// its line, the bar and the % on one line and centred on it. Fatih (29.09): keep V4's #1
// card, its descriptions and its count-up.
describe("the top three take V2's desktop rows", () => {
  const v2 = readFileSync(join(__dirname, "..", "ui", "report.css"), "utf8");
  const v2Rule = (selector: string) => {
    const at = v2.indexOf(`${selector} {`);
    expect(at, selector).toBeGreaterThan(-1);
    return v2.slice(at, v2.indexOf("}", at));
  };
  /** The clamp() a rule gives `property`, or undefined. */
  const clampOf = (rule: string, property: string) => {
    const at = rule.indexOf(`${property}: clamp(`);
    return at < 0 ? undefined : rule.slice(at + property.length + 2, rule.indexOf(";", at));
  };

  it("lays each row as rank, icon, the name over its description, the bar and the %", () => {
    const row = flat(ruleIn(".rv3.rv4 .rv4-top3 .rv3-top3__row"));
    expect(row).toContain(
      flat(`grid-template-areas: "rank icon name bar pct" "rank icon blurb bar pct"`)
    );
    expect(row).toContain(
      flat("grid-template-columns: 28px 24px minmax(0, 1fr) clamp(96px, 12vw, 160px) 52px")
    );
    expect(row).toContain("grid-template-rows:autoauto");
    expect(row).toContain("column-gap:clamp(12px,1.4vw,16px)");
    expect(row).toContain("row-gap:2px");
    for (const [part, area] of [
      ["rank", "rank"],
      ["icon", "icon"],
      ["name", "name"],
      ["blurb", "blurb"],
      ["bar", "bar"],
      ["pct", "pct"],
    ] as const) {
      expect(ruleIn(`.rv3.rv4 .rv4-top3 .rv3-top3__${part}`), part).toContain(`grid-area: ${area}`);
    }
  });

  it("sets them at V2's own sizes, so they match the Other Archetypes chapter at every width", () => {
    expect(clampOf(ruleIn(".rv3.rv4 .rv4-top3 .rv3-top3__rank"), "font-size")).toBe(
      clampOf(v2Rule(".report-constellation__rank"), "font-size")
    );
    expect(clampOf(ruleIn(".rv3.rv4 .rv4-top3 .rv3-top3__name"), "font-size")).toBe(
      clampOf(v2Rule(".report-constellation__name"), "font-size")
    );
    expect(clampOf(ruleIn(".rv3.rv4 .rv4-top3 .rv3-top3__pct"), "font-size")).toBe(
      clampOf(v2Rule(".report-constellation__pct"), "font-size")
    );
    expect(ruleIn(".rv3.rv4 .rv4-top3 .rv3-top3__row")).toContain(
      clampOf(v2Rule(".report-constellation__bar"), "width")
    );
    expect(ruleIn(".rv3.rv4 .rv4-top3 .rv3-top3__row")).toContain(
      clampOf(v2Rule(".report-constellation__row"), "column-gap")
    );
  });

  it("keeps V4's #1 card, its ring inside the row's columns, and its description's measure", () => {
    expect(ruleIn(".rv3.rv4 .rv4-top3 .rv3-top3__row.is-lead")).toContain(
      "padding: 13px 11px 14px"
    );
    expect(v3).toMatch(/\.rv3-top3__row\.is-lead \{[^}]*background: color-mix/);
    const blurb = ruleIn(".rv3.rv4 .rv4-top3 .rv3-top3__blurb");
    expect(blurb).toContain("max-width: 480px");
    expect(blurb).toContain("padding-top: 0");
  });

  it("splits the two plain rows with V2's hairline, flush", () => {
    expect(ruleIn(".rv3.rv4 .rv4-top3 .rv3-top3__row:not(.is-lead):not(:last-child)")).toContain(
      "border-bottom: 1px solid rgba(0, 0, 0, 0.05)"
    );
    expect(ruleIn(".rv3.rv4 .rv4-top3 .rv3-top3__row:not(.is-lead) + .rv3-top3__row")).toContain(
      "margin-top: 0"
    );
  });

  it("leaves no rule for the phone's stacked rows behind", () => {
    expect(v3).not.toContain("grid-template-rows: 26px auto 17.08px");
  });
});
