// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useMidlineRows } from "@features/report/ui/v3/useMidlineRows";
import { __resetGuidedTourForTests, setGuidedTourActive } from "@shared/ui/guided-tour-state";

/**
 * Typical Beliefs' rows turn as their tops rise past the middle of the screen. The guided
 * tour scrolls the page to Typical Beliefs and back, so the rows hold still while it runs:
 * a turning row grows from 61 to 126px and would move the controls the tour lands on.
 */
describe("useMidlineRows", () => {
  let tops: number[];
  const row = (i: number) =>
    ({
      getBoundingClientRect: () => ({ top: tops[i] ?? 0, width: 300, height: 61 }) as DOMRect,
    }) as unknown as Element;

  beforeEach(() => {
    tops = [500, 600, 700];
    Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", () => undefined);
  });

  afterEach(() => {
    cleanup();
    __resetGuidedTourForTests();
    vi.unstubAllGlobals();
  });

  const render = () => {
    const rows = { current: [row(0), row(1), row(2)] };
    return renderHook(() => useMidlineRows(rows, 3));
  };
  const scroll = (to: number[]) =>
    act(() => {
      tops = to;
      window.dispatchEvent(new Event("scroll"));
    });

  it("turns the rows whose tops have risen past the middle", () => {
    const { result } = render();
    expect([...result.current]).toEqual([]);
    scroll([200, 300, 500]);
    expect([...result.current].sort()).toEqual([0, 1]);
  });

  it("holds the rows still while the guided tour moves the page, and reads them as it ends", () => {
    const { result } = render();
    act(() => setGuidedTourActive(true));
    scroll([100, 200, 300]);
    expect([...result.current], "nothing turns under the tour").toEqual([]);
    act(() => setGuidedTourActive(false));
    expect([...result.current].sort(), "read again once it ends").toEqual([0, 1, 2]);
  });
});
