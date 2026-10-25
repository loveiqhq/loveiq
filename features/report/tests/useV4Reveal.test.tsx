// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import type { FC } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useV4Reveal, type V4RevealOptions } from "@features/report/ui/v3/useV4Reveal";
import { __resetGuidedTourForTests, setGuidedTourActive } from "@shared/ui/guided-tour-state";
import { installRevealObserver, mockRect, observerOf, RevealObserver } from "./v4RevealTestKit";

const Probe: FC<{ opts?: V4RevealOptions }> = ({ opts }) => {
  const [ref, shown] = useV4Reveal<HTMLDivElement>(opts);
  return <div ref={ref} data-testid="probe" data-shown={shown ? "yes" : "no"} />;
};

const shown = () => screen.getByTestId("probe").getAttribute("data-shown");

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("useV4Reveal — one reveal, the same on the server and the client", () => {
  it("renders unrevealed on the server, so /report-v4-preview hydrates without a mismatch", async () => {
    // The server has no IntersectionObserver; the browser does.
    vi.stubGlobal("IntersectionObserver", undefined);
    const html = renderToString(<Probe />);
    expect(html).toContain('data-shown="no"');
    installRevealObserver();

    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.appendChild(container);
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    await act(async () => {
      hydrateRoot(container, <Probe />);
    });
    expect(errors).not.toHaveBeenCalled();
    container.remove();
  });

  it("reveals after mount where there is no IntersectionObserver to wait for", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    render(<Probe />);
    expect(shown()).toBe("yes");
  });
});

describe("useV4Reveal — when it reveals", () => {
  beforeEach(() => {
    installRevealObserver();
  });

  it("insets the observer's root by the band: 0.6 of the screen means 40% off the bottom", () => {
    mockRect({ top: 5000 });
    render(<Probe opts={{ band: 0.6 }} />);
    const observer = observerOf(screen.getByTestId("probe"))!;
    expect(observer.rootMargin).toBe("0px 0px -40% 0px");
    expect(observer.thresholds).toEqual([0]);
  });

  it("stays hidden below the band, reveals when the observer reports it, then lets go", () => {
    mockRect({ top: 5000 });
    render(<Probe />);
    expect(shown()).toBe("no");
    const observer = observerOf(screen.getByTestId("probe"))!;
    observer.fire(true);
    expect(shown()).toBe("yes");
    expect(observer.disconnected).toBe(true);
  });

  it("catches a scroll that jumped straight past it", () => {
    const rect = mockRect({ top: 5000 });
    render(<Probe />);
    expect(shown()).toBe("no");
    rect.mockReturnValue({ top: -800, width: 329, height: 61 } as DOMRect);
    fireEvent.scroll(window);
    expect(shown()).toBe("yes");
  });

  it("never reveals a box with no size — a chapter collapsed with display:none", () => {
    mockRect({ top: 0, width: 0, height: 0 });
    render(<Probe />);
    fireEvent.scroll(window);
    expect(shown()).toBe("no");
  });

  it("with catchUp off, waits for the observer alone — no mount or scroll check", () => {
    mockRect({ top: 10 });
    render(<Probe opts={{ catchUp: false }} />);
    fireEvent.scroll(window);
    expect(shown()).toBe("no");
    observerOf(screen.getByTestId("probe"))!.fire(true);
    expect(shown()).toBe("yes");
  });

  it("with catchUp off and no observer, never reveals", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    render(<Probe opts={{ catchUp: false }} />);
    expect(shown()).toBe("no");
  });

  it("does nothing at all while disabled — a locked surface", () => {
    mockRect({ top: 10 });
    render(<Probe opts={{ enabled: false }} />);
    fireEvent.scroll(window);
    expect(RevealObserver.instances).toHaveLength(0);
    expect(shown()).toBe("no");
  });

  it("reveals at mount when it is already inside the band", () => {
    mockRect({ top: 100 });
    render(<Probe />);
    expect(shown()).toBe("yes");
  });
});

/** A held-back surface with a control in it, as the map's dots and the Snapshot's rows. */
const FocusProbe: FC<{ opts?: V4RevealOptions }> = ({ opts }) => {
  const [ref, isShown] = useV4Reveal<HTMLDivElement>(opts);
  return (
    <div ref={ref} data-testid="probe" data-shown={isShown ? "yes" : "no"}>
      <button type="button">inside</button>
    </div>
  );
};

