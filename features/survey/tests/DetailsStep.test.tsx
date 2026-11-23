// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { surveyQuestions } from "@/data/survey-data";
import { optInLabels } from "@features/survey/survey2/details";
import DetailsStep, { type DetailsStepHandle } from "@features/survey/ui/questions/DetailsStep";

/**
 * Survey 2.0's details screen (Mark's boards "Details · 1 · Name", "2a · Email", "3 · Country
 * picked · postal code opens", "alt · Yes/No opt-in").
 */
afterEach(cleanup);

const OPT_IN = surveyQuestions.find((q) => q.qId === "16015")!;
const COUNTRY = surveyQuestions.find((q) => q.qId === "15001")!;
const { yes: YES, no: NO } = optInLabels(OPT_IN.options);
const EMAIL = "sam.private@example.com";

function setup(answers: Record<string, unknown> = {}, extra: { focusField?: "email" } = {}) {
  const onAnswer = vi.fn();
  const onOptInNo = vi.fn();
  const ref = createRef<DetailsStepHandle>();
  const utils = render(
    <DetailsStep
      ref={ref}
      answers={answers}
      onAnswer={onAnswer}
      onOptInNo={onOptInNo}
      optInOptions={OPT_IN.options}
      countryQuestion={COUNTRY}
      focusField={extra.focusField}
    />
  );
  return { ...utils, onAnswer, onOptInNo, ref };
}

describe("the details screen", () => {
  it("shows Mark's title, the blurred archetype and the name field first", () => {
    setup();
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(
      "Last step to your report to become a more intelligent lover"
    );
    expect(
      screen.getByText("We use these to personalise your report and send it to you.")
    ).toBeTruthy();
    expect(screen.getByText("Your Core Archetype")).toBeTruthy();
    expect(screen.getByText("What should we call you?")).toBeTruthy();
    expect(screen.getByPlaceholderText("e.g. Banana Bandit")).toBeTruthy();
    expect(screen.getByText("A nickname and an anonymous email are fine")).toBeTruthy();
  });

  it("writes the name under 00001", async () => {
    const { onAnswer } = setup();
    await userEvent.type(screen.getByLabelText("Name or nickname"), "S");
    expect(onAnswer).toHaveBeenLastCalledWith("00001", "S");
  });

  it("opens the email field on Next once there is a name, with the privacy tip", () => {
    // The engine passes the latest answers (a Next can come before React re-renders).
    const { ref, rerender } = setup();
    act(() => {
      expect(ref.current!.advance({ "00001": "Sam" })).toEqual({ kind: "moved", to: "email" });
    });
    rerender(
      <DetailsStep
        ref={ref}
        answers={{ "00001": "Sam" }}
        onAnswer={vi.fn()}
        onOptInNo={vi.fn()}
        optInOptions={OPT_IN.options}
        countryQuestion={COUNTRY}
      />
    );
    expect(screen.getByText("Where should we send your report?")).toBeTruthy();
    expect(screen.getByText(/Prefer privacy\?/)).toBeTruthy();
    expect(screen.getByText("Name")).toBeTruthy();
    expect(screen.getByText("Sam")).toBeTruthy();
  });

  it("opens on the first field still to fill when a run comes back to it", () => {
    setup({ "00001": "Sam" });
    expect(screen.getByText("Where should we send your report?")).toBeTruthy();
  });

  it("says what is missing when Next is pressed on an empty field", () => {
    const { ref } = setup();
    act(() => {
      expect(ref.current!.advance()).toEqual({ kind: "blocked", field: "name" });
    });
    expect(screen.getByRole("alert").textContent).toMatch(/name/i);
  });

  it("asks the newsletter question only once there is an email, with nothing picked", () => {
    setup({ "00001": "Sam" });
    expect(screen.queryByText("Free LoveIQ hints and insights by email?")).toBeNull();
    cleanup();
    setup({ "00001": "Sam", "00000": EMAIL });
    expect(screen.getByText("Free LoveIQ hints and insights by email?")).toBeTruthy();
    expect(screen.getByText(/We track opens and clicks to improve them/)).toBeTruthy();
    for (const radio of screen.getAllByRole("radio")) {
      expect(radio.getAttribute("aria-checked")).toBe("false");
    }
  });

  it("stores today's No and asks the engine for the miss-out sheet on No", async () => {
    const { onAnswer, onOptInNo } = setup({ "00001": "Sam", "00000": EMAIL });
    await userEvent.click(screen.getByRole("radio", { name: "No, thanks" }));
    expect(onAnswer).toHaveBeenCalledWith("16015", NO);
    expect(onOptInNo).toHaveBeenCalledTimes(1);
  });

  it("stores today's Yes on Yes", async () => {
    const { onAnswer, onOptInNo } = setup({ "00001": "Sam", "00000": EMAIL });
    await userEvent.click(screen.getByRole("radio", { name: "Yes, keep learning" }));
    expect(onAnswer).toHaveBeenCalledWith("16015", YES);
    expect(onOptInNo).not.toHaveBeenCalled();
  });

  it("opens the postal code only once a country is picked", () => {
    setup({ "00001": "Sam", "00000": EMAIL });
    expect(screen.queryByText(/Postal code in/)).toBeNull();
    cleanup();
    setup({ "00001": "Sam", "00000": EMAIL, "15001": "Germany" });
    expect(screen.getByText("Postal code in Germany")).toBeTruthy();
    expect(screen.getByPlaceholderText("e.g. 10115")).toBeTruthy();
    expect(screen.getByText("The first 3 digits are enough")).toBeTruthy();
  });

  it("keeps details on Back: a run that comes back shows what it filled in", () => {
    setup({ "00001": "Sam", "00000": EMAIL, "15001": "Germany", "15002": "101", "16015": YES });
    expect(screen.getByText("Sam")).toBeTruthy();
    expect(screen.getByText(EMAIL)).toBeTruthy();
    expect(
      screen.getByRole("radio", { name: "Yes, keep learning" }).getAttribute("aria-checked")
    ).toBe("true");
  });

  it("opens the email field after the server refused it", () => {
    setup(
      { "00001": "Sam", "00000": EMAIL, "15001": "Germany", "15002": "101", "16015": NO },
      { focusField: "email" }
    );
    expect(screen.getByText("Where should we send your report?")).toBeTruthy();
    expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe(EMAIL);
  });
});
