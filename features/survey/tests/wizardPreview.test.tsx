// @vitest-environment jsdom
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { vi, describe, it, expect, afterEach } from "vitest";

vi.mock("next/image", () => ({
  default: ({
    alt = "",
    unoptimized: _unoptimized,
    ...props
  }: Record<string, unknown> & { alt?: string; unoptimized?: boolean }) => (
    // eslint-disable-next-line @next/next/no-img-element -- test-only mock for next/image
    <img {...props} alt={alt} />
  ),
}));

const analytics = vi.hoisted(() => ({
  trackWizardSlideAdvanced: vi.fn(),
  trackWizardMapStep: vi.fn(),
}));
vi.mock("@features/analytics/client", () => analytics);

const navigation = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("next/navigation", () => navigation);

import WizardPreviewPage from "@/app/wizard-preview/page";
import WizardPreviewClient from "@/app/wizard-preview/WizardPreviewClient";

/**
 * /wizard-preview — the pre-report wizard on its own page (Mark, sync 01.10: "an
 * individual staging link just for the wizard"; Fatih: local links to test before
 * staging). The real flow only reaches it after a survey is submitted.
 */
const heading = () => screen.getByRole("heading", { level: 2 }).textContent;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  cleanup();
  analytics.trackWizardSlideAdvanced.mockClear();
  analytics.trackWizardMapStep.mockClear();
});

describe("/wizard-preview", () => {
  it("404s on the live site", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.loveiq.org");
    expect(() => WizardPreviewPage()).toThrow("NEXT_NOT_FOUND");
  });

  it("404s where it cannot tell it is off production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    expect(() => WizardPreviewPage()).toThrow("NEXT_NOT_FOUND");
  });

  it("renders the wizard on staging", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://staging.loveiq.org");
    render(WizardPreviewPage());
    expect(heading()).toBe("A note before you explore your report.");
  });

  it("starts over when the wizard ends, and tracks nothing", () => {
    vi.useFakeTimers();
    render(<WizardPreviewClient />);
    fireEvent.click(screen.getByRole("button", { name: /continue to next slide/i }));
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(heading()).toBe("6 Parts, 20 Chapters");
    // SKIP INTRO ends the wizard; the real flow would open the report.
    fireEvent.click(screen.getByRole("button", { name: /skip intro/i }));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(heading()).toBe("A note before you explore your report.");
    expect(analytics.trackWizardSlideAdvanced).not.toHaveBeenCalled();
    expect(analytics.trackWizardMapStep).not.toHaveBeenCalled();
  });
});
