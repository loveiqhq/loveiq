// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import type { FC } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useV4CountUp, type V4CountUpOptions } from "@features/report/ui/v3/useV4CountUp";

/**
 * The count-up the V4 entrances share (review 28.09): Mark asked for the top three's
 * percentages, and the archetype card's, to "count up from 0", as Report 2.0's match
 * strength does (CoreArchetypeSection): one rAF loop over 1800ms on an easeInOutCubic.
 */

const Probe: FC<{ target: number; run: boolean; opts?: V4CountUpOptions }> = ({
  target,
  run,
  opts,
}) => <span data-testid="n">{useV4CountUp(target, run, opts)}</span>;

const shown = () => Number(screen.getByTestId("n").textContent);

let frames: FrameRequestCallback[] = [];
let now = 0;

/** Moves the clock on and runs the frames the hook asked for. */
const tick = (ms: number) =>
  act(() => {
    now += ms;
    const due = frames;
    frames = [];
    due.forEach((frame) => frame(now));
  });

function stubReducedMotion(reduce: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: reduce && query.includes("reduce"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  );
}

beforeEach(() => {
  frames = [];
  now = 1000;
  vi.stubGlobal("requestAnimationFrame", (frame: FrameRequestCallback) => {
    frames.push(frame);
    return frames.length;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.spyOn(performance, "now").mockImplementation(() => now);
  stubReducedMotion(false);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("useV4CountUp", () => {
  it("renders 0 on the server, so a page hydrates onto the same number", () => {
    expect(renderToString(<Probe target={43.4} run />)).toContain(">0<");
  });

  it("holds 0 until it is told to run", () => {
    render(<Probe target={43.4} run={false} />);
    tick(5000);
    expect(shown()).toBe(0);
    expect(frames).toHaveLength(0);
  });

  it("counts on V2's easeInOutCubic and lands exactly on the target", () => {
    const view = render(<Probe target={43.4} run={false} opts={{ decimals: 1 }} />);
    view.rerender(<Probe target={43.4} run opts={{ decimals: 1 }} />);
    tick(0);
    tick(450); // a quarter of the way: 4 * 0.25^3 = 0.0625 of it
    expect(shown()).toBe(2.7);
    tick(450); // halfway in time is halfway in value
    expect(shown()).toBe(21.7);
    tick(900);
    expect(shown()).toBe(43.4);
    // Done: no frame is left asking to run.
    tick(16);
    expect(frames).toHaveLength(0);
  });

  it("rounds to whole numbers by default", () => {
    render(<Probe target={43} run />);
    tick(0);
    tick(900);
    expect(shown()).toBe(22);
    expect(Number.isInteger(shown())).toBe(true);
  });

  it("waits out its delay at 0 before it starts to count", () => {
    render(<Probe target={43.4} run opts={{ delay: 300, decimals: 1 }} />);
    tick(0);
    tick(300);
    expect(shown()).toBe(0);
    tick(900);
    expect(shown()).toBe(21.7);
  });

  it("shows the target on its first frame under reduced motion, running or not", () => {
    stubReducedMotion(true);
    render(<Probe target={43.4} run={false} opts={{ decimals: 1 }} />);
    // One frame, as V2's reduced-motion path takes, and no count.
    expect(frames).toHaveLength(1);
    tick(0);
    expect(shown()).toBe(43.4);
    expect(frames).toHaveLength(0);
  });

  it("counts once: a second run does not start it again from 0", () => {
    const view = render(<Probe target={43} run />);
    tick(0);
    tick(1800);
    expect(shown()).toBe(43);
    view.rerender(<Probe target={43} run={false} />);
    view.rerender(<Probe target={43} run />);
    tick(0);
    expect(shown()).toBe(43);
  });

  it("stops asking for frames when it unmounts mid-count", () => {
    const view = render(<Probe target={43} run />);
    tick(0);
    tick(400);
    view.unmount();
    expect(cancelAnimationFrame).toHaveBeenCalled();
  });
});
