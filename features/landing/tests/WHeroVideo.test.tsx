// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const analytics = vi.hoisted(() => ({
  trackHeroVideoPlay: vi.fn(),
  trackHeroVideoProgress: vi.fn(),
  trackHeroVideoComplete: vi.fn(),
  trackHeroVideoError: vi.fn(),
  trackHeroVideoPaused: vi.fn(),
  trackHeroVideoResumed: vi.fn(),
}));
vi.mock("@features/analytics/client", () => analytics);

import WHeroVideo, {
  HERO_POSTER_SRC,
  HERO_PREVIEW_SRC,
  HERO_VIDEO_SRC,
} from "@features/landing/ui/white/WHeroVideo";

/** An IntersectionObserver the test drives (same shape as cta-seen.test.tsx). */
class FakeObserver {
  static all: FakeObserver[] = [];
  el: Element | null = null;
  disconnected = false;
  constructor(
    public cb: IntersectionObserverCallback,
    public opts?: IntersectionObserverInit
  ) {
    FakeObserver.all.push(this);
  }
  observe(el: Element) {
    this.el = el;
  }
  disconnect() {
    this.disconnected = true;
  }
  /** The element is now `ratio` in view. */
  show(ratio: number) {
    this.showMany(ratio);
  }
  /** One callback carrying several crossings, oldest first, as a browser batches them. */
  showMany(...ratios: number[]) {
    if (this.disconnected) return;
    this.cb(
      ratios.map(
        (ratio) =>
          ({ isIntersecting: ratio > 0, intersectionRatio: ratio, target: this.el }) as never
      ),
      this as never
    );
  }
}

let played: HTMLMediaElement[] = [];
let paused: HTMLMediaElement[] = [];
/** What play() returns, per element: the loop and the full video can be told apart. */
let playResult: (el: HTMLMediaElement) => Promise<void> = () => Promise.resolve();
const rejectWith = (name: string) => () => Promise.reject(Object.assign(new Error(name), { name }));
/** A play() that never settles: the HTML spec's answer to a network error mid-load. */
const never = () => new Promise<void>(() => {});
const isFull = (el: HTMLMediaElement) => el.getAttribute("data-testid") === "hero-video-full";
const originalMatchMedia = window.matchMedia;

const setReducedMotion = (reduce: boolean) => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: reduce && query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
};

const setConnection = (connection: { saveData?: boolean; effectiveType?: string } | undefined) => {
  Object.defineProperty(navigator, "connection", { configurable: true, value: connection });
};

const setVisibility = (state: "visible" | "hidden") => {
  Object.defineProperty(document, "visibilityState", { configurable: true, value: state });
  document.dispatchEvent(new Event("visibilitychange"));
};

const media = () => ({
  preview: screen.getByTestId("hero-video-preview") as HTMLVideoElement,
  full: screen.getByTestId("hero-video-full") as HTMLVideoElement,
});

/** Tap play, then let the first frames arrive. */
const startAndPlay = () => {
  const { full } = media();
  fireEvent.click(screen.getByTestId("hero-video-play"));
  act(() => {
    fireEvent(full, new Event("playing"));
  });
  return full;
};

beforeEach(() => {
  played = [];
  paused = [];
  playResult = () => Promise.resolve();
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (
    this: HTMLMediaElement
  ) {
    played.push(this);
    return playResult(this);
  });
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function (
    this: HTMLMediaElement
  ) {
    paused.push(this);
  });
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  FakeObserver.all = [];
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
  setReducedMotion(false);
  setConnection(undefined);
  setVisibility("visible");
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const fn of Object.values(analytics)) fn.mockClear();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: originalMatchMedia,
  });
  setConnection(undefined);
});

