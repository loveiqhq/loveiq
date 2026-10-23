// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { findOpenOverlay } from "@features/report/logic/openOverlay";

afterEach(() => {
  document.body.innerHTML = "";
  document.documentElement.style.removeProperty("--liq-consent-h");
});

describe("findOpenOverlay", () => {
  it("is null on a bare page", () => {
    expect(findOpenOverlay(document)).toBeNull();
  });

  it("sees an open dialog, the invite modal and the phone feedback panel", () => {
    document.body.innerHTML = '<div role="dialog" aria-modal="true"></div>';
    expect(findOpenOverlay(document)).toBe("dialog");
    document.body.innerHTML = '<div data-invite-modal=""></div>';
    expect(findOpenOverlay(document)).toBe("invite");
    document.body.innerHTML = '<div class="report-fb__panel report-fb--expanded"></div>';
    expect(findOpenOverlay(document)).toBe("feedback");
  });

  it("ignores a closed dialog that stays in the page", () => {
    document.body.innerHTML = '<div role="dialog"></div>';
    expect(findOpenOverlay(document)).toBeNull();
  });

  it("sees the cookie banner and its settings window", () => {
    document.documentElement.style.setProperty("--liq-consent-h", "120px");
    expect(findOpenOverlay(document)).toBe("cookie_banner");
    document.documentElement.style.setProperty("--liq-consent-h", "0px");
    expect(findOpenOverlay(document)).toBeNull();
    document.body.innerHTML = '<div class="cky-modal cky-modal-open"></div>';
    expect(findOpenOverlay(document)).toBe("cookie_banner");
  });
});
