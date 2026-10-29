// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const analytics = vi.hoisted(() => ({
  trackHeroVideoTap: vi.fn(),
  trackHeroVideoPlay: vi.fn(),
  trackHeroVideoProgress: vi.fn(),
  trackHeroVideoComplete: vi.fn(),
  trackHeroVideoError: vi.fn(),
  trackHeroVideoAbandoned: vi.fn(),
  trackHeroVideoPaused: vi.fn(),
  trackHeroVideoResumed: vi.fn(),
  trackCtaSeen: vi.fn(),
}));
vi.mock("@features/analytics/client", () => analytics);

import WHeroVideo, { HERO_POSTER_SRC, HERO_VIDEO_SRC } from "@features/landing/ui/white/WHeroVideo";

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
    if (this.disconnected) return;
    this.cb(
      [{ isIntersecting: ratio > 0, intersectionRatio: ratio, target: this.el } as never],
      this as never
    );
  }
}

/** cta_seen's observer: half of the box on screen (features/analytics/useCtaSeen.ts). */
const seenIo = () => FakeObserver.all.find((o) => o.opts?.threshold === 0.5)!;

let played: HTMLMediaElement[] = [];
let paused: HTMLMediaElement[] = [];
/** What play() returns. */
let playResult: (el: HTMLMediaElement) => Promise<void> = () => Promise.resolve();
const rejectWith = (name: string) => () => Promise.reject(Object.assign(new Error(name), { name }));
/** A play() that never settles: the HTML spec's answer to a network error mid-load. */
const never = () => new Promise<void>(() => {});

const film = () => screen.getByTestId("hero-video-full") as HTMLVideoElement;
const button = () => screen.getByTestId("hero-video-play") as HTMLButtonElement;
const tap = () => fireEvent.click(button());

/** Tap play, then let the first frames arrive. */
const startAndPlay = () => {
  const full = film();
  tap();
  act(() => {
    fireEvent(full, new Event("playing"));
  });
  return full;
};

/** Plays to the end, as the browser reports it, and hands back to the poster. */
const playToTheEnd = (full: HTMLVideoElement) => {
  Object.defineProperty(full, "ended", { configurable: true, value: true });
  act(() => {
    fireEvent(full, new Event("ended"));
  });
  Object.defineProperty(full, "ended", { configurable: true, value: false });
};

const leavePage = () =>
  act(() => {
    window.dispatchEvent(new Event("pagehide"));
  });

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
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const fn of Object.values(analytics)) {
    fn.mockReset();
  }
});

describe("hero video — what the server sends", () => {
  it("renders the poster at high priority and the film unloaded, and nothing that plays itself", () => {
    const html = renderToString(<WHeroVideo />);
    // Not "ready" until hydrated: before then the button has no click handler.
    expect(html).not.toContain("data-ready");
    // One video, the film, in the page with NO src, so there is nothing to fetch until the tap
    // names it. preload="none" alone was not enough: WebKit on Linux still requested it.
    expect(html.match(/<video\b/g)).toHaveLength(1);
    const fullTag = /<video[^>]*data-testid="hero-video-full"[^>]*>/.exec(html)?.[0] ?? "";
    expect(fullTag).not.toContain("src=");
    expect(fullTag).toContain('preload="none"');
    expect(html).not.toContain(HERO_VIDEO_SRC);
    // No silent loop since the 29.10 sync: the box is a paused frame until someone taps it.
    expect(html).not.toMatch(/\b(autoplay|loop)\b/i);
    expect(html).not.toContain("emma-preview");
    // The poster: eager and high priority, because on a desktop it is the largest thing above the fold.
    const img = /<img[^>]*>/.exec(html)?.[0] ?? "";
    expect(img).toContain(encodeURIComponent(HERO_POSTER_SRC));
    expect(img).toMatch(/fetchpriority="high"/i);
    expect(img).toMatch(/loading="eager"/);
  });
});

