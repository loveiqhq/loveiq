// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ScrollAnimator from "@features/landing/ui/ScrollAnimator";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const page = () =>
  render(
    <>
      <p data-testid="first" className="animate-on-scroll" />
      <p data-testid="second" className="animate-on-scroll" />
      <ScrollAnimator />
    </>
  );

describe("ScrollAnimator", () => {
  it("reveals each element once it is in view, and then stops watching it", () => {
    const watched = new Set<Element>();
    let report: (entries: { isIntersecting: boolean; target: Element }[]) => void = () => {};
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(callback: typeof report) {
          report = callback;
        }
        observe(el: Element) {
          watched.add(el);
        }
        unobserve(el: Element) {
          watched.delete(el);
        }
        disconnect() {
          watched.clear();
        }
      }
    );
    page();
    const first = screen.getByTestId("first");
    const second = screen.getByTestId("second");
    expect(watched.size).toBe(2);

    act(() =>
      report([
        { isIntersecting: true, target: first },
        { isIntersecting: false, target: second },
      ])
    );
    expect(first.classList.contains("animate")).toBe(true);
    expect(second.classList.contains("animate")).toBe(false);
    expect([...watched]).toEqual([second]);
  });

  it("shows everything at once where there is no IntersectionObserver", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    page();
    expect(screen.getByTestId("first").classList.contains("animate")).toBe(true);
    expect(screen.getByTestId("second").classList.contains("animate")).toBe(true);
  });
});
