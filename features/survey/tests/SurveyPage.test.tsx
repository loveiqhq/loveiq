// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SurveyPage from "@features/survey/ui/SurveyPage";
import {
  ANSWERS_STORAGE_KEY,
  PENDING_COMPLETION_KEY,
  SURVEY_STEP_KEY,
} from "@features/survey/ui/hooks/surveyStorage";
import { COMPLETED_REPORT_KEY } from "@features/survey/ui/hooks/surveySession";

vi.mock("next/image", () => ({
  default: ({
    src,
    alt,
    unoptimized: _unoptimized,
    ..._props
  }: {
    src: string;
    alt: string;
    unoptimized?: boolean;
  }) => <span aria-label={alt} data-next-image={src} />,
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@features/survey/ui/SurveyEngine", () => ({
  default: ({ onExit, onComplete }: { onExit: () => void; onComplete: () => void }) => (
    <div data-testid="survey-engine">
      <button onClick={onExit}>Exit Survey</button>
      <button onClick={onComplete}>Complete Survey</button>
    </div>
  ),
}));

const pendingCompletion = {
  sessionId: "550e8400-e29b-41d4-a716-446655440000",
  email: "alice@example.com",
  firstName: "Alice",
  answers: { q1: "yes" },
  startedAt: "2026-04-05T10:00:00.000Z",
  durationMs: 5000,
  utmTracker: '{"utm_source":"google"}',
  currentIndex: 2,
  savedAt: "2026-04-05T10:05:00.000Z",
};