describe("hero video — what the server sends", () => {
  it("renders the poster at high priority, the full video unloaded, and no loop yet", () => {
    const html = renderToString(<WHeroVideo />);
    // The loop is a per-device decision (reduced motion, Save-Data), so it waits for the browser.
    expect(html).not.toContain(HERO_PREVIEW_SRC);
    // Not "ready" until hydrated: before then the button has no click handler.
    expect(html).not.toContain("data-ready");
    // The full video is in the page with NO src, so there is nothing to fetch until the tap
    // names it. preload="none" alone was not enough: WebKit on Linux still requested it.
    const fullTag = /<video[^>]*data-testid="hero-video-full"[^>]*>/.exec(html)?.[0] ?? "";
    expect(fullTag).not.toContain("src=");
    expect(fullTag).toContain('preload="none"');
    expect(html).not.toContain(HERO_VIDEO_SRC);
    // The poster: eager and high priority, because on a desktop it is the largest thing above the fold.
    const img = /<img[^>]*>/.exec(html)?.[0] ?? "";
    expect(img).toContain(encodeURIComponent(HERO_POSTER_SRC));
    expect(img).toMatch(/fetchpriority="high"/i);
    expect(img).toMatch(/loading="eager"/);
  });
});

describe("hero video — the silent loop", () => {
  it("rolls once a quarter of it is on screen and stops when it leaves", () => {
    render(<WHeroVideo />);
    // Hydrated in the browser, so tests and walkers can tell the button now works.
    expect(screen.getByTestId("hero-video").hasAttribute("data-ready")).toBe(true);
    const { preview } = media();
    expect(preview.getAttribute("src")).toBe(HERO_PREVIEW_SRC);
    const [io] = FakeObserver.all;
    expect(io!.opts?.threshold).toEqual([0, 0.25]);

    act(() => io!.show(0.1));
    expect(played).not.toContain(preview);

    act(() => io!.show(0.3));
    expect(played).toContain(preview);
    expect(preview.muted).toBe(true);

    paused = [];
    act(() => io!.show(0));
    expect(paused).toContain(preview);
  });

  it("stops in a hidden tab and rolls again when the tab comes back", () => {
    render(<WHeroVideo />);
    const { preview } = media();
    act(() => FakeObserver.all[0]!.show(1));
    paused = [];
    played = [];
    act(() => setVisibility("hidden"));
    expect(paused).toContain(preview);
    act(() => setVisibility("visible"));
    expect(played).toContain(preview);
  });

  it.each([
    ["reduced motion", () => setReducedMotion(true)],
    ["Save-Data", () => setConnection({ saveData: true })],
    ["a 3G link", () => setConnection({ effectiveType: "3g" })],
    ["a 2G link", () => setConnection({ effectiveType: "2g" })],
  ])("never rolls under %s: the poster and the button stay", (_name, arrange) => {
    arrange();
    render(<WHeroVideo />);
    const { preview } = media();
    expect(preview.getAttribute("src")).toBeNull();
    expect(FakeObserver.all).toHaveLength(0);
    expect(screen.getByTestId("hero-video-play")).toBeTruthy();
  });

  it("still rolls on a 4G link", () => {
    setConnection({ effectiveType: "4g" });
    render(<WHeroVideo />);
    expect(media().preview.getAttribute("src")).toBe(HERO_PREVIEW_SRC);
  });

  it("goes by the latest crossing when one callback carries several", () => {
    render(<WHeroVideo />);
    const { preview } = media();
    const [io] = FakeObserver.all;
    // Scrolled in and straight back out between two callbacks: off screen now.
    act(() => io!.showMany(0.6, 0));
    expect(played).not.toContain(preview);
    // And the other way round: on screen now.
    act(() => io!.showMany(0, 0.6));
    expect(played).toContain(preview);
  });

  it("says nothing when autoplay is refused: that is the poster doing its job", async () => {
    playResult = rejectWith("NotAllowedError");
    render(<WHeroVideo />);
    await act(async () => FakeObserver.all[0]!.show(1));
    expect(analytics.trackHeroVideoError).not.toHaveBeenCalled();
    expect(screen.getByTestId("hero-video-play")).toBeTruthy();
  });

  it("reports a loop that cannot play at all, once per page", async () => {
    playResult = rejectWith("NotSupportedError");
    render(<WHeroVideo />);
    const [io] = FakeObserver.all;
    await act(async () => io!.show(1));
    await act(async () => io!.show(0));
    await act(async () => io!.show(1));
    fireEvent(media().preview, new Event("error"));
    expect(analytics.trackHeroVideoError.mock.calls).toEqual([
      [{ video: "preview", reason: "NotSupportedError" }],
    ]);
  });
});

