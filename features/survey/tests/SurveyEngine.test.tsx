// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup, act, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

const mockSetAnswer = vi.fn();
const mockGetAnswer = vi.fn().mockReturnValue(null);
const mockSetCurrentIndex = vi.fn();
const mockTrackNavigation = vi.fn();
const mockSubmit = vi.fn();

let mockCurrentIndex = 0;
let mockProgress = 0;
let mockSubmitStatus = "idle";
// qIds answered on the landing page — SurveyEngine drops these from the flow.
let mockPrefilled: string[] = [];
// A test's own questions; null keeps the four defaults.
let mockQuestions: ReturnType<typeof makeSurveyQuestion>[] | null = null;

// Staging, previews and dev (true) or the live site (false): the jump menu's gate.
let mockNonProd = true;
vi.mock("@shared/env/is-non-prod-deploy", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@shared/env/is-non-prod-deploy")>()),
  isNonProdDeploy: () => mockNonProd,
}));

vi.mock("@features/survey/ui/hooks/useSurveyState", () => ({
  useSurveyState: () => ({
    answers: {},
    get currentIndex() {
      return mockCurrentIndex;
    },
    startedAt: new Date().toISOString(),
    get prefilled() {
      return mockPrefilled;
    },
    get progress() {
      return mockProgress;
    },
    setAnswer: mockSetAnswer,
    getAnswer: mockGetAnswer,
    // The submit path reads the answers through this, never the `answers` closure —
    // see features/survey/tests/hooks/latestAnswers.test.ts for why.
    getLatestAnswers: () => ({}),
    setCurrentIndex: mockSetCurrentIndex,
    clearState: vi.fn(),
  }),
}));

const mockClearPendingCompletion = vi.fn();
let mockErrorKind: string | null = null;
vi.mock("@features/survey/ui/hooks/useSubmitSurvey", () => ({
  useSubmitSurvey: () => ({
    submit: mockSubmit,
    retryPending: vi.fn(),
    clearPendingCompletion: mockClearPendingCompletion,
    hasPendingCompletion: false,
    get status() {
      return mockSubmitStatus;
    },
    get errorKind() {
      return mockErrorKind;
    },
  }),
}));

vi.mock("@features/survey/ui/hooks/useSurveyTracking", () => ({
  useSurveyTracking: () => ({ trackNavigation: mockTrackNavigation }),
}));

// Mock survey questions sourced from the shared fixture factory so a schema
// change to SurveyQuestion is a one-file edit. The async factory is required
// because vi.mock() hoists above the top-level imports.
vi.mock("@/data/survey-data", async () => {
  const { defaultSurveyQuestions } = await import("@/__tests__/__fixtures__/survey");
  const defaults = defaultSurveyQuestions();
  return {
    // Read at render, so a test can swap in its own questions (the email step).
    get surveyQuestions() {
      return mockQuestions ?? defaults;
    },
  };
});

vi.mock("@features/analytics/client", () => ({
  trackSurveyStart: vi.fn(),
  trackSurveyAnswer: vi.fn(),
  trackSurveyProgress: vi.fn(),
  trackSurveyComplete: vi.fn(),
  trackSurveyFormError: vi.fn(),
  setReportSubmissionContext: vi.fn(),
  setSurveyVariant: vi.fn(),
  trackExperimentExposure: vi.fn(),
}));

vi.mock("@features/survey/ui/questions/SingleChoiceQuestion", () => ({
  default: (props: { question: { question: string } }) => (
    <div data-testid="single-choice">{props.question.question}</div>
  ),
}));

vi.mock("@features/survey/ui/questions/ScaleQuestion", () => ({
  default: (props: { question: { question: string } }) => (
    <div data-testid="scale-question">{props.question.question}</div>
  ),
}));

vi.mock("@features/survey/ui/questions/OpenResponseQuestion", () => ({
  default: (props: { question: { question: string } }) => (
    <div data-testid="open-response">{props.question.question}</div>
  ),
}));

vi.mock("@features/survey/ui/questions/MultipleChoiceQuestion", () => ({
  default: (props: { question: { question: string }; forceValidation?: boolean }) => (
    <div data-testid="multiple-choice">
      {props.question.question}
      {props.forceValidation ? " (validated)" : ""}
    </div>
  ),
}));

vi.mock("@features/survey/ui/questions/CountryQuestion", () => ({
  default: (props: { question: { question: string } }) => (
    <div data-testid="country-question">{props.question.question}</div>
  ),
}));

vi.mock("@features/survey/ui/SurveyProgress", () => ({
  default: (props: { index: number; total: number }) => (
    <div data-testid="survey-progress">
      {props.index}/{props.total}
    </div>
  ),
}));

vi.mock("@features/survey/ui/SurveyNav", () => ({
  default: (props: {
    canGoNext: boolean;
    hasAnswer: boolean;
    onNext: () => void;
    onPrevious: () => void;
    progress?: ReactNode;
  }) => (
    <div data-testid="survey-nav" data-ready={String(props.hasAnswer)}>
      <button data-testid="survey-nav-prev" onClick={props.onPrevious}>
        Previous
      </button>
      {props.progress}
      <button data-testid="survey-nav-next" onClick={props.onNext} disabled={!props.canGoNext}>
        Next
      </button>
    </div>
  ),
}));

