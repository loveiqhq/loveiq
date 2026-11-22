// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = { replace: vi.fn(), refresh: vi.fn(), push: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
// The browser's WebAuthn: present, with a built-in authenticator, no autofill (tested apart).
const webauthn = vi.hoisted(() => ({
  supports: true,
  platform: true,
  startRegistration: vi.fn(),
  startAuthentication: vi.fn(),
  sendSignal: vi.fn(),
}));
vi.mock("@simplewebauthn/browser", () => ({
  browserSupportsWebAuthn: () => webauthn.supports,
  browserSupportsWebAuthnAutofill: async () => false,
  platformAuthenticatorIsAvailable: async () => webauthn.platform,
  startRegistration: webauthn.startRegistration,
  startAuthentication: webauthn.startAuthentication,
  sendSignal: webauthn.sendSignal,
  WebAuthnAbortService: { cancelCeremony: vi.fn() },
}));

import MiraSettings from "@features/mira/ui/MiraSettings";
import SignUpFlow from "@features/mira/ui/SignUpFlow";
import SecuritySettings, { lastActive } from "@features/mira/ui/account/SecuritySettings";
import { unlockMark, unlockName } from "@features/mira/ui/account/passkeys";

type Reply = { status?: number; body: unknown };
let replies: Record<string, (body: Record<string, unknown>) => Reply>;
const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
  const key = `${init.method ?? "GET"} ${url.split("?")[0]}`;
  const body = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
  const r = replies[key]?.(body) ?? { body: { success: true } };
  const status = r.status ?? 200;
  return { ok: status < 400, status, json: async () => r.body } as Response;
});
const calls = (key: string) =>
  fetchMock.mock.calls
    .filter(([url, init]) => `${init?.method ?? "GET"} ${url.split("?")[0]}` === key)
    .map(([url, init]) => ({
      url,
      ...(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>),
    }));
const MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15";

beforeEach(() => {
  replies = {};
  vi.stubGlobal("fetch", fetchMock);
  localStorage.clear();
  webauthn.supports = true;
  webauthn.platform = true;
  webauthn.startRegistration.mockResolvedValue({ id: "new-key", rawId: "new-key" });
  webauthn.startAuthentication.mockResolvedValue({ id: "a-key", rawId: "a-key" });
  webauthn.sendSignal.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "userAgent", { value: MAC, configurable: true });
});
afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.unstubAllGlobals();
  fetchMock.mockClear();
  Object.values(router).forEach((f) => f.mockClear());
  Object.values(webauthn).forEach(
    (f) => typeof f === "function" && (f as ReturnType<typeof vi.fn>).mockReset()
  );
});

const tickAll = () =>
  screen
    .getAllByRole("checkbox")
    .slice(0, 3)
    .forEach((b) => fireEvent.click(b));
async function codeSignIn(verifyReply: unknown) {
  replies["POST /api/mira/auth"] = (b) =>
    b.action === "verify" ? { body: verifyReply } : { body: { success: true } };
  replies["GET /api/mira/me"] = () => ({ body: { profile: { time_zone: "Europe/Berlin" } } });
  render(<SignUpFlow />);
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@b.co" } });
  tickAll();
  fireEvent.click(screen.getByRole("button", { name: "Send me a code" }));
  await screen.findByRole("heading", { name: "Check your inbox" });
  fireEvent.change(screen.getByLabelText("Code from the email"), { target: { value: "12345678" } });
  fireEvent.click(screen.getByRole("button", { name: "Verify and continue" }));
}

