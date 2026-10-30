// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const analytics = vi.hoisted(() => ({
  track: vi.fn(),
  pingFunnelEvent: vi.fn(),
  getGaMeasurementContext: vi.fn(() => ({ clientId: "111.222", sessionId: "333", consent: true })),
  // The site header's own button counts this; on this page it must never be sent.
  trackStartSurvey: vi.fn(),
}));
vi.mock("@features/analytics/client", () => analytics);
// The header's links are the site's client-side Links; here, plain anchors.
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
const posthog = vi.hoisted(() => ({
  register_for_session: vi.fn(),
  get_property: vi.fn(),
  get_distinct_id: vi.fn(),
}));
vi.mock("posthog-js", () => ({ default: posthog }));
vi.mock("@shared/http/csrf-client", () => ({ getCsrfToken: () => "csrf-token" }));
vi.mock("@shared/url/utm", () => ({ getStoredUtm: () => '{"utm_source":"google"}' }));

import { readAppCss } from "@shared/testing/read-app-css";
import { PayToStartLanding } from "@features/pay-to-start/ui/landing/PayToStartLanding";
import { __resetArrivalNoticeForTests } from "@features/pay-to-start/ui/landing/PtsNotice";
import {
  PTS_BREADCRUMB,
  PTS_FAQ,
  PTS_FINAL_CTA,
  PTS_FOOTER,
  PTS_GUARANTEE,
  PTS_HERO,
  PTS_HOW_IT_WORKS,
  PTS_INITIAL,
  PTS_INSIDE,
  PTS_NOTICES,
  PTS_ONE_PRICE,
  PTS_PRICE_CARD,
  PTS_SAMPLE,
} from "@features/pay-to-start/ui/landing/payToStartContent";
import { WHY_UNLOCK_CARDS } from "@features/report/logic/whyUnlockCards";
import { REPORT_V4_NAV_PARTS } from "@features/report/ui/v3/reportV3Nav";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const assign = vi.fn();
const reload = vi.fn();
const replaceState = vi.fn();
let originalLocation: Location;

function setLocation(href: string) {
  const url = new URL(href);
  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      href: url.href,
      origin: url.origin,
      pathname: url.pathname,
      search: url.search,
      hash: url.hash,
      assign,
      reload,
    },
  });
}

function reply(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
  );
}

const fetchMock = vi.fn();

function renderPage(priceCents = 2900) {
  return render(<PayToStartLanding offer="full" priceCents={priceCents} />);
}

/** The visible text of the page, whitespace collapsed (React splits runs into nodes). */
const pageText = () => (document.body.textContent ?? "").replace(/\s+/g, " ");

const cta = (location: string) =>
  document.querySelector<HTMLButtonElement>(`[data-pts-cta="${location}"]`)!;

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetArrivalNoticeForTests();
  originalLocation = window.location;
  setLocation("https://www.loveiq.org/sexual-archetype");
  vi.spyOn(window.history, "replaceState").mockImplementation(replaceState);
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
});

