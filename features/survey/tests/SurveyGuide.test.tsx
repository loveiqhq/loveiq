// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SurveyPage from "@features/survey/ui/SurveyPage";
import {
  ANSWERS_STORAGE_KEY,
  LANDING_PREFILL_QID,
  SURVEY_CONSENT_KEY,
  SURVEY_STEP_KEY,
  __resetSurveyConsentForTests,
  saveLandingPrefill,
} from "@features/survey/ui/hooks/surveyStorage";
import { COMPLETED_REPORT_KEY, SURVEY_SESSION_KEY } from "@features/survey/ui/hooks/surveySession";
import { __resetFunnelPingsForTests } from "@features/analytics/client";
import { assignSurvey2TestArm, type Survey2Visit } from "@shared/experiments/questionOrderArm";

/**
 * Survey 2.0's short guide (Mark's Pre Survey Wizard, row "Suggestion · 3 cards excl. future/past
 * me"): three cards under a "Short guide / before you start" header, then the consent with the
 * 18+ and the use of the answers as two ticks of their own and the terms in the line under its
 * buttons. The intro ("Let's prepare you well") and "How the Test Works" are not part of it.
 */
vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    <span aria-label={alt} data-next-image={src} />
  ),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// The engine draws a fresh run's order as SurveyEngine does on mounting (its `survey2` prop and the
// tab's session id), so a test can read which questions follow the guide and consent it saw.
vi.mock("@features/survey/ui/SurveyEngine", async () => {
  const { freshQuestionOrderArm } = await import("@shared/experiments/questionOrderArm");
  const { getSessionId } = await import("@features/survey/ui/hooks/surveySession");
  return {
    default: ({
      survey2 = "off",
      payToStart = false,
    }: {
      survey2?: Survey2Visit;
      payToStart?: boolean;
    }) => (
      <div
        data-testid="survey-engine"
        data-fresh-arm={freshQuestionOrderArm(payToStart ? "off" : survey2, getSessionId())}
      />
    ),
  };
});

const CARD_1 = "Three rules to increase your report quality:";
const CARD_2 = "Answer from the perspective of today";
const CARD_3 = "Your Privacy Matters";
const AGE_2 = "I’m 18 years of age or older.";
const DATA_2 =
  /^I agree that LoveIQ uses my answers, including about my sex life, to create my report\.\s*I can withdraw anytime\.\s*$/;
const PAY_TO_START = { kind: "pay_to_start" as const, paid: true };

/**
 * With the switch on, half of the fresh runs get Survey 2.0 (the Survey 2.0 test, by session id):
 * these tests run as a session in that half unless one is about the other.
 */
const VARIANT_SESSION = "00000000-0000-4000-8000-000000000001";
const CONTROL_SESSION = "00000000-0000-4000-8000-000000000000";

const continueButton = () => screen.getAllByRole("button", { name: /continue to next slide/i })[0]!;

let fetchSpy: ReturnType<typeof vi.spyOn>;
const sent = () =>
  fetchSpy.mock.calls
    .filter(([url]) => url === "/api/funnel-event")
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)).event as string);

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  __resetSurveyConsentForTests();
  __resetFunnelPingsForTests();
  window.history.replaceState(null, "", "/survey");
  sessionStorage.setItem(SURVEY_SESSION_KEY, VARIANT_SESSION);
  // A reader who agreed for this run already, unless a test is about the consent gate.
  localStorage.setItem(SURVEY_CONSENT_KEY, "2026-11-23T09:00:00.000Z");
  document.cookie = "__liq_vid=11111111-1111-4111-8111-111111111111; path=/";
  document.cookie = "__csrf=test-token; path=/";
  Object.defineProperty(navigator, "sendBeacon", { value: undefined, configurable: true });
  fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));
});

afterEach(() => {
  cleanup();
  fetchSpy.mockRestore();
  document.cookie = "__liq_vid=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
});

