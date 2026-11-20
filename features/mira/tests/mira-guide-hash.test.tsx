// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import GuideHashScroll from "@features/mira/ui/GuideHashScroll";

describe("GuideHashScroll", () => {
  afterEach(() => {
    cleanup();
    window.history.replaceState(null, "", "/");
    document.body.innerHTML = "";
  });

  it("brings #practice-N to the top without animation on a fresh load", () => {
    const target = document.createElement("h3");
    target.id = "practice-4";
    target.scrollIntoView = vi.fn();
    document.body.appendChild(target);
    window.history.replaceState(null, "", "/mira/guide#practice-4");
    render(<GuideHashScroll />);
    expect(target.scrollIntoView).toHaveBeenCalledWith({ block: "start", behavior: "instant" });
  });

  it("leaves any other hash to the browser", () => {
    const other = document.createElement("h2");
    other.id = "sources";
    other.scrollIntoView = vi.fn();
    document.body.appendChild(other);
    window.history.replaceState(null, "", "/mira/guide#sources");
    render(<GuideHashScroll />);
    expect(other.scrollIntoView).not.toHaveBeenCalled();
  });
});