describe("the pay-to-start page, as drawn", () => {
  // Landing V2 (Mark, final 30.10), with the survey's own facts where V2 drew older ones.
  it("prints every line of Landing V2's copy", () => {
    renderPage();
    const text = pageText();
    const price = "€29";
    const sampleText = PTS_SAMPLE.cards.flatMap((c) => {
      switch (c.kind) {
        case "read":
          return [c.label, c.text];
        case "shift":
          return [c.from, c.shiftLabel, c.to];
        case "try":
          return [c.lead, `${c.text}${c.quote}`];
        case "deeper":
          return c.sources.flatMap((s) => [s.title, s.body]);
      }
    });
    const expected = [
      ...PTS_BREADCRUMB,
      PTS_HERO.title,
      PTS_HERO.lead,
      PTS_HERO.takers,
      PTS_HERO.length,
      PTS_HOW_IT_WORKS.title,
      ...PTS_HOW_IT_WORKS.steps.flatMap((s) => [s.eyebrow, s.title, s.body(price)]),
      "In 15 minutes, you'll know things about yourself most people never learn.",
      "What actually turns you on",
      "Where you and a partner keep missing each other",
      `${PTS_INSIDE.title.lead}${PTS_INSIDE.title.emph} ${PTS_INSIDE.title.tail}`,
      ...PTS_INSIDE.notes.flatMap((n) => ("body" in n ? [n.title, n.body] : [n.title])),
      "Typical Beliefs",
      "Other Archetypes",
      `${PTS_SAMPLE.title.lead} ${PTS_SAMPLE.title.emph}${PTS_SAMPLE.title.tail}`,
      ...PTS_SAMPLE.cards.flatMap((c) => [c.eyebrow, c.title]),
      ...sampleText,
      "14 sexual personalities.",
      "10,000+",
      "Built by researchers and on practical wisdom.",
      `${PTS_ONE_PRICE.title.lead} ${PTS_ONE_PRICE.title.emph}`,
      PTS_ONE_PRICE.badge,
      `${PTS_ONE_PRICE.cardTitle.strong} ${PTS_ONE_PRICE.cardTitle.rest}`,
      `${PTS_ONE_PRICE.covers}${PTS_ONE_PRICE.coversStrong}`,
      PTS_ONE_PRICE.terms,
      PTS_ONE_PRICE.guarantee,
      ...PTS_ONE_PRICE.includes,
      PTS_ONE_PRICE.secure,
      ...WHY_UNLOCK_CARDS.flatMap((c) => [c.emph, c.body]),
      `${PTS_FAQ.title.lead}${PTS_FAQ.title.emph}`,
      ...PTS_FAQ.items.flatMap((i) => [i.question, i.answer]),
      `${PTS_FAQ.disclaimerBefore}${PTS_FAQ.disclaimerBold}${PTS_FAQ.disclaimerAfter}`,
      PTS_PRICE_CARD.eyebrow,
      PTS_PRICE_CARD.guarantee,
      ...PTS_PRICE_CARD.includes,
      PTS_GUARANTEE.title,
      `${PTS_GUARANTEE.body}${PTS_GUARANTEE.strong}`,
      PTS_FINAL_CTA.title,
      `${PTS_FINAL_CTA.leadBefore}${PTS_FINAL_CTA.leadPrice(price)}`,
      PTS_FINAL_CTA.cta(price),
      PTS_FINAL_CTA.ctaShort(price),
      ...PTS_FINAL_CTA.badges,
      PTS_FOOTER.company,
      PTS_FOOTER.disclaimer,
    ];
    for (const line of expected) expect(text).toContain(line.replace(/\s+/g, " "));
  });

  it("prints every price from the server's price, never a fixed one", () => {
    renderPage(1999);
    const text = pageText();
    expect(text).not.toContain("€29");
    expect(text).toContain("€19.99, one-time.");
    expect(text).toContain("Unlock Survey & Full Report · €19.99");
    expect(text).toContain("Unlock for €19.99");
    // The price card, the One price band and the sticky bar.
    expect(screen.getAllByText("€19.99")).toHaveLength(3);
  });

  it("names the full report on every button (Sanjin Studenovic, 20.10)", () => {
    renderPage();
    for (const location of ["price_card", "one_price", "final_cta"]) {
      expect(cta(location).textContent).toContain("Unlock Survey & Full Report");
    }
    expect(cta("final_cta").textContent).toContain("Unlock Survey & Full Report · €29");
    // Shorter in the bar, so its price keeps its room on a 360-wide phone.
    expect(cta("sticky_bar").textContent).toContain("Unlock Full Report");
  });

  it("has no Log in, and its breadcrumb links nowhere", () => {
    renderPage();
    expect(screen.queryByText(/log in/i)).toBeNull();
    const crumbs = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(crumbs).queryAllByRole("link")).toHaveLength(0);
    expect(within(crumbs).getByText(PTS_BREADCRUMB[2]).getAttribute("aria-current")).toBe("page");
  });

  it("links the site's own pages and the legal pages, and never the survey", () => {
    renderPage();
    const hrefs = [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href"));
    // The LoveIQ header (Marcus, 18.10): logo and Home, About us, Glossary, Trust Center,
    // and its button on this page's own price, in the bar and in the phone's menu.
    const site = ["/", "/about", "/glossary", "/trust-zone"];
    const allowed = new Set([...site, "#price", ...PTS_FOOTER.links.map((l) => l.href)]);
    expect(hrefs.filter((href) => !allowed.has(href ?? ""))).toEqual([]);
    for (const href of [...site, "#price"]) expect(hrefs).toContain(href);
    expect(hrefs).not.toContain("/survey");
  });

  it("wears the LoveIQ header, and no Facets", () => {
    renderPage();
    const header = within(document.querySelector("header") as HTMLElement);
    expect(header.getByRole("link", { name: "LoveIQ" }).getAttribute("href")).toBe("/");
    for (const label of ["Home", "About us", "Glossary", "Trust Center"]) {
      expect(header.getAllByRole("link", { name: label }).length).toBeGreaterThan(0);
    }
    expect(pageText()).not.toMatch(/facets/i);
  });

  it("sends the header's button to the price, counted as its own, never as the survey's", () => {
    renderPage();
    const button = screen.getByRole("link", { name: "Start test now - navigation" });
    expect(button.getAttribute("href")).toBe("#price");
    expect(document.getElementById("price")?.querySelector("h2")?.textContent).toBe(
      `${PTS_ONE_PRICE.title.lead} ${PTS_ONE_PRICE.title.emph}`
    );
    fireEvent.click(button);
    expect(analytics.track).toHaveBeenCalledWith("pts_nav_click", {
      target: "price",
      place: "bar",
    });
    expect(analytics.trackStartSurvey).not.toHaveBeenCalled();
  });

  it("counts a visitor who leaves through the header", () => {
    renderPage();
    const stayOnPage = (event: Event) => event.preventDefault();
    document.addEventListener("click", stayOnPage, true);
    const bar = within(document.querySelector("header nav") as HTMLElement);
    fireEvent.click(bar.getByRole("link", { name: "Trust Center" }));
    fireEvent.click(bar.getByRole("link", { name: "LoveIQ" }));
    document.removeEventListener("click", stayOnPage, true);
    expect(analytics.track).toHaveBeenCalledWith("pts_nav_click", {
      target: "trust_center",
      place: "bar",
    });
    expect(analytics.track).toHaveBeenCalledWith("pts_nav_click", { target: "logo", place: "bar" });
    expect(analytics.trackStartSurvey).not.toHaveBeenCalled();
  });

  // Landing V2 (Mark, final 30.10).
  it("lists the report's live chapter menu beside the questions it answers", () => {
    renderPage();
    const overview = within(document.getElementById("inside-your-report") as HTMLElement);
    for (const part of REPORT_V4_NAV_PARTS) {
      for (const item of part.items) expect(overview.getAllByText(item.label).length).toBe(1);
    }
    for (const note of PTS_INSIDE.notes) expect(overview.getByText(note.title)).toBeTruthy();
  });

  it("draws its section icons as Mark's rings, never filled with the buttons' gradient", () => {
    renderPage();
    const rings = [...document.querySelectorAll<HTMLElement>(".pts-ring-step")];
    expect(rings).toHaveLength(3);
    for (const ring of rings) {
      expect(ring.getAttribute("style")).toContain("padding-box");
      expect(ring.getAttribute("style")).toContain("border-box");
    }
    const sections = document.querySelectorAll(
      '[aria-labelledby="pts-how"], [aria-labelledby="pts-find-out"], [aria-labelledby="pts-sample"]'
    );
    for (const section of sections) {
      expect(section.querySelector('[class*="bg-gradient-to-br"]')).toBeNull();
    }
  });

  it("pulses How it works' rings three times as they come into view, and never under reduced motion", () => {
    const css = readFileSync(
      join(process.cwd(), "features/pay-to-start/ui/landing/payToStart.css"),
      "utf8"
    );
    const block = css.slice(css.indexOf("@media (prefers-reduced-motion: no-preference)"));
    expect(block).toMatch(
      /\.pts-how-steps\.animate \.pts-ring-step \{\s*animation: pts-ring-pulse [^;]* 3;/
    );
    expect(css).not.toMatch(/pts-ring-pulse[^;]*infinite/);
  });

  it("carries the search ad's sitelink anchors", () => {
    renderPage();
    for (const id of ["inside-your-report", "personalities", "reviews"]) {
      expect(document.getElementById(id)).not.toBeNull();
    }
  });

  it("folds every answer at first, and a question opens its own (Marcus, 20.10)", () => {
    renderPage();
    const details = document.querySelectorAll("details");
    expect(details).toHaveLength(PTS_FAQ.items.length);
    for (const d of details) expect(d.open).toBe(false);
    // Folded, the answers are still in the page.
    expect(details[0]!.textContent).toContain(PTS_FAQ.items[0]!.answer);

    fireEvent.click(screen.getByText(PTS_FAQ.items[0]!.question));

    expect(details[0]!.open).toBe(true);
    expect(details[1]!.open).toBe(false);
  });

  it("names no video file before the play button is pressed", () => {
    renderPage();
    const video = screen.getByTestId("pts-hero-video") as HTMLVideoElement;
    expect(video.getAttribute("src")).toBeNull();
    expect(video.getAttribute("preload")).toBe("none");
  });
});

/** Every `@media (prefers-reduced-motion: reduce)` block of the shipped CSS, brace-matched. */
function reducedMotionBlocks(): string[] {
  const css = readAppCss().replace(/\/\*[\s\S]*?\*\//g, "");
  const needle = "@media (prefers-reduced-motion: reduce)";
  const blocks: string[] = [];
  for (let from = css.indexOf(needle); from !== -1; from = css.indexOf(needle, from + 1)) {
    let depth = 0;
    let i = css.indexOf("{", from);
    const start = i;
    for (; i < css.length; i++) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}" && --depth === 0) break;
    }
    blocks.push(css.slice(start, i));
  }
  return blocks;
}