describe("hero video — playing it", () => {
  it("starts the full video with sound inside the tap itself", () => {
    render(<WHeroVideo />);
    const { preview, full } = media();
    expect(full.getAttribute("src")).toBeNull();
    fireEvent.click(screen.getByTestId("hero-video-play"));

    // Synchronously, inside the click: iOS plays with sound only from within a gesture.
    // The tap names the file first, then plays it.
    expect(full.getAttribute("src")).toBe(HERO_VIDEO_SRC);
    expect(played).toContain(full);
    expect(full.muted).toBe(false);
    expect(paused).toContain(preview);
    // Until frames arrive the button stays, showing that it is loading.
    expect((screen.getByTestId("hero-video-play") as HTMLButtonElement).disabled).toBe(true);
    expect(full.controls).toBe(false);
    // A tap is not yet a play: that is counted once a frame shows.
    expect(analytics.trackHeroVideoPlay).not.toHaveBeenCalled();
  });

  it("hands over to the video's own controls once frames arrive, and counts the play then", () => {
    render(<WHeroVideo />);
    const full = startAndPlay();
    expect(full.controls).toBe(true);
    expect(full.tabIndex).toBe(0);
    expect(screen.queryByTestId("hero-video-play")).toBeNull();
    expect(document.activeElement).toBe(full);
    expect(analytics.trackHeroVideoPlay.mock.calls).toEqual([[{ replay: false }]]);
  });
});

/**
 * Every way a start can fail must give the button back. It is disabled while the video
 * starts, so a start that never ends is a spinner the visitor cannot get past without
 * reloading — the page's one call to action on arm B, dead.
 */
