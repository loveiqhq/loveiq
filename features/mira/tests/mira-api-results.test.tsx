// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ADULTS_ONLY, SIGNED_OUT, miraApi, signInHref, useSignedOut } from "@features/mira/ui/api";

/**
 * Two refusals every screen must show the same way (round-2 decision 9 and HAB-16): the under-18
 * stop (403 with `minor: true`) and a lost sign-in (401), whatever words the route used.
 */

let reply: { status: number; body: unknown };
const fetchMock = vi.fn(
  async () =>
    ({
      ok: reply.status < 400,
      status: reply.status,
      json: async () => reply.body,
    }) as Response
);

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  window.history.replaceState({}, "", "/mira/settings#weekly");
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockClear();
});

describe("a refusal reaches every screen as one result", () => {
  it("the under-18 stop: one flag and one wording, whatever the route said", async () => {
    reply = { status: 403, body: { error: "Mira's coaching is only for adults.", minor: true } };
    const r = await miraApi("/api/mira/goals");
    expect(r).toMatchObject({ ok: false, status: 403, minor: true });
    expect(r.data.error).toBe(ADULTS_ONLY);
    expect(ADULTS_ONLY).toBe("Mira is only for adults.");
  });

  it("any other 403 (a CSRF refusal) stays what it was", async () => {
    reply = { status: 403, body: { error: "Invalid request." } };
    const r = await miraApi("/api/mira/goals");
    expect(r.minor).toBeUndefined();
    expect(r.data.error).toBe("Invalid request.");
  });

  it("a lost sign-in: one flag and one wording, and the page hears of it", async () => {
    function Page() {
      return <p>{useSignedOut() ? "out" : "in"}</p>;
    }
    render(<Page />);
    expect(screen.getByText("in")).toBeInTheDocument();
    reply = { status: 401, body: { error: "Please sign in." } };
    let r!: Awaited<ReturnType<typeof miraApi>>;
    await act(async () => {
      r = await miraApi("/api/mira/me", { method: "PATCH", body: { nudges_on: false } });
    });
    expect(r).toMatchObject({ ok: false, status: 401, signedOut: true });
    expect(r.data.error).toBe(SIGNED_OUT);
    expect(screen.getByText("out")).toBeInTheDocument();
  });

  it("signs in again back to this page and its section", () => {
    expect(signInHref()).toBe("/mira/start?next=%2Fmira%2Fsettings%23weekly");
  });
});
