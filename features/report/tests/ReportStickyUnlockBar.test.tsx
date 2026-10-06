// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@features/analytics/client", () => ({
  trackStickyUnlockClicked: vi.fn(),
}));

import ReportStickyUnlockBar from "@features/report/ui/ReportStickyUnlockBar";

/**
 * The bar publishes the height it occupies as `--report-unlock-bar-h`, the way
 * ConsentBannerOffset publishes `--liq-consent-h`, so the report's own floating UI
 * can clear it. Its height is not a constant: safe-area padding on a phone, and a
 * stacked card with vw-clamped type between 641 and 1024px.
 */

let heights: { mobile: number; desktop: number };
let resize: (() => void) | null;

beforeEach(() => {
  heights = { mobile: 71, desktop: 0 };
  resize = null;
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (
    this: HTMLElement
  ) {
    if (this.classList.contains("report-sticky-unlock--mobile")) return heights.mobile;
    if (this.classList.contains("report-sticky-unlock--desktop")) return heights.desktop;
    return 0;
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(cb: () => void) {
        resize = cb;
      }
      observe() {}
      disconnect() {}
    }
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.documentElement.style.removeProperty("--report-unlock-bar-h");
});

const published = () =>
  document.documentElement.style.getPropertyValue("--report-unlock-bar-h") || null;

describe("ReportStickyUnlockBar", () => {
  it("publishes the height of whichever bar is showing", () => {
    render(<ReportStickyUnlockBar quote={null} onCheckout={() => {}} />);
    expect(published()).toBe("71px");
  });

  it("follows the bar as it resizes, e.g. the desktop card taking over", () => {
    render(<ReportStickyUnlockBar quote={null} onCheckout={() => {}} />);
    heights = { mobile: 0, desktop: 160 };
    resize!();
    expect(published()).toBe("160px");
  });

  it("clears the variable when the bar goes, so nothing keeps clearing a ghost", () => {
    const { unmount } = render(<ReportStickyUnlockBar quote={null} onCheckout={() => {}} />);
    unmount();
    expect(published()).toBeNull();
  });
});

/**
 * Mark, 29.09 (1945950396, 8:1786): "Please update the mobile footer with this" — 1005:411,
 * the guarantee badge beside a gradient "Unlock Full Report →" pill. V4 only: the bar sits
 * outside the V4 providers, so ReportPage says so. The frame's "7-day" stays 14 (Fatih,
 * 29.09), as on the paywall cards.
 */