describe("Survey 2.0's short guide", () => {
  it("opens on its first card under the Short guide header, not on the intro", async () => {
    render(<SurveyPage survey2="test" />);

    expect(await screen.findByRole("heading", { name: CARD_1 })).toBeInTheDocument();
    expect(screen.getByText("Short guide")).toBeInTheDocument();
    expect(screen.getByText("before you start")).toBeInTheDocument();
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /continue to survey introduction/i })
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Identify Your Sexual Archetype")).not.toBeInTheDocument();
  });

  it("lists the three rules, in order", async () => {
    render(<SurveyPage survey2="test" />);
    await screen.findByRole("heading", { name: CARD_1 });

    const rules = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(rules.map((li) => li.textContent)).toEqual([
      "1Be honestThe more honest you answer, the more precise your report.",
      "2Answer freely, no one judgesThere are no right or wrong answers, every answer is ok.",
      "3Stay to the endIt takes about 9 minutes from start to finish, question by question.",
    ]);
  });

  it("goes card by card to the consent", async () => {
    const user = userEvent.setup();
    render(<SurveyPage survey2="test" />);
    await screen.findByRole("heading", { name: CARD_1 });

    await user.click(continueButton());
    expect(await screen.findByRole("heading", { name: CARD_2 })).toBeInTheDocument();
    expect(screen.getByText("2 / 3")).toBeInTheDocument();
    expect(
      screen.getByText(
        "You might have answered differently in the past, or want to answer differently in the future."
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText("Reflecting on your answers can be as valuable as the report itself.")
    ).toBeInTheDocument();

    await user.click(continueButton());
    expect(await screen.findByRole("heading", { name: CARD_3 })).toBeInTheDocument();
    expect(screen.getByText("3 / 3")).toBeInTheDocument();
    expect(screen.getByText("We encrypt everything you share.")).toBeInTheDocument();
    expect(screen.getByText("A nickname and an alias email are fine")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "> Trust Zone" })).toHaveAttribute(
      "href",
      "/trust-zone"
    );

    await user.click(continueButton());
    expect(await screen.findByRole("heading", { name: /before we begin/i })).toBeInTheDocument();
  });

  it("has no Back on its first card, and Back on the next ones", async () => {
    const user = userEvent.setup();
    render(<SurveyPage survey2="test" />);
    await screen.findByRole("heading", { name: CARD_1 });
    expect(screen.queryByRole("button", { name: /go to previous slide/i })).not.toBeInTheDocument();

    await user.click(continueButton());
    await screen.findByRole("heading", { name: CARD_2 });
    await user.click(screen.getByRole("button", { name: /go to previous slide/i }));

    expect(await screen.findByRole("heading", { name: CARD_1 })).toBeInTheDocument();
  });

  it("takes the arrow keys as today's slides do", async () => {
    const user = userEvent.setup();
    render(<SurveyPage survey2="test" />);
    await screen.findByRole("heading", { name: CARD_1 });

    await user.keyboard("{ArrowRight}");
    expect(await screen.findByRole("heading", { name: CARD_2 })).toBeInTheDocument();
    await user.keyboard("{ArrowLeft}");
    expect(await screen.findByRole("heading", { name: CARD_1 })).toBeInTheDocument();
  });

  it("goes to the consent on Skip Intro", async () => {
    const user = userEvent.setup();
    render(<SurveyPage survey2="test" />);
    await screen.findByRole("heading", { name: CARD_1 });

    await user.click(screen.getByRole("button", { name: /skip intro/i }));

    expect(await screen.findByRole("heading", { name: /before we begin/i })).toBeInTheDocument();
  });

  it("stops on the consent when Skip Intro comes within a Continue's 200 ms", async () => {
    localStorage.removeItem(SURVEY_CONSENT_KEY);
    __resetSurveyConsentForTests();
    sessionStorage.setItem(SURVEY_STEP_KEY, "2");
    const user = userEvent.setup();
    render(<SurveyPage survey2="test" />);
    await screen.findByRole("heading", { name: CARD_3 });

    await user.click(continueButton());
    await user.click(screen.getByRole("button", { name: /skip intro/i }));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 400));
    });

    expect(screen.getByRole("heading", { name: /before we begin/i })).toBeInTheDocument();
    expect(screen.queryByTestId("survey-engine")).not.toBeInTheDocument();
  });

  it("shows the card a reload was on", async () => {
    sessionStorage.setItem(SURVEY_STEP_KEY, "1");
    render(<SurveyPage survey2="test" />);

    expect(await screen.findByRole("heading", { name: CARD_2 })).toBeInTheDocument();
  });
});

