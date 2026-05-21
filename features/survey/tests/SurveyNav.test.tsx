// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import SurveyNav from "@features/survey/ui/SurveyNav";

afterEach(cleanup);

describe("SurveyNav", () => {
  it("disables navigation buttons when movement is not allowed", () => {
    render(
      <SurveyNav
        canGoBack={false}
        canGoNext={false}
        hasAnswer={false}
        statusText="Waiting"
        onPrevious={vi.fn()}
        onNext={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: /previous/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /next/i })).toBeDisabled();
  });

  it("fires previous and next callbacks when enabled", async () => {
    const user = userEvent.setup();
    const onPrevious = vi.fn();
    const onNext = vi.fn();

    render(
      <SurveyNav
        canGoBack={true}
        canGoNext={true}
        hasAnswer={true}
        statusText="Ready"
        onPrevious={onPrevious}
        onNext={onNext}
      />
    );

    await user.click(screen.getByRole("button", { name: /previous/i }));
    await user.click(screen.getByRole("button", { name: /next/i }));

    expect(onPrevious).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
  });
});