describe("hero video — a start that fails", () => {
  const button = () => screen.getByTestId("hero-video-play") as HTMLButtonElement;
  const tap = () => fireEvent.click(button());

  it("goes back to the poster when the browser refuses to play, and says why", async () => {
    playResult = (el) => (isFull(el) ? rejectWith("NotAllowedError")() : Promise.resolve());
    render(<WHeroVideo />);
    tap();
    await act(async () => {});
    expect(button().disabled).toBe(false);
    expect(media().full.controls).toBe(false);
    expect(analytics.trackHeroVideoError).toHaveBeenCalledWith({
      video: "full",
      reason: "NotAllowedError",
    });
    // A start that never showed a frame is not a play, so the next tap is a first watch.
    expect(analytics.trackHeroVideoPlay).not.toHaveBeenCalled();
    playResult = () => Promise.resolve();
    tap();
    act(() => {
      fireEvent(media().full, new Event("playing"));
    });
    expect(analytics.trackHeroVideoPlay).toHaveBeenLastCalledWith({ replay: false });
  });

  it("gives the button back when the browser aborts the start (an app switch on iOS)", async () => {
    playResult = (el) => (isFull(el) ? rejectWith("AbortError")() : Promise.resolve());
    render(<WHeroVideo />);
    tap();
    await act(async () => {});
    expect(button().disabled).toBe(false);
    expect(analytics.trackHeroVideoError).toHaveBeenCalledWith({
      video: "full",
      reason: "AbortError",
    });
  });

  it("gives the button back when the browser pauses it before a frame shows", () => {
    playResult = (el) => (isFull(el) ? never() : Promise.resolve());
    render(<WHeroVideo />);
    tap();
    act(() => {
      fireEvent(media().full, new Event("pause"));
    });
    expect(button().disabled).toBe(false);
    expect(analytics.trackHeroVideoError).toHaveBeenCalledWith({
      video: "full",
      reason: "paused-before-playing",
    });
    // Not a viewer's pause: nothing was playing.
    expect(analytics.trackHeroVideoPaused).not.toHaveBeenCalled();
  });

  it("gives the button back on a media error, which never settles play()", () => {
    playResult = (el) => (isFull(el) ? never() : Promise.resolve());
    render(<WHeroVideo />);
    tap();
    const { full } = media();
    Object.defineProperty(full, "error", { configurable: true, value: { code: 2 } });
    act(() => {
      fireEvent(full, new Event("error"));
    });
    expect(button().disabled).toBe(false);
    expect(analytics.trackHeroVideoError).toHaveBeenCalledWith({
      video: "full",
      reason: "media-error-2",
    });
  });

  it("gives up after 12 s without a frame, and pauses it so it cannot start later unseen", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    playResult = (el) => (isFull(el) ? never() : Promise.resolve());
    render(<WHeroVideo />);
    tap();
    const { full } = media();
    act(() => vi.advanceTimersByTime(11_999));
    expect(button().disabled).toBe(true);
    paused = [];
    act(() => vi.advanceTimersByTime(1));
    expect(button().disabled).toBe(false);
    expect(paused).toContain(full);
    expect(analytics.trackHeroVideoError).toHaveBeenCalledWith({
      video: "full",
      reason: "timeout",
    });
    // Frames arriving after that change nothing: the poster stays, nothing is counted.
    act(() => {
      fireEvent(full, new Event("playing"));
    });
    expect(full.controls).toBe(false);
    expect(analytics.trackHeroVideoPlay).not.toHaveBeenCalled();
  });

  it("never times out a start that played", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    render(<WHeroVideo />);
    const full = startAndPlay();
    act(() => vi.advanceTimersByTime(60_000));
    expect(full.controls).toBe(true);
    expect(analytics.trackHeroVideoError).not.toHaveBeenCalled();
  });

  /**
   * Measured in Chrome, Safari and Firefox on a production build: after one failed load a
   * media element keeps its error, and play() on it rejects at once with
   * NotSupportedError. So the button came back, and every later tap failed too, until the
   * page was reloaded. A failed start must leave the element as it was before any tap.
   */
  it("lets a second tap load the file afresh after a failed start", async () => {
    let failNext = true;
    playResult = (el) => {
      if (!isFull(el)) return Promise.resolve();
      if (failNext) {
        failNext = false;
        return rejectWith("NotSupportedError")();
      }
      return Promise.resolve();
    };
    const loads = vi.spyOn(HTMLMediaElement.prototype, "load");
    render(<WHeroVideo />);
    const { full } = media();
    tap();
    await act(async () => {});
    expect(button().disabled).toBe(false);
    // Reset: no source, and load() run to clear the error and stop any download.
    expect(full.getAttribute("src")).toBeNull();
    expect(loads.mock.contexts).toContain(full);

    tap();
    expect(full.getAttribute("src")).toBe(HERO_VIDEO_SRC);
    act(() => {
      fireEvent(full, new Event("playing"));
    });
    expect(full.controls).toBe(true);
    expect(analytics.trackHeroVideoPlay.mock.calls).toEqual([[{ replay: false }]]);
  });

  /**
   * The button is disabled while the video starts, and browsers move focus off a focused
   * control that becomes disabled (to the page body, in Chrome, Safari and Firefox). jsdom
   * does neither that nor blur() on a disabled button, so focus is parked on an element that
   * is then removed, which leaves it on the body as the browsers do. A keyboard user whose
   * start failed was left at the top of the page.
   */
  it("hands focus back to the button after a failed start, unless the visitor moved on", async () => {
    playResult = (el) => (isFull(el) ? rejectWith("NotSupportedError")() : Promise.resolve());
    render(<WHeroVideo />);
    button().focus();
    tap();
    const sink = document.createElement("input");
    document.body.appendChild(sink);
    sink.focus();
    sink.remove();
    expect(document.activeElement).toBe(document.body);
    await act(async () => {});
    expect(document.activeElement).toBe(button());

    // Moved on to another control while it was starting: left there.
    const elsewhere = document.createElement("a");
    elsewhere.href = "#elsewhere";
    document.body.appendChild(elsewhere);
    tap();
    elsewhere.focus();
    await act(async () => {});
    expect(document.activeElement).toBe(elsewhere);
    elsewhere.remove();
  });

  it("resets after a timeout too, so a stalled download stops and a retry starts clean", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    playResult = (el) => (isFull(el) ? never() : Promise.resolve());
    render(<WHeroVideo />);
    const { full } = media();
    tap();
    act(() => vi.advanceTimersByTime(12_000));
    expect(full.getAttribute("src")).toBeNull();
    tap();
    expect(full.getAttribute("src")).toBe(HERO_VIDEO_SRC);
  });

  it("counts one failure once, whichever signals it raises", async () => {
    playResult = (el) => (isFull(el) ? rejectWith("NotSupportedError")() : Promise.resolve());
    render(<WHeroVideo />);
    tap();
    const { full } = media();
    Object.defineProperty(full, "error", { configurable: true, value: { code: 4 } });
    act(() => {
      fireEvent(full, new Event("error"));
      fireEvent(full, new Event("pause"));
    });
    await act(async () => {});
    expect(analytics.trackHeroVideoError).toHaveBeenCalledTimes(1);
    expect(analytics.trackHeroVideoError).toHaveBeenCalledWith({
      video: "full",
      reason: "media-error-4",
    });
  });
});

