// @vitest-environment jsdom
import { useRef, type FC } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRampFit } from "@features/report/ui/v3/useRampFit";

/**
 * A paywall's ramp paragraph is real through its anchor sentence and scrambled
 * after it (splitRamp). On a phone the scrambled tail starts below the fade band;
 * in the 588px desktop column the real part runs to fewer lines, so the tail rose
 * into the band's light blur and read as gibberish (review 25.09). useRampFit
 * measures where the tail's first line starts and hands CSS a cap for the band.
 */

const rect = (top: number) =>
  ({
    top,
    bottom: top + 25.6,
    left: 0,
    right: 300,
    width: 300,
    height: 25.6,
    x: 0,
    y: top,
  }) as DOMRect;

const Ramp: FC<{ veiled?: boolean }> = ({ veiled = true }) => {
  const ref = useRef<HTMLDivElement>(null);
  useRampFit(ref);
  return (
    <div ref={ref} className="ramp">
      <p>
        Real through here. {veiled ? <span className="rv4-prose__veiled">Xyzq wbnn.</span> : null}
      </p>
    </div>
  );
};

let veiledTop = 153;
let resize: (() => void) | null = null;
const disconnect = vi.fn();

beforeEach(() => {
  veiledTop = 153;
  resize = null;
  disconnect.mockClear();
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement
  ) {
    return rect(this.classList.contains("ramp") ? 100 : 0);
  });
  vi.spyOn(Element.prototype, "getClientRects").mockImplementation(function (this: Element) {
    const rects = this.classList.contains("rv4-prose__veiled") ? [rect(veiledTop)] : [];
    return rects as unknown as DOMRectList;
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(cb: () => void) {
        resize = cb;
      }
      observe() {}
      disconnect() {
        disconnect();
      }
    }
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const band = (container: HTMLElement) =>
  container.querySelector<HTMLElement>(".ramp")!.style.getPropertyValue("--rv4-band-fit");

describe("useRampFit", () => {
  it("caps the fade where the stand-in text starts", () => {
    const { container } = render(<Ramp />);
    expect(band(container)).toBe("53px");
  });

  it("skips the empty fragment WebKit reports on the line above when the tail wraps", () => {
    // Safari hands back a zero-width box at the end of the previous line for a span
    // that starts right after a break — measuring that would cut a line off the fade.
    vi.mocked(Element.prototype.getClientRects).mockImplementation(function (this: Element) {
      const rects = this.classList.contains("rv4-prose__veiled")
        ? [{ ...rect(130), width: 0, right: 0 }, rect(179)]
        : [];
      return rects as unknown as DOMRectList;
    });
    const { container } = render(<Ramp />);
    expect(band(container)).toBe("79px");
  });

  it("sets no cap when the ramp is real to its end", () => {
    const { container } = render(<Ramp veiled={false} />);
    expect(band(container)).toBe("");
  });

  it("measures again when the column's width changes", () => {
    const { container } = render(<Ramp />);
    veiledTop = 179;
    act(() => resize?.());
    expect(band(container)).toBe("79px");
  });

  it("measures again once the web fonts have loaded, which moves the wrap", async () => {
    let fontsLoaded: () => void = () => {};
    const ready = new Promise<void>((resolve) => {
      fontsLoaded = resolve;
    });
    Object.defineProperty(document, "fonts", { configurable: true, value: { ready } });
    try {
      const { container } = render(<Ramp />);
      veiledTop = 204.6;
      await act(async () => {
        fontsLoaded();
        await ready;
      });
      expect(band(container)).toBe("104.6px");
    } finally {
      Reflect.deleteProperty(document, "fonts");
    }
  });

  it("measures again whenever a later font load finishes, which can move the wrap alone", () => {
    // A face that arrives after mount re-wraps the paragraph without resizing the ramp
    // (same line count), so neither `ready` nor the ResizeObserver would notice.
    const fonts = Object.assign(new EventTarget(), { ready: Promise.resolve() });
    Object.defineProperty(document, "fonts", { configurable: true, value: fonts });
    try {
      const { container, unmount } = render(<Ramp />);
      const ramp = container.querySelector<HTMLElement>(".ramp")!;
      veiledTop = 179;
      act(() => {
        fonts.dispatchEvent(new Event("loadingdone"));
      });
      expect(ramp.style.getPropertyValue("--rv4-band-fit")).toBe("79px");
      // Unmounted, it stops listening.
      unmount();
      veiledTop = 230;
      fonts.dispatchEvent(new Event("loadingdone"));
      expect(ramp.style.getPropertyValue("--rv4-band-fit")).toBe("79px");
    } finally {
      Reflect.deleteProperty(document, "fonts");
    }
  });

  it("measures again as the ramp scrolls into view — Safari fires no font events", () => {
    // WebKit never fires `loadingdone` for a face that lands after mount, so a late
    // swap would leave a stale cap. The fade is only seen once the ramp is on screen.
    let seen: ((entries: Array<{ isIntersecting: boolean }>) => void) | null = null;
    const unobserve = vi.fn();
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(cb: (entries: Array<{ isIntersecting: boolean }>) => void) {
          seen = cb;
        }
        observe() {}
        disconnect() {
          unobserve();
        }
      }
    );
    const { container, unmount } = render(<Ramp />);
    veiledTop = 179;
    act(() => seen?.([{ isIntersecting: false }]));
    expect(band(container)).toBe("53px");
    act(() => seen?.([{ isIntersecting: true }]));
    expect(band(container)).toBe("79px");
    unmount();
    expect(unobserve).toHaveBeenCalled();
  });

  it("stops watching the column when it unmounts", () => {
    const { unmount } = render(<Ramp />);
    unmount();
    expect(disconnect).toHaveBeenCalled();
  });
});
