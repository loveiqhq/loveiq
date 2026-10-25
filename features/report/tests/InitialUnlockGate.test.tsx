// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockTrackViewed = vi.fn();
const mockTrackCta = vi.fn();
const mockTrackBack = vi.fn();
const mockTrackBeginCheckout = vi.fn();
const mockSetContext = vi.fn();
vi.mock("@features/analytics/client", () => ({
  trackInitialGateViewed: (...args: unknown[]) => mockTrackViewed(...args),
  trackInitialGateCta: (...args: unknown[]) => mockTrackCta(...args),
  trackInitialGateBack: (...args: unknown[]) => mockTrackBack(...args),
  trackBeginCheckout: (...args: unknown[]) => mockTrackBeginCheckout(...args),
  setReportSubmissionContext: (...args: unknown[]) => mockSetContext(...args),
  getGaMeasurementContext: () => ({ clientId: "123.456", sessionId: "789", consent: true }),
}));
vi.mock("posthog-js", () => ({ default: { capture: vi.fn() } }));
vi.mock("@shared/http/csrf-client", () => ({ getCsrfToken: () => "csrf-token" }));

import InitialUnlockGate from "@features/report/ui/gate/InitialUnlockGate";
import type { InitialUnlockGatePayload } from "@features/report/logic/initialUnlockGate";
import { titleCase } from "@features/report/logic/titleCase";

const GATE: InitialUnlockGatePayload = {
  gate: "initial_unlock",
  priceCents: 199,
  currency: "EUR",
  creditCents: 1000,
  guaranteeDays: 14,
  reportToken: "rpt_abcdefghij0123456789",
  submissionId: 55,
  viewMode: "owner",
};

/** What every IntersectionObserver on the page watches, so a test can say what is in view. */
const observers: Array<{ callback: IntersectionObserverCallback; targets: Element[] }> = [];
class FakeIntersectionObserver {
  readonly root = null;
  readonly rootMargin = "0px";
  readonly thresholds = [0];
  readonly targets: Element[] = [];
  constructor(readonly callback: IntersectionObserverCallback) {
    observers.push(this);
  }
  observe(target: Element) {
    this.targets.push(target);
  }
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}
function setMotion(reduce: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: reduce && query.includes("prefers-reduced-motion: reduce"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  );
}

const assign = vi.fn();
const reload = vi.fn();
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
function setReferrer(referrer: string) {
  Object.defineProperty(document, "referrer", { configurable: true, value: referrer });
}

const fetchMock = vi.fn();
function reply(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
  );
}

const renderGate = (gate: InitialUnlockGatePayload = GATE) =>
  render(<InitialUnlockGate gate={gate} reportToken={gate.reportToken} reportSessionId={null} />);

/** The visible text of the page, whitespace collapsed (React splits runs into nodes). */
const pageText = () => (document.body.textContent ?? "").replace(/\s+/g, " ");
const cardCta = () => screen.getByRole("button", { name: /^unlock now/i });
const stickyCta = () => screen.getByRole("button", { name: /^unlock for/i });
const stickyBar = () => document.querySelector<HTMLElement>("[data-testid='iug-sticky']")!;

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  observers.length = 0;
  originalLocation = window.location;
  setLocation(`https://www.loveiq.org/report/${GATE.reportToken}`);
  setReferrer("");
  setMotion(false);
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
});