describe("Survey 2.0's consent", () => {
  beforeEach(() => {
    localStorage.removeItem(SURVEY_CONSENT_KEY);
    __resetSurveyConsentForTests();
    sessionStorage.setItem(SURVEY_STEP_KEY, "5");
  });

  it("asks for the 18+ and the use of the answers in two ticks, the terms under its buttons", async () => {
    render(<SurveyPage survey2="test" />);
    await screen.findByRole("heading", { name: /before we begin/i });

    const [age, data] = screen.getAllByRole("checkbox");
    expect(within(age!).getByText(AGE_2)).toBeInTheDocument();
    expect(within(data!).getByText(DATA_2)).toBeInTheDocument();
    expect(within(data!).getByRole("link", { name: "Privacy Policy" })).toHaveAttribute(
      "href",
      "/privacy-policy"
    );
    // Today's words are not part of it.
    expect(screen.queryByText(/We need your explicit consent/)).not.toBeInTheDocument();
    expect(screen.queryByText(/I confirm that I am 18/)).not.toBeInTheDocument();
    expect(screen.queryByText(/I have read the/)).not.toBeInTheDocument();

    const terms = screen.getByText(/By continuing, you accept our/);
    expect(terms.textContent).toBe(
      "By continuing, you accept our Terms & Conditions, Terms of Use, Digital Content & Subscription Terms and Medical & Psychological Disclaimer."
    );
    for (const [name, href] of [
      ["Terms & Conditions", "/terms-and-conditions"],
      ["Terms of Use", "/terms-of-use"],
      ["Digital Content & Subscription Terms", "/digital-content-terms"],
      ["Medical & Psychological Disclaimer", "/medical-disclaimer"],
    ] as const) {
      expect(within(terms).getByRole("link", { name })).toHaveAttribute("href", href);
    }
  });

  it("opens the questions only once both are ticked, and keeps the consent for the run", async () => {
    const user = userEvent.setup();
    render(<SurveyPage survey2="test" />);
    const agree = await screen.findByRole("button", { name: /i agree/i });
    const [age, data] = screen.getAllByRole("checkbox");

    expect(agree).toBeDisabled();
    await user.click(age!);
    expect(agree).toBeDisabled();
    // The Privacy Policy link opens the policy; it does not tick the box it sits in.
    const policy = within(data!).getByRole("link", { name: "Privacy Policy" });
    policy.addEventListener("click", (e) => e.preventDefault());
    await user.click(policy);
    expect(data).toHaveAttribute("aria-checked", "false");
    await user.click(data!);
    expect(agree).toBeEnabled();

    await user.click(agree);
    expect(await screen.findByTestId("survey-engine", {}, { timeout: 1000 })).toBeInTheDocument();
    expect(localStorage.getItem(SURVEY_CONSENT_KEY)).toBeTruthy();
  });

  it("still says why I agree is not working, until both are ticked", async () => {
    const user = userEvent.setup();
    render(<SurveyPage survey2="test" />);
    const agree = await screen.findByRole("button", { name: /i agree/i });
    const hint = screen.getByText(/tick both boxes above to continue/i);
    expect(agree).toHaveAttribute("aria-describedby", hint.id);

    const [age, data] = screen.getAllByRole("checkbox");
    await user.click(age!);
    await user.click(data!);
    expect(screen.queryByText(/tick both boxes above to continue/i)).not.toBeInTheDocument();
  });

  it("is what a homepage-card starter sees first", async () => {
    sessionStorage.clear();
    sessionStorage.setItem(SURVEY_SESSION_KEY, VARIANT_SESSION);
    saveLandingPrefill(LANDING_PREFILL_QID, 4);
    render(<SurveyPage survey2="test" />);

    await screen.findByRole("heading", { name: /before we begin/i });
    expect(screen.getByText(AGE_2)).toBeInTheDocument();
  });

  it("is today's consent for a classic run resumed while the switch is on", async () => {
    sessionStorage.clear();
    localStorage.setItem(
      ANSWERS_STORAGE_KEY,
      JSON.stringify({ answers: { "10003": 4 }, currentIndex: 1, orderArm: "control" })
    );
    render(<SurveyPage survey2="test" />);

    await screen.findByRole("heading", { name: /before we begin/i });
    expect(screen.getByText("I confirm that I am 18 years of age or older.")).toBeInTheDocument();
    expect(screen.queryByText(AGE_2)).not.toBeInTheDocument();
  });

  it("stays 2.0's for a 2.0 run resumed after the switch is off", async () => {
    sessionStorage.clear();
    localStorage.setItem(
      ANSWERS_STORAGE_KEY,
      JSON.stringify({ answers: { "10003": 4 }, currentIndex: 1, orderArm: "survey2" })
    );
    render(<SurveyPage />);

    await screen.findByRole("heading", { name: /before we begin/i });
    expect(screen.getByText(AGE_2)).toBeInTheDocument();
  });
});