vi.mock("@features/survey/ui/GuidancePanel", () => ({
  default: () => <div data-testid="guidance-panel" />,
}));

vi.mock("@features/survey/ui/PreReportWizard", () => ({
  default: ({ onComplete }: { onComplete: () => void }) => (
    <div data-testid="pre-report-wizard">
      <button onClick={onComplete}>Complete Wizard</button>
    </div>
  ),
}));

vi.mock("@features/survey/ui/ProcessingSequence", () => ({
  default: ({ onComplete }: { onComplete: () => void; submitDone: boolean }) => (
    <div data-testid="processing-sequence">
      <span>Extracting your answers...</span>
      <button onClick={onComplete}>Finish Processing</button>
    </div>
  ),
}));

import SurveyEngine from "@features/survey/ui/SurveyEngine";
import { makeSurveyQuestion } from "@/__tests__/__fixtures__/survey";

beforeEach(() => {
  vi.useFakeTimers();
  mockCurrentIndex = 0;
  mockProgress = 0;
  mockSubmitStatus = "idle";
  mockPrefilled = [];
  mockNonProd = true;
  mockQuestions = null;
  mockSetAnswer.mockClear();
  mockGetAnswer.mockClear().mockReturnValue(null);
  mockSetCurrentIndex.mockClear();
  mockTrackNavigation.mockClear();
  mockSubmit.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("SurveyEngine", () => {
  it("drops a landing-prefilled question from the flow", () => {
    // A question answered on the landing page must not be asked again: it is
    // removed from the list, so everything after it shifts up by one index.
    mockCurrentIndex = 1;
    const { unmount } = render(<SurveyEngine onExit={() => {}} onComplete={() => {}} />);
    expect(screen.getByText("Q2?")).toBeInTheDocument();
    unmount();

    mockPrefilled = ["q2"];
    render(<SurveyEngine onExit={() => {}} onComplete={() => {}} />);
    expect(screen.queryByText("Q2?")).toBeNull();
    // Index 1 now holds what used to be index 2.
    expect(screen.getByText("Q3?")).toBeInTheDocument();
  });

  it("renders first question on mount", () => {
    render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);
    expect(screen.getByTestId("single-choice")).toBeInTheDocument();
    expect(screen.getByText("Q1?")).toBeInTheDocument();
  });

  it("renders the correct question component for answerType single", () => {
    render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);
    expect(screen.getByTestId("single-choice")).toBeInTheDocument();
    expect(screen.queryByTestId("scale-question")).not.toBeInTheDocument();
    expect(screen.queryByTestId("open-response")).not.toBeInTheDocument();
  });

  it("shows the processing sequence while the submit is in flight", () => {
    mockCurrentIndex = 4;
    mockProgress = 100;
    mockSubmitStatus = "submitting";

    render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);
    expect(screen.getByTestId("processing-sequence")).toBeInTheDocument();
    expect(screen.getByText("Extracting your answers...")).toBeInTheDocument();
  });

  it("goes on to the report, not a processing screen that never ends, on a finished run with nothing in flight", () => {
    // Regression, 2026-10-04: Back while the final submit was in flight left the run
    // finished with nothing pending; mounting onto it waited forever at 95%.
    mockCurrentIndex = 4;
    mockProgress = 100;
    sessionStorage.setItem("loveiq-completed-report", "rpt_remembered");
    const onComplete = vi.fn();
    try {
      render(<SurveyEngine onExit={vi.fn()} onComplete={onComplete} />);

      expect(screen.queryByTestId("processing-sequence")).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /complete wizard/i }));
      expect(onComplete).toHaveBeenCalledWith("rpt_remembered");
    } finally {
      sessionStorage.removeItem("loveiq-completed-report");
    }
  });

  it("calls onComplete when wizard completes", () => {
    mockCurrentIndex = 4;
    mockProgress = 100;

    const onComplete = vi.fn();
    mockSubmitStatus = "success";
    render(<SurveyEngine onExit={vi.fn()} onComplete={onComplete} />);

    fireEvent.click(screen.getByRole("button", { name: /finish processing/i }));
    expect(screen.getByTestId("pre-report-wizard")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /complete wizard/i }));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("renders scale question component for answerType scale", () => {
    mockCurrentIndex = 1;

    render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);
    expect(screen.getByTestId("scale-question")).toBeInTheDocument();
    expect(screen.getByText("Q2?")).toBeInTheDocument();
  });

  it("renders open response question component for answerType open", () => {
    mockCurrentIndex = 2;

    render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);
    expect(screen.getByTestId("open-response")).toBeInTheDocument();
    expect(screen.getByText("Q3?")).toBeInTheDocument();
  });

  it("lets an optional open question go Next with nothing typed", () => {
    // Mark's content asks (16019, 16020) are optional: an empty box must never block the
    // survey. q3 is the fixture's optional open question.
    mockCurrentIndex = 2;
    render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);
    expect(screen.getByTestId("survey-nav-next")).not.toBeDisabled();
  });

  it("draws Next as ready on an empty optional question, not in its greyed 'answer first' style", () => {
    // SurveyNav fades Next until the question has an answer. On an optional question that
    // fade tells the respondent they are blocked when they are not.
    mockCurrentIndex = 2;
    render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);
    expect(screen.getByTestId("survey-nav")).toHaveAttribute("data-ready", "true");
  });

  it("still fades Next on an empty required question", () => {
    render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);
    expect(screen.getByTestId("survey-nav")).toHaveAttribute("data-ready", "false");
  });

  it("renders multiple choice question component for answerType multiple", () => {
    mockCurrentIndex = 3;

    render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);
    expect(screen.getByTestId("multiple-choice")).toBeInTheDocument();
    expect(screen.getByText("Q4?")).toBeInTheDocument();
  });

  it("shows the nav and the progress strip when in question view", () => {
    render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);
    expect(screen.getByTestId("survey-nav")).toBeInTheDocument();
    expect(screen.getByTestId("survey-progress")).toBeInTheDocument();
  });

  it("draws the progress strip inside the footer row, between Previous and Next", () => {
    // Figma 11303:174, ready for dev 2026-10-06: one slim row, not two.
    render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);
    const nav = screen.getByTestId("survey-nav");
    expect(nav).toContainElement(screen.getByTestId("survey-progress"));
  });

  it("feeds the progress strip the position on screen, out of the questions asked", () => {
    // A landing-prefilled question leaves the flow, so the strip must count what
    // is actually asked: 4 fixture questions minus q2 is 3, and index 1 is Q3.
    mockPrefilled = ["q2"];
    mockCurrentIndex = 1;
    render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);
    expect(screen.getByTestId("survey-progress")).toHaveTextContent("1/3");
  });

  it("offers no Pause or Auto-advance control any more", () => {
    // Both left with the 2026-10-04 redesign (Figma 11303:174).
    render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /pause|save & exit/i })).toBeNull();
    expect(screen.queryByText(/auto-advance/i)).toBeNull();
  });

  it("blocks progressing when a persisted multiselect answer exceeds maxSelections", () => {
    mockCurrentIndex = 3;
    mockGetAnswer.mockImplementation((qId: string) => {
      if (qId === "q4") return ["A", "B", "C", "D"];
      return null;
    });

    render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);

    expect(screen.getByTestId("survey-nav-next")).toBeDisabled();

    fireEvent.keyDown(window, { key: "Enter" });

    expect(mockSetCurrentIndex).not.toHaveBeenCalled();
    expect(screen.getByText("Q4? (validated)")).toBeInTheDocument();
  });

  it("records the blocked attempt, naming the question and why", async () => {
    // `trackSurveyFormError` sat in analytics/client.ts and was never called
    // once — the event was not even in PostHog's taxonomy — while Marcus was
    // asking the agents to check against form errors. This is the only kind
    // this survey can produce: a Next that refuses.
    const { trackSurveyFormError } = await import("@features/analytics/client");
    // This suite does not reset mocks between tests, so a call count is
    // cumulative unless it is cleared here.
    vi.mocked(trackSurveyFormError).mockClear();
    mockCurrentIndex = 3;
    mockGetAnswer.mockImplementation((qId: string) => (qId === "q4" ? ["A", "B", "C", "D"] : null));

    render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);
    fireEvent.keyDown(window, { key: "Enter" });

    expect(trackSurveyFormError).toHaveBeenCalledWith({
      question_id: "q4",
      error_kind: "out_of_range",
    });
  });

  it("counts every blocked attempt, not one per question", async () => {
    // Pressing Next four times against the same rejection is the signal, the
    // same way a rage click is. Deduping would erase it.
    const { trackSurveyFormError } = await import("@features/analytics/client");
    // This suite does not reset mocks between tests, so a call count is
    // cumulative unless it is cleared here.
    vi.mocked(trackSurveyFormError).mockClear();
    mockCurrentIndex = 3;
    mockGetAnswer.mockImplementation((qId: string) => (qId === "q4" ? ["A", "B", "C", "D"] : null));

    render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);
    fireEvent.keyDown(window, { key: "Enter" });
    fireEvent.keyDown(window, { key: "Enter" });
    fireEvent.keyDown(window, { key: "Enter" });

    expect(trackSurveyFormError).toHaveBeenCalledTimes(3);
  });

  it("stays silent when the answer is valid", async () => {
    const { trackSurveyFormError } = await import("@features/analytics/client");
    // This suite does not reset mocks between tests, so a call count is
    // cumulative unless it is cleared here.
    vi.mocked(trackSurveyFormError).mockClear();
    mockCurrentIndex = 3;
    mockGetAnswer.mockImplementation((qId: string) => (qId === "q4" ? ["A", "B", "C"] : null));

    render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);
    fireEvent.keyDown(window, { key: "Enter" });

    expect(trackSurveyFormError).not.toHaveBeenCalled();
  });

  it("allows a capped multiselect answer at the limit to proceed normally", () => {
    mockCurrentIndex = 3;
    mockGetAnswer.mockImplementation((qId: string) => {
      if (qId === "q4") return ["A", "B", "C"];
      return null;
    });

    render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);

    expect(screen.getByTestId("survey-nav-next")).not.toBeDisabled();

    fireEvent.click(screen.getByTestId("survey-nav-next"));

    expect(mockSubmit).toHaveBeenCalledTimes(1);
    expect(mockSetCurrentIndex).toHaveBeenCalledWith(4);
  });
});

