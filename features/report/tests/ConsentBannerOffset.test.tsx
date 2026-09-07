// @vitest-environment jsdom
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import ConsentBannerOffset from "@shared/ui/ConsentBannerOffset";

/**
 * The defect this guards: CookieYes pins a 316px banner to the bottom of a phone
 * viewport at z-index 9999999, and the report's sticky "Unlock full report" bar
 * sits underneath it — invisible and untappable until consent is answered.
 *
 * jsdom does no layout, so the banner's geometry is stubbed. What is under test
 * is the DECISION — "is something covering the bottom edge, and how tall is it"
 * — not the measurement, which the browser does.
 */
function makeBanner({ height, bottom }: { height: number; bottom: number }) {
  const el = document.createElement("div");
  el.className = "cky-consent-container";
  el.getBoundingClientRect = () =>
    ({
      height,
      width: 400,
      top: bottom - height,
      bottom,
      left: 0,
      right: 400,
      x: 0,
      y: bottom - height,
      toJSON: () => ({}),
    }) as DOMRect;
  return el;
}

const offset = () => document.documentElement.style.getPropertyValue("--liq-consent-h");

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  document.documentElement.style.removeProperty("--liq-consent-h");
});

describe("ConsentBannerOffset", () => {
  it("publishes the height of a banner pinned to the bottom edge", async () => {
    // jsdom's default window.innerHeight is 768.
    document.body.appendChild(makeBanner({ height: 316, bottom: 768 }));
    render(<ConsentBannerOffset />);
    await waitFor(() => expect(offset()).toBe("316px"));
  });

  it("reports 0px when no banner is present", async () => {
    render(<ConsentBannerOffset />);
    await waitFor(() => expect(offset()).toBe("0px"));
  });

  it("ignores an overlay that is not against the bottom edge", async () => {
    // A centred consent modal must not shove the unlock bar up the screen.
    document.body.appendChild(makeBanner({ height: 300, bottom: 500 }));
    render(<ConsentBannerOffset />);
    await waitFor(() => expect(offset()).toBe("0px"));
  });

  it("clamps a banner taller than the space above it", async () => {
    // jsdom innerHeight is 768, so the clamp is 60% = 460px.
    document.body.appendChild(makeBanner({ height: 700, bottom: 768 }));
    render(<ConsentBannerOffset />);
    await waitFor(() => expect(offset()).toBe("460px"));
  });

  it("drops back to 0px once the banner is dismissed", async () => {
    const banner = makeBanner({ height: 316, bottom: 768 });
    document.body.appendChild(banner);
    render(<ConsentBannerOffset />);
    await waitFor(() => expect(offset()).toBe("316px"));

    banner.remove();
    await waitFor(() => expect(offset()).toBe("0px"));
  });
});
