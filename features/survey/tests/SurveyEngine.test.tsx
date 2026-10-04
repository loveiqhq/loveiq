// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
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

vi.mock("@features/survey/ui/hooks/useSubmitSurvey", () => ({
  useSubmitSurvey: () => ({
    submit: mockSubmit,
    retryPending: vi.fn(),
    hasPendingCompletion: false,
    get status() {
      return mockSubmitStatus;
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
  return {
    surveyQuestions: defaultSurveyQuestions(),
  };
});

vi.mock("@features/analytics/client", () => ({
  trackSurveyStart: vi.fn(),
  trackSurveyAnswer: vi.fn(),
  trackSurveyProgress: vi.fn(),
  trackSurveyComplete: vi.fn(),
  trackSurveyPause: vi.fn(),
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

vi.mock("@features/survey/ui/SurveyHeader", () => ({
  default: () => <div data-testid="survey-header" />,
}));

vi.mock("@features/survey/ui/SurveyNav", () => ({
  default: (props: {
    canGoNext: boolean;
    hasAnswer: boolean;
    onNext: () => void;
    onPrevious: () => void;
  }) => (
    <div data-testid="survey-nav" data-ready={String(props.hasAnswer)}>
      <button data-testid="survey-nav-prev" onClick={props.onPrevious}>
        Previous
      </button>
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

beforeEach(() => {
  vi.useFakeTimers();
  mockCurrentIndex = 0;
  mockProgress = 0;
  mockSubmitStatus = "idle";
  mockPrefilled = [];
  mockNonProd = true;
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

  it("shows processing sequence when currentIndex >= total questions", () => {
    mockCurrentIndex = 4;
    mockProgress = 100;

    render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);
    expect(screen.getByTestId("processing-sequence")).toBeInTheDocument();
    expect(screen.getByText("Extracting your answers...")).toBeInTheDocument();
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

  it("persists the report session while preserving the survey session for report handoff", () => {
    mockCurrentIndex = 4;
    mockProgress = 100;
    mockSubmitStatus = "success";
    sessionStorage.setItem("loveiq-survey-session", "session-123");
    localStorage.setItem("loveiq-report-session", "stale-session");

    render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);

    expect(localStorage.getItem("loveiq-report-session")).toBe("session-123");
    expect(sessionStorage.getItem("loveiq-survey-session")).toBe("session-123");
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

  it("shows survey header and nav when in question view", () => {
    render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);
    expect(screen.getByTestId("survey-header")).toBeInTheDocument();
    expect(screen.getByTestId("survey-nav")).toBeInTheDocument();
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
    render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);
    expect(screen.getByTestId("processing-sequence")).toBeInTheDocument();
    mockSetCurrentIndex.mockClear();
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, cancelable: true })
    );
    expect(mockSetCurrentIndex).not.toHaveBeenCalled();
  });
});
