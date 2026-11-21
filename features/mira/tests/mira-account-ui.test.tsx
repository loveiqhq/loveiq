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

import SignUpFlow from "@features/mira/ui/SignUpFlow";
import SecuritySettings, { lastActive } from "@features/mira/ui/account/SecuritySettings";
import { unlockName } from "@features/mira/ui/account/passkeys";

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
    await waitFor(() => expect(screen.getByRole("button", { name: "Use Touch ID" })).toBeEnabled());
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    await screen.findByRole("heading", { name: "About you" });
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
    fireEvent.click(within(devices).getByRole("button", { name: "Sign out everywhere" }));
    const confirm = within(devices).getAllByRole("button", { name: "Sign out everywhere" })[0]!;
    await waitFor(() => expect(document.activeElement).toBe(confirm));
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
    fireEvent.click(within(how).getByRole("button", { name: "Remove iPhone · Safari" }));
    fireEvent.click(within(how).getByRole("button", { name: "Remove" }));
    await waitFor(() =>
      expect(within(how).queryByText("iPhone · Safari", { selector: "p" })).toBeNull()
    );
    expect(calls("DELETE /api/mira/passkeys")[0]!.url).toBe("/api/mira/passkeys?id=k1");
    expect(webauthn.sendSignal).toHaveBeenCalledWith({
      signalName: "allAcceptedCredentials",
      rpID: "loveiq.org",
      userID: "dXNlcg",
      allAcceptedCredentialIDs: ["k2"],
    });
  });

  it("changes the email with a code to the new address", async () => {
    await show();
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    fireEvent.change(screen.getByLabelText("New email"), {
      target: { value: "lea.new@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));
    const code = await screen.findByLabelText("Code from the email");
    replies["POST /api/mira/email"] = () => ({
      body: { success: true, email: "lea.new@example.com" },
    });
    fireEvent.change(code, { target: { value: "12345678" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Your email is now lea.new@example.com.")
    );
    expect(calls("POST /api/mira/email").map((c) => c.action)).toEqual(["start", "confirm"]);
    expect(webauthn.sendSignal).toHaveBeenCalledWith(
      expect.objectContaining({ signalName: "currentUserDetails", userName: "lea.new@example.com" })
    );
  });

  it("asks to sign in again before a passkey or a new address, long after signing in", async () => {
    await show({ recent: false });
    fireEvent.click(screen.getByRole("button", { name: "Add a passkey" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "please sign in again to add a passkey"
    );
    expect(calls("POST /api/mira/passkeys")).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Sign in again" }));
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith("/mira/start?next=%2Fmira%2Fsettings")
    );
    expect(calls("POST /api/mira/auth")).toEqual([expect.objectContaining({ action: "logout" })]);
  });

  it("offers staff and team logins only what they may use", async () => {
    await show({
      emailChange: { allowed: false },
      google: { allowed: false, connected: false },
      passkeys: { ...SECURITY.passkeys, allowed: false, list: [] },
    });
    expect(screen.queryByRole("button", { name: "Change" })).toBeNull();
    expect(screen.getByText(/also a LoveIQ team login/)).toBeInTheDocument();
    expect(screen.queryByText("Google")).toBeNull();
    expect(screen.queryByRole("button", { name: "Add a passkey" })).toBeNull();
  });

  it("says once how Connect Google went, then takes it out of the address", async () => {
    window.history.replaceState(null, "", "/mira/settings?google=mismatch#security");
    await show({ google: { allowed: true, connected: false } });
    expect(screen.getByRole("status")).toHaveTextContent(
      "That Google account has a different address"
    );
    expect(window.location.search).toBe("");
    expect(window.location.hash).toBe("#security");
    expect(screen.getByRole("link", { name: "Connect" })).toHaveAttribute(
      "href",
      "/api/mira/auth/google?connect=1"
    );
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