describe("ReportStickyUnlockBar — V4's mobile footer (1005:411)", () => {
  const mobile = () => document.querySelector<HTMLElement>(".report-sticky-unlock--mobile")!;

  it("sets the guarantee badge and the gradient pill", () => {
    render(<ReportStickyUnlockBar quote={null} onCheckout={() => {}} v4 />);
    const bar = mobile();
    expect(bar).toHaveClass("is-v4");
    const badge = bar.querySelector(".report-sticky-unlock__badge")!;
    // Since Mark's 01.10 round the badge follows 1167:2607's (1167:2612), without its box.
    expect(badge.getAttribute("data-node-id")).toBe("1167:2612");
    expect(badge.querySelector(".report-sticky-unlock__badge-head")!.textContent).toBe(
      "14-Day Money-Back"
    );
    expect(badge.querySelector(".report-sticky-unlock__badge-sub")!.textContent).toBe(
      "Guaranteed, no questions asked."
    );
    const [shield, tick] = [...badge.querySelectorAll("img")];
    expect(shield!.getAttribute("src")).toBe("/report/v3/premium/footer-shield.svg");
    expect(tick!.getAttribute("src")).toBe("/report/v3/premium/footer-tick.svg");
    expect(bar.querySelector(".report-sticky-unlock__guarantee")).toBeNull();
    expect(bar.textContent).not.toMatch(/7-day/i);

    const cta = within(bar).getByRole("button", { name: "Unlock full report" });
    expect(cta).toHaveClass("report-sticky-unlock__cta--v4");
    expect(cta).not.toHaveClass("rpm-cta");
    expect(cta.textContent).toBe("Unlock Full Report →");
  });

  it("still opens checkout from the pill", () => {
    const onCheckout = vi.fn();
    render(<ReportStickyUnlockBar quote={null} onCheckout={onCheckout} v4 />);
    fireEvent.click(within(mobile()).getByRole("button", { name: "Unlock full report" }));
    expect(onCheckout).toHaveBeenCalledTimes(1);
  });

  it("keeps V1–V3's bar and desktop card", () => {
    render(<ReportStickyUnlockBar quote={null} onCheckout={() => {}} />);
    expect(mobile()).not.toHaveClass("is-v4");
    expect(mobile().querySelector(".report-sticky-unlock__guarantee")!.textContent).toBe(
      "14-day money-back guarantee"
    );
    expect(within(mobile()).getByRole("button", { name: "Unlock full report" })).toHaveClass(
      "rpm-cta"
    );
    const desktop = document.querySelector(".report-sticky-unlock--desktop")!;
    expect(desktop).not.toHaveClass("is-v4");
    expect(desktop.querySelector(".report-sticky-unlock__heading")!.textContent).toBe(
      "Ready to meet yourself?"
    );
  });

  it("is what ReportPage renders under ?v4=1", () => {
    const page = readFileSync(join(process.cwd(), "features/report/ui/ReportPage.tsx"), "utf8");
    const at = page.indexOf("<ReportStickyUnlockBar");
    expect(page.slice(at, page.indexOf("/>", at))).toContain("v4={isV4}");
  });

  it("styles it on the V4 page only, through the page (the bar is outside .rv4)", () => {
    const css = readFileSync(join(process.cwd(), "features/report/ui/v3/reportV3.css"), "utf8");
    const rule = (selector: string) => {
      const at = css.indexOf(`${selector} {`);
      expect(at, selector).toBeGreaterThan(-1);
      return css.slice(at, css.indexOf("}", at));
    };
    const bar = rule("body:has(.rv3.rv4) .report-sticky-unlock--mobile.is-v4");
    // The frame's Plus Jakarta Sans: outside `.rv3.rv4`, --font-sans is the site's
    // Manrope (final review, 29.09).
    expect(bar).toContain("--font-sans: var(--font-jakarta);");
    expect(bar).toContain("border-top: 1px solid #e5e5e5;");
    expect(bar).toContain("box-shadow: none;");
    // 12.5 from the bar's edge with Figma's stroke inside: 1 of hairline and 11.5.
    expect(bar).toContain("padding: 11.5px 15px max(10.3px, env(safe-area-inset-bottom));");
    // Mark, 01.10 (1167:2607, "Updated sticky footer for mobile"): the guarantee loses
    // its box. No fill, no 0.49 stroke; the shield sits at the badge's own left edge,
    // 15 from the screen's, and the copy 27.2 after it. The head is 12px bold, the
    // line under it 10px, and the badge may take what the pill leaves (192 at 393),
    // since the 10px line runs 160 wide.
    const badge = rule("body:has(.rv3.rv4) .report-sticky-unlock__badge");
    expect(badge).toContain("height: 30.769px;");
    expect(badge).not.toMatch(/background|border/);
    expect(badge).toContain("padding: 0;");
    expect(badge).toContain("flex: 1 1 auto;");
    const head = rule("body:has(.rv3.rv4) .report-sticky-unlock__badge-head");
    expect(head).toContain("font-size: 12px;");
    expect(head).toContain("line-height: 15.251px;");
    expect(head).toContain("color: #009148;");
    const sub = rule("body:has(.rv3.rv4) .report-sticky-unlock__badge-sub");
    expect(sub).toContain("font-size: 10px;");
    expect(sub).toContain("line-height: 10.894px;");
    expect(sub).toContain("color: #6b6678;");
    const pill = rule("body:has(.rv3.rv4) .report-sticky-unlock__cta--v4");
    expect(pill).toContain("width: 163px;");
    expect(pill).toContain("height: 32px;");
    expect(pill).toContain(
      "linear-gradient(168.893deg, #fb683e 14.644%, #e88c8c 51.414%, #ac88ed 85.356%)"
    );
    // The 32px pill keeps a 44px target, as the bar's button always has.
    expect(rule("body:has(.rv3.rv4) .report-sticky-unlock__cta--v4::after")).toContain(
      "inset: -6px 0;"
    );
    // At 320 "14-day money-back" needs 122 of the badge (12px bold, the real font): the
    // compact rule's 12 of side padding leaves it 120.7, so below 341 the pill gives up 2.
    const narrow = css.slice(css.indexOf("@media (max-width: 340px)"));
    expect(narrow.slice(0, narrow.indexOf("\n}\n"))).toContain("padding: 0 10px;");
    // At the frame's sizes the two need 386: 2 x 15 of margin, the 8 gap, the 163 pill,
    // the shield's 20 and its 7.838, and the 10px line's 156 (the real font). Below that
    // the margins and the pill's side padding come to 12, and from 355 down the line
    // shrinks with the screen rather than ending in an ellipsis. Starting at 381, the rule
    // left 382-385 cutting the line by up to 3px, and 384 is a common Android width.
    expect(css).not.toContain("@media (max-width: 381px)");
    expect(css).toContain("@media (max-width: 385px) {");
    const compact = css.slice(css.indexOf("@media (max-width: 385px)"));
    const block = compact.slice(0, compact.indexOf("\n}\n"));
    expect(block).toContain("font-size: min(10px, calc((100vw - 200px) / 15.6));");
    expect(block).toContain("padding: 0 12px;");
  });
});