describe("its fly-ins (Marcus, 18.10)", () => {
  it("flies in as the landing does, the hero on load and the rest as it scrolls in", () => {
    renderPage();
    const reveals = [...document.querySelectorAll(".animate-on-scroll")];
    expect(reveals.length).toBeGreaterThan(30);
    // Every section's heading (the reviews' with its rating line, as one).
    for (const h2 of document.querySelectorAll("main h2")) {
      expect(h2.closest(".animate-on-scroll"), h2.textContent ?? "").not.toBeNull();
    }
    // In view from the first paint: it plays on load, never waits for a scroll.
    const hero = document.querySelector("h1")!.parentElement!;
    expect(hero.querySelectorAll(".animate-on-load").length).toBeGreaterThanOrEqual(4);
    expect(hero.querySelectorAll(".animate-on-scroll")).toHaveLength(0);
    // jsdom has no IntersectionObserver, like an old browser: everything shows at once.
    expect(reveals.filter((el) => !el.classList.contains("animate"))).toEqual([]);
  });

  it("never makes a price, a button or a status line wait on a reveal", () => {
    renderPage();
    const moving = ".animate-on-scroll, .animate-on-load";
    const stays = [
      ...document.querySelectorAll("[data-pts-cta]"),
      ...document.querySelectorAll('[role="status"], [role="alert"]'),
      document.querySelector('aside[aria-label="Price"]'),
      screen.getByTestId("pts-sticky-bar"),
      ...screen.getAllByText("€29"),
    ];
    expect(stays.length).toBeGreaterThan(8);
    for (const el of stays) {
      expect(el, "an element the test looks for is missing").not.toBeNull();
      expect(el!.closest(moving), el!.outerHTML.slice(0, 90)).toBeNull();
    }
  });

  it("gives a reduced-motion visitor the page at once", () => {
    const covering = reducedMotionBlocks().filter((b) =>
      b.includes(".pts-page .animate-on-scroll")
    );
    expect(covering.length, "no reduced-motion block covers the page's fly-ins").toBe(1);
    expect(covering[0]).toMatch(/opacity:\s*1/);
    expect(covering[0]).toMatch(/transform:\s*none/);
    // The scope is the page's own root, around every one of its fly-ins.
    renderPage();
    const reveals = document.querySelectorAll(".animate-on-scroll");
    expect(document.querySelectorAll(".pts-page .animate-on-scroll")).toHaveLength(reveals.length);
  });
});

