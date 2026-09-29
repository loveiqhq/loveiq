// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProcessingSequence from "@features/survey/ui/ProcessingSequence";

describe("ProcessingSequence", () => {
  const rafTimers = new Map<number, ReturnType<typeof setTimeout>>();
  let rafId = 0;

  const advanceInSteps = (durationMs: number, stepMs = 100) => {
    let remaining = durationMs;
    while (remaining > 0) {
      const delta = Math.min(stepMs, remaining);
      act(() => {
        vi.advanceTimersByTime(delta);
      });
      remaining -= delta;
    }
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(performance, "now").mockImplementation(() => Date.now());
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      rafId += 1;
      const id = rafId;
      const timer = setTimeout(() => {
        rafTimers.delete(id);
        callback(performance.now());
      }, 16);
      rafTimers.set(id, timer);
      return id;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      const timer = rafTimers.get(id);
      if (timer !== undefined) {
        clearTimeout(timer);
        rafTimers.delete(id);
      }
    });
  });

  afterEach(() => {
    rafTimers.forEach((timer) => clearTimeout(timer));
    rafTimers.clear();
    rafId = 0;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    cleanup();
  });

  it("never shows a negative percent when a frame is stamped before the start", () => {
    // A browser stamps each frame with the moment the frame began, which can be a few
    // milliseconds BEFORE the performance.now() the effect read just before asking for
    // it. Elapsed time then comes out negative, and the first frame painted "-1% complete"
    // (a persona walk on staging caught it on 2026-09-29).
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      rafId += 1;
      const id = rafId;
      const frameBegan = performance.now() - 12;
      const timer = setTimeout(() => {
        rafTimers.delete(id);
        callback(frameBegan);
      }, 16);
      rafTimers.set(id, timer);
      return id;
    });

    const onComplete = vi.fn();
    render(<ProcessingSequence onComplete={onComplete} submitDone />);
    const shown: number[] = [];
    // One frame per step, so the frame that goes wrong is the one that gets read.
    for (let i = 0; i < 2000 && !onComplete.mock.calls.length; i += 1) {
      act(() => {
        vi.advanceTimersByTime(16);
      });
      const text = screen.queryByText(/% complete$/)?.textContent;
      if (text) shown.push(Number.parseInt(text, 10));
    }

    expect(onComplete).toHaveBeenCalled();
    expect(shown[0]).toBe(0);
    // Neither the 0→95 count nor the 95→100 finish may dip below 0 or step backwards.
    expect(shown.every((pct, i) => pct >= 0 && (i === 0 || pct >= shown[i - 1]!))).toBe(true);
    expect(shown.at(-1)).toBe(100);
  });

  it("moves through the processing steps in order", () => {
    render(<ProcessingSequence onComplete={vi.fn()} submitDone={false} />);

    expect(screen.getByText("Extracting your answers...")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2200);
    });
    expect(screen.getByText("Scoring your answers against our archetypes...")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2200);
    });
    expect(screen.getByText("Generating your report results...")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2200);
    });
    expect(screen.getByText("Creating your protected access link...")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2200);
    });
    expect(screen.getByText("Sending you a report access link...")).toBeInTheDocument();
  });

  it("does not complete until submission is marked done", () => {
    const onComplete = vi.fn();

    render(<ProcessingSequence onComplete={onComplete} submitDone={false} />);

    advanceInSteps(12000);

    expect(screen.getByRole("status")).toHaveAttribute(
      "aria-label",
      "Sending you a report access link..."
    );
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("completes the sequence when submitDone is already true", () => {
    const onComplete = vi.fn();

    render(<ProcessingSequence onComplete={onComplete} submitDone={true} />);

    advanceInSteps(13000);

    expect(
      screen.getByText((_, element) => element?.textContent === "100% complete")
    ).toBeInTheDocument();
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("completes if submission finishes after all steps are already done", () => {
    const onComplete = vi.fn();
    const { rerender } = render(<ProcessingSequence onComplete={onComplete} submitDone={false} />);

    advanceInSteps(11200);
    expect(onComplete).not.toHaveBeenCalled();

    rerender(<ProcessingSequence onComplete={onComplete} submitDone={true} />);

    advanceInSteps(1500);

    expect(
      screen.getByText((_, element) => element?.textContent === "100% complete")
    ).toBeInTheDocument();
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