/**
 * Marcus, 29.10 sync: the muted loop "might be a reason why people don't click it", so the
 * box now waits, paused on the poster, with a big play button over it.
 */
describe("hero video — paused until tapped", () => {
  it("plays nothing and loads nothing on its own, even fully on screen", () => {
    render(<WHeroVideo />);
    // Hydrated in the browser, so tests and walkers can tell the button now works.
    expect(screen.getByTestId("hero-video").hasAttribute("data-ready")).toBe(true);
    expect(screen.queryByTestId("hero-video-preview")).toBeNull();
    expect(screen.getByTestId("hero-video").querySelectorAll("video")).toHaveLength(1);
    act(() => seenIo().show(1));
    expect(played).toEqual([]);
    expect(film().getAttribute("src")).toBeNull();
    expect(button().disabled).toBe(false);
  });
});

describe("hero video — playing it", () => {
  it("starts the full video with sound inside the tap itself", () => {
    render(<WHeroVideo />);
    const full = film();
    expect(full.getAttribute("src")).toBeNull();
    tap();

    // Synchronously, inside the click: iOS plays with sound only from within a gesture.
    // The tap names the file first, then plays it.
    expect(full.getAttribute("src")).toBe(HERO_VIDEO_SRC);
    expect(played).toEqual([full]);
    expect(full.muted).toBe(false);
    // Until frames arrive the button stays, showing that it is loading.
    expect(button().disabled).toBe(true);
    expect(full.controls).toBe(false);
    // A tap is not yet a play: that is counted once a frame shows.
    expect(analytics.trackHeroVideoPlay).not.toHaveBeenCalled();
  });

  /**
   * The share who tap is the number Marcus asked about (2.2% at the 29.10 sync), and a play
   * counts only the taps that reached a frame. A tap that stalls was invisible.
   */
  it("counts the tap itself, before the film is asked to play", () => {
    const order: string[] = [];
    analytics.trackHeroVideoTap.mockImplementation(() => order.push("tap"));
    playResult = () => {
      order.push("play");
      return never();
    };
    render(<WHeroVideo />);
    tap();
    expect(order).toEqual(["tap", "play"]);
    expect(analytics.trackHeroVideoTap.mock.calls).toEqual([[{ replay: false }]]);
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
  it("goes back to the poster when the browser refuses to play, and says why", async () => {
    playResult = rejectWith("NotAllowedError");
    render(<WHeroVideo />);
    tap();
    await act(async () => {});
    expect(button().disabled).toBe(false);
    expect(film().controls).toBe(false);
    expect(analytics.trackHeroVideoError).toHaveBeenCalledWith({
      video: "full",
      reason: "NotAllowedError",
    });
    // A start that never showed a frame is not a play, so the next tap is a first watch.
    expect(analytics.trackHeroVideoPlay).not.toHaveBeenCalled();
    playResult = () => Promise.resolve();
    tap();
    act(() => {
      fireEvent(film(), new Event("playing"));
    });
    expect(analytics.trackHeroVideoPlay).toHaveBeenLastCalledWith({ replay: false });
    // Both taps were taps, and neither followed a watch.
    expect(analytics.trackHeroVideoTap.mock.calls).toEqual([
      [{ replay: false }],
      [{ replay: false }],
    ]);
  });

  it("gives the button back when the browser aborts the start (an app switch on iOS)", async () => {
    playResult = rejectWith("AbortError");
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
    playResult = never;
    render(<WHeroVideo />);
    tap();
    act(() => {
      fireEvent(film(), new Event("pause"));
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
    playResult = never;
    render(<WHeroVideo />);
    tap();
    const full = film();
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
    playResult = never;
    render(<WHeroVideo />);
    tap();
    const full = film();
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
   * media element keeps its error, and play() on it then rejects at once with
   * NotSupportedError. So the button came back, and every later tap failed too, until the
   * page was reloaded. A failed start must leave the element as it was before any tap.
   */
  it("lets a second tap load the file afresh after a failed start", async () => {
    let failNext = true;
    playResult = () => {
      if (failNext) {
        failNext = false;
        return rejectWith("NotSupportedError")();
      }
      return Promise.resolve();
    };
    const loads = vi.spyOn(HTMLMediaElement.prototype, "load");
    render(<WHeroVideo />);
    const full = film();
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
    playResult = rejectWith("NotSupportedError");
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
    playResult = never;
    render(<WHeroVideo />);
    const full = film();
    tap();
    act(() => vi.advanceTimersByTime(12_000));
    expect(full.getAttribute("src")).toBeNull();
    tap();
    expect(full.getAttribute("src")).toBe(HERO_VIDEO_SRC);
  });

  it("counts one failure once, whichever signals it raises", async () => {
    playResult = rejectWith("NotSupportedError");
    render(<WHeroVideo />);
    tap();
    const full = film();
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

/**
 * A tap whose film had not started when the visitor left sent nothing at all: the 12 s
 * timeout that would have reported it dies with the page (one such start on 18.10). Now
 * the start ends there and says so, by beacon, because the page is going.
 */
describe("hero video — a start the visitor leaves behind", () => {
  it("is reported when the page goes while the film starts, and stops its download", () => {
    playResult = never;
    render(<WHeroVideo />);
    tap();
    leavePage();
    expect(analytics.trackHeroVideoAbandoned).toHaveBeenCalledTimes(1);
    expect(analytics.trackHeroVideoError).not.toHaveBeenCalled();
    // Back to the poster with nothing loading, should the page come back from the cache.
    expect(film().getAttribute("src")).toBeNull();
    expect(button().disabled).toBe(false);
  });

  it("is reported when the video unmounts while it starts (a move to another page in the app)", () => {
    playResult = never;
    const { unmount } = render(<WHeroVideo />);
    tap();
    unmount();
    expect(analytics.trackHeroVideoAbandoned).toHaveBeenCalledTimes(1);
  });

  it("is reported once, and the timer it would have run into says nothing after it", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    playResult = never;
    const { unmount } = render(<WHeroVideo />);
    tap();
    leavePage();
    leavePage();
    act(() => vi.advanceTimersByTime(12_000));
    unmount();
    expect(analytics.trackHeroVideoAbandoned).toHaveBeenCalledTimes(1);
    expect(analytics.trackHeroVideoError).not.toHaveBeenCalled();
  });

  it("is not a leave before any tap, or after the film has started", () => {
    const { unmount } = render(<WHeroVideo />);
    leavePage();
    startAndPlay();
    leavePage();
    unmount();
    expect(analytics.trackHeroVideoAbandoned).not.toHaveBeenCalled();
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
    expect(button().disabled).toBe(false);
    expect(full.controls).toBe(false);
    expect(full.getAttribute("src")).toBeNull();
    // The video had focus while it played; it goes back to the button, not to nowhere.
    expect(document.activeElement).toBe(button());
    // The viewer did not pause it.
    expect(analytics.trackHeroVideoPaused).not.toHaveBeenCalled();
  });
});

describe("hero video — screen readers", () => {
  it("hides the full video until it plays, and exposes it once it does", () => {
    render(<WHeroVideo />);
    const full = film();
    expect(full.getAttribute("aria-hidden")).toBe("true");
    startAndPlay();
    expect(full.hasAttribute("aria-hidden")).toBe(false);
  });
});

describe("hero video — the button", () => {
  it("shows the running time, and its name says what a tap does and contains what it shows", () => {
    render(<WHeroVideo />);
    // The play circle is a picture; the one visible word is the running time.
    expect(button().textContent).toBe("1:10");
    // Contains the visible "1:10", so a voice user saying what they see finds it (WCAG 2.5.3).
    expect(button().getAttribute("aria-label")).toBe("Watch the intro video with sound (1:10)");
  });

  /**
   * 29.10 evening (Fatih): the circle takes the old corner pill's look back (the brand
   * gradient, a white triangle), a little smaller, with a small pulse to draw the eye. A
   * film that is starting shows its spinner instead, without the pulse.
   */
  it("pulses gently while it waits, and stops once the film is starting", () => {
    playResult = never;
    render(<WHeroVideo />);
    expect(screen.getByTestId("hero-video-play-pulse")).toBeTruthy();
    tap();
    expect(screen.queryByTestId("hero-video-play-pulse")).toBeNull();
  });

  it("shows a spinner in the circle while the film starts, and the triangle otherwise", () => {
    playResult = never;
    render(<WHeroVideo />);
    const circle = screen.getByTestId("hero-video-play-icon");
    expect(circle.querySelector("svg")).not.toBeNull();
    tap();
    expect(circle.querySelector("svg")).toBeNull();
    expect(circle.querySelector("[class*='animate-spin']")).not.toBeNull();
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
      [{ percent: 25, replay: false }],
      [{ percent: 50, replay: false }],
      [{ percent: 75, replay: false }],
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
    expect(analytics.trackHeroVideoComplete.mock.calls).toEqual([[{ replay: false }]]);
  });

  it("returns to the poster after the end and counts the next watch as a replay", () => {
    render(<WHeroVideo />);
    const full = startAndPlay();
    playToTheEnd(full);
    expect(full.controls).toBe(false);

    full.currentTime = 70;
    tap();
    expect(full.currentTime).toBe(0);
    act(() => {
      fireEvent(full, new Event("playing"));
    });
    expect(analytics.trackHeroVideoTap).toHaveBeenLastCalledWith({ replay: true });
    expect(analytics.trackHeroVideoPlay).toHaveBeenLastCalledWith({ replay: true });
  });

  /**
   * Without the flag a second watch's milestones and finish read as the first watch's, so
   * "how far do people get" counted the keenest viewers twice.
   */
  it("marks a replay's milestones and finish as a replay's", () => {
    render(<WHeroVideo />);
    const full = startAndPlay();
    Object.defineProperty(full, "duration", { configurable: true, value: 70.4 });
    playToTheEnd(full);
    tap();
    act(() => {
      fireEvent(full, new Event("playing"));
    });
    full.currentTime = 20;
    fireEvent(full, new Event("timeupdate"));
    playToTheEnd(full);
    expect(analytics.trackHeroVideoProgress.mock.calls).toEqual([[{ percent: 25, replay: true }]]);
    expect(analytics.trackHeroVideoComplete.mock.calls).toEqual([
      [{ replay: false }],
      [{ replay: true }],
    ]);
  });
});

describe("hero video — whether it was seen", () => {
  // useCtaSeen remembers what was seen per page for the life of the module, so each test
  // stands on a page of its own.
  const onPage = (path: string) => window.history.replaceState(null, "", path);
  afterEach(() => onPage("/"));

  it("counts it once, when half of the video is on screen", () => {
    onPage("/seen-half");
    render(<WHeroVideo />);
    const io = seenIo();
    expect(io.el).toBe(screen.getByTestId("hero-video"));
    act(() => io.show(0.4));
    expect(analytics.trackCtaSeen).not.toHaveBeenCalled();
    act(() => io.show(0.5));
    expect(analytics.trackCtaSeen.mock.calls).toEqual([[{ cta: "hero_video" }]]);
    act(() => io.show(0));
    act(() => io.show(1));
    expect(analytics.trackCtaSeen).toHaveBeenCalledTimes(1);
  });

  it("is not a tap or a play: seeing it sends neither, and no error", () => {
    onPage("/seen-not-play");
    render(<WHeroVideo />);
    act(() => seenIo().show(1));
    expect(analytics.trackHeroVideoTap).not.toHaveBeenCalled();
    expect(analytics.trackHeroVideoPlay).not.toHaveBeenCalled();
    expect(analytics.trackHeroVideoError).not.toHaveBeenCalled();
  });
});