describe("its checkout", () => {
  it("posts the price it shows and goes to Stripe", async () => {
    fetchMock.mockReturnValue(
      reply({ state: "redirect", url: "https://checkout.stripe.com/c/pay/cs_test_1" })
    );
    renderPage();
    fireEvent.click(cta("price_card"));
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/stripe/pay-to-start");
    expect(init.headers["x-csrf-token"]).toBe("csrf-token");
    expect(JSON.parse(init.body)).toEqual({
      offer: "full",
      displayedPriceCents: 2900,
      gaClientId: "111.222",
      gaSessionId: "333",
      gaConsent: true,
      posthogDistinctId: null,
      utmTracker: '{"utm_source":"google"}',
    });
    expect(assign).toHaveBeenCalledWith("https://checkout.stripe.com/c/pay/cs_test_1");
    expect(analytics.track).toHaveBeenCalledWith("pts_cta_click", {
      location: "price_card",
      price_cents: 2900,
    });
    expect(analytics.track).toHaveBeenCalledWith(
      "begin_checkout",
      expect.objectContaining({ journey: "pay_to_start", currency: "EUR", value: 29 })
    );
    expect(analytics.pingFunnelEvent).toHaveBeenCalledWith("prepaid_checkout_started");
  });

  it("sends the anonymous PostHog id, so the purchase joins this visit, never an email", async () => {
    fetchMock.mockReturnValue(reply({ state: "redirect", url: "https://checkout.stripe.com/x" }));
    posthog.get_property.mockReturnValue("anonymous");
    posthog.get_distinct_id.mockReturnValue("019a7c1e-anon");
    renderPage();
    fireEvent.click(cta("price_card"));
    await settle();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).posthogDistinctId).toBe("019a7c1e-anon");

    // An identified browser's id is an email: it has no place in Stripe's metadata.
    cleanup();
    fetchMock.mockClear();
    posthog.get_property.mockReturnValue("identified");
    posthog.get_distinct_id.mockReturnValue("someone@example.com");
    renderPage();
    fireEvent.click(cta("price_card"));
    await settle();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).posthogDistinctId).toBeNull();
    posthog.get_property.mockReset();
    posthog.get_distinct_id.mockReset();
  });

  it("sends one request however many buttons are pressed", async () => {
    let release: (value: Response) => void = () => {};
    fetchMock.mockReturnValue(new Promise<Response>((resolve) => (release = resolve)));
    renderPage();
    fireEvent.click(cta("price_card"));
    fireEvent.click(cta("price_card"));
    fireEvent.click(cta("sticky_bar"));
    fireEvent.click(cta("final_cta"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(cta("sticky_bar").disabled).toBe(true);
    expect(cta("price_card").getAttribute("aria-busy")).toBe("true");
    expect(cta("sticky_bar").getAttribute("aria-busy")).toBeNull();
    release(
      new Response(JSON.stringify({ state: "redirect", url: "https://checkout.stripe.com/x" }))
    );
    await settle();
    expect(assign).toHaveBeenCalledTimes(1);
  });

  it("sends a browser that already paid straight to the survey", async () => {
    fetchMock.mockReturnValue(reply({ state: "paid" }));
    renderPage();
    fireEvent.click(cta("one_price"));
    await settle();
    expect(assign).toHaveBeenCalledWith("https://www.loveiq.org/survey");
  });

  it("counts a checkout started only when one opens", async () => {
    // GA4's begin_checkout (Google Ads reads it) and the durable funnel row mean a
    // checkout: never a browser sent to its survey, a changed price, a paused one, or a
    // payment still settling, which goes to our own status page.
    for (const answer of [
      reply({ state: "paid" }),
      reply({
        state: "redirect",
        url: "https://www.loveiq.org/sexual-archetype/checkout?session_id=cs_test_1",
      }),
      reply({ state: "used", reportPath: null }),
      reply({ state: "price_changed", priceCents: 1999 }, 409),
      reply({ state: "unavailable", message: "Checkout is paused." }, 503),
    ]) {
      cleanup();
      vi.mocked(analytics.track).mockClear();
      vi.mocked(analytics.pingFunnelEvent).mockClear();
      fetchMock.mockReturnValueOnce(answer);
      renderPage();
      fireEvent.click(cta("price_card"));
      await settle();
      expect(analytics.track).toHaveBeenCalledWith("pts_cta_click", expect.any(Object));
      expect(analytics.track).not.toHaveBeenCalledWith("begin_checkout", expect.anything());
      expect(analytics.pingFunnelEvent).not.toHaveBeenCalledWith("prepaid_checkout_started");
    }
  });

  it("sends a used purchase to its report, or says where to find it", async () => {
    fetchMock.mockReturnValueOnce(reply({ state: "used", reportPath: "/report/rpt_abc" }));
    renderPage();
    fireEvent.click(cta("final_cta"));
    await settle();
    expect(assign).toHaveBeenCalledWith("https://www.loveiq.org/report/rpt_abc");

    cleanup();
    assign.mockClear();
    fetchMock.mockReturnValueOnce(reply({ state: "used", reportPath: null }));
    renderPage();
    fireEvent.click(cta("final_cta"));
    await settle();
    expect(assign).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toBe(PTS_NOTICES.alreadyUsed);
  });

  it("reloads rather than charge a price the visitor was not shown", async () => {
    fetchMock.mockReturnValue(reply({ state: "price_changed", priceCents: 1999 }, 409));
    renderPage();
    fireEvent.click(cta("price_card"));
    await settle();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(assign).not.toHaveBeenCalled();
  });

  it("says why beside the button that was pressed when checkout is paused", async () => {
    fetchMock.mockReturnValue(
      reply(
        {
          state: "unavailable",
          message: "Checkout is paused for a moment. Please try again later.",
        },
        503
      )
    );
    renderPage();
    fireEvent.click(cta("one_price"));
    await settle();
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe("Checkout is paused for a moment. Please try again later.");
    expect(cta("one_price").closest("div")!.contains(alert)).toBe(true);
    expect(cta("one_price").disabled).toBe(false);
    expect(analytics.track).toHaveBeenCalledWith("pts_checkout_failed", {
      location: "one_price",
      reason: "unavailable",
    });
  });

  it("puts the sticky bar's failure above its row", async () => {
    fetchMock.mockReturnValue(reply({ error: "Please try again later." }, 429));
    renderPage();
    fireEvent.click(cta("sticky_bar"));
    await settle();
    const bar = screen.getByTestId("pts-sticky-bar");
    expect(within(bar).getByRole("alert").textContent).toMatch(/wait a minute/);
  });

  it("never shows a server error's own words", async () => {
    fetchMock.mockReturnValue(reply({ error: "Unable to process request." }, 500));
    renderPage();
    fireEvent.click(cta("price_card"));
    await settle();
    expect(screen.getByRole("alert").textContent).toBe(PTS_NOTICES.checkoutFailed);
  });

  it("survives a network failure and can be pressed again", async () => {
    fetchMock.mockReturnValueOnce(Promise.reject(new TypeError("Failed to fetch")));
    renderPage();
    fireEvent.click(cta("price_card"));
    await settle();
    expect(screen.getByRole("alert").textContent).toBe(PTS_NOTICES.checkoutFailed);

    fetchMock.mockReturnValueOnce(
      reply({ state: "redirect", url: "https://checkout.stripe.com/y" })
    );
    fireEvent.click(cta("price_card"));
    await settle();
    expect(assign).toHaveBeenCalledWith("https://checkout.stripe.com/y");
  });

  it("gives the buttons back when Back from Stripe restores the page", async () => {
    fetchMock.mockReturnValue(reply({ state: "redirect", url: "https://checkout.stripe.com/z" }));
    renderPage();
    fireEvent.click(cta("price_card"));
    await settle();
    expect(cta("price_card").disabled).toBe(true);

    act(() => {
      const event = new Event("pageshow") as PageTransitionEvent;
      Object.defineProperty(event, "persisted", { value: true });
      window.dispatchEvent(event);
    });
    expect(cta("price_card").disabled).toBe(false);
    expect(cta("price_card").getAttribute("aria-busy")).toBeNull();
  });
});