describe("the EUR 1.99 gate, as drawn (Figma 1604:2374, 1650:2667)", () => {
  it("says what was found and what it costs to see it", () => {
    renderGate();
    const text = pageText();
    for (const line of [
      "Your Core Archetype was determined",
      "Built from your Answers",
      "Your Personal Results",
      "Find out your core archetype constellation",
      "€1.99",
      "one time payment",
      "14-day money-back guarantee.",
      "Your Core Archetype and what drives it",
      "How you rank against all 14 archetypes",
      "4x full chapters + 4x partly open",
      "€10 credit toward the Premium Report",
      "Guaranteed Safe & Secure Checkout",
    ]) {
      expect(text).toContain(line);
    }
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Find Out Your Sexual Archetypes"
    );
    expect(cardCta()).toBeInTheDocument();
  });

  it("pitches the chapters, and why to unlock, in the frame's words", () => {
    renderGate();
    const text = pageText();
    for (const line of [
      "The Questions Your Report Answers.",
      "Start with who you are.",
      "Your Core Archetype, your constellation and how this report was built.",
      "PARTLY OPEN",
      "Which rules about sex did you never agree to?",
      "What turns you on, and what shuts you down?",
      "Where do you and your partners keep missing each other?",
      "Which fantasies belong in your head, and which in your bed?",
      "Why Unlock Your Archetype?",
      "Money-Back Guarantee. Zero Risk.",
      "Learn about your Core Archetype. If it doesn’t land, every cent back, no questions asked.",
      "Your Core Archetype, Explained.",
      "Which archetype leads for you and what that means for your desire and your relationships.",
      "Insights From Hundreds of Research Papers and Books.",
      "Your Archetype is based on insights from hundreds of scientific papers and leading books on sexuality.",
      "Become an Expert Around Your Sexuality",
      "Real People Love & Appreciate Our Insights.",
      "Dorian, 34",
      "Marija Mustapić, 41",
      "14-day money-back",
      "Guaranteed, no questions asked.",
      "Unlock for €1.99 now",
    ]) {
      expect(text).toContain(line);
    }
  });

  it("never promises 7 days: the guarantee is 14", () => {
    renderGate();
    expect(pageText()).not.toMatch(/7-day/);
  });

  it("prints the price, the credit and the guarantee it is sent, not its own", () => {
    renderGate({ ...GATE, priceCents: 249, creditCents: 500, guaranteeDays: 30 });
    const text = pageText();
    expect(text).toContain("€2.49");
    expect(text).toContain("Unlock for €2.49 now");
    expect(text).toContain("€5 credit toward the Premium Report");
    expect(text).toContain("30-day money-back guarantee.");
    expect(text).not.toContain("€1.99");
  });

  it("sets every heading in the report's 02.10 heading case", () => {
    renderGate();
    const headings = screen.getAllByRole("heading").map((h) => h.textContent ?? "");
    expect(headings.length).toBeGreaterThanOrEqual(5);
    for (const heading of headings) expect(heading).toBe(titleCase(heading));
  });
});

describe("the chapter map", () => {
  const row = (id: string) => document.querySelector<HTMLElement>(`[data-iug-chapter="${id}"]`);

  it("lists today's chapters, each as EUR 1.99 opens it", () => {
    renderGate();
    expect(row("introduction")?.dataset.access).toBe("in_full");
    expect(row("core_archetype")?.dataset.access).toBe("in_full");
    expect(row("constellation")?.dataset.access).toBe("in_full");
    expect(row("typical_beliefs")?.dataset.access).toBe("partly_open");
    expect(row("typical_sexual_fantasy_amp_practice_tendencies")?.dataset.access).toBe(
      "partly_open"
    );
    expect(row("attachment_style")?.dataset.access).toBe("locked");
    expect(row("recommendations")?.dataset.access).toBe("locked");
  });

  it("names no chapter the report has dropped", () => {
    renderGate();
    expect(pageText()).not.toContain("Core Insecurities");
    expect(pageText()).not.toContain("Arousal Style");
  });
});

