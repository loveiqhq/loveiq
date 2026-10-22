// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const analytics = vi.hoisted(() => ({
  track: vi.fn(),
  pingFunnelEvent: vi.fn(),
  trackReportPurchase: vi.fn(),
  gtagQueueSettled: vi.fn(() => Promise.resolve()),
  getGaMeasurementContext: vi.fn(() => ({ clientId: null, sessionId: null, consent: false })),
}));
vi.mock("@features/analytics/client", () => analytics);
vi.mock("posthog-js", () => ({ default: { register_for_session: vi.fn() } }));
vi.mock("@shared/http/csrf-client", () => ({ getCsrfToken: () => "csrf-token" }));
vi.mock("@shared/url/utm", () => ({ getStoredUtm: () => null }));

import { PAY_TO_START_PAUSED_MESSAGE } from "@features/pay-to-start/logic/api";
import { STATUS_PREVIEWS, type StatusPreview } from "@features/pay-to-start/logic/statusPreview";
import { PtsCheckoutProvider } from "@features/pay-to-start/ui/landing/PtsCheckout";
import { PTS_STATUS } from "@features/pay-to-start/ui/landing/payToStartContent";
import {
  PayToStartStatusPage,
  __resetArrivalSessionForTests,
} from "@features/pay-to-start/ui/status/PayToStartStatusPage";

const SESSION = "cs_test_a1B2c3D4e5F6g7H8";
const purchase = {
  value: 29,
  currency: "EUR",
  transaction_id: SESSION,
  item_name: "LoveIQ Survey & Report",
  isTest: false,
};

const assign = vi.fn();
const replace = vi.fn();
const replaceState = vi.fn();
const fetchMock = vi.fn();
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
      replace,
      reload: vi.fn(),
    },
  });
}

const json = (body: unknown, status = 200) =>
  Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
  );

function renderStatus() {
  return render(
    <PtsCheckoutProvider offer="full" priceCents={2900} price="€29">
      <PayToStartStatusPage />
    </PtsCheckoutProvider>
  );
}

/** Lets the pending fetch and its json() resolve. */
async function flush() {
  await act(async () => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  });
}

const copy = () => document.querySelector(".checkout-return__copy")?.textContent;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: false, toFake: ["setTimeout", "clearTimeout"] });
  __resetArrivalSessionForTests();
  window.sessionStorage.clear();
  originalLocation = window.location;
  setLocation(`https://www.loveiq.org/sexual-archetype/checkout?session_id=${SESSION}`);
  vi.spyOn(window.history, "replaceState").mockImplementation(replaceState);
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
});