describe("its arrival notices", () => {
  it("says no payment was taken after Stripe's back link, once", () => {
    setLocation("https://www.loveiq.org/sexual-archetype?checkout=cancelled&utm_source=google");
    renderPage();
    expect(screen.getByText(PTS_NOTICES.cancelled)).toBeTruthy();
    expect(analytics.track).toHaveBeenCalledWith("pts_checkout_cancelled");
    expect(replaceState).toHaveBeenCalledWith(
      window.history.state,
      "",
      "/sexual-archetype?utm_source=google"
    );
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText(PTS_NOTICES.cancelled)).toBeNull();
  });

  it("explains an email link that could not open the survey", () => {
    setLocation("https://www.loveiq.org/sexual-archetype?continue=refunded");
    renderPage();
    expect(screen.getByText(PTS_NOTICES.continueRefunded)).toBeTruthy();
    expect(analytics.track).toHaveBeenCalledWith("pts_landing_viewed", {
      price_cents: 2900,
      notice: "continue_refunded",
    });
  });

  it("says nothing on an ordinary visit, and counts it", () => {
    renderPage();
    expect(document.querySelector("[role=status].mb-4")).toBeNull();
    expect(replaceState).not.toHaveBeenCalled();
    expect(posthog.register_for_session).toHaveBeenCalledWith({
      journey: "pay_to_start",
      pts_offer: "full",
      pts_price_cents: 2900,
    });
    expect(analytics.pingFunnelEvent).toHaveBeenCalledWith("prepaid_gate_viewed");
  });
});

