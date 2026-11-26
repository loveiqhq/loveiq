// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { surveyQuestions } from "@/data/survey-data";
import { optInLabels } from "@features/survey/survey2/details";
import DetailsStep, { type DetailsStepHandle } from "@features/survey/ui/questions/DetailsStep";

/**
 * Survey 2.0's details screen (Mark's boards "Details · 1 · Name", "2a · Email", "2b · Email
 * entered · opt-in opens", "3 · Country picked · postal code opens").
 */
afterEach(cleanup);

const OPT_IN = surveyQuestions.find((q) => q.qId === "16015")!;
const COUNTRY = surveyQuestions.find((q) => q.qId === "15001")!;
const { yes: YES, no: NO } = optInLabels(OPT_IN.options);
const EMAIL = "sam.private@example.com";
const SWITCH = { name: "Keep learning after your report" };

type Answers = Record<string, unknown>;

/**
 * The screen as the engine holds it: answers kept in state, so what the reader types or switches
 * shows. `sheetOpens` is the engine's answer when the email is left with the switch off: whether
 * the miss-out sheet opened (it does once per run).
 */
function setup(initial: Answers = {}, extra: { focusField?: "email"; sheetOpens?: boolean } = {}) {
  const onAnswer = vi.fn();
  const onOptInOff = vi.fn(() => extra.sheetOpens ?? false);
  const ref = createRef<DetailsStepHandle>();
  function Engine() {
    const [answers, setAnswers] = useState<Answers>(initial);
    return (
      <DetailsStep
        ref={ref}
        answers={answers}
        onAnswer={(qId, value) => {
          onAnswer(qId, value);
          setAnswers((a) => ({ ...a, [qId]: value }));
        }}
        onOptInOff={onOptInOff}
        optInOptions={OPT_IN.options}
        countryQuestion={COUNTRY}
        focusField={extra.focusField}
      />
    );
  }
  const utils = render(<Engine />);
  const advance = () => {
    let step: ReturnType<DetailsStepHandle["advance"]> | undefined;
    act(() => {
      step = ref.current!.advance();
    });
    return step;
  };
  return { ...utils, onAnswer, onOptInOff, ref, advance };
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

  it("opens the email field on Next once there is a name, with the privacy tip", async () => {
    const { advance } = setup();
    await userEvent.type(screen.getByLabelText("Name or nickname"), "Sam");
    expect(advance()).toEqual({ kind: "moved", to: "email" });
    expect(screen.getByText("Where should we send your report?")).toBeTruthy();
    expect(screen.getByText(/Prefer privacy\?/)).toBeTruthy();
    expect(screen.getByText("Name")).toBeTruthy();
    expect(screen.getByText("Sam")).toBeTruthy();
  });

  it("opens on the first step still to take when a run comes back to it", () => {
    setup({ "00001": "Sam" });
    expect(screen.getByText("Where should we send your report?")).toBeTruthy();
    cleanup();
    // An email typed but its switch never passed with Next: the email again, switch showing.
    setup({ "00001": "Sam", "00000": EMAIL });
    expect(screen.getByText("Where should we send your report?")).toBeTruthy();
    expect(screen.getByRole("switch", SWITCH)).toBeTruthy();
  });

  it("says what is missing when Next is pressed on an empty field", () => {
    const { advance } = setup();
    expect(advance()).toEqual({ kind: "blocked", field: "name" });
    expect(screen.getByRole("alert").textContent).toMatch(/name/i);
  });
});