describe("the checkout status page", () => {
  it("verifies first, as Figma 08", () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    renderStatus();
    expect(copy()).toBe(PTS_STATUS.verifying);
    expect(
      screen.getByRole("link", { name: PTS_STATUS.returnToLanding }).getAttribute("href")
    ).toBe("/sexual-archetype");
    expect(screen.getByRole("link", { name: /Back to Landing Page/ })).toBeTruthy();
  });

  it("asks about the session in the address, then takes it out of the address", async () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    renderStatus();
    await flush();
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/stripe/pay-to-start/status?session_id=${SESSION}`,
      { cache: "no-store" }
    );
    expect(replaceState).toHaveBeenCalledWith(
      window.history.state,
      "",
      "/sexual-archetype/checkout"
    );
    expect(window.sessionStorage.getItem("pts-checkout-session")).toBe(SESSION);
  });

  it("keeps working after a reload in the same tab", async () => {
    window.sessionStorage.setItem("pts-checkout-session", SESSION);
    setLocation("https://www.loveiq.org/sexual-archetype/checkout");
    fetchMock.mockReturnValue(new Promise(() => {}));
    renderStatus();
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(replaceState).not.toHaveBeenCalled();
  });

  it("says so when there is no session, and asks nothing", async () => {
    setLocation("https://www.loveiq.org/sexual-archetype/checkout?session_id=not-a-session");
    renderStatus();
    await flush();
    expect(copy()).toBe(PTS_STATUS.missing);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(analytics.track).toHaveBeenCalledWith("pts_status_viewed", { state: "missing" });
  });

  it("reports a paid purchase once and opens the survey, as Figma 10", async () => {
    fetchMock.mockReturnValue(json({ state: "paid", purchase }));
    renderStatus();
    await flush();
    expect(copy()).toBe(`${PTS_STATUS.completeLead}${PTS_STATUS.completeRest}`);
    expect(screen.getByRole("link", { name: PTS_STATUS.goToSurvey }).getAttribute("href")).toBe(
      "/survey"
    );
    expect(analytics.trackReportPurchase).toHaveBeenCalledTimes(1);
    expect(analytics.trackReportPurchase).toHaveBeenCalledWith({
      ...purchase,
      journey: "pay_to_start",
    });
    expect(analytics.track).toHaveBeenCalledWith("pts_status_viewed", { state: "paid" });

    expect(replace).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1_200);
    });
    await flush();
    expect(replace).toHaveBeenCalledWith("https://www.loveiq.org/survey");
  });

  it("leaves for the survey only once Google's tag has taken the purchase", async () => {
    // gtag.js loads late on a page Stripe just returned to; until then the purchase waits
    // in the page's memory, and a full-page load throws it away with the Ads sale.
    let sent!: () => void;
    analytics.gtagQueueSettled.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        sent = resolve;
      })
    );
    fetchMock.mockReturnValue(json({ state: "paid", purchase }));
    renderStatus();
    await flush();
    act(() => {
      vi.advanceTimersByTime(1_200);
    });
    await flush();
    expect(analytics.gtagQueueSettled).toHaveBeenCalledWith(3_000);
    expect(replace).not.toHaveBeenCalled();
    sent();
    await flush();
    expect(replace).toHaveBeenCalledWith("https://www.loveiq.org/survey");
  });

  it("waits on a payment that is still settling, as Figma 09, and keeps asking", async () => {
    fetchMock
      .mockReturnValueOnce(json({ state: "processing" }))
      .mockReturnValueOnce(json({ state: "processing" }))
      .mockReturnValueOnce(json({ state: "paid", purchase }));
    renderStatus();
    await flush();
    expect(copy()).toBe(PTS_STATUS.received);
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    await flush();
    expect(copy()).toBe(PTS_STATUS.received);
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(copy()).toContain(PTS_STATUS.completeLead);
  });

  it("stops asking after fifteen tries and says the email will follow", async () => {
    fetchMock.mockImplementation(() => json({ state: "processing" }));
    renderStatus();
    await flush();
    for (let i = 0; i < 14; i += 1) {
      act(() => {
        vi.advanceTimersByTime(2_000);
      });
      await flush();
    }
    expect(fetchMock).toHaveBeenCalledTimes(15);
    expect(copy()).toBe(PTS_STATUS.slow);
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(15);
    expect(analytics.track).toHaveBeenCalledWith("pts_status_viewed", { state: "timeout" });
  });

  it("says nothing was charged when the payment failed, and offers to start again", async () => {
    fetchMock
      .mockReturnValueOnce(json({ state: "failed" }))
      .mockReturnValueOnce(json({ state: "redirect", url: "https://checkout.stripe.com/c/pay/x" }));
    renderStatus();
    await flush();
    expect(copy()).toBe(PTS_STATUS.failed);

    fireEvent.click(screen.getByRole("button", { name: PTS_STATUS.startAgain }));
    await flush();
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe("/api/stripe/pay-to-start");
    expect(JSON.parse(init.body)).toMatchObject({ offer: "full", displayedPriceCents: 2900 });
    expect(assign).toHaveBeenCalledWith("https://checkout.stripe.com/c/pay/x");
    expect(analytics.track).toHaveBeenCalledWith("pts_cta_click", {
      location: "status_retry",
      price_cents: 2900,
    });
  });

  it("opens the report when the purchase was already used", async () => {
    fetchMock.mockReturnValue(json({ state: "used", reportPath: "/report/rpt_abc", purchase }));
    renderStatus();
    await flush();
    expect(screen.getByRole("link", { name: PTS_STATUS.openReport }).getAttribute("href")).toBe(
      "/report/rpt_abc"
    );
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(replace).not.toHaveBeenCalled();
  });

  it("offers no new checkout once the purchase was used, when it cannot open the report", async () => {
    fetchMock.mockReturnValue(json({ state: "used", reportPath: null, purchase }));
    renderStatus();
    await flush();
    expect(copy()).toBe(PTS_STATUS.usedNoReport);
    expect(screen.queryByRole("button", { name: PTS_STATUS.startAgain })).toBeNull();
    expect(screen.getByRole("link", { name: PTS_STATUS.returnToLanding })).toBeTruthy();
  });

  it("says a refund no longer unlocks anything", async () => {
    fetchMock.mockReturnValue(json({ state: "refunded" }));
    renderStatus();
    await flush();
    expect(copy()).toBe(PTS_STATUS.refunded);
    expect(analytics.trackReportPurchase).not.toHaveBeenCalled();
  });

  it("retries a failing status check twice before saying so", async () => {
    fetchMock.mockImplementation(() => json({ error: "Unable to check payment." }, 500));
    renderStatus();
    await flush();
    expect(copy()).toBe(PTS_STATUS.verifying);
    for (let i = 0; i < 2; i += 1) {
      act(() => {
        vi.advanceTimersByTime(2_000);
      });
      await flush();
    }
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(copy()).toBe(PTS_STATUS.error);
  });
});

describe("the checkout status page's preview (off production)", () => {
  function renderPreview(preview: StatusPreview) {
    return render(
      <PtsCheckoutProvider offer="full" priceCents={2900} price="€29">
        <PayToStartStatusPage preview={preview} />
      </PtsCheckoutProvider>
    );
  }

  it("shows every state without asking, reporting or redirecting", async () => {
    const expected: Record<StatusPreview, string> = {
      verifying: PTS_STATUS.verifying,
      received: PTS_STATUS.received,
      complete: `${PTS_STATUS.completeLead}${PTS_STATUS.completeRest}`,
      used: `${PTS_STATUS.completeLead}${PTS_STATUS.usedRest}`,
      used_no_report: PTS_STATUS.usedNoReport,
      failed: PTS_STATUS.failed,
      refunded: PTS_STATUS.refunded,
      slow: PTS_STATUS.slow,
      unknown: PTS_STATUS.unknown,
      error: PTS_STATUS.error,
      missing: PTS_STATUS.missing,
      paused: PAY_TO_START_PAUSED_MESSAGE,
    };
    for (const [state] of STATUS_PREVIEWS) {
      renderPreview(state);
      await flush();
      expect(copy(), state).toBe(expected[state]);
      act(() => {
        vi.advanceTimersByTime(5_000);
      });
      cleanup();
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(replaceState).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    expect(analytics.track).not.toHaveBeenCalled();
    expect(analytics.trackReportPurchase).not.toHaveBeenCalled();
  });

  it("links every state, marking the one shown", () => {
    renderPreview("refunded");
    const nav = screen.getByRole("navigation", { name: "Status previews" });
    const links = [...nav.querySelectorAll("a")];
    expect(links.map((a) => a.getAttribute("href"))).toEqual(
      STATUS_PREVIEWS.map(([state]) => `?preview=${state}`)
    );
    expect(nav.querySelector('[aria-current="page"]')?.textContent).toBe("Refunded");
  });

  it("draws no switcher outside a preview", () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    renderStatus();
    expect(screen.queryByRole("navigation", { name: "Status previews" })).toBeNull();
  });
});

describe("the checkout status page for the initial report", () => {
  beforeEach(() => {
    setLocation(`https://www.loveiq.org/sexual-archetype/checkout?session_id=${SESSION}&offer=pre`);
  });

  it("leads back to the page the buyer paid on, and keeps the offer in the address", async () => {
    fetchMock.mockReturnValueOnce(json({ state: "failed" }));
    render(
      <PtsCheckoutProvider offer="pre" priceCents={199} price="€1.99">
        <PayToStartStatusPage />
      </PtsCheckoutProvider>
    );
    await flush();
    for (const link of screen.getAllByRole("link")) {
      expect(link.getAttribute("href")).toBe("/sexual-archetype/initial");
    }
    expect(replaceState.mock.calls[0]?.[2]).toBe("/sexual-archetype/checkout?offer=pre");
  });

  it("keeps the offer in the preview's switcher, and its report opens as the offer does", () => {
    render(
      <PtsCheckoutProvider offer="pre" priceCents={199} price="€1.99">
        <PayToStartStatusPage preview="used" />
      </PtsCheckoutProvider>
    );
    const nav = screen.getByRole("navigation", { name: "Status previews" });
    for (const link of nav.querySelectorAll("a")) {
      expect(link.getAttribute("href")).toMatch(/^\?preview=\w+&offer=pre$/);
    }
    expect(screen.getByRole("link", { name: PTS_STATUS.openReport }).getAttribute("href")).toBe(
      "/report?preview=1&v4=1&plan=initial"
    );
  });
});
