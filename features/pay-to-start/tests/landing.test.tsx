// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const analytics = vi.hoisted(() => ({
  track: vi.fn(),
  pingFunnelEvent: vi.fn(),
  getGaMeasurementContext: vi.fn(() => ({ clientId: "111.222", sessionId: "333", consent: true })),
}));
vi.mock("@features/analytics/client", () => analytics);
const posthog = vi.hoisted(() => ({
  register_for_session: vi.fn(),
  get_property: vi.fn(),
  get_distinct_id: vi.fn(),
}));
vi.mock("posthog-js", () => ({ default: posthog }));
vi.mock("@shared/http/csrf-client", () => ({ getCsrfToken: () => "csrf-token" }));
vi.mock("@shared/url/utm", () => ({ getStoredUtm: () => '{"utm_source":"google"}' }));

import { PayToStartLanding } from "@features/pay-to-start/ui/landing/PayToStartLanding";
import { __resetArrivalNoticeForTests } from "@features/pay-to-start/ui/landing/PtsNotice";
import {
  PTS_BREADCRUMB,
  PTS_FAQ,
  PTS_FIND_OUT,
  PTS_FINAL_CTA,
  PTS_FOOTER,
  PTS_HERO,
  PTS_HOW_IT_WORKS,
  PTS_INSIDE,
  PTS_NOTICES,
  PTS_ONE_PRICE,
  PTS_PERSONALITIES,
  PTS_PRICE_CARD,
  PTS_RESEARCH,
  PTS_TESTIMONIALS,
} from "@features/pay-to-start/ui/landing/payToStartContent";

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
  it("prints every line of Figma's copy", () => {
    renderPage();
    const text = pageText();
    const price = "€29";
    const expected = [
      ...PTS_BREADCRUMB,
      PTS_HERO.badge,
      PTS_HERO.title,
      PTS_HERO.lead,
      PTS_HERO.takers,
      PTS_HERO.length,
      PTS_FIND_OUT.title,
      PTS_FIND_OUT.lead,
      ...PTS_FIND_OUT.cards.flatMap((c) => [c.title, c.body]),
      PTS_INSIDE.title,
      PTS_INSIDE.lead(price),
      ...PTS_INSIDE.chapters.flatMap((c) => [c.title, c.body]),
      PTS_INSIDE.sample.label,
      PTS_INSIDE.sample.title,
      ...PTS_INSIDE.sample.beliefs.flatMap((b) => [b.from, b.to]),
      PTS_INSIDE.sample.caption,
      PTS_PERSONALITIES.title,
      PTS_PERSONALITIES.lead,
      ...PTS_PERSONALITIES.archetypes.flatMap((a) => [a.name, a.motto]),
      PTS_HOW_IT_WORKS.title,
      ...PTS_HOW_IT_WORKS.steps.flatMap((s) => [s.title, s.body(price)]),
      PTS_TESTIMONIALS.title,
      ...PTS_TESTIMONIALS.quotes.flatMap((q) => [q.quote, q.name, q.role]),
      PTS_RESEARCH.title,
      PTS_RESEARCH.lead,
      ...PTS_RESEARCH.stats.flatMap((s) => [s.value, s.label, s.body]),
      ...PTS_RESEARCH.experts.flatMap((e) => [e.quote, e.name, e.role]),
      PTS_ONE_PRICE.title,
      PTS_ONE_PRICE.terms,
      ...PTS_ONE_PRICE.includes,
      `${PTS_ONE_PRICE.guaranteeLead}${PTS_ONE_PRICE.guaranteeRest}`,
      PTS_FAQ.title,
      ...PTS_FAQ.items.flatMap((i) => [i.question, i.answer]),
      `${PTS_FAQ.disclaimerBefore}${PTS_FAQ.disclaimerBold}${PTS_FAQ.disclaimerAfter}`,
      PTS_PRICE_CARD.eyebrow,
      PTS_PRICE_CARD.guarantee,
      ...PTS_PRICE_CARD.includes,
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

  it("keeps the testimonial Figma sets without quotation marks without them", () => {
    renderPage();
    const first = screen.getByText(PTS_TESTIMONIALS.quotes[0].quote);
    expect(first.textContent?.startsWith("“")).toBe(false);
    expect(screen.getByText(PTS_TESTIMONIALS.quotes[1].quote).textContent?.startsWith("“")).toBe(
      true
    );
  });

  it("prints every price from the server's price, never a fixed one", () => {
    renderPage(1999);
    const text = pageText();
    expect(text).not.toContain("€29");
    expect(text).toContain("All of it is included in €19.99;");
    expect(text).toContain("€19.99, paid securely with Apple Pay");
    expect(text).toContain("€19.99, one-time.");
    expect(text).toContain("Unlock survey & report · €19.99");
    expect(text).toContain("Unlock for €19.99");
    // The price card, the One price band and the sticky bar.
    expect(screen.getAllByText("€19.99")).toHaveLength(3);
  });

  it("has no Log in, and its breadcrumb links nowhere", () => {
    renderPage();
    expect(screen.queryByText(/log in/i)).toBeNull();
    const crumbs = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(crumbs).queryAllByRole("link")).toHaveLength(0);
    expect(within(crumbs).getByText(PTS_BREADCRUMB[2]).getAttribute("aria-current")).toBe("page");
  });

  it("links only the legal pages, and nothing into the free funnel", () => {
    renderPage();
    const hrefs = [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href"));
    expect(hrefs.sort()).toEqual(PTS_FOOTER.links.map((l) => l.href).sort());
    expect(hrefs).not.toContain("/survey");
    expect(hrefs).not.toContain("/");
  });

  it("carries the search ad's sitelink anchors", () => {
    renderPage();
    for (const id of ["inside-your-report", "personalities", "reviews"]) {
      expect(document.getElementById(id)).not.toBeNull();
    }
  });

  it("opens every answer, as Figma draws them", () => {
    renderPage();
    const details = document.querySelectorAll("details");
    expect(details).toHaveLength(PTS_FAQ.items.length);
    for (const d of details) expect(d.open).toBe(true);
  });

  it("names no video file before the play button is pressed", () => {
    renderPage();
    const video = screen.getByTestId("pts-hero-video") as HTMLVideoElement;
    expect(video.getAttribute("src")).toBeNull();
    expect(video.getAttribute("preload")).toBe("none");
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
