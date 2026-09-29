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
    expect(badge.getAttribute("data-node-id")).toBe("1005:397");
    expect(badge.querySelector(".report-sticky-unlock__badge-head")!.textContent).toBe(
      "14-day money-back"
    );
    expect(badge.querySelector(".report-sticky-unlock__badge-sub")!.textContent).toBe(
      "Guaranteed, no questions asked."
    );
    const [shield, tick] = [...badge.querySelectorAll("img")];
    expect(shield!.getAttribute("src")).toBe("/report/v3/premium/footer-shield.svg");
    expect(tick!.getAttribute("src")).toBe("/report/v3/premium/footer-tick.svg");
    expect(bar.querySelector(".report-sticky-unlock__guarantee")).toBeNull();
    expect(bar.textContent).not.toMatch(/7-day/);

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

  it("keeps V1–V3's bar, and the desktop card everywhere", () => {
    const { unmount } = render(<ReportStickyUnlockBar quote={null} onCheckout={() => {}} />);
    expect(mobile()).not.toHaveClass("is-v4");
    expect(mobile().querySelector(".report-sticky-unlock__guarantee")!.textContent).toBe(
      "14-day money-back guarantee"
    );
    expect(within(mobile()).getByRole("button", { name: "Unlock full report" })).toHaveClass(
      "rpm-cta"
    );
    unmount();
    render(<ReportStickyUnlockBar quote={null} onCheckout={() => {}} v4 />);
    const desktop = document.querySelector(".report-sticky-unlock--desktop")!;
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
    const badge = rule("body:has(.rv3.rv4) .report-sticky-unlock__badge");
    expect(badge).toContain("height: 30.769px;");
    expect(badge).toContain("border-radius: 9.797px;");
    const head = rule("body:has(.rv3.rv4) .report-sticky-unlock__badge-head");
    expect(head).toContain("font-size: 9.532px;");
    expect(head).toContain("color: #009148;");
    expect(rule("body:has(.rv3.rv4) .report-sticky-unlock__badge-sub")).toContain(
      "font-size: 6.809px;"
    );
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
    // At 320 "14-day money-back" needs 106px of the badge: the pill gives up 6 more of
    // its padding below 341 so it keeps them (measured with the real font).
    const narrow = css.slice(css.indexOf("@media (max-width: 340px)"));
    expect(narrow.slice(0, narrow.indexOf("\n}\n"))).toContain("padding: 0 10px;");
  });
});
