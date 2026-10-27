// @vitest-environment jsdom
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WhyPage from "@features/unlock-feedback/ui/WhyPage";
import { REASON_COPY, UNLOCK_REASONS } from "@features/unlock-feedback/logic/reasons";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }));
vi.mock("@shared/http/csrf-client", () => ({ getCsrfToken: () => "csrf-1" }));

const ANSWER = {
  alreadyPaid: false,
  archetypeName: "Loyal Ritualist",
  reason: "too_expensive",
  reportPath: "/report/rpt_ABCDEFGHIJKLMNOPQRST",
};

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

let fetchMock: ReturnType<typeof vi.fn>;
const posts = (path: string) =>
  fetchMock.mock.calls.filter(([url]) => url === path).map(([, init]) => init as RequestInit);
const bodyOf = (init: RequestInit) => JSON.parse(String(init.body));

beforeEach(() => {
  mockPush.mockReset();
  fetchMock = vi.fn((url: string) =>
    url === "/api/unlock-feedback/answer" ? json(ANSWER) : json({ success: true })
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const ready = () => screen.findByRole("heading", { level: 1 });

describe("/why while the answer is recorded", () => {
  it("posts the tapped answer once, with the CSRF header, and claims nothing yet", async () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    render(
      <StrictMode>
        <WhyPage initialReason="too_expensive" />
      </StrictMode>
    );

    expect(screen.getByText("One moment, please.")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/unlocked/i);
    await waitFor(() => expect(posts("/api/unlock-feedback/answer")).toHaveLength(1));
    const [init] = posts("/api/unlock-feedback/answer");
    expect(init!.method).toBe("POST");
    expect((init!.headers as Record<string, string>)["x-csrf-token"]).toBe("csrf-1");
    expect(bodyOf(init!)).toEqual({ r: "too_expensive", touch: false });
  });
});

describe("/why once the answer is in", () => {
  it("says the report is unlocked, in Mark's words", async () => {
    render(<WhyPage initialReason="too_expensive" />);

    expect(await ready()).toHaveTextContent("Thank you. Your full report is unlocked.");
    expect(
      screen.getByText(
        "We’ve saved your answer. The full report, with all its 17 chapters, is yours now, free."
      )
    ).toBeInTheDocument();
    expect(screen.getByText("Optional")).toBeInTheDocument();
    expect(
      screen.getByText("Your answers are only used to improve LoveIQ. No payment details needed.")
    ).toBeInTheDocument();
    // Left out on 22.10: the answer is tied to the reader, and the page asks for no time.
    expect(document.body.textContent).not.toMatch(/Anonymous|30 seconds|50\+/);
  });

  it("preselects the answer as kept, from the eight labels, with its follow-up", async () => {
    // Another button tapped later: the first answer stands, and the page shows it.
    fetchMock.mockImplementation(() => json({ ...ANSWER, reason: "privacy" }));
    render(<WhyPage initialReason="time_commitment" />);
    await ready();

    const select = screen.getByLabelText("Your answer") as HTMLSelectElement;
    expect(select.value).toBe("privacy");
    expect([...select.options].map((o) => o.textContent)).toEqual(
      UNLOCK_REASONS.map((code) => REASON_COPY[code].landing)
    );
    expect(select).toHaveAccessibleDescription("Tapped the wrong one? Change it here.");
    expect(
      screen.getByRole("heading", { level: 2, name: REASON_COPY.privacy.question })
    ).toBeInTheDocument();
    expect(screen.getByRole("group").querySelectorAll("button")).toHaveLength(5);
  });

  it("someone who had already bought: thanked, never told anything was unlocked", async () => {
    fetchMock.mockImplementation(() => json({ ...ANSWER, alreadyPaid: true }));
    render(<WhyPage initialReason="too_expensive" />);

    expect(await ready()).toHaveTextContent("Thank you. We’ve saved your answer.");
    expect(document.body.textContent).not.toMatch(/unlock/i);
    expect(screen.getByLabelText("Your answer")).toBeInTheDocument();
  });

  it("keeps the note out of Clarity and PostHog", async () => {
    render(<WhyPage initialReason="too_expensive" />);
    await ready();
    const box = screen.getByLabelText("Anything else we should know?");
    expect(box).toHaveAttribute("data-clarity-mask", "true");
    expect(box).toHaveClass("ph-no-capture");
    expect(box).toHaveAttribute("placeholder", REASON_COPY.too_expensive.placeholder);
    expect(box).toHaveAttribute("maxLength", "2000");
  });
});

describe("/why when the link or the network fails", () => {
  it("no answer in the URL: the link state, pointing to the email and the support address", async () => {
    render(<WhyPage initialReason={null} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "We couldn’t open this link."
    );
    expect(screen.getByRole("link", { name: "hello@loveiq.org" })).toHaveAttribute(
      "href",
      "mailto:hello@loveiq.org"
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("an expired or unknown link: the same state", async () => {
    fetchMock.mockImplementation(() => json({ error: "Not found." }, 404));
    render(<WhyPage initialReason="time_commitment" />);
    expect(await ready()).toHaveTextContent("We couldn’t open this link.");
  });

  it("a network error offers a retry that posts again", async () => {
    fetchMock.mockImplementationOnce(() => Promise.reject(new TypeError("offline")));
    const user = userEvent.setup();
    render(<WhyPage initialReason="time_commitment" />);

    expect(await ready()).toHaveTextContent("Something went wrong.");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Thank you. Your full report is unlocked.")).toBeInTheDocument();
    expect(posts("/api/unlock-feedback/answer")).toHaveLength(2);
  });
});

describe("/why's follow-up", () => {
  it("changing the answer switches the question, chips and placeholder, and clears picks", async () => {
    const user = userEvent.setup();
    render(<WhyPage initialReason="too_expensive" />);
    await ready();

    await user.click(screen.getByRole("button", { name: "A little less" }));
    await user.selectOptions(screen.getByLabelText("Your answer"), "result_off");
    expect(
      screen.getByRole("heading", { level: 2, name: REASON_COPY.result_off.question })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Too broad" })).toBeInTheDocument();
    expect(screen.getByLabelText("Anything else we should know?")).toHaveAttribute(
      "placeholder",
      REASON_COPY.result_off.placeholder
    );

    // Mark's new answer asks only for the reader's words, as Something else does.
    await user.selectOptions(screen.getByLabelText("Your answer"), "time_commitment");
    expect(
      screen.getByRole("heading", { level: 2, name: "What would have made it easier?" })
    ).toBeInTheDocument();
    expect(screen.queryByRole("group")).toBeNull();
    expect(screen.getByLabelText("Anything else we should know?")).toHaveAttribute(
      "placeholder",
      "One sentence is plenty"
    );

    await user.selectOptions(screen.getByLabelText("Your answer"), "too_expensive");
    expect(screen.getByRole("button", { name: "A little less" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );

    await user.selectOptions(screen.getByLabelText("Your answer"), "other");
    expect(screen.queryByRole("group")).toBeNull();
    expect(screen.queryByText("Pick any that fit.")).toBeNull();
  });

  it("chips toggle", async () => {
    const user = userEvent.setup();
    render(<WhyPage initialReason="too_expensive" />);
    await ready();
    const chip = screen.getByRole("button", { name: "Pay per chapter" });
    expect(chip).toHaveAttribute("aria-pressed", "false");
    await user.click(chip);
    expect(chip).toHaveAttribute("aria-pressed", "true");
    await user.click(chip);
    expect(chip).toHaveAttribute("aria-pressed", "false");
  });

  it("Submit and open my report with nothing added goes straight to the report", async () => {
    const user = userEvent.setup();
    render(<WhyPage initialReason="too_expensive" />);
    await ready();
    await user.click(screen.getByRole("button", { name: "Submit and open my report" }));
    expect(posts("/api/unlock-feedback/detail")).toHaveLength(0);
    expect(mockPush).toHaveBeenCalledWith(ANSWER.reportPath);
  });

  it("sends the chips and words, then opens the report", async () => {
    const user = userEvent.setup();
    render(<WhyPage initialReason="too_expensive" />);
    await ready();
    await user.click(screen.getByRole("button", { name: "A little less" }));
    await user.type(screen.getByLabelText("Anything else we should know?"), "  About 15 euros ");
    await user.click(screen.getByRole("button", { name: "Submit and open my report" }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith(ANSWER.reportPath));
    expect(bodyOf(posts("/api/unlock-feedback/detail")[0]!)).toEqual({
      chips: ["A little less"],
      note: "About 15 euros",
    });
  });

  it("sends a changed answer", async () => {
    const user = userEvent.setup();
    render(<WhyPage initialReason="too_expensive" />);
    await ready();
    await user.selectOptions(screen.getByLabelText("Your answer"), "time_commitment");
    await user.click(screen.getByRole("button", { name: "Submit and open my report" }));

    await waitFor(() => expect(mockPush).toHaveBeenCalled());
    expect(bodyOf(posts("/api/unlock-feedback/detail")[0]!)).toEqual({
      reason: "time_commitment",
      chips: [],
      note: "",
    });
  });

  it("keeps the words on screen when sending fails, and Skip still opens the report", async () => {
    fetchMock.mockImplementation((url: string) =>
      url === "/api/unlock-feedback/answer" ? json(ANSWER) : json({ error: "x" }, 500)
    );
    const user = userEvent.setup();
    render(<WhyPage initialReason="too_expensive" />);
    await ready();
    await user.type(screen.getByLabelText("Anything else we should know?"), "Too dear");
    await user.click(screen.getByRole("button", { name: "Submit and open my report" }));

    expect(
      await screen.findByText("We couldn’t send that. Please try again, or skip to your report.")
    ).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Anything else we should know?")).toHaveValue("Too dear");
    expect(screen.getByRole("button", { name: "Submit and open my report" })).toBeEnabled();
    expect(screen.getByRole("link", { name: "Skip, just open my report" })).toHaveAttribute(
      "href",
      ANSWER.reportPath
    );
  });
});
