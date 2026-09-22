// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const tracked = vi.hoisted(() => ({
  dead: vi.fn(),
  rage: vi.fn(),
  scroll: vi.fn(),
  tabH: vi.fn(),
  tabV: vi.fn(),
}));
vi.mock("@features/analytics/client", () => ({
  hasCookieYesConsent: () => true,
  trackDeadClick: tracked.dead,
  trackRageClick: tracked.rage,
  trackScrollDepth: tracked.scroll,
  trackTabHidden: tracked.tabH,
  trackTabVisible: tracked.tabV,
}));

/**
 * The dead-click listener recorded taps on decoration and discarded taps on
 * controls — because `isInteractive` matched `closest("button")` with no
 * regard for whether that button was DISABLED. So the one case worth an alert
 * (a control that looks live and does nothing) was the one case it dropped:
 * readers tapped a disabled survey "Next" 1,347 times in production without a
 * single row landing here.
 */
describe("dead-click detection on controls that look live", () => {
  let install: () => void;
  let reset: () => void;

  /**
   * INSTALLED ONCE, like production.
   *
   * This used to delete `__loveiqUxSignalsInstalled` and re-install per test.
   * `installUxSignals` binds to `document`, which jsdom keeps for the whole
   * file and there is no uninstall — so every test added another listener and
   * by the third there were three. Each tap then ran the handler three times.
   *
   * The old per-selector dedupe hid it: calls 2 and 3 were swallowed. The
   * moment a repeat threshold existed, three listeners tripped it from a single
   * tap and four tests failed for a reason that had nothing to do with them.
   * State is cleared per test with the reset the app itself calls on
   * navigation.
   */
  beforeAll(async () => {
    delete (window as unknown as Record<string, unknown>).__loveiqUxSignalsInstalled;
    delete (window as unknown as Record<string, unknown>).__loveiqUxSignalsState;
    const mod = await import("@shared/observability/uxSignals");
    install = mod.installUxSignals;
    reset = mod.resetUxSignalsForPageview;
    install();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = "";
    reset();
  });

  it("binds exactly one listener, so a single tap is handled once", () => {
    // The guard above is only as good as something checking it. Two listeners
    // make every count in this file wrong by a factor nobody would notice.
    document.body.innerHTML = `<button class="once" disabled>Next</button>`;
    tap(document.querySelector("button")!);
    expect(tracked.dead).toHaveBeenCalledTimes(1);
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  const tap = (el: Element) =>
    el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, composed: true }));

  const selectors = () => tracked.dead.mock.calls.map(([p]) => p.target_selector as string);

  it("reports a tap on a DISABLED button", () => {
    document.body.innerHTML = `<button class="survey-next" disabled><span class="chev">›</span>Next</button>`;
    tap(document.querySelector("button")!);
    expect(tracked.dead).toHaveBeenCalledTimes(1);
    expect(selectors()[0]).toContain("button");
  });

  it("reports a tap on the ICON inside a disabled button, not just the button", () => {
    // Readers hit the chevron, and PostHog attributes clicks to it — so the
    // child has to resolve to a dead click too.
    document.body.innerHTML = `<button class="survey-next" disabled><span class="chev">›</span></button>`;
    tap(document.querySelector(".chev")!);
    expect(tracked.dead).toHaveBeenCalledTimes(1);
  });

  it("reports aria-disabled controls, which stay focusable and never set .disabled", () => {
    document.body.innerHTML = `<div role="button" aria-disabled="true" class="fake-cta">Next</div>`;
    tap(document.querySelector(".fake-cta")!);
    expect(tracked.dead).toHaveBeenCalledTimes(1);
  });

  it("stays silent on a live button — the whole point of the filter", () => {
    document.body.innerHTML = `<button class="live">Next</button>`;
    tap(document.querySelector("button")!);
    expect(tracked.dead).not.toHaveBeenCalled();
  });

  it("stays silent on a live anchor", () => {
    document.body.innerHTML = `<a class="live" href="#x">Go</a>`;
    tap(document.querySelector("a")!);
    expect(tracked.dead).not.toHaveBeenCalled();
  });

  it("a disabled control does NOT escape via a cursor:pointer ancestor", () => {
    // The old code fell through to a 3-level `cursor: pointer` walk, which
    // would have re-classified the tap as interactive and dropped it again.
    document.body.innerHTML = `<div class="wrap"><button class="survey-next" disabled>Next</button></div>`;
    const wrap = document.querySelector(".wrap") as HTMLElement;
    wrap.style.cursor = "pointer";
    tap(document.querySelector("button")!);
    expect(tracked.dead).toHaveBeenCalledTimes(1);
  });

  it("still reports plain decoration, so nothing regressed", () => {
    document.body.innerHTML = `<p class="copy">Some report copy</p>`;
    tap(document.querySelector("p")!);
    expect(tracked.dead).toHaveBeenCalledTimes(1);
  });

  /**
   * The two cases are not the same finding, and the event could not tell them
   * apart.
   *
   * A disabled control that looks live is a defect. A tap on a paragraph is a
   * reader resting a thumb — 95% of 11,662 events over 30 days, against 5% for
   * disabled controls. `isInteractive` computed the difference and the caller
   * threw it away, so the only way to ask "how many of these are real?" was a
   * regex over the selector: a guess, and the first attempt matched `article`
   * and `aside` because the pattern started `^(button|a|…)`.
   */
  it("says WHY the tap was dead", () => {
    document.body.innerHTML = `<button class="survey-next" disabled>Next</button>`;
    tap(document.querySelector("button")!);
    expect(tracked.dead).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "disabled_control" })
    );
  });

  it("marks a tap on prose as the other thing entirely", () => {
    document.body.innerHTML = `<p class="copy">Some report copy</p>`;
    tap(document.querySelector("p")!);
    expect(tracked.dead).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "non_interactive" })
    );
  });

  it("never labels a live control, because it never reports one", () => {
    // The reason only exists on events that fire. An enabled button responds,
    // so there is nothing to label — asserting that keeps a future "always
    // report, label it dead-or-not" refactor from doubling the event volume.
    document.body.innerHTML = `<button class="survey-next">Next</button>`;
    tap(document.querySelector("button")!);
    expect(tracked.dead).not.toHaveBeenCalled();
  });

  it("keeps the fields the pipeline already reads", () => {
    // verify-ux-findings.mjs passes target_selector and url_path into
    // verify-dead-click-target.mjs — the one probe that reads what the scanner
    // claimed. Adding a field must not move the two it depends on.
    document.body.innerHTML = `<p class="copy">Some report copy</p>`;
    tap(document.querySelector("p")!);
    expect(tracked.dead).toHaveBeenCalledWith(
      expect.objectContaining({ target_selector: "p.copy", pathname: expect.any(String) })
    );
  });

  /**
   * Volume stays bounded, but a reader who KEPT TRYING is now visible.
   *
   * Firing once per (pageview, selector) made "tapped once" and "tapped
   * twenty-one times" the same event — and the survey never changes pathname,
   * so one event covered an entire sitting. PostHog counted 20,081 taps on the
   * disabled Next where this recorded 28. Repetition is what separates a defect
   * from a thumb resting on a paragraph, so it has to survive the dedupe; two
   * events per selector per pageview is still a hard bound.
   */
  it("fires once, again on the third tap, and never more", () => {
    document.body.innerHTML = `<button class="survey-next" disabled>Next</button>`;
    const btn = document.querySelector("button")!;
    tap(btn);
    expect(tracked.dead).toHaveBeenCalledTimes(1);
    expect(tracked.dead).toHaveBeenLastCalledWith(expect.objectContaining({ repeat_count: 1 }));

    tap(btn);
    expect(tracked.dead, "the second tap must stay quiet").toHaveBeenCalledTimes(1);

    tap(btn);
    expect(tracked.dead).toHaveBeenCalledTimes(2);
    expect(tracked.dead).toHaveBeenLastCalledWith(expect.objectContaining({ repeat_count: 3 }));

    // Bounded: tapping forever adds nothing further.
    tap(btn);
    tap(btn);
    tap(btn);
    expect(tracked.dead, "two events per selector per pageview is the cap").toHaveBeenCalledTimes(
      2
    );
  });

  /**
   * THE CASE THAT MATTERS MOST, and the one this could not see.
   *
   * A disabled control carries `pointer-events: none`, so the browser does not
   * dispatch to it at all — `event.target` is whatever sits behind. Driven on
   * production: a finger on the survey's disabled "Next" lands on `nav.flex`,
   * `closest(INTERACTIVE_SELECTOR)` finds NOTHING, and this reported it as
   * `non_interactive` — the same bucket as touching a paragraph. It also handed
   * `nav.flex` to verify-dead-click-target.mjs, the one probe that checks what
   * the reader actually tapped, which then correctly said "ordinary content,
   * not a control". A false clear on the site's single most dead-clicked thing:
   * PostHog's own $dead_click counts it in 929 of ~1000 sessions, 20,081 taps.
   *
   * jsdom gives every element a zero rect, which would make a point-in-box test
   * match everything and assert nothing — so the rects are stubbed, and the
   * negative case below is what proves the check discriminates.
   */
  describe("a control the browser refused to dispatch to", () => {
    const withRects = (rects: Record<string, DOMRect>) =>
      vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (
        this: Element
      ) {
        for (const [sel, r] of Object.entries(rects)) if (this.matches(sel)) return r;
        return { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 } as DOMRect;
      });

    const rect = (left: number, top: number, w: number, h: number) =>
      ({ left, top, right: left + w, bottom: top + h, width: w, height: h }) as DOMRect;

    const tapAt = (el: Element, clientX: number, clientY: number) =>
      el.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, composed: true, clientX, clientY })
      );

    afterEach(() => vi.restoreAllMocks());

    it("names the disabled button, not the container the tap landed on", () => {
      document.body.innerHTML = `<nav class="flex"><button class="prev">Previous</button><button class="next" disabled>Next</button></nav>`;
      withRects({ "button.next": rect(100, 200, 80, 40) });

      // The browser hands us the container, because the button is unreachable.
      tapAt(document.querySelector("nav")!, 140, 220);

      expect(tracked.dead).toHaveBeenCalledTimes(1);
      const call = tracked.dead.mock.calls[0][0];
      expect(call.reason).toBe("disabled_control");
      expect(call.target_selector).toBe("button.next");
    });

    it("does NOT claim one when the finger was somewhere else in the container", () => {
      // Without this the check would be "is there any disabled control nearby",
      // which on a survey screen is always true and would relabel every tap on
      // the page as a dead control.
      document.body.innerHTML = `<nav class="flex"><span class="hint">Choose one</span><button class="next" disabled>Next</button></nav>`;
      withRects({ "button.next": rect(100, 200, 80, 40) });

      tapAt(document.querySelector("nav")!, 10, 10);

      expect(tracked.dead).toHaveBeenCalledTimes(1);
      expect(tracked.dead.mock.calls[0][0].reason).toBe("non_interactive");
    });

    it("ignores an ENABLED control under the finger", () => {
      // Only a control that cannot respond is a defect. A live one that the tap
      // simply missed is not.
      document.body.innerHTML = `<nav class="flex"><button class="next">Next</button></nav>`;
      withRects({ "button.next": rect(100, 200, 80, 40) });

      tapAt(document.querySelector("nav")!, 140, 220);

      expect(tracked.dead).toHaveBeenCalledTimes(1);
      expect(tracked.dead.mock.calls[0][0].reason).toBe("non_interactive");
    });

    it("names the disabled control a reader is HAMMERING, not the container", () => {
      /**
       * Rage detection resolved its node with the same target-based `closest`,
       * so rage-tapping a dead "Next" was keyed to `nav.flex` and reported as
       * rage on a layout div. Repeat taps on a control that cannot respond is
       * the most useful thing this listener can report and it named the wrong
       * element — the same blindness as the dead click, one listener over.
       */
      document.body.innerHTML = `<nav class="flex"><button class="next" disabled>Next</button></nav>`;
      withRects({ "button.next": rect(100, 200, 80, 40) });
      const nav = document.querySelector("nav")!;

      tapAt(nav, 140, 220);
      tapAt(nav, 140, 220);
      tapAt(nav, 140, 220);

      expect(tracked.rage).toHaveBeenCalledTimes(1);
      expect(tracked.rage.mock.calls[0][0].target_selector).toBe("button.next");
    });

    it("counts aria-disabled, which never sets .disabled", () => {
      document.body.innerHTML = `<nav class="flex"><div role="button" aria-disabled="true" class="cta">Next</div></nav>`;
      withRects({ "div.cta": rect(100, 200, 80, 40) });

      tapAt(document.querySelector("nav")!, 140, 220);

      expect(tracked.dead.mock.calls[0][0].reason).toBe("disabled_control");
      expect(tracked.dead.mock.calls[0][0].target_selector).toBe("div.cta");
    });
  });

  it("reopens after a pageview reset", () => {
    document.body.innerHTML = `<button class="survey-next" disabled>Next</button>`;
    const btn = document.querySelector("button")!;
    tap(btn);
    expect(tracked.dead).toHaveBeenCalledTimes(1);
    reset();
    tap(btn);
    expect(tracked.dead).toHaveBeenCalledTimes(2);
    // Counting restarts, so the next pageview is not already half-way to the
    // repeat threshold.
    expect(tracked.dead).toHaveBeenLastCalledWith(expect.objectContaining({ repeat_count: 1 }));
  });
});