describe("SurveyEngine completion phases", () => {
  it("transitions from processing to the pre-report wizard on success", () => {
    mockCurrentIndex = 4;
    mockProgress = 100;
    mockSubmitStatus = "success";

    render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);

    expect(screen.getByTestId("processing-sequence")).toBeInTheDocument();
    expect(screen.queryByTestId("pre-report-wizard")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /finish processing/i }));

    expect(screen.getByTestId("pre-report-wizard")).toBeInTheDocument();
    expect(screen.queryByTestId("processing-sequence")).not.toBeInTheDocument();
  });

  it("transitions through full success flow: processing -> wizard -> complete", () => {
    mockCurrentIndex = 4;
    mockProgress = 100;
    mockSubmitStatus = "success";

    const onComplete = vi.fn();
    render(<SurveyEngine onExit={vi.fn()} onComplete={onComplete} />);

    fireEvent.click(screen.getByRole("button", { name: /finish processing/i }));
    expect(screen.getByTestId("pre-report-wizard")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /complete wizard/i }));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("skips wizard and shows error confirmation on error", () => {
    mockCurrentIndex = 4;
    mockProgress = 100;
    mockSubmitStatus = "error";

    render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);

    expect(screen.getByTestId("processing-sequence")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /finish processing/i }));

    expect(screen.getByText("Submission Interrupted")).toBeInTheDocument();
    expect(screen.queryByTestId("pre-report-wizard")).not.toBeInTheDocument();
  });

  describe("swipes", () => {
    const swipeRight = (start: EventTarget) => {
      fireEvent.touchStart(start, { touches: [{ clientX: 40, clientY: 300 }] });
      fireEvent.touchEnd(window, { changedTouches: [{ clientX: 240, clientY: 305 }] });
    };

    // A drag across the 1-7 scale (it looks like a slider), or along a text box to move
    // the caret, went to the previous or next question.
    it.each([
      [
        "the scale",
        () => {
          const scale = document.createElement("div");
          scale.setAttribute("data-no-swipe", "");
          return scale;
        },
      ],
      ["a text box", () => document.createElement("input")],
      ["a text area", () => document.createElement("textarea")],
    ])("a drag that starts on %s does not change the question", (_label, make) => {
      mockCurrentIndex = 1;
      const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
      render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);
      mockSetCurrentIndex.mockClear();
      const el = make();
      document.body.appendChild(el);
      try {
        swipeRight(el);
        expect(back).not.toHaveBeenCalled();
        expect(mockSetCurrentIndex).not.toHaveBeenCalled();
      } finally {
        el.remove();
        back.mockRestore();
      }
    });

    it("a swipe anywhere else still goes back a question", () => {
      mockCurrentIndex = 1;
      const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
      render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);
      mockSetCurrentIndex.mockClear();
      try {
        swipeRight(document.body);
        // Back pops an entry, or with none above the base, moves on its own.
        expect(back.mock.calls.length + mockSetCurrentIndex.mock.calls.length).toBe(1);
      } finally {
        back.mockRestore();
      }
    });

    // Pinch-zoom is on, and the finger a horizontal pinch lifts first was measured from
    // the other finger's start, so spreading two fingers went back a question.
    const a = { clientX: 40, clientY: 300 };
    const b = { clientX: 60, clientY: 300 };
    it.each([
      [
        "a pinch, one finger lifting first",
        () => {
          fireEvent.touchStart(document.body, { touches: [a] });
          fireEvent.touchStart(document.body, { touches: [a, b] });
          fireEvent.touchEnd(window, {
            touches: [a],
            changedTouches: [{ clientX: 240, clientY: 305 }],
          });
          fireEvent.touchEnd(window, { touches: [], changedTouches: [a] });
        },
      ],
      [
        "a pinch, both fingers lifting together",
        () => {
          fireEvent.touchStart(document.body, { touches: [a] });
          fireEvent.touchStart(document.body, { touches: [a, b] });
          fireEvent.touchEnd(window, {
            touches: [],
            changedTouches: [{ clientX: 240, clientY: 305 }, b],
          });
        },
      ],
      [
        "a finger lifting while another is down, its touch start unheard",
        () => {
          fireEvent.touchStart(document.body, { touches: [a] });
          fireEvent.touchEnd(window, {
            touches: [a],
            changedTouches: [{ clientX: 240, clientY: 305 }],
          });
        },
      ],
      [
        "a drag across a zoomed-in page",
        () => {
          Object.defineProperty(window, "visualViewport", {
            configurable: true,
            value: { scale: 2 },
          });
          try {
            swipeRight(document.body);
          } finally {
            delete (window as { visualViewport?: unknown }).visualViewport;
          }
        },
      ],
    ])("%s does not change the question", (_label, gesture) => {
      mockCurrentIndex = 1;
      const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
      render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);
      mockSetCurrentIndex.mockClear();
      try {
        gesture();
        expect(back).not.toHaveBeenCalled();
        expect(mockSetCurrentIndex).not.toHaveBeenCalled();
      } finally {
        back.mockRestore();
      }
    });
  });

  // Focus stays on Next, so a screen reader said nothing when the question changed.
  it("announces each new question to screen readers", () => {
    mockQuestions = [
      makeSurveyQuestion({ qId: "q1", question: "First question?" }),
      makeSurveyQuestion({ qId: "q2", question: "Second question?" }),
    ];
    try {
      mockCurrentIndex = 0;
      const { rerender, container } = render(
        <SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />
      );
      const live = () => container.querySelector('[aria-live="polite"]')?.textContent;
      expect(live()).toBe("Question 1 of 2: First question?");
      mockCurrentIndex = 1;
      rerender(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);
      expect(live()).toBe("Question 2 of 2: Second question?");
    } finally {
      mockQuestions = null;
    }
  });

  // pan-y alone turned pinch-zoom off for the whole survey.
  it("lets the reader pinch to zoom", () => {
    mockCurrentIndex = 0;
    const { container } = render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);
    expect((container.querySelector("main") as HTMLElement).style.touchAction).toContain(
      "pinch-zoom"
    );
  });

  it("never re-runs a finished run from the keyboard or a swipe", () => {
    // A remount onto the retry screen resets hasCompleted; ArrowRight, Enter or a left
    // swipe there re-ran the whole completion (a second survey_completed and payload).
    mockCurrentIndex = 4;
    mockProgress = 100;
    mockSubmitStatus = "error";
    render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /finish processing/i }));

    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.touchStart(window, { touches: [{ clientX: 240, clientY: 300 }] });
    fireEvent.touchEnd(window, { changedTouches: [{ clientX: 40, clientY: 305 }] });

    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it("sends the reader back to the email question when the server refused the address", () => {
    mockQuestions = [
      makeSurveyQuestion({ qId: "q1", question: "First?" }),
      makeSurveyQuestion({
        qId: "00000",
        question: "What is your email?",
        answerType: "open",
        inputType: "email",
        options: [],
      }),
      makeSurveyQuestion({ qId: "16015", question: "Keep me posted?" }),
    ];
    mockCurrentIndex = 3;
    mockSubmitStatus = "error";
    mockErrorKind = "email";
    try {
      render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);
      fireEvent.click(screen.getByRole("button", { name: /finish processing/i }));

      expect(screen.queryByRole("button", { name: /retry submission/i })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /fix my email/i }));

      expect(mockClearPendingCompletion).toHaveBeenCalled();
      expect(mockSetCurrentIndex).toHaveBeenCalledWith(1);
    } finally {
      mockErrorKind = null;
    }
  });

  it("Start Over on the error screen starts over, it does not take the success path", () => {
    // It was wired to onComplete, which wiped the answers and opened
    // /report/[object Object] for a submission that never happened (2026-10-03).
    mockCurrentIndex = 4;
    mockProgress = 100;
    mockSubmitStatus = "error";
    const onComplete = vi.fn();
    const onStartOver = vi.fn();

    render(<SurveyEngine onExit={vi.fn()} onComplete={onComplete} onStartOver={onStartOver} />);
    fireEvent.click(screen.getByRole("button", { name: /finish processing/i }));
    fireEvent.click(screen.getByRole("button", { name: /start over/i }));

    expect(onStartOver).toHaveBeenCalledTimes(1);
    expect(onComplete).not.toHaveBeenCalled();
  });
});

