// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

const mockSetAnswer = vi.fn();
const mockGetAnswer = vi.fn().mockReturnValue(null);
const mockSetCurrentIndex = vi.fn();
const mockTrackNavigation = vi.fn();
const mockSubmit = vi.fn();

let mockCurrentIndex = 0;
let mockProgress = 0;
let mockSubmitStatus = "idle";

vi.mock("@/components/survey/hooks/useSurveyState", () => ({
  useSurveyState: () => ({
    answers: {},
    get currentIndex() {
      return mockCurrentIndex;
    },
    startedAt: new Date().toISOString(),
    get progress() {
      return mockProgress;
    },
    setAnswer: mockSetAnswer,
    getAnswer: mockGetAnswer,
    setCurrentIndex: mockSetCurrentIndex,
    clearState: vi.fn(),
  }),
}));

vi.mock("@/components/survey/hooks/useSubmitSurvey", () => ({
  useSubmitSurvey: () => ({
    submit: mockSubmit,
    retryPending: vi.fn(),
    hasPendingCompletion: false,
    get status() {
      return mockSubmitStatus;
    },
  }),
}));

vi.mock("@/components/survey/hooks/useSurveyTracking", () => ({
  useSurveyTracking: () => ({ trackNavigation: mockTrackNavigation }),
}));

vi.mock("@/data/survey-data", () => ({
  surveyQuestions: [
    {
      qId: "q1",
      cId: 1,
      question: "Q1?",
      answerType: "single",
      options: ["A", "B"],
      chapter: "ch1",
      required: true,
      guide: "",
    },
    {
      qId: "q2",
      cId: 1,
      question: "Q2?",
      answerType: "scale",
      chapter: "ch1",
      required: false,
      options: [],
      guide: "",
      scaleLabels: { low: "Low", high: "High" },
    },
    {
      qId: "q3",
      cId: 2,
      question: "Q3?",
      answerType: "open",
      chapter: "ch2",
      required: false,
      options: [],
      guide: "",
    },
    {
      qId: "q4",
      cId: 2,
      question: "Q4?",
      answerType: "multiple",
      chapter: "ch2",
      required: true,
      options: ["A", "B", "C", "D"],
      guide: "",
      maxSelections: 3,
    },
  ],
  chapterIntros: [],
}));

vi.mock("@/lib/analytics", () => ({
  trackSurveyStart: vi.fn(),
  trackSurveyAnswer: vi.fn(),
  trackSurveyComplete: vi.fn(),
  trackSurveyPause: vi.fn(),
}));

vi.mock("@/components/survey/questions/SingleChoiceQuestion", () => ({
  default: (props: { question: { question: string } }) => (
    <div data-testid="single-choice">{props.question.question}</div>
  ),
}));

vi.mock("@/components/survey/questions/ScaleQuestion", () => ({
  default: (props: { question: { question: string } }) => (
    <div data-testid="scale-question">{props.question.question}</div>
  ),
}));

vi.mock("@/components/survey/questions/OpenResponseQuestion", () => ({
  default: (props: { question: { question: string } }) => (
    <div data-testid="open-response">{props.question.question}</div>
  ),
}));

vi.mock("@/components/survey/questions/MultipleChoiceQuestion", () => ({
  default: (props: { question: { question: string }; forceValidation?: boolean }) => (
    <div data-testid="multiple-choice">
      {props.question.question}
      {props.forceValidation ? " (validated)" : ""}
    </div>
  ),
}));

vi.mock("@/components/survey/questions/CountryQuestion", () => ({
  default: (props: { question: { question: string } }) => (
    <div data-testid="country-question">{props.question.question}</div>
  ),
}));

vi.mock("@/components/survey/SurveyHeader", () => ({
  default: () => <div data-testid="survey-header" />,
}));

vi.mock("@/components/survey/SurveyNav", () => ({
  default: (props: { canGoNext: boolean; onNext: () => void; onPrevious: () => void }) => (
    <div data-testid="survey-nav">
      <button data-testid="survey-nav-prev" onClick={props.onPrevious}>
        Previous
      </button>
      <button data-testid="survey-nav-next" onClick={props.onNext} disabled={!props.canGoNext}>
        Next
      </button>
    </div>
  ),
}));

vi.mock("@/components/survey/GuideAvatar", () => ({
  default: () => <div data-testid="guide-avatar" />,
}));

vi.mock("@/components/survey/GuidancePanel", () => ({
  default: () => <div data-testid="guidance-panel" />,
}));

vi.mock("@/components/survey/PreReportWizard", () => ({
  default: ({ onComplete }: { onComplete: () => void }) => (
    <div data-testid="pre-report-wizard">
      <button onClick={onComplete}>Complete Wizard</button>
    </div>
  ),
}));

vi.mock("@/components/survey/ProcessingSequence", () => ({
  default: ({ onComplete }: { onComplete: () => void; submitDone: boolean }) => (
    <div data-testid="processing-sequence">
      <span>Extracting your answers...</span>
      <button onClick={onComplete}>Finish Processing</button>
    </div>
  ),
}));

vi.mock("@/components/survey/ReportReady", () => ({
  default: ({ onContinue }: { onContinue: () => void; name: string; email: string }) => (
    <div data-testid="report-ready">
      <button onClick={onContinue}>View your free report</button>
    </div>
  ),
}));

import SurveyEngine from "@/components/survey/SurveyEngine";

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  sessionStorage.clear();
  mockCurrentIndex = 0;
  mockProgress = 0;
  mockSubmitStatus = "idle";
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

  it("calls onComplete when wizard completes after report ready screen", () => {
    mockCurrentIndex = 4;
    mockProgress = 100;

    const onComplete = vi.fn();
    mockSubmitStatus = "success";
    render(<SurveyEngine onExit={vi.fn()} onComplete={onComplete} />);

    fireEvent.click(screen.getByRole("button", { name: /finish processing/i }));
    expect(screen.getByTestId("report-ready")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /view your free report/i }));
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
  it("transitions from processing to report ready screen on success", () => {
    mockCurrentIndex = 4;
    mockProgress = 100;
    mockSubmitStatus = "success";

    render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);

    expect(screen.getByTestId("processing-sequence")).toBeInTheDocument();
    expect(screen.queryByTestId("report-ready")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /finish processing/i }));

    expect(screen.getByTestId("report-ready")).toBeInTheDocument();
    expect(screen.queryByTestId("processing-sequence")).not.toBeInTheDocument();
  });

  it("transitions through full success flow: processing -> ready -> wizard -> complete", () => {
    mockCurrentIndex = 4;
    mockProgress = 100;
    mockSubmitStatus = "success";

    const onComplete = vi.fn();
    render(<SurveyEngine onExit={vi.fn()} onComplete={onComplete} />);

    fireEvent.click(screen.getByRole("button", { name: /finish processing/i }));
    expect(screen.getByTestId("report-ready")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /view your free report/i }));
    expect(screen.getByTestId("pre-report-wizard")).toBeInTheDocument();
    expect(screen.queryByTestId("report-ready")).not.toBeInTheDocument();

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