describe("SurveyPage", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState(null, "", "/survey");
  });

  afterEach(() => {
    cleanup();
  });

  it("shows the intro screen after hydration", async () => {
    render(<SurveyPage />);

    expect(
      await screen.findByRole("button", { name: /continue to survey introduction/i })
    ).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { name: /sexual archetypes/i })).toHaveLength(2);
  });

  describe("a reader who already finished in this tab", () => {
    // Submission clears the answers and the step key, and loadInitialStep()
    // reads only those two — so Back from the report landed on the intro, which
    // says "Let's prepare you well to discover your sexual archetypes". To
    // someone who had just answered every question that reads as losing all of
    // it. Four scanners reported it 24 times in 30 days; it was 69% of every
    // finding the pipeline produced, and the probe covering it never visited
    // the survey, so all of it was reported as passing.
    it("is not shown the intro", async () => {
      sessionStorage.setItem(COMPLETED_REPORT_KEY, "rpt_abc123");

      render(<SurveyPage />);

      expect(await screen.findByRole("heading", { name: /already finished/i })).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /continue to survey introduction/i })
      ).not.toBeInTheDocument();
    });

    it("is offered their own report, not a restart", async () => {
      sessionStorage.setItem(COMPLETED_REPORT_KEY, "rpt_abc123");

      render(<SurveyPage />);

      const cta = await screen.findByRole("link", { name: /open my report/i });
      expect(cta).toHaveAttribute("href", "/report/rpt_abc123");
    });

    it("can still choose to start a new one", async () => {
      // A screen with no way out is its own trap.
      const user = userEvent.setup();
      sessionStorage.setItem(COMPLETED_REPORT_KEY, "rpt_abc123");
      render(<SurveyPage />);

      await user.click(await screen.findByRole("button", { name: /start a new one/i }));

      expect(
        await screen.findByRole("button", { name: /continue to survey introduction/i })
      ).toBeInTheDocument();
      expect(sessionStorage.getItem(COMPLETED_REPORT_KEY)).toBeNull();
    });

    it("starts a new submission when they go back to consent and agree again", async () => {
      // Round-9 audit: Back from the screens after submitting lands on consent, and
      // "I agree" opened a new run under the finished id, which the server answers with
      // the OLD submission. The same loss as "Start a new one" before #378.
      const user = userEvent.setup();
      sessionStorage.setItem(COMPLETED_REPORT_KEY, "rpt_abc123");
      // The survey session key, as the probe verify-start-over-new-session.mjs seeds it.
      sessionStorage.setItem("loveiq-survey-session", "finished-run");
      sessionStorage.setItem(SURVEY_STEP_KEY, "5");
      render(<SurveyPage />);

      const agree = await screen.findByRole("button", { name: /i agree/i });
      for (const box of screen.getAllByRole("checkbox")) await user.click(box);
      await user.click(agree);

      expect(await screen.findByTestId("survey-engine", {}, { timeout: 1000 })).toBeInTheDocument();
      expect(sessionStorage.getItem("loveiq-survey-session")).toBeNull();
      expect(sessionStorage.getItem(COMPLETED_REPORT_KEY)).toBeNull();
    });

    it("starts a new submission when they go back and then forward onto the survey", async () => {
      // Round-10 audit: Forward remounts the survey through popstate and never passes
      // "I agree", so the finished id was reused.
      sessionStorage.setItem(COMPLETED_REPORT_KEY, "rpt_abc123");
      sessionStorage.setItem("loveiq-survey-session", "finished-run");
      sessionStorage.setItem(SURVEY_STEP_KEY, "5");
      render(<SurveyPage />);
      await screen.findByRole("button", { name: /i agree/i });

      act(() => {
        window.dispatchEvent(new PopStateEvent("popstate", { state: { surveyStep: 6 } }));
      });

      expect(await screen.findByTestId("survey-engine")).toBeInTheDocument();
      expect(sessionStorage.getItem("loveiq-survey-session")).toBeNull();
      expect(sessionStorage.getItem(COMPLETED_REPORT_KEY)).toBeNull();
    });

    it("shows the intro, not the retired report, on the way back from a new run", async () => {
      // Review on #393: the page kept the finished token it read on mount.
      sessionStorage.setItem(COMPLETED_REPORT_KEY, "rpt_abc123");
      sessionStorage.setItem(SURVEY_STEP_KEY, "5");
      render(<SurveyPage />);
      await screen.findByRole("button", { name: /i agree/i });

      act(() => {
        window.dispatchEvent(new PopStateEvent("popstate", { state: { surveyStep: 6 } }));
      });
      await screen.findByTestId("survey-engine");
      act(() => {
        window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
      });

      expect(
        await screen.findByRole("button", { name: /continue to survey introduction/i })
      ).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: /already finished/i })).not.toBeInTheDocument();
    });

    it("keeps a run it just finished when Back lands on a second survey entry", async () => {
      // Round-11 audit: a reload on the survey pushes a second entry for it, and Back from
      // the screens after submitting lands there, step 6 to step 6: no new run begins.
      localStorage.setItem(ANSWERS_STORAGE_KEY, JSON.stringify({ answers: { q1: "a" } }));
      render(<SurveyPage />);
      await screen.findByTestId("survey-engine");
      sessionStorage.setItem(COMPLETED_REPORT_KEY, "rpt_just_finished");
      sessionStorage.setItem("loveiq-survey-session", "just-finished");

      act(() => {
        window.dispatchEvent(new PopStateEvent("popstate", { state: { surveyStep: 6 } }));
      });

      expect(sessionStorage.getItem(COMPLETED_REPORT_KEY)).toBe("rpt_just_finished");
      expect(sessionStorage.getItem("loveiq-survey-session")).toBe("just-finished");
    });

    it("starts a new submission when a landing answer opens the survey after finishing", async () => {
      // Round-11 audit: the landing page's question saves an answer, and /survey then opens
      // straight into the survey, past "I agree".
      sessionStorage.setItem(COMPLETED_REPORT_KEY, "rpt_abc123");
      sessionStorage.setItem("loveiq-survey-session", "finished-run");
      localStorage.setItem(ANSWERS_STORAGE_KEY, JSON.stringify({ answers: { q1: 3 } }));
      render(<SurveyPage />);

      expect(await screen.findByTestId("survey-engine")).toBeInTheDocument();
      expect(sessionStorage.getItem("loveiq-survey-session")).toBeNull();
      expect(sessionStorage.getItem(COMPLETED_REPORT_KEY)).toBeNull();
    });

    it("leaves a pending completion's session alone", async () => {
      sessionStorage.setItem(COMPLETED_REPORT_KEY, "rpt_abc123");
      sessionStorage.setItem("loveiq-survey-session", "pending-run");
      localStorage.setItem(PENDING_COMPLETION_KEY, JSON.stringify(pendingCompletion));
      render(<SurveyPage />);

      expect(await screen.findByTestId("survey-engine")).toBeInTheDocument();
      expect(sessionStorage.getItem("loveiq-survey-session")).toBe("pending-run");
    });

    it("keeps a mid-survey reader's session when they go back and forward", async () => {
      sessionStorage.setItem("loveiq-survey-session", "mid-run");
      sessionStorage.setItem(SURVEY_STEP_KEY, "5");
      render(<SurveyPage />);
      await screen.findByRole("button", { name: /i agree/i });

      act(() => {
        window.dispatchEvent(new PopStateEvent("popstate", { state: { surveyStep: 6 } }));
      });

      expect(await screen.findByTestId("survey-engine")).toBeInTheDocument();
      expect(sessionStorage.getItem("loveiq-survey-session")).toBe("mid-run");
    });

    it("does not hijack a reader who still has answers", async () => {
      // Someone mid-survey belongs in the engine. The finished screen is only
      // for the case where the step logic would otherwise show the intro.
      sessionStorage.setItem(COMPLETED_REPORT_KEY, "rpt_abc123");
      localStorage.setItem(ANSWERS_STORAGE_KEY, JSON.stringify({ answers: { q1: "a" } }));

      render(<SurveyPage />);

      expect(await screen.findByTestId("survey-engine")).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: /already finished/i })).not.toBeInTheDocument();
    });
  });

  it("transitions from the intro screen to the first slide", async () => {
    const user = userEvent.setup();

    render(<SurveyPage />);

    await user.click(
      await screen.findByRole("button", { name: /continue to survey introduction/i })
    );
    expect(
      await screen.findByRole("heading", { name: /quality in/i }, { timeout: 2000 })
    ).toBeInTheDocument();
    expect(screen.getByText("1 / 4")).toBeInTheDocument();
  });

  it("lets the user skip the slide sequence and go to consent", async () => {
    const user = userEvent.setup();

    render(<SurveyPage />);

    await user.click(
      await screen.findByRole("button", { name: /continue to survey introduction/i })
    );
    await screen.findByRole("heading", { name: /quality in/i }, { timeout: 2000 });

    await user.click(screen.getByRole("button", { name: /skip intro/i }));

    expect(await screen.findByRole("heading", { name: /before we begin/i })).toBeInTheDocument();
  });

  it("requires both consent checkboxes before entering the survey engine", async () => {
    const user = userEvent.setup();
    sessionStorage.setItem(SURVEY_STEP_KEY, "5");

    render(<SurveyPage />);

    const agreeButton = await screen.findByRole("button", { name: /i agree/i });
    const checkboxes = screen.getAllByRole("checkbox");

    expect(agreeButton).toBeDisabled();

    await user.click(checkboxes[0]);
    expect(agreeButton).toBeDisabled();

    await user.click(checkboxes[1]);
    expect(agreeButton).toBeEnabled();

    await user.click(agreeButton);
    expect(await screen.findByTestId("survey-engine", {}, { timeout: 1000 })).toBeInTheDocument();
  });

  /**
   * A disabled button cannot explain itself: it takes no pointer events, so
   * there is no hover, no click, nothing. On production 22 people tapped this
   * button while it was disabled in 30 days and 3 never got past the screen —
   * a hard stop at the entrance to the funnel. The checkboxes sit above it and
   * the cookie banner covers the lower one on a Pixel 7 and both on an iPhone
   * SE, so they could not see what was missing.
   */
  it("says why the agree button is not working, and stops once it is", async () => {
    const user = userEvent.setup();
    sessionStorage.setItem(SURVEY_STEP_KEY, "5");

    render(<SurveyPage />);

    const agreeButton = await screen.findByRole("button", { name: /i agree/i });
    const checkboxes = screen.getAllByRole("checkbox");

    expect(agreeButton).toBeDisabled();
    expect(screen.getByText(/tick both boxes above to continue/i)).toBeInTheDocument();

    // Still blocked on one box: the reason must still be shown.
    await user.click(checkboxes[0]);
    expect(screen.getByText(/tick both boxes above to continue/i)).toBeInTheDocument();

    // Not nagging once there is nothing to fix.
    await user.click(checkboxes[1]);
    expect(agreeButton).toBeEnabled();
    expect(screen.queryByText(/tick both boxes above to continue/i)).not.toBeInTheDocument();
  });

  it("announces the reason to a screen reader, not just sighted readers", async () => {
    const user = userEvent.setup();
    sessionStorage.setItem(SURVEY_STEP_KEY, "5");
    render(<SurveyPage />);
    const hint = await screen.findByText(/tick both boxes above to continue/i);
    expect(hint).toHaveAttribute("aria-live", "polite");

    /**
     * The button must POINT AT the reason, not merely sit above it. This is
     * what a screen reader reads when the disabled button takes focus, and it
     * is also how verify-dead-click-target.mjs tells a dead end apart from a
     * control that is blocked but explains itself — without it that probe
     * reports this correct behaviour as a defect on every run, and D1 is in
     * AUTO_PR_CRITERIA, so it would open a draft PR against it.
     */
    const agreeButton = screen.getByRole("button", { name: /i agree/i });
    expect(agreeButton).toHaveAttribute("aria-describedby", hint.id);
    expect(hint.id).toBeTruthy();

    // ...and stops pointing once there is nothing to explain.
    const checkboxes = screen.getAllByRole("checkbox");
    await user.click(checkboxes[0]);
    await user.click(checkboxes[1]);
    expect(agreeButton).not.toHaveAttribute("aria-describedby");
  });

  it("restores the consent screen from session storage", async () => {
    sessionStorage.setItem(SURVEY_STEP_KEY, "5");

    render(<SurveyPage />);

    expect(await screen.findByRole("heading", { name: /before we begin/i })).toBeInTheDocument();
  });

  // Regression, 2026-09-14: "Return to site" was wired `onClick={onReturn}`,
  // so React handed handleReturn the MouseEvent as its `clearAnswers`
  // argument. Being truthy, it wiped the saved answers and sent the user to
  // the token-less /report ("Can't find your report") instead of the site
  // root. The prop was typed `() => void`, which hid it from the compiler.
  it("returns to the site root from consent without wiping answers", async () => {
    sessionStorage.setItem(SURVEY_STEP_KEY, "5");
    localStorage.setItem(ANSWERS_STORAGE_KEY, JSON.stringify({ answers: { q1: "yes" } }));

    const original = Object.getOwnPropertyDescriptor(window, "location");
    const navigated: string[] = [];
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        get href() {
          return "/survey";
        },
        set href(value: string) {
          navigated.push(value);
        },
      },
    });

    try {
      render(<SurveyPage />);
      await userEvent.click(await screen.findByRole("button", { name: /return to site/i }));

      expect(navigated).toEqual(["/"]);
      expect(localStorage.getItem(ANSWERS_STORAGE_KEY)).not.toBeNull();
    } finally {
      if (original) Object.defineProperty(window, "location", original);
    }
  });

  // Regression, 2026-10-04: a reload restores the step onto the entry it was saved from,
  // and pushing a second copy buried the questions' own entry, so the first Back after a
  // reload did nothing.
  it("does not stack a second history entry for the step a reload restores", async () => {
    window.history.replaceState({ surveyStep: 6, surveyQuestion: 3 }, "", "/survey");
    sessionStorage.setItem(SURVEY_STEP_KEY, "6");
    localStorage.setItem(ANSWERS_STORAGE_KEY, JSON.stringify({ answers: { q1: "yes" } }));
    const push = vi.spyOn(window.history, "pushState");
    try {
      render(<SurveyPage />);
      await screen.findByTestId("survey-engine");
      expect(push).not.toHaveBeenCalled();
    } finally {
      push.mockRestore();
    }
  });

  it("still pushes the entry when it arrives at a step from elsewhere", async () => {
    sessionStorage.setItem(SURVEY_STEP_KEY, "6");
    localStorage.setItem(ANSWERS_STORAGE_KEY, JSON.stringify({ answers: { q1: "yes" } }));
    const push = vi.spyOn(window.history, "pushState");
    try {
      render(<SurveyPage />);
      await screen.findByTestId("survey-engine");
      expect(push).toHaveBeenCalledWith(expect.objectContaining({ surveyStep: 6 }), "");
    } finally {
      push.mockRestore();
    }
  });

  it("restores the survey engine when answers exist in local storage", async () => {
    localStorage.setItem(
      ANSWERS_STORAGE_KEY,
      JSON.stringify({
        answers: { q1: "yes" },
        currentIndex: 1,
        startedAt: "2026-04-05T10:00:00.000Z",
      })
    );

    render(<SurveyPage />);

    expect(await screen.findByTestId("survey-engine")).toBeInTheDocument();
  });

  it("restores the survey engine when a pending completion exists", async () => {
    localStorage.setItem(PENDING_COMPLETION_KEY, JSON.stringify(pendingCompletion));

    render(<SurveyPage />);

    expect(await screen.findByTestId("survey-engine")).toBeInTheDocument();
  });
});