/**
 * The initial report's page (EUR 1.99, Marcus 19.10; Figma 1733:4089, phone 1733:4424): the
 * same page in the initial report's words, with no "One price" band, and its one price card
 * under the film below 1280 and beside the column from there.
 */
describe("the initial report's page", () => {
  const renderInitial = () => render(<PayToStartLanding offer="pre" priceCents={199} />);

  it("prints the initial report's words, and none that promise the full report", () => {
    renderInitial();
    const text = pageText();
    const price = "€1.99";
    const expected = [
      PTS_HERO.title,
      PTS_HERO.lead,
      "In 15 minutes, you'll know things about yourself most people never learn.",
      `${PTS_INSIDE.title.lead}${PTS_INSIDE.title.emph} ${PTS_INSIDE.title.tail}`,
      PTS_INITIAL.insideLead,
      ...PTS_INITIAL.steps.flatMap((s) => [s.eyebrow, s.title, s.body()]),
      ...PTS_INITIAL.faqItems.flatMap((i) => [i.question, i.answer]),
      PTS_INITIAL.priceCard.eyebrow,
      ...PTS_INITIAL.priceCard.includes,
      PTS_INITIAL.finalCta.leadBefore,
      PTS_INITIAL.finalCta.cta(price),
      PTS_INITIAL.finalCta.ctaShort(price),
      PTS_INITIAL.stickyLabel,
    ];
    for (const line of expected) expect(text).toContain(line.replace(/\s+/g, " "));
    expect(text).toContain("SURVEY + INITIAL REPORT");
    expect(text).toContain("€10 credit toward your Full Report");
    expect(text).not.toContain("Premium Report");
    for (const wrong of [
      PTS_ONE_PRICE.title.emph,
      ...WHY_UNLOCK_CARDS.map((c) => c.emph),
      "the full report.",
      "nothing locked",
      "no second paywall",
      "All of it is included",
      "a 50+ page report you keep",
      "€29",
    ]) {
      expect(text).not.toContain(wrong);
    }
  });

  it("prints its price where the full report's page prints it, and no other", () => {
    renderInitial();
    // The price card and the sticky bar.
    expect(screen.getAllByText("€1.99")).toHaveLength(2);
    expect(pageText()).toContain("Unlock Survey & Initial Report €1.99");
  });

  it("names the initial report on every button, never the full one (Sanjin Studenovic, 20.10)", () => {
    renderInitial();
    const buttons = document.querySelectorAll("[data-pts-cta]");
    expect(buttons).toHaveLength(3);
    expect(cta("price_card").textContent).toContain("Unlock Survey & Initial Report");
    expect(cta("final_cta").textContent).toContain("Unlock Survey & Initial Report €1.99");
    expect(cta("sticky_bar").textContent).toContain("Unlock Initial Report");
    for (const button of buttons) expect(button.textContent).not.toContain("Full");
  });

  it("has one price card, the header's #price, under the film and beside the column", () => {
    renderInitial();
    const asides = document.querySelectorAll('aside[aria-label="Price"]');
    expect(asides).toHaveLength(1);
    expect(asides[0]!.id).toBe("price");
    expect(asides[0]!.textContent).toContain(PTS_INITIAL.priceCard.eyebrow);
    // Visible at every width: in the column below 1280, beside it from there.
    expect(asides[0]!.className).not.toMatch(/(^|\s)hidden(\s|$)/);
    // Right after the hero, before the first section.
    const hero = document.querySelector("h1")!.closest("div.mx-auto")!;
    expect(hero.nextElementSibling).toBe(asides[0]);
    expect(
      screen.getByRole("link", { name: "Start test now - navigation" }).getAttribute("href")
    ).toBe("#price");
    expect(document.querySelectorAll("#price")).toHaveLength(1);
  });

  it("never makes its price card or the sticky bar wait on a reveal", () => {
    renderInitial();
    const moving = ".animate-on-scroll, .animate-on-load";
    for (const el of [
      document.querySelector("#price"),
      screen.getByTestId("pts-sticky-bar"),
      ...screen.getAllByText("€1.99"),
      ...document.querySelectorAll("[data-pts-cta]"),
    ]) {
      expect(el).not.toBeNull();
      expect(el!.closest(moving), el!.outerHTML.slice(0, 90)).toBeNull();
    }
  });

  it("sells the initial report: its offer, at the price it shows", async () => {
    fetchMock.mockReturnValue(
      reply({ state: "redirect", url: "https://checkout.stripe.com/c/pay/cs_test_pre" })
    );
    renderInitial();
    fireEvent.click(cta("price_card"));
    await settle();
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body)).toMatchObject({ offer: "pre", displayedPriceCents: 199 });
    expect(analytics.track).toHaveBeenCalledWith(
      "begin_checkout",
      expect.objectContaining({
        value: 1.99,
        items: [expect.objectContaining({ item_id: "pay_to_start_pre" })],
      })
    );
  });
});
