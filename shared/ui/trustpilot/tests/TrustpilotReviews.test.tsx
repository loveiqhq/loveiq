// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Consent reader is mocked so we can flip consent per test.
let consentGranted = false;
vi.mock("@features/analytics/client", () => ({
  hasCookieYesConsent: () => consentGranted,
}));

import TrustpilotReviews from "@shared/ui/trustpilot/TrustpilotReviews";

const BU_ID = "NEXT_PUBLIC_TRUSTPILOT_BUSINESS_UNIT_ID";

afterEach(() => {
  cleanup();
  consentGranted = false;
  delete process.env[BU_ID];
  delete process.env.NEXT_PUBLIC_TRUSTPILOT_DOMAIN;
  delete (window as unknown as { Trustpilot?: unknown }).Trustpilot;
  vi.restoreAllMocks();
});

describe("TrustpilotReviews", () => {
  it("always renders the cookieless static block — no env, no consent", () => {
    render(<TrustpilotReviews variant="carousel" />);
    expect(screen.getByText("Excellent")).toBeInTheDocument();
    expect(screen.getByText(/see our reviews on trustpilot/i)).toBeInTheDocument();
    // No live (cookie-setting) widget element when unconfigured.
    expect(document.querySelector(".trustpilot-widget")).toBeNull();
  });

  it("hides the profile link when showProfileLink is false", () => {
    render(<TrustpilotReviews variant="compact" showProfileLink={false} />);
    expect(screen.getByText("Excellent")).toBeInTheDocument();
    expect(screen.queryByText(/see our reviews on trustpilot/i)).not.toBeInTheDocument();
  });

  it("renders the live widget element only when a Business Unit ID is configured", () => {
    process.env[BU_ID] = "abc123";
    render(<TrustpilotReviews variant="carousel" />);
    const widget = document.querySelector(".trustpilot-widget");
    expect(widget).not.toBeNull();
    expect(widget?.getAttribute("data-businessunit-id")).toBe("abc123");
    // Static block remains until the live widget paints its iframe.
    expect(screen.getByText("Excellent")).toBeInTheDocument();
  });

  it("does NOT initialize Trustpilot without consent, even when configured", () => {
    process.env[BU_ID] = "abc123";
    const loadFromElement = vi.fn();
    (window as unknown as { Trustpilot: unknown }).Trustpilot = { loadFromElement };
    render(<TrustpilotReviews variant="carousel" />);
    expect(loadFromElement).not.toHaveBeenCalled();
  });

  it("initializes Trustpilot once consent is granted and configured", () => {
    process.env[BU_ID] = "abc123";
    consentGranted = true;
    const loadFromElement = vi.fn();
    (window as unknown as { Trustpilot: unknown }).Trustpilot = { loadFromElement };
    render(<TrustpilotReviews variant="carousel" />);
    expect(loadFromElement).toHaveBeenCalled();
  });
});