describe("unlocking", () => {
  it("starts the EUR 1.99 checkout from the card and goes to Stripe", async () => {
    fetchMock.mockReturnValue(
      reply({ enabled: true, url: "https://checkout.stripe.com/c/pay/cs_1" })
    );
    renderGate();
    fireEvent.click(cardCta());
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/stripe/initial-unlock");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["x-csrf-token"]).toBe("csrf-token");
    expect(JSON.parse(String(init.body))).toEqual({
      reportToken: GATE.reportToken,
      reportSessionId: null,
      gaClientId: "123.456",
      gaConsent: true,
      gaSessionId: "789",
    });
    expect(assign).toHaveBeenCalledWith("https://checkout.stripe.com/c/pay/cs_1");
    expect(mockTrackCta).toHaveBeenCalledWith({ place: "card" });
    expect(mockTrackBeginCheckout).toHaveBeenCalledWith("initial", 1.99, "EUR");
  });

  it("starts it from the sticky bar too, and says so", async () => {
    fetchMock.mockReturnValue(
      reply({ enabled: true, url: "https://checkout.stripe.com/c/pay/cs_2" })
    );
    renderGate();
    fireEvent.click(stickyCta());
    await settle();
    expect(mockTrackCta).toHaveBeenCalledWith({ place: "sticky" });
    expect(assign).toHaveBeenCalledWith("https://checkout.stripe.com/c/pay/cs_2");
  });

  it("reloads into the report when the server says it is already unlocked", async () => {
    fetchMock.mockReturnValue(reply({ error: "already_unlocked" }, 409));
    renderGate();
    fireEvent.click(cardCta());
    await settle();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(assign).not.toHaveBeenCalled();
  });

  it("says a server failure in words a reader can use, and lets them try again", async () => {
    fetchMock.mockReturnValue(reply({ error: "Unable to process request." }, 500));
    renderGate();
    fireEvent.click(cardCta());
    await settle();
    expect(screen.getByRole("alert").textContent).toBe(
      "We couldn't prepare secure checkout right now. Please try again."
    );
    expect(cardCta()).not.toBeDisabled();
  });

  it("passes on what a 4xx says", async () => {
    fetchMock.mockReturnValue(reply({ error: "Please try again later." }, 429));
    renderGate();
    fireEvent.click(cardCta());
    await settle();
    expect(screen.getByRole("alert").textContent).toBe("Please try again later.");
  });

  it("starts one checkout however often the button is pressed", async () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    renderGate();
    fireEvent.click(cardCta());
    fireEvent.click(cardCta());
    fireEvent.click(stickyCta());
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("is ready again when the reader comes back from Stripe with the back button", async () => {
    fetchMock.mockReturnValue(
      reply({ enabled: true, url: "https://checkout.stripe.com/c/pay/cs_3" })
    );
    renderGate();
    fireEvent.click(cardCta());
    await settle();
    expect(cardCta()).toBeDisabled();
    act(() => {
      window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
    });
    expect(cardCta()).not.toBeDisabled();
  });
});

describe("around the card", () => {
  // Sync 23.10 (Marcus and Fatih): "the call to action should be sticky immediately".
  it("pins the sticky bar from the first paint, beside the card's own button", () => {
    renderGate();
    expect(stickyBar()).not.toHaveAttribute("aria-hidden");
    expect(stickyBar()).not.toHaveAttribute("inert");
    expect(stickyCta()).toBeEnabled();
    expect(cardCta()).toBeEnabled();
  });

  it("has no back arrow for a reader who came from anywhere but the survey", () => {
    setReferrer("https://mail.google.com/");
    renderGate();
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
  });

  it("goes back to the survey's last screen with the back arrow", () => {
    setReferrer("https://www.loveiq.org/survey?step=done");
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    renderGate();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(back).toHaveBeenCalledTimes(1);
    expect(mockTrackBack).toHaveBeenCalledTimes(1);
  });

  it("counts the gate as seen once, for this reader", () => {
    const { rerender } = renderGate();
    rerender(
      <InitialUnlockGate gate={GATE} reportToken={GATE.reportToken} reportSessionId={null} />
    );
    expect(mockSetContext).toHaveBeenCalledWith(55);
    expect(mockTrackViewed).toHaveBeenCalledTimes(1);
    expect(mockTrackViewed).toHaveBeenCalledWith({ submission_id: 55 });
  });

  it("fills a progress bar before the badge, unless the reader asks for less motion", () => {
    renderGate();
    expect(document.querySelector("[data-testid='iug-progress']")).not.toBeNull();
    cleanup();
    setMotion(true);
    renderGate();
    expect(document.querySelector("[data-testid='iug-progress']")).toBeNull();
    expect(pageText()).toContain("Your Core Archetype was determined");
  });
});