describe("who gets the short guide", () => {
  it("draws each half from the session id: these tests' sessions are one of each", () => {
    expect(assignSurvey2TestArm(VARIANT_SESSION)).toBe("variant");
    expect(assignSurvey2TestArm(CONTROL_SESSION)).toBe("control");
  });

  // The Survey 2.0 test (Mark, sync of 25 Nov 2026): its control is today's survey, new order.
  it("not the control half of the Survey 2.0 test: today's intro, switch on", async () => {
    sessionStorage.setItem(SURVEY_SESSION_KEY, CONTROL_SESSION);
    render(<SurveyPage survey2="test" />);
    expect(
      await screen.findByRole("button", { name: /continue to survey introduction/i })
    ).toBeInTheDocument();
  });

  // `?order=survey2` (staging, the e2e server) previews 2.0 for every run, whatever the half.
  it("a ?order=survey2 preview, in either half", async () => {
    sessionStorage.setItem(SURVEY_SESSION_KEY, CONTROL_SESSION);
    render(<SurveyPage survey2="forced" />);
    expect(await screen.findByRole("heading", { name: CARD_1 })).toBeInTheDocument();
  });

  it("nobody while the switch is off: today's intro", async () => {
    render(<SurveyPage />);
    expect(
      await screen.findByRole("button", { name: /continue to survey introduction/i })
    ).toBeInTheDocument();
  });

  it("not a buyer who paid before the survey: their survey stays today's", async () => {
    render(<SurveyPage survey2="test" journey={PAY_TO_START} />);
    expect(
      await screen.findByRole("button", { name: /continue to survey introduction/i })
    ).toBeInTheDocument();
  });
});

describe("the short guide's records", () => {
  it("records each card and the consent as they show", async () => {
    const user = userEvent.setup();
    render(<SurveyPage survey2="test" />);
    await screen.findByRole("heading", { name: CARD_1 });
    await waitFor(() => expect(sent()).toContain("guide_card_1"));
    await user.click(continueButton());
    await screen.findByRole("heading", { name: CARD_2 });
    await waitFor(() => expect(sent()).toContain("guide_card_2"));
    await user.click(continueButton());
    await screen.findByRole("heading", { name: CARD_3 });
    await waitFor(() => expect(sent()).toContain("guide_card_3"));
    await user.click(continueButton());
    await screen.findByRole("heading", { name: /before we begin/i });

    await waitFor(() =>
      expect(sent()).toEqual(["guide_card_1", "guide_card_2", "guide_card_3", "consent_view"])
    );
  });

  it("records Back and Skip Intro on the card they were pressed on", async () => {
    const user = userEvent.setup();
    sessionStorage.setItem(SURVEY_STEP_KEY, "1");
    render(<SurveyPage survey2="test" />);
    await screen.findByRole("heading", { name: CARD_2 });
    await waitFor(() => expect(sent()).toContain("guide_card_2"));

    await user.click(screen.getByRole("button", { name: /go to previous slide/i }));
    await screen.findByRole("heading", { name: CARD_1 });
    await waitFor(() => expect(sent()).toContain("guide_card_1"));
    await user.click(screen.getByRole("button", { name: /skip intro/i }));
    await screen.findByRole("heading", { name: /before we begin/i });

    await waitFor(() =>
      expect(sent()).toEqual([
        "guide_card_2",
        "guide_back_2",
        "guide_card_1",
        "guide_skip_1",
        "consent_view",
      ])
    );
  });

  it("records the browser's Back from a card and from the consent", async () => {
    sessionStorage.setItem(SURVEY_STEP_KEY, "5");
    render(<SurveyPage survey2="test" />);
    await screen.findByRole("heading", { name: /before we begin/i });

    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate", { state: { surveyStep: 2 } }));
    });
    await screen.findByRole("heading", { name: CARD_3 });
    await waitFor(() => expect(sent()).toContain("guide_card_3"));
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate", { state: { surveyStep: 1 } }));
    });
    await screen.findByRole("heading", { name: CARD_2 });
    await waitFor(() => expect(sent()).toContain("guide_card_2"));
    // Card 1 is the page's first entry, as the intro is today.
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
    });
    await screen.findByRole("heading", { name: CARD_1 });

    await waitFor(() =>
      expect(sent()).toEqual([
        "consent_view",
        "consent_back",
        "guide_card_3",
        "guide_back_3",
        "guide_card_2",
        "guide_back_2",
        "guide_card_1",
      ])
    );
    expect(sent().some((e) => e.startsWith("intro_"))).toBe(false);
  });
});