describe("SurveyEngine — the phone's Back button walks the questions", () => {
  // Regression, 2026-10-04: the questions shared ONE history entry, so the phone's Back
  // left them for the 18+ consent screen (unticked boxes, read as "the survey reset") and
  // a couple more presses reached the homepage. 20 readers landed there mid-survey in
  // four days; 19 never answered again.
  const q = (index: number, base: number) => ({ surveyQuestion: index, surveyQuestionBase: base });
  const popTo = (state: unknown) =>
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate", { state }));
    });

  beforeEach(() => {
    window.history.replaceState(null, "", "/survey");
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("gives every question it moves forward to its own entry, on a marked base", () => {
    mockCurrentIndex = 1; // q2, optional, so Next is live
    const replace = vi.spyOn(window.history, "replaceState");
    const push = vi.spyOn(window.history, "pushState");
    render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);

    fireEvent.click(screen.getByTestId("survey-nav-next"));

    expect(replace).toHaveBeenCalledWith(expect.objectContaining(q(1, 1)), "");
    expect(push).toHaveBeenCalledWith(expect.objectContaining(q(2, 1)), "");
    expect(mockSetCurrentIndex).toHaveBeenCalledWith(2);
  });

  it("shows the question a Back lands on", () => {
    mockCurrentIndex = 2;
    render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);

    popTo(q(1, 0));

    expect(mockSetCurrentIndex).toHaveBeenCalledWith(1);
    expect(mockTrackNavigation).toHaveBeenCalledWith("back");
  });

  it("ignores a Back that lands on the question already showing", () => {
    // Re-running goTo for it would replay the entry animation and log a false move.
    mockCurrentIndex = 2;
    render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);

    popTo(q(2, 0));

    expect(mockSetCurrentIndex).not.toHaveBeenCalled();
    expect(mockTrackNavigation).not.toHaveBeenCalledWith("forward");
  });

  it("leaves a Back past the questions (consent, a slide) to the page", () => {
    mockCurrentIndex = 2;
    render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);

    popTo({ surveyStep: 5 });

    expect(mockSetCurrentIndex).not.toHaveBeenCalled();
  });

  it("reopens no question once the run is finished, even one restored onto that screen", () => {
    mockCurrentIndex = 4; // past the last of four: the completion screens
    mockProgress = 100;
    render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);

    popTo(q(2, 0));

    expect(mockSetCurrentIndex).not.toHaveBeenCalled();
  });

  it("Previous pops the entry above the base, and the popstate moves the screen", () => {
    window.history.replaceState(q(2, 0), "");
    mockCurrentIndex = 2;
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);

    fireEvent.click(screen.getByTestId("survey-nav-prev"));
    expect(back).toHaveBeenCalledTimes(1);
    expect(mockSetCurrentIndex).not.toHaveBeenCalled();

    popTo(q(1, 0));
    act(() => {
      vi.advanceTimersByTime(600);
    });
    // Moved once, by the popstate: its arrival cancelled the fallback.
    expect(mockSetCurrentIndex).toHaveBeenCalledTimes(1);
    expect(mockSetCurrentIndex).toHaveBeenCalledWith(1);
  });

  it("Previous still moves when the browser had no entry left to go back to", () => {
    // Browsers keep 50 entries; deep into the 57 questions the ones below are evicted
    // and back() does nothing, so the button must not go dead.
    window.history.replaceState(q(2, 0), "");
    mockCurrentIndex = 2;
    vi.spyOn(window.history, "back").mockImplementation(() => {});
    const replace = vi.spyOn(window.history, "replaceState");
    render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);

    fireEvent.click(screen.getByTestId("survey-nav-prev"));
    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(mockSetCurrentIndex).toHaveBeenCalledWith(1);
    expect(replace).toHaveBeenCalledWith(expect.objectContaining(q(1, 1)), "");
  });

  it("two fast Previous taps leave no stale fallback to move the screen later", () => {
    window.history.replaceState(q(3, 0), "");
    mockCurrentIndex = 3;
    mockGetAnswer.mockImplementation((qId: string) => (qId === "q4" ? ["A"] : null));
    vi.spyOn(window.history, "back").mockImplementation(() => {});
    render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);

    fireEvent.click(screen.getByTestId("survey-nav-prev"));
    fireEvent.click(screen.getByTestId("survey-nav-prev"));
    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(mockSetCurrentIndex).toHaveBeenCalledTimes(1);
  });

  it("Previous at the base moves without history and re-points the base", () => {
    window.history.replaceState(q(2, 2), "");
    mockCurrentIndex = 2;
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const replace = vi.spyOn(window.history, "replaceState");
    render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);

    fireEvent.click(screen.getByTestId("survey-nav-prev"));

    expect(back).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith(expect.objectContaining(q(1, 1)), "");
    expect(mockSetCurrentIndex).toHaveBeenCalledWith(1);
  });

  it("submitting collapses the question entries onto the base", () => {
    window.history.replaceState(q(3, 0), "");
    mockCurrentIndex = 3; // the last question
    mockGetAnswer.mockImplementation((qId: string) => (qId === "q4" ? ["A", "B"] : null));
    vi.spyOn(window.history, "length", "get").mockReturnValue(20);
    const go = vi.spyOn(window.history, "go").mockImplementation(() => {});
    render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);

    fireEvent.click(screen.getByTestId("survey-nav-next"));

    expect(mockSubmit).toHaveBeenCalled();
    expect(go).toHaveBeenCalledWith(-3);
  });

  it("never collapses further back than the browser holds", () => {
    // A go() past the first entry is a no-op, so asking for -56 on a capped stack would
    // collapse nothing at all.
    window.history.replaceState(q(3, 0), "");
    mockCurrentIndex = 3;
    mockGetAnswer.mockImplementation((qId: string) => (qId === "q4" ? ["A", "B"] : null));
    vi.spyOn(window.history, "length", "get").mockReturnValue(2);
    const go = vi.spyOn(window.history, "go").mockImplementation(() => {});
    render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);

    fireEvent.click(screen.getByTestId("survey-nav-next"));

    expect(go).toHaveBeenCalledWith(-1);
  });

  // Found in review, 2026-10-04: the tests below.
  it("makes an entry that names another question the base before moving on", () => {
    // The engine restored question 2 from storage while the entry still names question 1
    // (another tab moved the run on, or a jump through the Back menu). Keeping that
    // entry's base let Previous from question 3 fall straight through to question 1.
    window.history.replaceState(q(0, 0), "", "/survey");
    mockCurrentIndex = 1; // optional, so Next is live
    const push = vi.spyOn(window.history, "pushState");
    render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);

    fireEvent.click(screen.getByTestId("survey-nav-next"));

    expect(push).toHaveBeenCalledWith(expect.objectContaining(q(2, 1)), "");
  });

  it("lets Forward through where Next would go", () => {
    window.history.replaceState(q(1, 0), "", "/survey");
    mockCurrentIndex = 1; // optional
    render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);

    popTo(q(2, 0));

    expect(mockSetCurrentIndex).toHaveBeenCalledWith(2);
    expect(mockTrackNavigation).toHaveBeenCalledWith("forward");
  });

  it("refuses a Forward off a required question left unanswered", () => {
    window.history.replaceState(q(0, 0), "", "/survey");
    mockCurrentIndex = 0; // required, no answer: Next is disabled
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);

    popTo(q(1, 0));

    expect(mockSetCurrentIndex).not.toHaveBeenCalled();
    expect(back).toHaveBeenCalledTimes(1); // the history steps back onto this question
  });

  it("refuses a Forward off the email question until the address is confirmed", () => {
    // Back to the email question clears the confirmation; an edit and the browser's
    // Forward then submitted an address nobody had confirmed.
    mockQuestions = [
      makeSurveyQuestion({
        qId: "00000",
        question: "What is your email?",
        answerType: "open",
        inputType: "email",
        options: [],
      }),
      makeSurveyQuestion({ qId: "16015", question: "Keep me posted?" }),
    ];
    mockGetAnswer.mockImplementation((qId: string) =>
      qId === "00000" ? "reader@example.com" : null
    );
    window.history.replaceState(q(0, 0), "", "/survey");
    mockCurrentIndex = 0;
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);

    popTo(q(1, 0));

    expect(mockSetCurrentIndex).not.toHaveBeenCalled();
    expect(back).toHaveBeenCalledTimes(1);
  });

  it("refuses a Forward off a multiple choice over its limit", () => {
    mockQuestions = [
      makeSurveyQuestion({
        qId: "m1",
        answerType: "multiple",
        options: ["A", "B", "C"],
        maxSelections: 2,
      }),
      makeSurveyQuestion({ qId: "s2" }),
    ];
    mockGetAnswer.mockImplementation((qId: string) => (qId === "m1" ? ["A", "B", "C"] : null));
    window.history.replaceState(q(0, 0), "", "/survey");
    mockCurrentIndex = 0;
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);

    popTo(q(1, 0));

    expect(mockSetCurrentIndex).not.toHaveBeenCalled();
    expect(back).toHaveBeenCalledTimes(1);
  });

  it("turns a Forward jump over several questions into one step", () => {
    // The browser's history list can jump straight past a question edited since it was
    // last passed (an email changed, then Back further), skipping its checks. The jump
    // steps back one entry at a time; where it lands one question on, that is a single
    // step, with this question's checks.
    window.history.replaceState(q(1, 0), "", "/survey");
    mockCurrentIndex = 1; // optional, so a single step is allowed
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const go = vi.spyOn(window.history, "go");
    render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);

    popTo(q(3, 0));
    expect(mockSetCurrentIndex).not.toHaveBeenCalled();
    expect(back).toHaveBeenCalledTimes(1);
    expect(go).not.toHaveBeenCalled(); // never a go() by the question gap

    popTo(q(2, 0)); // where that back() lands
    expect(mockSetCurrentIndex).toHaveBeenCalledWith(2);
  });

  it("never steps back past the question on screen when entries skip numbers", () => {
    // Re-based by another tab: entries for questions 20, 31 and 32 sit side by side.
    // A go() by the question gap (-12) from 32 would have passed 20 entirely.
    mockQuestions = Array.from({ length: 40 }, (_, i) =>
      makeSurveyQuestion({ qId: `x${i}`, required: false })
    );
    window.history.replaceState(q(19, 0), "", "/survey");
    mockCurrentIndex = 19;
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);

    popTo(q(31, 30)); // jumped forward two entries
    popTo(q(30, 30)); // the first step back: still not this question's entry
    popTo(q(19, 0)); // the second: home

    expect(back).toHaveBeenCalledTimes(2);
    expect(mockSetCurrentIndex).not.toHaveBeenCalled();
  });

  it("ignores a pop that lands before the finished run renders", () => {
    // The collapse's own popstate can arrive while navigation still holds the last
    // question: only hasCompleted stops it reopening a question under the finished
    // run (#393).
    window.history.replaceState(q(3, 0), "", "/survey");
    mockCurrentIndex = 3; // the last question; the mock keeps it there after the submit
    mockGetAnswer.mockImplementation((qId: string) => (qId === "q4" ? ["A"] : null));
    vi.spyOn(window.history, "go").mockImplementation(() => {});
    render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);
    fireEvent.click(screen.getByTestId("survey-nav-next"));
    mockSetCurrentIndex.mockClear();

    popTo(q(0, 0));

    expect(mockSetCurrentIndex).not.toHaveBeenCalled();
  });

  it("drops a pending Previous fallback when Next moves on before it fires", () => {
    window.history.replaceState(q(2, 0), "", "/survey");
    mockCurrentIndex = 2; // optional, so Next is live
    vi.spyOn(window.history, "back").mockImplementation(() => {}); // the pop never lands
    render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);

    fireEvent.click(screen.getByTestId("survey-nav-prev")); // arms the fallback
    fireEvent.click(screen.getByTestId("survey-nav-next"));
    mockSetCurrentIndex.mockClear();
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(mockSetCurrentIndex).not.toHaveBeenCalled();
  });
});