describe("Use Face ID next time?", () => {
  it("is offered once after a code sign-in, in the device's words, and adds the passkey in one tap", async () => {
    replies["POST /api/mira/passkeys"] = (b) =>
      b.action === "register-options"
        ? { body: { options: { challenge: "c" } } }
        : { body: { passkey: { id: "new-key", label: "Mac · Safari" } } };
    await codeSignIn({ success: true, offerPasskey: true });
    const heading = await screen.findByRole("heading", { name: "Use Touch ID next time?" });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(calls("POST /api/mira/event")).toEqual([
      expect.objectContaining({ type: "track", name: "passkey_offer_shown" }),
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Use Touch ID" }));
    await screen.findByRole("heading", { name: "You're all set" });
    expect(calls("POST /api/mira/passkeys").map((c) => [c.action, c.via])).toEqual([
      ["register-options", "offer"],
      ["register", "offer"],
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/mira/home"));
    // Once per browser: the next code sign-in goes straight on.
    cleanup();
    router.replace.mockClear();
    await codeSignIn({ success: true, offerPasskey: true });
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/mira/home"));
    expect(screen.queryByRole("heading", { name: /next time/ })).toBeNull();
  });

  it("isn't offered when the account may not, or the device can't, make one", async () => {
    await codeSignIn({ success: true, offerPasskey: false });
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/mira/home"));
    cleanup();
    router.replace.mockClear();
    webauthn.platform = false;
    await codeSignIn({ success: true, offerPasskey: true });
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/mira/home"));
    expect(calls("POST /api/mira/passkeys")).toEqual([]);
  });

  it("Not now goes on to About you for a new account; a closed sheet is no error", async () => {
    replies["POST /api/mira/passkeys"] = () => ({ body: { options: { challenge: "c" } } });
    webauthn.startRegistration.mockRejectedValueOnce(
      Object.assign(new Error("x"), { name: "NotAllowedError" })
    );
    await codeSignIn({ success: true, offerPasskey: true, needsProfile: true });
    fireEvent.click(await screen.findByRole("button", { name: "Use Touch ID" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Use Touch ID" })).not.toHaveAttribute(
        "aria-disabled"
      )
    );
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    await screen.findByRole("heading", { name: "About you" });
  });

  it("shows a fingerprint beside a fingerprint, and a face beside Face ID", () => {
    expect(unlockMark("your fingerprint")).toBe("fingerprint"); // Android
    expect(unlockMark("Touch ID")).toBe("fingerprint");
    expect(unlockMark("Face ID")).toBe("face");
    expect(unlockMark("Touch ID or Face ID")).toBe("face");
  });

  it("speaks the device's language", () => {
    expect(unlockName("Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X)")).toBe("Face ID");
    expect(unlockName(MAC)).toBe("Touch ID");
    expect(unlockName(MAC, 5)).toBe("Touch ID or Face ID"); // an iPad asking as a Mac
    expect(unlockName("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("Windows Hello");
    expect(unlockName("Mozilla/5.0 (Linux; Android 14; Pixel 8)")).toBe("your fingerprint");
    expect(unlockName("Mozilla/5.0 (X11; Linux x86_64)")).toBe("your device");
  });
});

describe("The sign-up form", () => {
  it("says what is missing instead of a dead button, and marks the step it is on (A11Y-14)", async () => {
    render(<SignUpFlow />);
    const email = screen.getByLabelText("Email");
    fireEvent.change(email, { target: { value: "lea@" } });
    tickAll();
    fireEvent.click(screen.getByRole("button", { name: "Send me a code" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Please enter your email address.");
    expect(document.activeElement).toBe(email);
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(email).toHaveAttribute("aria-describedby", alert.id);
    expect(calls("POST /api/mira/auth")).toEqual([]);
    const steps = within(screen.getByRole("list", { name: "Sign-up progress" })).getAllByRole(
      "listitem"
    );
    expect(steps.map((li) => li.getAttribute("aria-current"))).toEqual(["step", null, null]);
  });

  it("draws its fields' edges at 3:1 (ap-field, A11Y-8)", () => {
    render(<SignUpFlow />);
    expect(screen.getByLabelText("Email")).toHaveClass("border-ap-field");
  });

  it("keeps the passkey button in reach while it works, and a second tap does nothing", async () => {
    let answer!: (r: { body: unknown }) => void;
    replies["POST /api/mira/passkeys"] = () => ({ body: { options: { challenge: "c" } } });
    webauthn.startAuthentication.mockImplementation(
      () => new Promise((resolve) => (answer = () => resolve({ id: "a-key", rawId: "a-key" })))
    );
    render(<SignUpFlow />);
    const button = screen.getByRole("button", { name: "Sign in with a passkey" });
    fireEvent.click(button);
    await waitFor(() => expect(button).toHaveAttribute("aria-disabled", "true"));
    expect(button).not.toBeDisabled(); // focusable: a keyboard user isn't thrown out (decision 7)
    fireEvent.click(button);
    await new Promise((r) => setTimeout(r, 20));
    expect(webauthn.startAuthentication).toHaveBeenCalledTimes(1);
    answer({ body: {} });
  });
});

describe("A chat the account doesn't keep", () => {
  // The sign-up card promised "this chat comes with you"; an account with "Remember our
  // conversations" off keeps none, so the page says so before going on (round-2 ID-20).
  const chat = () =>
    localStorage.setItem(
      "mira.chat.v1",
      JSON.stringify({ turns: [{ role: "user", content: "hello" }], freeLeft: 0 })
    );

  it("by code: says it wasn't kept and why, then goes on", async () => {
    chat();
    await codeSignIn({ success: true, chatId: null, memoryOff: true });
    const heading = await screen.findByRole("heading", { name: "Your earlier chat wasn't kept" });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(screen.getByText(/“Remember our conversations” is off/)).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/mira/home"));
  });

  it("with a passkey, and back from Google, the same", async () => {
    chat();
    replies["POST /api/mira/passkeys"] = (b) =>
      b.action === "sign-in-options"
        ? { body: { options: { challenge: "c" } } }
        : { body: { success: true, needsProfile: false } };
    replies["POST /api/mira/auth"] = () => ({
      body: { success: true, chatId: null, memoryOff: true },
    });
    replies["GET /api/mira/me"] = () => ({ body: { profile: { time_zone: "Europe/Berlin" } } });
    render(<SignUpFlow />);
    fireEvent.click(screen.getByRole("button", { name: "Sign in with a passkey" }));
    await screen.findByRole("heading", { name: "Your earlier chat wasn't kept" });
    cleanup();
    chat();
    render(<SignUpFlow googleResult="done" needsAbout />);
    await screen.findByRole("heading", { name: "Your earlier chat wasn't kept" });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("heading", { name: "About you" });
  });
});

describe("The code step", () => {
  afterEach(() => sessionStorage.clear());
  const toCodeStep = async () => {
    render(<SignUpFlow />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "lea@example.com" } });
    tickAll();
    fireEvent.click(screen.getAllByRole("checkbox")[3]!); // the optional LoveIQ result
    fireEvent.click(screen.getByRole("button", { name: "Send me a code" }));
    await screen.findByRole("heading", { name: "Check your inbox" });
  };

  it("comes back after a reload, Back or a discarded tab, with its address", async () => {
    await toCodeStep();
    cleanup(); // the page goes; this tab's storage stays
    render(<SignUpFlow />);
    await screen.findByRole("heading", { name: "Check your inbox" });
    expect(screen.getByText("lea@example.com")).toBeInTheDocument();
    replies["POST /api/mira/auth"] = (b) =>
      b.action === "verify" ? { body: { success: true } } : { body: { success: true } };
    replies["GET /api/mira/me"] = () => ({ body: { profile: { time_zone: "Europe/Berlin" } } });
    fireEvent.change(screen.getByLabelText("Code from the email"), {
      target: { value: "12345678" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Verify and continue" }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/mira/home"));
    expect(calls("POST /api/mira/auth").at(-1)).toMatchObject({
      action: "verify",
      email: "lea@example.com",
      useAssessment: true,
    });
    // Signed in: nothing waits any more.
    cleanup();
    render(<SignUpFlow />);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByRole("heading", { name: /Create your free account/ })).toBeVisible();
  });

  // Round-3 R3-ACCT-1: the kept step held the address but not the three ticks, so "Send a new
  // code" after a reload sent them unticked and got "Please check the form and try again."
  it("sends a new code after a reload: the ticks that got it there come back with it", async () => {
    await toCodeStep();
    cleanup();
    render(<SignUpFlow />);
    await screen.findByRole("heading", { name: "Check your inbox" });
    fireEvent.click(screen.getByRole("button", { name: "Send a new code" }));
    await waitFor(() => expect(calls("POST /api/mira/auth")).toHaveLength(2));
    expect(calls("POST /api/mira/auth").at(-1)).toMatchObject({
      action: "start",
      email: "lea@example.com",
      adult: true,
      terms: true,
      consent: true,
    });
  });

  it("is left for good with Change email", async () => {
    await toCodeStep();
    fireEvent.click(screen.getByRole("button", { name: "Change email" }));
    cleanup();
    render(<SignUpFlow />);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole("heading", { name: "Check your inbox" })).toBeNull();
  });

  it("opens when a code went out minutes ago, so the code in the inbox can still be used", async () => {
    replies["POST /api/mira/auth"] = () => ({
      status: 429,
      body: {
        error: "We just sent you a code. Check your inbox and spam, or try again in a few minutes.",
        codeSent: true,
      },
    });
    await toCodeStep();
    expect(screen.getByRole("status")).toHaveTextContent("We just sent you a code.");
    expect(screen.getByLabelText("Code from the email")).toBeInTheDocument();
  });
});

describe("A sign-in Mira refuses as under 18", () => {
  const adultsOnly = () => screen.findByRole("heading", { name: "Mira is only for adults." });

  it("by code: says so at once, never asks About you or promises nudges", async () => {
    localStorage.setItem("mira.chat.v1", JSON.stringify({ turns: [], freeLeft: 0 }));
    await codeSignIn({ success: true, minor: true, needsProfile: false, chatId: null });
    const heading = await adultsOnly();
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(screen.queryByText(/daily nudge/)).toBeNull();
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute(
      "href",
      "/mira/settings"
    );
    expect(router.replace).not.toHaveBeenCalled();
    expect(calls("PATCH /api/mira/me")).toEqual([]);
    expect(localStorage.getItem("mira.chat.v1")).toBeNull(); // the browser forgets its chat
  });

  it("with a passkey: the same refusal, not an error under the form", async () => {
    replies["POST /api/mira/passkeys"] = (b) =>
      b.action === "sign-in-options"
        ? { body: { options: { challenge: "c" } } }
        : { status: 403, body: { error: "Mira is only for adults.", minor: true } };
    render(<SignUpFlow />);
    fireEvent.click(screen.getByRole("button", { name: "Sign in with a passkey" }));
    await adultsOnly();
    expect(screen.queryByRole("button", { name: "Send me a code" })).toBeNull();
    // Not signed in: nothing to manage in Settings.
    expect(screen.queryByRole("link", { name: "Settings" })).toBeNull();
  });

  it("back from Google: the same refusal, and the browser's chat stays out of the account", async () => {
    localStorage.setItem(
      "mira.chat.v1",
      JSON.stringify({ turns: [{ role: "user", content: "hi" }], freeLeft: 0 })
    );
    render(<SignUpFlow googleResult="done" needsAbout minor />);
    await adultsOnly();
    expect(screen.queryByRole("heading", { name: "About you" })).toBeNull();
    await new Promise((r) => setTimeout(r, 20));
    expect(calls("POST /api/mira/auth")).toEqual([]);
    expect(localStorage.getItem("mira.chat.v1")).toBeNull();
  });
});

describe("Back to a Settings section after sign-in", () => {
  // A session email's link, /mira/settings#weekly, signed out: the page's redirect can't see the
  // hash, so it sends next=/mira/settings, and the browser keeps #weekly on the sign-in page.
  afterEach(() => window.history.replaceState(null, "", "/"));

  it("goes back to the section the link named, by code and by Google", async () => {
    window.history.replaceState(null, "", "/mira/start?next=%2Fmira%2Fsettings#weekly");
    replies["POST /api/mira/auth"] = (b) =>
      b.action === "verify" ? { body: { success: true } } : { body: { success: true } };
    replies["GET /api/mira/me"] = () => ({ body: { profile: { time_zone: "Europe/Berlin" } } });
    render(<SignUpFlow googleEnabled next="/mira/settings" />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@b.co" } });
    tickAll();
    // Google leaves the page, so the section rides in its next.
    expect(screen.getByRole("link", { name: "Continue with Google" })).toHaveAttribute(
      "href",
      expect.stringContaining("&next=%2Fmira%2Fsettings%23weekly")
    );
    fireEvent.click(screen.getByRole("button", { name: "Send me a code" }));
    await screen.findByRole("heading", { name: "Check your inbox" });
    fireEvent.change(screen.getByLabelText("Code from the email"), {
      target: { value: "12345678" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Verify and continue" }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/mira/settings#weekly"));
  });
});

describe("Sign in with a passkey", () => {
  it("signs in without ticks or a code, brings the chat along, then goes on", async () => {
    localStorage.setItem(
      "mira.chat.v1",
      JSON.stringify({ turns: [{ role: "user", content: "hello" }], freeLeft: 0 })
    );
    replies["POST /api/mira/passkeys"] = (b) =>
      b.action === "sign-in-options"
        ? { body: { options: { challenge: "c" } } }
        : { body: { success: true, needsProfile: false } };
    replies["GET /api/mira/me"] = () => ({ body: { profile: { time_zone: "Europe/Berlin" } } });
    render(<SignUpFlow />);
    expect(screen.getByLabelText("Email")).toHaveAttribute("autocomplete", "email webauthn");
    fireEvent.click(screen.getByRole("button", { name: "Sign in with a passkey" }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/mira/home"));
    const signIn = calls("POST /api/mira/passkeys").find((c) => c.action === "sign-in")!;
    expect(signIn).not.toHaveProperty("ticks");
    expect(calls("POST /api/mira/auth")).toEqual([
      expect.objectContaining({ action: "carry", carry: [{ role: "user", content: "hello" }] }),
    ]);
    expect(localStorage.getItem("mira.chat.v1")).toBeNull();
  });

  it("asks for the ticks when the consent on file is older, and sends them once ticked", async () => {
    let first = true;
    replies["POST /api/mira/passkeys"] = (b) => {
      if (b.action === "sign-in-options") return { body: { options: { challenge: "c" } } };
      if (first) {
        first = false;
        return {
          status: 409,
          body: {
            error: "Please tick the three boxes, then use your passkey again.",
            needsConsent: true,
          },
        };
      }
      return { body: { success: true, needsProfile: true } };
    };
    render(<SignUpFlow />);
    fireEvent.click(screen.getByRole("button", { name: "Sign in with a passkey" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Please tick the three boxes");
    tickAll();
    fireEvent.click(screen.getByRole("button", { name: "Sign in with a passkey" }));
    await screen.findByRole("heading", { name: "About you" });
    const sent = calls("POST /api/mira/passkeys").filter((c) => c.action === "sign-in");
    expect(sent[1]!.ticks).toEqual({
      adult: true,
      terms: true,
      consent: true,
      useAssessment: false,
    });
  });

  it("asks the passkey manager to forget a passkey Mira no longer knows", async () => {
    replies["POST /api/mira/passkeys"] = (b) =>
      b.action === "sign-in-options"
        ? { body: { options: { challenge: "c" } } }
        : {
            status: 400,
            body: { error: "That passkey didn't work.", unknown: true, rpID: "loveiq.org" },
          };
    render(<SignUpFlow />);
    fireEvent.click(screen.getByRole("button", { name: "Sign in with a passkey" }));
    await screen.findByRole("alert");
    expect(webauthn.sendSignal).toHaveBeenCalledWith({
      signalName: "unknownCredential",
      rpID: "loveiq.org",
      credentialID: "a-key",
    });
  });

  it("is hidden where the browser has no passkeys", () => {
    webauthn.supports = false;
    render(<SignUpFlow />);
    expect(screen.queryByRole("button", { name: "Sign in with a passkey" })).toBeNull();
    expect(screen.getByText(/Use the same form\.$/)).toBeInTheDocument();
  });
});

const SECURITY = {
  email: "lea@example.com",
  recent: true,
  emailChange: { allowed: true },
  google: { allowed: true, connected: true },
  passkeys: {
    allowed: true,
    rpID: "loveiq.org",
    userHandle: "dXNlcg",
    list: [
      {
        id: "k1",
        label: "iPhone · Safari",
        backed_up: true,
        created_at: "2026-11-20T09:00:00Z",
        last_used_at: null,
      },
      {
        id: "k2",
        label: "Work laptop",
        backed_up: false,
        created_at: "2026-11-21T09:00:00Z",
        last_used_at: null,
      },
    ],
  },
  devices: [
    {
      id: "d1",
      method: "email",
      device: "Mac · Safari",
      city: "Berlin",
      created_at: "2026-11-21T09:00:00Z",
      last_seen_at: "2026-11-22T09:00:00Z",
      current: true,
    },
    {
      id: "d2",
      method: "passkey",
      device: "iPhone · Safari",
      city: "Berlin",
      created_at: "2026-11-20T09:00:00Z",
      last_seen_at: "2026-11-21T09:00:00Z",
      current: false,
    },
  ],
};

describe("Settings › Sign-in & security", () => {
  const show = async (over: Partial<typeof SECURITY> = {}) => {
    replies["GET /api/mira/security"] = () => ({ body: { ...SECURITY, ...over } });
    render(<SecuritySettings />);
    return screen.findByRole("region", { name: "Devices" });
  };

  it("shows how the account signs in and where it is signed in, this device marked", async () => {
    const devices = await show();
    expect(within(devices).getByText("You're signed in on 2 devices.")).toBeInTheDocument();
    const here = within(devices).getByText("This device").closest("li")!;
    expect(here).toHaveTextContent("Mac · Safari");
    expect(here).toHaveTextContent("Berlin · Active now");
    const how = screen.getByRole("region", { name: "How you sign in" });
    expect(how).toHaveTextContent("lea@example.com");
    expect(how).toHaveTextContent("Connected");
    const passkey = (label: string) =>
      within(how).getByText(label, { selector: "p" }).closest("li");
    expect(passkey("iPhone · Safari")).toHaveTextContent("Synced");
    expect(passkey("Work laptop")).toHaveTextContent("On this device only");
    // True on every device, Android's screen lock included (not "Face ID, Touch ID or Windows Hello").
    expect(how).toHaveTextContent(
      "Sign in with your face, fingerprint or screen lock instead of a code."
    );
  });

  it("lists this device first, and tells look-alike devices apart by when they signed in", async () => {
    const phone = (id: string, current: boolean, created: string) => ({
      id,
      method: "passkey",
      device: "Android phone · Chrome",
      city: "Berlin",
      created_at: created,
      last_seen_at: current ? "2026-11-22T08:00:00Z" : "2026-11-22T09:00:00Z",
      current,
    });
    const devices = await show({
      devices: [
        phone("old", false, "2026-11-22T08:05:00Z"),
        phone("here", true, "2026-11-22T09:14:00Z"),
      ],
    });
    const at = (iso: string) =>
      new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    const rows = within(devices).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("This device");
    expect(rows[0]).toHaveTextContent(
      `Signed in 22 Nov at ${at("2026-11-22T09:14:00Z")} with a passkey`
    );
    expect(rows[1]).toHaveTextContent(
      `Signed in 22 Nov at ${at("2026-11-22T08:05:00Z")} with a passkey`
    );
  });

  it("signs out another device in place, and this one out of the page", async () => {
    const devices = await show();
    fireEvent.click(within(devices).getByRole("button", { name: "Sign out iPhone · Safari" }));
    await waitFor(() =>
      expect(within(devices).queryByText("iPhone · Safari", { selector: "p" })).toBeNull()
    );
    expect(calls("DELETE /api/mira/security")[0]!.url).toBe("/api/mira/security?device=d2");
    expect(screen.getByRole("status")).toHaveTextContent("Signed out on iPhone · Safari.");
    replies["DELETE /api/mira/security"] = () => ({ body: { success: true, signedOut: true } });
    const opener = within(devices).getByRole("button", { name: "Sign out everywhere" });
    fireEvent.click(opener);
    // The question opens on its safe answer: its red button has the opener's name in the
    // opener's place, so a double press or key repeat would sign every device out (A11Y-10).
    const cancel = within(devices).getByRole("button", { name: "Cancel" });
    await waitFor(() => expect(document.activeElement).toBe(cancel));
    fireEvent.click(cancel);
    const reopened = within(devices).getByRole("button", { name: "Sign out everywhere" });
    await waitFor(() => expect(document.activeElement).toBe(reopened));
    fireEvent.click(reopened);
    const confirm = within(devices).getAllByRole("button", { name: "Sign out everywhere" })[0]!;
    fireEvent.click(confirm);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/mira/start"));
    expect(calls("DELETE /api/mira/security")[1]!.url).toBe("/api/mira/security?device=all");
  });

  it("renames and removes a passkey, and tells the passkey manager which still work", async () => {
    await show();
    const how = screen.getByRole("region", { name: "How you sign in" });
    fireEvent.click(within(how).getByRole("button", { name: "Rename Work laptop" }));
    fireEvent.change(within(how).getByLabelText("Name"), { target: { value: "Office PC" } });
    fireEvent.click(within(how).getByRole("button", { name: "Save" }));
    await within(how).findByText("Office PC", { selector: "p" });
    expect(calls("PATCH /api/mira/passkeys")).toEqual([
      expect.objectContaining({ id: "k2", label: "Office PC" }),
    ]);
    // The server answers with what is left, a passkey added on another device meanwhile too.
    const phone = {
      id: "k3",
      label: "Pixel · Chrome",
      backed_up: true,
      created_at: "2026-11-22T09:30:00Z",
      last_used_at: null,
    };
    replies["DELETE /api/mira/passkeys"] = () => ({
      body: {
        success: true,
        passkeys: [{ ...SECURITY.passkeys.list[1], label: "Office PC" }, phone],
      },
    });
    fireEvent.click(within(how).getByRole("button", { name: "Remove iPhone · Safari" }));
    fireEvent.click(within(how).getByRole("button", { name: "Remove" }));
    await waitFor(() =>
      expect(within(how).queryByText("iPhone · Safari", { selector: "p" })).toBeNull()
    );
    expect(calls("DELETE /api/mira/passkeys")[0]!.url).toBe("/api/mira/passkeys?id=k1");
    expect(within(how).getByText("Pixel · Chrome", { selector: "p" })).toBeInTheDocument();
    // Never the page's own (stale) list: the new passkey would be hidden in the manager.
    expect(webauthn.sendSignal).toHaveBeenCalledWith({
      signalName: "allAcceptedCredentials",
      rpID: "loveiq.org",
      userID: "dXNlcg",
      allAcceptedCredentialIDs: ["k2", "k3"],
    });
  });

  it("keeps Add a passkey in reach while the device asks, and a second tap does nothing", async () => {
    replies["POST /api/mira/passkeys"] = () => ({ body: { options: { challenge: "c" } } });
    webauthn.startRegistration.mockImplementation(() => new Promise(() => undefined));
    await show();
    const add = screen.getByRole("button", { name: "Add a passkey" });
    fireEvent.click(add);
    const waiting = await screen.findByRole("button", { name: "Waiting for your device…" });
    expect(waiting).toHaveAttribute("aria-disabled", "true");
    expect(waiting).not.toBeDisabled();
    fireEvent.click(waiting);
    await new Promise((r) => setTimeout(r, 20));
    expect(calls("POST /api/mira/passkeys")).toHaveLength(1);
  });

  it("says what is missing in the change of email, instead of a dead button", async () => {
    await show();
    fireEvent.click(screen.getByRole("button", { name: "Change email" }));
    fireEvent.change(screen.getByLabelText("New email"), { target: { value: "lea.new@" } });
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Please enter the new email address."
    );
    expect(calls("POST /api/mira/email")).toEqual([]);
    expect(screen.getByLabelText("New email")).toHaveClass("border-ap-field");
  });

  it("tells the passkey manager nothing it can't be sure of", async () => {
    await show();
    const how = screen.getByRole("region", { name: "How you sign in" });
    replies["DELETE /api/mira/passkeys"] = () => ({ status: 404, body: { error: "Not found." } });
    fireEvent.click(within(how).getByRole("button", { name: "Remove Work laptop" }));
    // Asked on its safe answer, and Cancel gives the focus back to what opened it.
    const cancel = within(how).getByRole("button", { name: "Cancel" });
    await waitFor(() => expect(document.activeElement).toBe(cancel));
    fireEvent.click(cancel);
    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(how).getByRole("button", { name: "Remove Work laptop" })
      )
    );
    fireEvent.click(within(how).getByRole("button", { name: "Remove Work laptop" }));
    fireEvent.click(within(how).getByRole("button", { name: "Remove" }));
    await waitFor(() =>
      expect(within(how).queryByText("Work laptop", { selector: "p" })).toBeNull()
    );
    expect(webauthn.sendSignal).not.toHaveBeenCalled();
  });

  it("changes the email with a code to the new address", async () => {
    await show();
    fireEvent.click(screen.getByRole("button", { name: "Change email" }));
    // Before the change: the old address will start a new account (round-2 ID-17).
    expect(
      screen.getByText(/the old one, by code or with Google, would start a new, empty account/)
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("New email"), {
      target: { value: "lea.new@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));
    const code = await screen.findByLabelText("Code from the email");
    fireEvent.click(screen.getByRole("button", { name: "Send a new code" }));
    expect(
      await screen.findByText("A new code is on its way. Only the newest code works.")
    ).toHaveAttribute("role", "status");
    replies["POST /api/mira/email"] = () => ({
      body: { success: true, email: "lea.new@example.com" },
    });
    fireEvent.change(code, { target: { value: "12345678" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Your email is now lea.new@example.com. Sign in with it from now on: the old one would start a new account. We let your old address know."
      )
    );
    expect(calls("POST /api/mira/email").map((c) => c.action)).toEqual([
      "start",
      "start",
      "confirm",
    ]);
    expect(webauthn.sendSignal).toHaveBeenCalledWith(
      expect.objectContaining({ signalName: "currentUserDetails", userName: "lea.new@example.com" })
    );
  });

  // Round-3 R3-ACCT-5: the code step lived in the page only, so a reload or a tab the phone
  // discarded while the person read the mail lost it; within production's 10-minute wait a new
  // send then gets 429 with no field, leaving a working code nowhere to go.
  it("keeps the change of email's code step through a reload until it is confirmed or cancelled", async () => {
    const toCode = async () => {
      fireEvent.click(screen.getByRole("button", { name: "Change email" }));
      fireEvent.change(screen.getByLabelText("New email"), {
        target: { value: "lea.new@example.com" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Send code" }));
      await screen.findByLabelText("Code from the email");
    };
    const reload = async (over: Partial<typeof SECURITY> = {}) => {
      cleanup();
      await show(over);
    };
    await show();
    await toCode();
    await reload();
    expect(screen.getByLabelText("Code from the email")).toBeInTheDocument();
    expect(screen.getByText("lea.new@example.com")).toBeInTheDocument();
    // Back with the page, it doesn't take the focus (the person may be elsewhere in Settings).
    expect(screen.getByLabelText("Code from the email")).not.toHaveFocus();
    // Confirming needs no recent sign-in, so an older one still gets the field.
    await reload({ recent: false });
    expect(screen.getByLabelText("Code from the email")).toBeInTheDocument();
    // Not for another account signed in in this tab meanwhile.
    await reload({ email: "kim@example.com" });
    expect(screen.queryByLabelText("Code from the email")).toBeNull();
    // Cancel leaves it for good.
    await reload();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await reload();
    expect(screen.queryByLabelText("Code from the email")).toBeNull();
    // So does the change itself.
    await toCode();
    replies["POST /api/mira/email"] = () => ({
      body: { success: true, email: "lea.new@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Code from the email"), {
      target: { value: "12345678" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await screen.findByText(/^Your email is now lea\.new@example\.com\./);
    await reload();
    expect(screen.queryByLabelText("Code from the email")).toBeNull();
  });

  it("shows the new address all over Settings at once", async () => {
    replies["GET /api/mira/me"] = () => ({
      body: {
        profile: {
          email: "lea@example.com",
          name: "Lea",
          style: {},
          nudges_on: false,
          nudge_time: "08:00",
          time_zone: "Europe/Berlin",
        },
        chats: [],
      },
    });
    replies["GET /api/mira/security"] = () => ({ body: SECURITY });
    render(<MiraSettings security={<SecuritySettings />} />);
    await screen.findByRole("region", { name: "Devices" });
    expect(screen.getAllByText("lea@example.com").length).toBeGreaterThan(1);
    fireEvent.click(screen.getByRole("button", { name: "Change email" }));
    fireEvent.change(screen.getByLabelText("New email"), {
      target: { value: "lea.new@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));
    fireEvent.change(await screen.findByLabelText("Code from the email"), {
      target: { value: "12345678" },
    });
    replies["POST /api/mira/email"] = () => ({
      body: { success: true, email: "lea.new@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await screen.findByText(/^Your email is now lea\.new@example\.com\./);
    // The Account section and the menu's account line too, not only this card.
    const account = screen.getByRole("region", { name: "Account" });
    expect(within(account).getByText("lea.new@example.com")).toBeInTheDocument();
    expect(screen.queryByText("lea@example.com")).toBeNull();
  });

  it("is one #security anchor in Settings, landing below the sticky index like every section", async () => {
    replies["GET /api/mira/me"] = () => ({
      body: {
        profile: { email: "lea@example.com", style: {}, nudge_time: "08:00", time_zone: "UTC" },
      },
    });
    replies["GET /api/mira/security"] = () => ({ body: SECURITY });
    render(<MiraSettings security={<SecuritySettings />} />);
    await screen.findByRole("region", { name: "Devices" });
    const anchors = document.querySelectorAll("#security");
    expect(anchors).toHaveLength(1);
    expect(anchors[0]).toHaveClass("scroll-mt-16");
    expect(anchors[0]).toHaveTextContent("Sign-in & security");
  });

  it("asks to sign in again before a passkey or a new address, long after signing in", async () => {
    await show({ recent: false });
    fireEvent.click(screen.getByRole("button", { name: "Add a passkey" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "please sign in again to add a passkey"
    );
    expect(calls("POST /api/mira/passkeys")).toEqual([]);
    // Round-3 R3-ACCT-2: a client-side hop from a page first loaded at #security came back from
    // the sign-in as #security#security, at the top of Settings. A full page load instead, as a
    // fresh sign-in page lands right.
    const replace = vi.fn();
    vi.stubGlobal("location", { ...window.location, replace });
    fireEvent.click(screen.getByRole("button", { name: "Sign in again" }));
    // "You'll come straight back here": to Sign-in & security, not the top of Settings.
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/mira/start?next=%2Fmira%2Fsettings%23security")
    );
    expect(router.replace).not.toHaveBeenCalled();
    expect(calls("POST /api/mira/auth")).toEqual([expect.objectContaining({ action: "logout" })]);
  });

  it("offers staff and team logins only what they may use", async () => {
    await show({
      emailChange: { allowed: false },
      google: { allowed: false, connected: false },
      passkeys: { ...SECURITY.passkeys, allowed: false, list: [] },
    });
    expect(screen.queryByRole("button", { name: "Change email" })).toBeNull();
    expect(screen.getByText(/also a LoveIQ team login/)).toBeInTheDocument();
    expect(screen.queryByText("Google")).toBeNull();
    expect(screen.queryByRole("button", { name: "Add a passkey" })).toBeNull();
  });

  it("tells someone stopped as under 18 why, never that the address is a team login", async () => {
    await show({
      minor: true,
      emailChange: { allowed: false },
      google: { allowed: false, connected: false },
      passkeys: { ...SECURITY.passkeys, allowed: false, list: [] },
    });
    expect(screen.getByText("Mira is only for adults.")).toBeInTheDocument();
    expect(screen.queryByText(/team login/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Change email" })).toBeNull();
    // Never a reason that isn't the reason ("Sign in with the emailed code").
    expect(screen.queryByText(/Passkeys aren.t available/)).toBeNull();
  });

  it("says once how Connect Google went, then takes it out of the address", async () => {
    window.history.replaceState(null, "", "/mira/settings?google=mismatch#security");
    await show({ google: { allowed: true, connected: false } });
    expect(screen.getByRole("status")).toHaveTextContent(
      "That Google account has a different address"
    );
    expect(window.location.search).toBe("");
    expect(window.location.hash).toBe("#security");
    expect(screen.getByRole("link", { name: "Connect Google" })).toHaveAttribute(
      "href",
      "/api/mira/auth/google?connect=1"
    );
  });

  it("calls Google connected only for what it is: Google confirmed the address", async () => {
    window.history.replaceState(null, "", "/mira/settings?google=connected#security");
    await show({ google: { allowed: true, connected: true } });
    // Continue with Google worked before connecting too: nothing promises a change (SIGN-F9).
    expect(screen.getByRole("status")).toHaveTextContent(
      "Google is connected: it confirmed this address."
    );
    expect(screen.getByRole("status")).not.toHaveTextContent(/now/);
  });

  it("can be loaded again after a failure", async () => {
    replies["GET /api/mira/security"] = () => ({ status: 500, body: { error: "x" } });
    render(<SecuritySettings />);
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't load this right now.");
    replies["GET /api/mira/security"] = () => ({ body: SECURITY });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByRole("region", { name: "Devices" });
  });

  it("says when a device was last active in plain words", () => {
    const now = new Date(2026, 10, 22, 12).getTime();
    expect(lastActive(new Date(2026, 10, 22, 8).toISOString(), now)).toBe("Active today");
    expect(lastActive(new Date(2026, 10, 21, 23).toISOString(), now)).toBe("Active yesterday");
    expect(lastActive(new Date(2026, 10, 18, 9).toISOString(), now)).toBe("Active 4 days ago");
    expect(lastActive(new Date(2026, 10, 2, 9).toISOString(), now)).toBe("Active on 2 Nov");
  });
});