describe("the newsletter switch under the email (Mark's board 2b)", () => {
  it("opens once there is an email, switched off, in place of the privacy tip", async () => {
    setup({ "00001": "Sam" });
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.getByText(/Prefer privacy\?/)).toBeTruthy();

    await userEvent.type(screen.getByLabelText("Email"), EMAIL);

    const toggle = screen.getByRole("switch", SWITCH);
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(screen.queryByText(/Prefer privacy\?/)).toBeNull();
    expect(screen.getByText("New research on desire and intimacy")).toBeTruthy();
    expect(screen.getByText("Small practices to try the same day")).toBeTruthy();
    expect(screen.getByText("First access to new tests")).toBeTruthy();
    expect(
      screen.getByText(
        "Free emails. We track opens and clicks to improve them. Unsubscribe any time."
      )
    ).toBeTruthy();
  });

  it("stores today's Yes and No as it is switched on and off", async () => {
    const { onAnswer } = setup({ "00001": "Sam", "00000": EMAIL });
    const toggle = screen.getByRole("switch", SWITCH);
    await userEvent.click(toggle);
    expect(onAnswer).toHaveBeenLastCalledWith("16015", YES);
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    await userEvent.click(toggle);
    expect(onAnswer).toHaveBeenLastCalledWith("16015", NO);
    expect(toggle.getAttribute("aria-checked")).toBe("false");
  });

  it("goes with the email row once Next opens the country, switched on: no sheet", async () => {
    const { advance, onOptInOff } = setup({ "00001": "Sam", "00000": EMAIL });
    await userEvent.click(screen.getByRole("switch", SWITCH));
    expect(advance()).toEqual({ kind: "moved", to: "country" });
    expect(onOptInOff).not.toHaveBeenCalled();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.getByText(EMAIL)).toBeTruthy();
    expect(screen.getByText("Where do you live?")).toBeTruthy();
  });

  it("left off, stores today's No and holds the page for the miss-out sheet", () => {
    const { advance, onAnswer, onOptInOff } = setup(
      { "00001": "Sam", "00000": EMAIL },
      { sheetOpens: true }
    );
    expect(advance()).toEqual({ kind: "held" });
    expect(onAnswer).toHaveBeenCalledWith("16015", NO);
    expect(onOptInOff).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("switch", SWITCH)).toBeTruthy();
    expect(screen.queryByText("Where do you live?")).toBeNull();
  });

  it("left off once the sheet has had its turn, goes on to the country", () => {
    const { advance, onAnswer } = setup({ "00001": "Sam", "00000": EMAIL }, { sheetOpens: false });
    expect(advance()).toEqual({ kind: "moved", to: "country" });
    expect(onAnswer).toHaveBeenCalledWith("16015", NO);
    expect(screen.getByText("Where do you live?")).toBeTruthy();
  });

  it("shows as it was left when a run comes back and opens the email row", async () => {
    setup({ "00001": "Sam", "00000": EMAIL, "15001": "Germany", "15002": "101", "16015": YES });
    expect(screen.getByText("Sam")).toBeTruthy();
    expect(screen.queryByRole("switch")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: new RegExp(`Email.*${EMAIL}`) }));
    expect(screen.getByRole("switch", SWITCH).getAttribute("aria-checked")).toBe("true");
  });
});

describe("the steps on the details screen", () => {
  it("open one still to come only through Next: its row takes no tap", () => {
    setup({ "00001": "Sam" });
    expect(screen.getByRole("button", { name: /Name.*Sam/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Country/ })).toBeNull();
  });

  it("open the postal code only once a country is picked", () => {
    setup({ "00001": "Sam", "00000": EMAIL, "16015": NO });
    expect(screen.queryByText(/Postal code in/)).toBeNull();
    cleanup();
    setup({ "00001": "Sam", "00000": EMAIL, "16015": NO, "15001": "Germany" });
    expect(screen.getByText("Postal code in Germany")).toBeTruthy();
    expect(screen.getByPlaceholderText("e.g. 10115")).toBeTruthy();
    expect(screen.getByText("The first 3 digits are enough")).toBeTruthy();
  });

  it("show a picked country as Mark's row, and the search again on a tap", async () => {
    setup({ "00001": "Sam", "00000": EMAIL, "16015": NO, "15001": "Germany" });
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByText("Where do you live?")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /Country.*Germany/ }));
    expect(screen.getByRole("combobox")).toBeTruthy();
  });

  it("open the email field after the server refused it", () => {
    setup(
      { "00001": "Sam", "00000": EMAIL, "15001": "Germany", "15002": "101", "16015": NO },
      { focusField: "email" }
    );
    expect(screen.getByText("Where should we send your report?")).toBeTruthy();
    expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe(EMAIL);
  });
});