/**
 * A tab that finished a survey and starts another ("Start a new one"): that drops the finished
 * run's session id (#375), so the questions open under a new one. They must still be the version
 * whose guide and consent the reader just saw, whichever half the new id would draw.
 */
describe("a new run in the tab that finished one, switch on", () => {
  async function startANewOne(finishedSession: string, nextSession: string) {
    sessionStorage.setItem(SURVEY_SESSION_KEY, finishedSession);
    sessionStorage.setItem(COMPLETED_REPORT_KEY, "rpt_finished");
    localStorage.removeItem(SURVEY_CONSENT_KEY);
    __resetSurveyConsentForTests();
    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      nextSession as `${string}-${string}-${string}-${string}-${string}`
    );
    const user = userEvent.setup();
    render(<SurveyPage survey2="test" />);
    await user.click(await screen.findByRole("button", { name: /start a new one/i }));
    return user;
  }

  async function agree(user: ReturnType<typeof userEvent.setup>) {
    await screen.findByRole("heading", { name: /before we begin/i });
    const [age, data] = screen.getAllByRole("checkbox");
    await user.click(age!);
    await user.click(data!);
    await user.click(screen.getByRole("button", { name: /i agree/i }));
    return (await screen.findByTestId("survey-engine")).getAttribute("data-fresh-arm");
  }

  afterEach(() => vi.restoreAllMocks());

  it("asks Survey 2.0's questions after 2.0's guide and consent, though the new id draws today's", async () => {
    const user = await startANewOne(VARIANT_SESSION, CONTROL_SESSION);
    expect(await screen.findByRole("heading", { name: CARD_1 })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /skip intro/i }));
    expect(await screen.findByText(AGE_2)).toBeInTheDocument();

    expect(await agree(user)).toBe("survey2");
  });

  it("asks today's questions after today's intro and consent, though the new id draws 2.0", async () => {
    const user = await startANewOne(CONTROL_SESSION, VARIANT_SESSION);
    await user.click(
      await screen.findByRole("button", { name: /continue to survey introduction/i })
    );
    await user.click(await screen.findByRole("button", { name: /skip intro/i }, { timeout: 3000 }));
    expect(
      await screen.findByText("I confirm that I am 18 years of age or older.")
    ).toBeInTheDocument();

    expect(await agree(user)).toBe("variant");
  });
});

describe("the short guide under reduced motion", () => {
  // jsdom applies no media queries, so this reads what would run: the guide and its consent
  // loop no transform (pulse-glow scales), and their opacity glows stop under reduced motion.
  const css = readFileSync("app/globals.css", "utf8");

  async function loopsOn(step: string, heading: RegExp | string) {
    sessionStorage.setItem(SURVEY_SESSION_KEY, VARIANT_SESSION);
    sessionStorage.setItem(SURVEY_STEP_KEY, step);
    render(<SurveyPage survey2="test" />);
    await screen.findByRole("heading", { name: heading });
    return document.querySelectorAll<HTMLElement>("[class*='animate-pulse-glow']");
  }

  it("stops the glows' loop on the cards and the consent", async () => {
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\.survey-calm-glow \{\s*animation: none;/
    );
    for (const [step, heading] of [
      ["0", CARD_1],
      ["5", /before we begin/i],
    ] as const) {
      localStorage.removeItem(SURVEY_CONSENT_KEY);
      __resetSurveyConsentForTests();
      const loops = await loopsOn(step, heading);
      expect(loops.length).toBeGreaterThan(0);
      for (const el of loops) {
        expect(el.classList.contains("animate-pulse-glow")).toBe(false);
        expect(el.classList.contains("survey-calm-glow")).toBe(true);
      }
      cleanup();
      sessionStorage.clear();
    }
  });
});
