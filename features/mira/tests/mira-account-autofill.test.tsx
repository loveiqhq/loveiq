// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = { replace: vi.fn(), refresh: vi.fn(), push: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import SignUpFlow from "@features/mira/ui/SignUpFlow";

/**
 * The sign-in page's passkeys (the email field's suggestions and the button) with the real
 * @simplewebauthn/browser, and a navigator.credentials.get that behaves as browsers do: it waits
 * until the person answers, and ends with the abort's reason when its signal is aborted.
 */

type Reply = { status?: number; body: unknown };
let replies: Record<string, (body: Record<string, unknown>) => Reply | Promise<Reply>>;
let hang = false;
const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
  // A round trip is a task, not a microtask, as in a browser.
  await new Promise((r) => setTimeout(r, 1));
  if (hang) return new Promise<Response>(() => {});
  const key = `${init.method ?? "GET"} ${url.split("?")[0]}`;
  const body = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
  const r = (await replies[key]?.(body)) ?? { body: { success: true } };
  const status = r.status ?? 200;
  return { ok: status < 400, status, json: async () => r.body } as Response;
});
const optionCalls = () =>
  fetchMock.mock.calls.filter(
    ([url, init]) =>
      url.startsWith("/api/mira/passkeys") &&
      (JSON.parse(String(init?.body ?? "{}")) as { action?: string }).action === "sign-in-options"
  ).length;

type Get = { mediation?: string; signal: AbortSignal; answer: (err: unknown) => void };
type GetOptions = { mediation?: string; signal: AbortSignal };
let gets: Get[];
/** Like a browser: pending until the person answers, ended by its signal with the abort's reason. */
const pendingGet = (opts: GetOptions) =>
  new Promise((_, reject) => {
    gets.push({ mediation: opts.mediation, signal: opts.signal, answer: reject });
    if (opts.signal.aborted) return reject(opts.signal.reason);
    opts.signal.addEventListener("abort", () => reject(opts.signal.reason));
  });
const credentialsGet = vi.fn(pendingGet);
/** What a browser answers when the person closes its sheet. */
const closedSheet = () => new DOMException("The operation was not allowed.", "NotAllowedError");
const conditional = () => gets.filter((g) => g.mediation === "conditional");
const sheet = () => gets.find((g) => g.mediation === undefined);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const OPTIONS = {
  body: { options: { challenge: "Y2hhbGxlbmdlLWNoYWxsZW5nZQ", rpId: "localhost" } },
};

beforeEach(() => {
  replies = {};
  hang = false;
  gets = [];
  credentialsGet.mockImplementation(pendingGet);
  // Stubbed for the whole file: whatever might still run after a test never reaches a network.
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  localStorage.clear();
  const PKC = function PublicKeyCredential() {} as unknown as {
    isConditionalMediationAvailable: () => Promise<boolean>;
  };
  PKC.isConditionalMediationAvailable = async () => true;
  vi.stubGlobal("PublicKeyCredential", PKC);
  Object.defineProperty(navigator, "credentials", {
    value: { get: credentialsGet, create: vi.fn() },
    configurable: true,
  });
});
afterEach(async () => {
  hang = true; // anything still going: its next request never answers
  cleanup();
  await wait(20);
  fetchMock.mockClear();
  credentialsGet.mockClear();
  vi.unstubAllGlobals();
});