describe("SurveyEngine — arrow keys in a text field", () => {
  // Regression, 2026-10-04 (on main before this branch): ArrowLeft in the email field
  // jumped to the previous question, so fixing a typo threw the reader back.
  beforeEach(() => {
    window.history.replaceState(null, "", "/survey"); // no question entries in play
  });
  afterEach(() => {
    document.body.querySelectorAll("[data-probe-field]").forEach((el) => el.remove());
  });
  const field = (type: string) => {
    const input = document.createElement("input");
    input.type = type;
    input.setAttribute("data-probe-field", "");
    document.body.appendChild(input);
    input.focus();
    return input;
  };

  it("leaves ArrowLeft to an email field instead of going back a question", () => {
    mockCurrentIndex = 2;
    render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);

    fireEvent.keyDown(field("email"), { key: "ArrowLeft" });

    expect(mockSetCurrentIndex).not.toHaveBeenCalled();
    expect(mockTrackNavigation).not.toHaveBeenCalledWith("back");
  });

  it("leaves ArrowRight to a text field instead of skipping ahead", () => {
    mockCurrentIndex = 1; // optional question, so ArrowRight would otherwise advance
    render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);

    fireEvent.keyDown(field("text"), { key: "ArrowRight" });

    expect(mockSetCurrentIndex).not.toHaveBeenCalled();
  });

  it("still goes back on ArrowLeft from a focused option (a radio is not a text field)", () => {
    // Treating radios as text would hand the arrows to the native radio group, which
    // changes the selected answer instead of the question.
    mockCurrentIndex = 2;
    render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);

    fireEvent.keyDown(field("radio"), { key: "ArrowLeft" });

    expect(mockSetCurrentIndex).toHaveBeenCalledWith(1);
  });

  it("still goes back on ArrowLeft outside a text field", () => {
    mockCurrentIndex = 2;
    render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);

    fireEvent.keyDown(window, { key: "ArrowLeft" });

    expect(mockSetCurrentIndex).toHaveBeenCalledWith(1);
  });
});

