// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
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

    await user.click(agreeButton);
    expect(await screen.findByText(/check both boxes above/i)).toBeInTheDocument();
    expect(screen.queryByTestId("survey-engine")).not.toBeInTheDocument();

    await user.click(checkboxes[0]);
    await user.click(agreeButton);
    expect(screen.queryByTestId("survey-engine")).not.toBeInTheDocument();

    await user.click(checkboxes[1]);
    await user.click(agreeButton);
    expect(await screen.findByTestId("survey-engine", {}, { timeout: 1000 })).toBeInTheDocument();
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
