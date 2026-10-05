"use client";

import { useState } from "react";
import type { ConnectState } from "@features/brain/server/connect";
import { getCsrfToken } from "@shared/http/csrf-client";
import { LoveIQMark, LoveIQWordmark } from "@shared/ui/branding/LoveIQBrand";

type Shown = Exclude<ConnectState, { kind: "redirect" }>;

async function post(
  path: string,
  body: unknown
): Promise<{ ok: boolean; data: Record<string, string> }> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-csrf-token": getCsrfToken() },
    body: JSON.stringify(body),
  });
  return { ok: res.ok, data: (await res.json().catch(() => ({}))) as Record<string, string> };
}

const input =
  "w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-text-primary " +
  "placeholder:text-text-muted outline-none transition focus:border-white/20 focus:ring-1 focus:ring-white/20";
const primary =
  "w-full rounded-full bg-gradient-brand py-3 text-sm font-semibold text-white shadow-pill " +
  "transition hover:-translate-y-[1px] disabled:opacity-60";
const quiet =
  "w-full rounded-full border border-white/10 py-3 text-sm text-text-muted transition hover:border-white/20";

/** The sign-in and consent card Claude opens when someone connects Jarvis. */
export default function JarvisConnect({
  state,
  authorizationId,
}: {
  state: Shown;
  authorizationId: string | null;
}) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const sendCode = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const r = await post("/api/jarvis/sign-in", { email });
      if (r.ok) setCodeSent(true);
      else setError(r.data.error ?? "The code could not be sent.");
    });
  };
  const checkCode = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const r = await post("/api/jarvis/verify", { email, code });
      if (r.ok) window.location.reload();
      else setError(r.data.error ?? "That code did not work.");
    });
  };
  const choose = (decision: "approve" | "deny") =>
    run(async () => {
      const r = await post("/api/jarvis/decision", { authorization_id: authorizationId, decision });
      if (r.ok && r.data.redirect_url) window.location.assign(r.data.redirect_url);
      else setError(r.data.error ?? "That did not go through.");
    });
  const signOut = () =>
    run(async () => {
      await post("/api/jarvis/sign-out", {});
      window.location.reload();
    });

  return (
    <div className="flex min-h-screen justify-center bg-page px-4 pt-[12vh]">
      <div className="h-fit w-full max-w-sm rounded-2xl border border-white/10 bg-surface p-8 shadow-card">
        <div className="mb-6 flex items-center justify-center gap-2">
          <LoveIQMark className="h-7 w-8 shrink-0" width={32} height={28} />
          <LoveIQWordmark className="text-2xl" />
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
            Jarvis
          </span>
        </div>

        {state.kind === "no-request" && (
          <p className="text-center text-sm text-text-muted">
            Connect from Claude: add Jarvis as a connector, and Claude brings you here to sign in.
          </p>
        )}

        {state.kind === "error" && (
          <p className="text-center text-sm text-text-muted">{state.message}</p>
        )}

        {state.kind === "not-claude" && (
          <p className="text-center text-sm text-text-muted">
            {state.app} wants to connect, but it would send your sign-in to {state.host}. Jarvis
            connects only to Claude, so nothing was shared.
          </p>
        )}

        {state.kind === "sign-in" && !codeSent && (
          <form onSubmit={sendCode} className="space-y-4">
            <p className="text-center text-sm text-text-muted">
              Sign in with your LoveIQ email. We&rsquo;ll send you a code.
            </p>
            <label htmlFor="jarvis-email" className="sr-only">
              Email
            </label>
            <input
              id="jarvis-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@loveiq.org"
              required
              autoFocus
              className={input}
            />
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button type="submit" disabled={busy} className={primary}>
              {busy ? "Sending…" : "Send code"}
            </button>
          </form>
        )}

        {state.kind === "sign-in" && codeSent && (
          <form onSubmit={checkCode} className="space-y-4">
            <p className="text-center text-sm text-text-muted">
              If {email} can use Jarvis, a code is in that inbox now. Type it here.
            </p>
            <label htmlFor="jarvis-code" className="sr-only">
              Code from the email
            </label>
            <input
              id="jarvis-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6,10}"
              maxLength={10}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="12345678"
              required
              autoFocus
              className={`${input} text-center tracking-[0.4em]`}
            />
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button type="submit" disabled={busy || code.length < 6} className={primary}>
              {busy ? "Checking…" : "Sign in"}
            </button>
            <button
              type="button"
              onClick={() => {
                setCodeSent(false);
                setCode("");
                setError("");
              }}
              className={quiet}
            >
              Use a different email
            </button>
          </form>
        )}

        {state.kind === "not-member" && (
          <div className="space-y-4">
            <p className="text-center text-sm text-text-muted">
              {state.email} isn&rsquo;t on the Jarvis member list. Ask Eman to add you, or sign in
              with your own LoveIQ address.
            </p>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button type="button" onClick={() => void signOut()} disabled={busy} className={quiet}>
              Use a different email
            </button>
          </div>
        )}

        {state.kind === "consent" && (
          <div className="space-y-4">
            <p className="text-center text-sm text-text-primary">
              Connect <strong>{state.app}</strong> to Jarvis as <strong>{state.name}</strong>?
            </p>
            <p className="text-center text-xs text-text-muted">
              It can then search and use everything Jarvis knows, and what it does is recorded under
              your name ({state.email}).
            </p>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button
              type="button"
              onClick={() => void choose("approve")}
              disabled={busy}
              className={primary}
            >
              {busy ? "Connecting…" : "Allow"}
            </button>
            <button
              type="button"
              onClick={() => void choose("deny")}
              disabled={busy}
              className={quiet}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void signOut()}
              disabled={busy}
              className="w-full text-xs text-text-muted underline-offset-2 hover:underline"
            >
              Not {state.name}? Sign out
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