// Mark, 30.09: "Is there a way that I can jump to specific questions rather than having
// to go through the entire survey?" Staging only (SurveyJumpMenu.test.tsx has the menu).
describe("SurveyEngine — the staging jump menu", () => {
  it("offers every asked question off production, and moves the engine to the one picked", () => {
    render(<SurveyEngine onExit={() => {}} onComplete={() => {}} />);
    const menu = screen.getByRole("combobox", { name: "Jump to question" });
    expect(
      within(menu)
        .getAllByRole("option")
        .map((o) => o.textContent)
    ).toEqual(["1. q1 · Q1?", "2. q2 · Q2?", "3. q3 · Q3?", "4. q4 · Q4?"]);
    fireEvent.change(menu, { target: { value: "2" } });
    expect(mockSetCurrentIndex).toHaveBeenLastCalledWith(2);
  });

  it("leaves the live site's survey without it", () => {
    mockNonProd = false;
    render(<SurveyEngine onExit={() => {}} onComplete={() => {}} />);
    expect(screen.queryByRole("combobox", { name: "Jump to question" })).toBeNull();
    expect(screen.queryByText(/Jump to question/)).toBeNull();
  });
});

// Final review, 30.09: the engine's window-level keys and swipe stayed live once the last
// question was answered. Under the wizard ArrowRight and Enter were swallowed (a
// preventDefault and a goNext with nothing to go to), and ArrowLeft or a back swipe went
// back to the last question, whose Next does nothing once the survey is submitted: the
// reader was stranded on it.
describe("SurveyEngine once the survey is over", () => {
  const atWizard = () => {
    mockCurrentIndex = 4;
    mockProgress = 100;
    mockSubmitStatus = "success";
    render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /finish processing/i }));
    expect(screen.getByTestId("pre-report-wizard")).toBeInTheDocument();
    mockSetCurrentIndex.mockClear();
  };

  it("leaves the arrow keys and Enter to the wizard", () => {
    atWizard();
    for (const key of ["ArrowRight", "Enter", "ArrowLeft"]) {
      const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
      window.dispatchEvent(event);
      expect(event.defaultPrevented, key).toBe(false);
    }
    expect(mockSetCurrentIndex).not.toHaveBeenCalled();
    expect(screen.getByTestId("pre-report-wizard")).toBeInTheDocument();
  });

  it("does not take a back swipe to the last question", () => {
    atWizard();
    fireEvent.touchStart(window, { touches: [{ clientX: 40, clientY: 300 }] });
    fireEvent.touchEnd(window, { changedTouches: [{ clientX: 260, clientY: 304 }] });
    expect(mockSetCurrentIndex).not.toHaveBeenCalled();
    expect(screen.getByTestId("pre-report-wizard")).toBeInTheDocument();
  });

  it("does not go back from the processing screen either", () => {
    mockCurrentIndex = 4;
    mockProgress = 100;
    // A submit in flight: mounting onto a finished run with nothing in flight goes
    // straight to the wizard (main's "the end of the survey never strands the reader").
    mockSubmitStatus = "submitting";
    render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);
    expect(screen.getByTestId("processing-sequence")).toBeInTheDocument();
    mockSetCurrentIndex.mockClear();
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, cancelable: true })
    );
    expect(mockSetCurrentIndex).not.toHaveBeenCalled();
  });
});
