// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import UnlockFeedbackSend from "@features/admin/ui/ap/UnlockFeedbackSend";

vi.mock("@shared/http/csrf-client", () => ({ getCsrfToken: () => "csrf-1" }));

const reply = (body: Record<string, unknown>, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

/** A tranche reply, as the route sends it. */
const tranche = (over: Record<string, unknown>) => ({
  batchSent: 0,
  sent: 0,
  eligible: 0,
  failed: 0,
  skipped: {},
  problems: [],
  newestEligible: "2026-10-22T15:00:00Z",
  oldestEligible: "2026-09-14T08:00:00Z",
  nextBefore: "2026-09-14T08:00:00Z",
  done: true,
  exhausted: false,
  halted: false,
  ...over,
});

let fetchMock: ReturnType<typeof vi.fn>;
const bodies = () => fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init.body)));

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const sendButton = () => screen.getByRole("button", { name: /^Send to \d+ readers$/ });
const confirmBox = () => screen.getByLabelText(/^Type “send \d+” to confirm$/);

describe("the admin's tranche", () => {
  it("unlocks the send only after a dry run for this name and size, and the typed words", async () => {
    fetchMock.mockImplementation(() =>
      reply(tranche({ eligible: 250, skipped: { paid: 30, not_opened: 12 } }))
    );
    const user = userEvent.setup();
    render(<UnlockFeedbackSend />);

    expect(sendButton()).toBeDisabled();
    expect(confirmBox()).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Dry run (sends nothing)" }));
    expect(
      await screen.findByText(
        /Would go to 250 readers, reports from 14 Sep to 22 Oct\. Left out: 30 bought, 12 never opened the report\./
      )
    ).toBeInTheDocument();
    expect(bodies()[0]).toEqual({
      mode: "tranche",
      batch: "first-250",
      size: 250,
      dryRun: true,
      counted: 0,
    });

    await user.type(confirmBox(), "send 25");
    expect(sendButton()).toBeDisabled();
    await user.type(confirmBox(), "0");
    expect(sendButton()).toBeEnabled();

    // Another name or size is another tranche: counted again before it can go.
    await user.type(screen.getByLabelText("Tranche name"), "-b");
    expect(sendButton()).toBeDisabled();
    expect(confirmBox()).toBeDisabled();
    await user.type(screen.getByLabelText("Tranche name"), "{Backspace}{Backspace}");
    expect(sendButton()).toBeEnabled();
    await user.clear(screen.getByLabelText("Readers"));
    await user.type(screen.getByLabelText("Readers"), "200");
    expect(confirmBox()).toBeDisabled();
    expect(sendButton()).toBeDisabled();
  });

  it("calls again until the count is done, carrying on where the last call stopped", async () => {
    fetchMock
      .mockImplementationOnce(() =>
        reply(tranche({ eligible: 100, done: false, nextBefore: "2026-10-01T10:00:00Z" }))
      )
      .mockImplementationOnce(() => reply(tranche({ eligible: 150 })));
    const user = userEvent.setup();
    render(<UnlockFeedbackSend />);
    await user.click(screen.getByRole("button", { name: "Dry run (sends nothing)" }));

    expect(await screen.findByText(/Would go to 250 readers/)).toBeInTheDocument();
    expect(bodies()[1]).toMatchObject({
      dryRun: true,
      counted: 100,
      before: "2026-10-01T10:00:00Z",
    });
  });

  it("says what a tranche stopped part-way already sent", async () => {
    fetchMock.mockImplementation(() => reply(tranche({ batchSent: 100, eligible: 150 })));
    const user = userEvent.setup();
    render(<UnlockFeedbackSend />);
    await user.click(screen.getByRole("button", { name: "Dry run (sends nothing)" }));
    expect(
      await screen.findByText(/100 already sent under this name\. Would go to 150 readers/)
    ).toBeInTheDocument();
  });

  it("sends in steps until done, with the typed words on every call", async () => {
    fetchMock
      .mockImplementationOnce(() => reply(tranche({ eligible: 250 })))
      .mockImplementationOnce(() =>
        reply(
          tranche({ batchSent: 120, sent: 120, done: false, nextBefore: "2026-10-05T09:00:00Z" })
        )
      )
      .mockImplementationOnce(() => reply(tranche({ batchSent: 250, sent: 130 })));
    const user = userEvent.setup();
    render(<UnlockFeedbackSend />);
    await user.click(screen.getByRole("button", { name: "Dry run (sends nothing)" }));
    await screen.findByText(/Would go to 250 readers/);
    await user.type(confirmBox(), "send 250");
    await user.click(sendButton());

    expect(await screen.findByText("Done: 250 of 250 sent.")).toBeInTheDocument();
    expect(bodies().slice(1)).toEqual([
      { mode: "tranche", batch: "first-250", size: 250, dryRun: false, confirm: "send 250" },
      {
        mode: "tranche",
        batch: "first-250",
        size: 250,
        dryRun: false,
        confirm: "send 250",
        before: "2026-10-05T09:00:00Z",
      },
    ]);
  });

  it("Stop ends the send after the call in flight, and sends no more", async () => {
    let finish: (r: Response) => void = () => {};
    fetchMock
      .mockImplementationOnce(() => reply(tranche({ eligible: 250 })))
      .mockImplementationOnce(() => new Promise<Response>((r) => (finish = r)));
    const user = userEvent.setup();
    render(<UnlockFeedbackSend />);
    await user.click(screen.getByRole("button", { name: "Dry run (sends nothing)" }));
    await screen.findByText(/Would go to 250 readers/);
    await user.type(confirmBox(), "send 250");
    await user.click(sendButton());

    await user.click(await screen.findByRole("button", { name: "Stop" }));
    finish(
      new Response(JSON.stringify(tranche({ batchSent: 40, sent: 40, done: false })), {
        status: 200,
      })
    );
    expect(await screen.findByText("Sent 40 of 250. Stopped.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("a dry run stopped part-way is no count: the send stays locked", async () => {
    let finish: (r: Response) => void = () => {};
    fetchMock.mockImplementationOnce(() => new Promise<Response>((r) => (finish = r)));
    const user = userEvent.setup();
    render(<UnlockFeedbackSend />);
    await user.click(screen.getByRole("button", { name: "Dry run (sends nothing)" }));
    await user.click(await screen.findByRole("button", { name: "Stop" }));
    finish(new Response(JSON.stringify(tranche({ eligible: 12, done: false })), { status: 200 }));

    expect(
      await screen.findByText("Dry run stopped before it finished. Run it again to send.")
    ).toBeInTheDocument();
    expect(screen.queryByText(/readers qualify|Would go to/)).toBeNull();
    expect(confirmBox()).toBeDisabled();
    expect(sendButton()).toBeDisabled();
  });

  it("stops when sends keep failing, and says to check Resend", async () => {
    fetchMock
      .mockImplementationOnce(() => reply(tranche({ eligible: 250 })))
      .mockImplementationOnce(() =>
        reply(
          tranche({
            failed: 3,
            halted: true,
            done: false,
            problems: ["application_error: Internal server error"],
          })
        )
      );
    const user = userEvent.setup();
    render(<UnlockFeedbackSend />);
    await user.click(screen.getByRole("button", { name: "Dry run (sends nothing)" }));
    await screen.findByText(/Would go to 250 readers/);
    await user.type(confirmBox(), "send 250");
    await user.click(sendButton());

    expect(
      await screen.findByText(
        "Stopped: 3 sends failed (application_error: Internal server error). Check Resend, then send again: it carries on where it stopped."
      )
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shows the server's refusal and stops", async () => {
    fetchMock
      .mockImplementationOnce(() => reply(tranche({ eligible: 250 })))
      .mockImplementationOnce(() => reply({ error: "Unable to send." }, 500));
    const user = userEvent.setup();
    render(<UnlockFeedbackSend />);
    await user.click(screen.getByRole("button", { name: "Dry run (sends nothing)" }));
    await screen.findByText(/Would go to 250 readers/);
    await user.type(confirmBox(), "send 250");
    await user.click(sendButton());
    expect(await screen.findByText("Stopped: Unable to send.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("the admin's test", () => {
  it("sends the chosen subject to the admin, and says where it went", async () => {
    fetchMock.mockImplementation(() =>
      reply({ sent: true, to: "ec@loveiq.org", arm: "D", submissionId: 2318 })
    );
    const user = userEvent.setup();
    render(<UnlockFeedbackSend />);
    await user.selectOptions(screen.getByLabelText("Subject"), "D");
    await user.click(screen.getByRole("button", { name: "Send a test to me" }));

    expect(
      await screen.findByText(
        "Sent to ec@loveiq.org with subject D. Its links work until your next test."
      )
    ).toBeInTheDocument();
    expect(bodies()).toEqual([{ mode: "test", arm: "D" }]);
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>)["x-csrf-token"]).toBe("csrf-1");
  });

  it("says why a test was not sent", async () => {
    fetchMock.mockImplementation(() =>
      reply({ error: "No unpaid, opened report under your address to send the test for." }, 400)
    );
    const user = userEvent.setup();
    render(<UnlockFeedbackSend />);
    await user.click(screen.getByRole("button", { name: "Send a test to me" }));
    expect(
      await screen.findByText(
        "Not sent: No unpaid, opened report under your address to send the test for."
      )
    ).toBeInTheDocument();
  });
});
