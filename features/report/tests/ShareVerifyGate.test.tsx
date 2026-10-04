// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@shared/http/csrf-client", () => ({ getCsrfToken: () => "csrf" }));

import ShareVerifyGate from "@features/report/ui/ShareVerifyGate";

const fetchMock = vi.fn();

function submit(status: number) {
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ error: "Report not found." }), { status })
  );
  const onVerified = vi.fn();
  render(
    <ShareVerifyGate
      shareToken="rpts_abcdefghijklmnopqrst"
      ownerFirstName="Ana"
      recipientEmailHint="b***@example.com"
      onVerified={onVerified}
    />
  );
  fireEvent.change(screen.getByLabelText(/your email address/i), {
    target: { value: "bo@exmaple.com" },
  });
  fireEvent.click(screen.getByRole("button", { name: /open report/i }));
  return onVerified;
}

describe("ShareVerifyGate", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  /**
   * The verify route answers 404 for a wrong email as well as a missing share, and the
   * gate only appears for a share that existed when the page loaded. A typo used to read
   * "This shared report is no longer available", so the recipient gave up.
   */
  it("reads a 404 as an email that does not match, not a report that is gone", async () => {
    submit(404);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That email doesn't match this invite. Use the address it was sent to."
    );
    expect(screen.queryByText(/no longer available/i)).toBeNull();
  });

  it("asks for the full address on a 400, not the server's 'Invalid input'", async () => {
    submit(400);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Enter the full email address the invite was sent to."
    );
  });

  it("does not blame the email when the server fails", async () => {
    submit(503);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't check that just now. Try again in a moment."
    );
  });

  it("keeps the rate-limit message", async () => {
    submit(429);
    expect(await screen.findByRole("alert")).toHaveTextContent("Too many attempts");
  });

  it("opens the report on a match", async () => {
    const onVerified = submit(200);
    await waitFor(() => expect(onVerified).toHaveBeenCalledOnce());
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