describe("the email field's passkey suggestions", () => {
  it.each([
    ["the site has no passkeys (503)", { status: 503, body: { error: "Not on this site." } }],
    ["the route's own limit (429)", { status: 429, body: { error: "Please try again." } }],
    ["a refused request (403)", { status: 403, body: { error: "Invalid request." } }],
    ["a server error (500)", { status: 500, body: { error: "Not working." } }],
  ])("ask once and stop quietly when the options are refused: %s", async (_, reply) => {
    replies["POST /api/mira/passkeys"] = () => reply;
    render(<SignUpFlow />);
    await wait(300);
    expect(optionCalls()).toBe(1);
    expect(gets).toEqual([]);
    expect(screen.queryByRole("alert")).toBeNull(); // the person did nothing
  });

  it("ask once and stop quietly without a connection", async () => {
    replies["POST /api/mira/passkeys"] = () => {
      throw new TypeError("Failed to fetch");
    };
    render(<SignUpFlow />);
    await wait(300);
    expect(optionCalls()).toBe(1);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("come back when the person closes the sheet, a few times at most", async () => {
    replies["POST /api/mira/passkeys"] = () => OPTIONS;
    // A browser that ends every conditional request at once, as if each sheet were closed.
    credentialsGet.mockImplementation((opts) => {
      gets.push({ mediation: opts.mediation, signal: opts.signal, answer: () => undefined });
      return Promise.reject(closedSheet());
    });
    render(<SignUpFlow />);
    await wait(300);
    const asked = optionCalls();
    expect(asked).toBeGreaterThan(1);
    expect(asked).toBeLessThanOrEqual(3);
    await wait(200);
    expect(optionCalls()).toBe(asked);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("end with the page, and nothing runs after it", async () => {
    replies["POST /api/mira/passkeys"] = () => OPTIONS;
    const view = render(<SignUpFlow />);
    await waitFor(() => expect(conditional()).toHaveLength(1));
    view.unmount();
    expect(conditional()[0]!.signal.aborted).toBe(true);
    await wait(300);
    expect(optionCalls()).toBe(1);
    expect(gets).toHaveLength(1);
  });

  it("end quietly when the browser can't make them, and leave Google's message alone", async () => {
    replies["POST /api/mira/passkeys"] = () => OPTIONS;
    // Chromium without a passkey provider says it can, then refuses the request at once.
    credentialsGet.mockImplementation((opts) => {
      gets.push({ mediation: opts.mediation, signal: opts.signal, answer: () => undefined });
      return Promise.reject(
        new DOMException("Resident credentials are not supported.", "NotSupportedError")
      );
    });
    render(<SignUpFlow googleResult="cancelled" />);
    await waitFor(() => expect(conditional()).toHaveLength(1));
    await wait(200);
    expect(conditional()).toHaveLength(1); // not asked again
    expect(screen.getByRole("alert")).toHaveTextContent("Google sign-in was cancelled.");
  });

  it("end quietly when the person goes on to the emailed code", async () => {
    replies["POST /api/mira/passkeys"] = () => OPTIONS;
    replies["POST /api/mira/auth"] = () => ({ body: { success: true } });
    render(<SignUpFlow />);
    await waitFor(() => expect(conditional()).toHaveLength(1));
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@example.com" } });
    screen
      .getAllByRole("checkbox")
      .slice(0, 3)
      .forEach((b) => fireEvent.click(b));
    fireEvent.click(screen.getByRole("button", { name: "Send me a code" }));
    await screen.findByRole("heading", { name: "Check your inbox" });
    await wait(100);
    expect(conditional()[0]!.signal.aborted).toBe(true);
    expect(optionCalls()).toBe(1);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("Sign in with a passkey", () => {
  it("keeps the device's sheet open until the person answers; closing it brings the suggestions back", async () => {
    replies["POST /api/mira/passkeys"] = () => OPTIONS;
    render(<SignUpFlow />);
    await waitFor(() => expect(conditional()).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: "Sign in with a passkey" }));
    await waitFor(() => expect(sheet()).toBeDefined());
    await wait(200);
    expect(sheet()!.signal.aborted).toBe(false);
    expect(gets.at(-1)).toBe(sheet());
    expect(conditional()[0]!.signal.aborted).toBe(true); // the sheet replaced the suggestions
    sheet()!.answer(closedSheet());
    await waitFor(() => expect(conditional()).toHaveLength(2));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: "Sign in with a passkey" })).toBeEnabled();
  });

  it("ends with the page, and asks nothing after it", async () => {
    replies["POST /api/mira/passkeys"] = () => OPTIONS;
    const view = render(<SignUpFlow />);
    await waitFor(() => expect(conditional()).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: "Sign in with a passkey" }));
    await waitFor(() => expect(sheet()).toBeDefined());
    view.unmount();
    expect(sheet()!.signal.aborted).toBe(true);
    await wait(300);
    expect(optionCalls()).toBe(2);
    expect(gets).toHaveLength(2);
  });

  it("is never replaced by a suggestion whose options were still on their way", async () => {
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    let first = true;
    replies["POST /api/mira/passkeys"] = async () => {
      if (first) {
        first = false;
        await held; // the suggestions' options, slow to come
      }
      return OPTIONS;
    };
    render(<SignUpFlow />);
    await waitFor(() => expect(optionCalls()).toBe(1));
    fireEvent.click(screen.getByRole("button", { name: "Sign in with a passkey" }));
    await waitFor(() => expect(sheet()).toBeDefined());
    release();
    await wait(200);
    expect(sheet()!.signal.aborted).toBe(false);
    expect(conditional()).toEqual([]);
  });
});