/**
 * Sanjin, desktop review 30.09 (banner.png): "too much, too many different fonts,
 * gradient edges on the round button" — Lora for the heading, Manrope in three weights,
 * a white-bordered button in an orange halo. No desktop frame exists, so V4's card
 * takes the mobile footer's pieces (1005:411): the guarantee box, here at the paywall
 * card's own scale (1015:1218), and the same gradient pill, in Plus Jakarta Sans only.
 */
describe("ReportStickyUnlockBar — V4's desktop card (review 30.09)", () => {
  const desktop = () => document.querySelector<HTMLElement>(".report-sticky-unlock--desktop")!;

  it("sets the guarantee box and the gradient pill, and nothing else", () => {
    render(<ReportStickyUnlockBar quote={null} onCheckout={() => {}} v4 />);
    const bar = desktop();
    expect(bar).toHaveClass("is-v4");
    const badge = bar.querySelector(".report-sticky-unlock__badge")!;
    expect(badge.getAttribute("data-node-id")).toBe("1015:1218");
    expect(badge.querySelector(".report-sticky-unlock__badge-head")!.textContent).toBe(
      "14-Day Money-Back"
    );
    expect(bar.querySelector(".report-sticky-unlock__heading")).toBeNull();
    expect(bar.textContent).not.toMatch(/Ready to meet yourself|doesn.t land/);
    const cta = within(bar).getByRole("button", { name: "Unlock full report" });
    expect(cta).toHaveClass("report-sticky-unlock__cta--v4");
    expect(cta).not.toHaveClass("rpm-cta");
    // A no-break space before the arrow, as the footer's pill has: the arrow is its own
    // flex item, and a plain space at an item's start collapses, leaving "Report→"
    // where 1005:395 sets one text run, "Unlock Full Report →" (final review, 30.09).
    expect(cta.textContent).toBe("Unlock Full Report →");
  });

  it("opens checkout from the pill and counts it as the desktop bar", async () => {
    const { trackStickyUnlockClicked } = await import("@features/analytics/client");
    const onCheckout = vi.fn();
    render(
      <ReportStickyUnlockBar quote={null} onCheckout={onCheckout} v4 archetype="Spark Seeker" />
    );
    fireEvent.click(within(desktop()).getByRole("button", { name: "Unlock full report" }));
    expect(onCheckout).toHaveBeenCalledTimes(1);
    expect(trackStickyUnlockClicked).toHaveBeenCalledWith({
      variant: "desktop",
      archetype: "Spark Seeker",
    });
  });

  it("styles it through the page, in Plus Jakarta, the guarantee without its box", () => {
    const css = readFileSync(join(process.cwd(), "features/report/ui/v3/reportV3.css"), "utf8");
    const rule = (selector: string) => {
      const at = css.indexOf(`${selector} {`);
      expect(at, selector).toBeGreaterThan(-1);
      return css.slice(at, css.indexOf("}", at));
    };
    const D = "body:has(.rv3.rv4) .report-sticky-unlock--desktop.is-v4";
    expect(rule(D)).toContain("--font-sans: var(--font-jakarta);");
    const row = rule(`${D} .report-sticky-unlock__desktop-inner`);
    expect(row).toContain("flex-direction: row;");
    expect(row).toContain("justify-content: center;");
    // Mark, 05.10: the desktop card matches the phone footer, "without the bigger
    // rectangle around the Money back guarantee" (1015:1218 still draws the 265.6 x 45.25
    // box). No fill, no stroke, no padding of its own.
    const badge = rule(`${D} .report-sticky-unlock__badge`);
    expect(badge).not.toMatch(/background|border/);
    expect(badge).toContain("padding: 0;");
    expect(badge).toContain("height: auto;");
    expect(badge).not.toContain("265.6px");
    expect(rule(`${D} .report-sticky-unlock__badge-head`)).toContain("font-size: 14px;");
    expect(rule(`${D} .report-sticky-unlock__badge-sub`)).toContain("font-size: 10px;");
  });
});
