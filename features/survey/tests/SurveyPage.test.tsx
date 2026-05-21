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

  it("restores the consent screen from session storage", async () => {
    sessionStorage.setItem(SURVEY_STEP_KEY, "5");

    render(<SurveyPage />);

    expect(await screen.findByRole("heading", { name: /before we begin/i })).toBeInTheDocument();
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