describe("hero video — a failure mid-film", () => {
  it("returns to the poster with the button, so a tap can start it again", () => {
    render(<WHeroVideo />);
    const full = startAndPlay();
    expect(screen.queryByTestId("hero-video-play")).toBeNull();
    Object.defineProperty(full, "error", { configurable: true, value: { code: 2 } });
    act(() => {
      fireEvent(full, new Event("error"));
    });
    expect(analytics.trackHeroVideoError).toHaveBeenCalledWith({
      video: "full",
      reason: "media-error-2",
    });
    const button = screen.getByTestId("hero-video-play") as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    expect(full.controls).toBe(false);
    expect(full.getAttribute("src")).toBeNull();
    // The video had focus while it played; it goes back to the button, not to nowhere.
    expect(document.activeElement).toBe(button);
    // The viewer did not pause it.
    expect(analytics.trackHeroVideoPaused).not.toHaveBeenCalled();
  });
});

describe("hero video — screen readers", () => {
  it("hides the full video until it plays, and exposes it once it does", () => {
    render(<WHeroVideo />);
    const { full } = media();
    expect(full.getAttribute("aria-hidden")).toBe("true");
    startAndPlay();
    expect(full.hasAttribute("aria-hidden")).toBe(false);
  });
});

describe("hero video — the button", () => {
  it("names the button with both of its visible words", () => {
    render(<WHeroVideo />);
    const button = screen.getByTestId("hero-video-play");
    expect(button.textContent).toContain("Watch");
    expect(button.textContent).toContain("1:10");
    const name = button.getAttribute("aria-label") ?? "";
    expect(name.startsWith("Watch")).toBe(true);
    expect(name).toContain("1:10");
  });
});

describe("hero video — what it records", () => {
  it("sends each progress milestone once", () => {
    render(<WHeroVideo />);
    const full = startAndPlay();
    Object.defineProperty(full, "duration", { configurable: true, value: 70.4 });
    for (const t of [10, 18, 18.5, 36, 53, 60]) {
      full.currentTime = t;
      fireEvent(full, new Event("timeupdate"));
    }
    expect(analytics.trackHeroVideoProgress.mock.calls).toEqual([
      [{ percent: 25 }],
      [{ percent: 50 }],
      [{ percent: 75 }],
    ]);
  });

  it("records a viewer's pause and resume, but not the pause the browser fires at the end", () => {
    render(<WHeroVideo />);
    const full = startAndPlay();
    full.currentTime = 30.4;
    fireEvent(full, new Event("pause"));
    fireEvent(full, new Event("play"));
    expect(analytics.trackHeroVideoPaused).toHaveBeenCalledWith({ current_time_sec: 30 });
    expect(analytics.trackHeroVideoResumed).toHaveBeenCalledWith({ current_time_sec: 30 });

    Object.defineProperty(full, "ended", { configurable: true, value: true });
    fireEvent(full, new Event("pause"));
    act(() => {
      fireEvent(full, new Event("ended"));
    });
    expect(analytics.trackHeroVideoPaused).toHaveBeenCalledTimes(1);
    expect(analytics.trackHeroVideoComplete).toHaveBeenCalledTimes(1);
  });

  it("returns to the poster after the end and counts the next watch as a replay", () => {
    render(<WHeroVideo />);
    const full = startAndPlay();
    Object.defineProperty(full, "ended", { configurable: true, value: true });
    act(() => {
      fireEvent(full, new Event("ended"));
    });
    expect(full.controls).toBe(false);
    const button = screen.getByTestId("hero-video-play");

    Object.defineProperty(full, "ended", { configurable: true, value: false });
    full.currentTime = 70;
    fireEvent.click(button);
    expect(full.currentTime).toBe(0);
    act(() => {
      fireEvent(full, new Event("playing"));
    });
    expect(analytics.trackHeroVideoPlay).toHaveBeenLastCalledWith({ replay: true });
  });
});
