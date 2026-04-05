// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import SurveyConfirmation from "@/components/survey/SurveyConfirmation";

afterEach(cleanup);

describe("SurveyConfirmation", () => {
  it("renders the success state and lets the user exit", async () => {
    const user = userEvent.setup();
    const onExit = vi.fn();

    render(<SurveyConfirmation status="success" onExit={onExit} />);

    expect(screen.getByText(/your journey begins/i)).toBeInTheDocument();
    expect(screen.getByText(/14 archetypes analyzed/i)).toBeInTheDocument();
    expect(screen.getByText(/your privacy is protected/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /return to loveiq/i }));

    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("renders the submitting state without success or error actions", () => {
    render(<SurveyConfirmation status="submitting" onExit={vi.fn()} />);

    expect(screen.getByText(/processing your answers/i)).toBeInTheDocument();
    expect(
      screen.getByText(/carefully analyzing your responses across 14 archetypes/i)
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /return to loveiq/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /retry submission/i })).not.toBeInTheDocument();
  });

  it("renders error actions when retry and start over handlers are provided", async () => {
    const user = userEvent.setup();
    const onExit = vi.fn();
    const onRetry = vi.fn();
    const onStartOver = vi.fn();

    render(
      <SurveyConfirmation
        status="error"
        onExit={onExit}
        onRetry={onRetry}
        onStartOver={onStartOver}
      />
    );

    expect(screen.getByText(/submission interrupted/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /retry submission/i }));
    await user.click(screen.getByRole("button", { name: /return to site/i }));
    await user.click(screen.getByRole("button", { name: /start over/i }));

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(onStartOver).toHaveBeenCalledTimes(1);
  });
});