// Final review 27.09: a held-back surface is clear, and a browser scrolls a focused
// control into view only when it is off screen, so a keyboard reader could tab onto a
// dot or a row still held below the band and see neither it nor its focus ring.
describe("useV4Reveal — keyboard focus inside it reveals it (WCAG 2.4.7)", () => {
  beforeEach(() => {
    installRevealObserver();
  });

  it("reveals when focus lands on a control inside it, below the band", () => {
    mockRect({ top: 5000 });
    render(<FocusProbe />);
    expect(shown()).toBe("no");
    act(() => screen.getByRole("button").focus());
    expect(shown()).toBe("yes");
  });

  it("does so with catchUp off too — the flywheel's orbit", () => {
    mockRect({ top: 5000 });
    render(<FocusProbe opts={{ catchUp: false }} />);
    act(() => screen.getByRole("button").focus());
    expect(shown()).toBe("yes");
  });

  it("ignores focus while disabled — nothing under the blur moves", () => {
    mockRect({ top: 5000 });
    render(<FocusProbe opts={{ enabled: false }} />);
    act(() => screen.getByRole("button").focus());
    expect(shown()).toBe("no");
  });
});

// Sync 23.10: the guided tour scrolls the page through Part 2 behind its scrim, and the
// top three's bars and percentages played out there, unseen. They now wait for the reader.
describe("useV4Reveal — held while the guided tour moves the page", () => {
  beforeEach(() => {
    __resetGuidedTourForTests();
    installRevealObserver();
    // The kit's frame runs at once but returns a live handle, so the hook would think a
    // frame is still queued and skip every scroll after the first. These tests scroll
    // several times: hand back 0, a frame that has already run.
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
  });

  afterEach(() => {
    __resetGuidedTourForTests();
  });

  it("plays when the reader scrolls to it, not when the tour passed it", () => {
    const rect = mockRect({ top: 5000 });
    render(<Probe />);
    const observer = observerOf(screen.getByTestId("probe"))!;

    act(() => setGuidedTourActive(true));
    rect.mockReturnValue({ top: 100, bottom: 161, width: 329, height: 61 } as DOMRect);
    fireEvent.scroll(window);
    observer.fire(true);
    expect(shown()).toBe("no");

    // The tour ends where it began, at the top: the box is below the band again.
    rect.mockReturnValue({ top: 5000, bottom: 5061, width: 329, height: 61 } as DOMRect);
    act(() => setGuidedTourActive(false));
    expect(shown()).toBe("no");

    rect.mockReturnValue({ top: 100, bottom: 161, width: 329, height: 61 } as DOMRect);
    fireEvent.scroll(window);
    expect(shown()).toBe("yes");
  });

  it("plays at once when the tour ends with it on screen", () => {
    const rect = mockRect({ top: 5000 });
    render(<Probe />);
    act(() => setGuidedTourActive(true));
    rect.mockReturnValue({ top: 100, bottom: 161, width: 329, height: 61 } as DOMRect);
    fireEvent.scroll(window);
    expect(shown()).toBe("no");

    act(() => setGuidedTourActive(false));
    expect(shown()).toBe("yes");
  });

  it("never catches up out of sight a box the tour carried the page past", () => {
    const rect = mockRect({ top: 5000 });
    render(<Probe />);
    act(() => setGuidedTourActive(true));
    rect.mockReturnValue({ top: -800, bottom: -739, width: 329, height: 61 } as DOMRect);
    fireEvent.scroll(window);
    act(() => setGuidedTourActive(false));
    fireEvent.scroll(window);
    expect(shown()).toBe("no");

    // The reader scrolls back up to it.
    rect.mockReturnValue({ top: 200, bottom: 261, width: 329, height: 61 } as DOMRect);
    fireEvent.scroll(window);
    expect(shown()).toBe("yes");
  });

  it("still catches up a box the reader jumped past themselves", () => {
    const rect = mockRect({ top: 5000 });
    render(<Probe />);
    rect.mockReturnValue({ top: -800, bottom: -739, width: 329, height: 61 } as DOMRect);
    fireEvent.scroll(window);
    expect(shown()).toBe("yes");
  });

  it("with catchUp off, the tour's end plays it only on screen", () => {
    const rect = mockRect({ top: 5000 });
    render(<Probe opts={{ catchUp: false }} />);
    const observer = observerOf(screen.getByTestId("probe"))!;
    act(() => setGuidedTourActive(true));
    observer.fire(true);
    expect(shown()).toBe("no");

    rect.mockReturnValue({ top: -800, bottom: -739, width: 329, height: 61 } as DOMRect);
    act(() => setGuidedTourActive(false));
    expect(shown()).toBe("no");

    observer.fire(true);
    expect(shown()).toBe("yes");
  });

  it("without an observer, shows when the tour ends", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    act(() => setGuidedTourActive(true));
    render(<Probe />);
    expect(shown()).toBe("no");
    act(() => setGuidedTourActive(false));
    expect(shown()).toBe("yes");
  });

  it("lets go of the tour once it has played", () => {
    mockRect({ top: 100 });
    render(<Probe />);
    expect(shown()).toBe("yes");
    // Revealed and torn down: a later tour changes nothing and throws nothing.
    act(() => setGuidedTourActive(true));
    act(() => setGuidedTourActive(false));
    expect(shown()).toBe("yes");
  });
});
