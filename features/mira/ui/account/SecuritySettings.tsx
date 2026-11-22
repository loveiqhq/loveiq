"use client";

import { useRouter } from "next/navigation";
import { useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { miraApi } from "../api";
import { EmailChanged } from "../MiraSettings";
import { addPasskey, syncPasskeyList, syncPasskeyName, usePasskeysWork } from "./passkeys";

/**
 * Settings › Sign-in & security (Mark's board "HomeSettings", 22 Nov 2026), for MiraSettings to
 * mount right after "Account" (`<SecuritySettings />`, in its slot `#security`, which carries the
 * page's scroll margin like every section, so a link lands below the sticky index). It loads and
 * saves on its own (/api/mira/security, /passkeys, /email, Google's connect link), so nothing in
 * the page's Save touches it.
 *
 * Two cards. How you sign in: the emailed code (and changing the address), Google, passkeys (add,
 * rename, remove). Where you're signed in: each device, this one marked, signed out one at a time
 * or everywhere. A passkey or a new address needs a sign-in from the last 15 minutes; past that the
 * card says why and offers to sign in again.
 */

type Passkey = {
  id: string;
  label: string;
  backed_up: boolean;
  created_at: string;
  last_used_at: string | null;
};
type Device = {
  id: string;
  method: "email" | "google" | "passkey";
  device: string;
  city: string | null;
  created_at: string;
  last_seen_at: string;
  current: boolean;
};
type Security = {
  email: string;
  /** Mira stopped the account as under 18. */
  minor?: boolean;
  recent: boolean;
  emailChange: { allowed: boolean };
  google: { allowed: boolean; connected: boolean };
  passkeys: { allowed: boolean; rpID: string | null; userHandle: string; list: Passkey[] };
  devices: Device[];
};

/** What Google's connect link came back with (`?google=` on /mira/settings). */
const GOOGLE_RESULTS: Record<string, { ok: boolean; text: string }> = {
  connected: { ok: true, text: "Google is connected. You can now continue with Google." },
  mismatch: {
    ok: false,
    text: "That Google account has a different address. Choose the Google account with the same email as yours here.",
  },
  other: {
    ok: false,
    text: "Google can't confirm this address for Mira. Keep using the emailed code or a passkey.",
  },
  minor: { ok: false, text: "Mira is only for adults." },
  cancelled: { ok: false, text: "Connecting Google was cancelled." },
  busy: { ok: false, text: "Too many tries. Please wait a minute, then try again." },
  off: { ok: false, text: "Google sign-in isn't available right now." },
  failed: { ok: false, text: "Connecting Google didn't work. Please try again." },
};

const METHOD: Record<Device["method"], string> = {
  email: "an emailed code",
  google: "Google",
  passkey: "a passkey",
};

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/** "Active today", "Active 3 days ago", "Active on 2 Nov". */
export function lastActive(iso: string, now = Date.now()): string {
  const then = new Date(iso);
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((start(new Date(now)) - start(then)) / 86_400_000);
  if (days <= 0) return "Active today";
  if (days === 1) return "Active yesterday";
  if (days < 7) return `Active ${days} days ago`;
  return `Active on ${day(iso)}`;
}

const PILL =
  "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border border-ap-line bg-white px-5 text-[14px] font-semibold text-ap-ink transition-[border-color,transform] hover:border-ap-purple focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ap-purple active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50";
const LINK =
  "min-h-[44px] rounded text-[14px] font-semibold text-ap-plum underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ap-purple disabled:opacity-50";
const DANGER =
  "inline-flex min-h-[44px] items-center justify-center rounded-full bg-ap-bad px-5 text-[14px] font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ap-bad disabled:opacity-50";
const FIELD =
  "min-h-[48px] w-full rounded-2xl border border-ap-line px-4 text-[16px] font-normal outline-none focus:border-ap-purple";

export default function SecuritySettings() {
  const router = useRouter();
  const [data, setData] = useState<Security | null>(null);
  const [failed, setFailed] = useState(false);
  const canPasskey = usePasskeysWork();
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const emailChanged = useContext(EmailChanged);

  const load = useCallback(async () => {
    const r = await miraApi<Security>("/api/mira/security");
    if (r.status === 401) return; // the page itself sends a signed-out visitor to sign in
    if (!r.ok) return setFailed(true);
    setFailed(false);
    setData(r.data);
  }, []);

  // Once, on arrival: the data, and what Connect Google came back with (said once, then taken out
  // of the address so a reload doesn't repeat it).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    void load();
    const url = new URL(window.location.href);
    const result = url.searchParams.get("google");
    if (result) {
      setNotice(GOOGLE_RESULTS[result] ?? GOOGLE_RESULTS.failed!);
      url.searchParams.delete("google");
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    }
  }, [load]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /** Signs out here and back to sign-in, to come straight back to Settings. */
  const signInAgain = useCallback(async () => {
    await miraApi("/api/mira/auth", { body: { action: "logout" } });
    router.replace("/mira/start?next=%2Fmira%2Fsettings");
    router.refresh();
  }, [router]);

  return (
    <section aria-labelledby="security-h" className="flex flex-col gap-4">
      <div>
        <h2 id="security-h" className="font-serif text-[22px] font-medium">
          Sign-in &amp; security
        </h2>
        <p className="mt-1 text-[14px] text-ap-body">
          How you sign in, and where you&apos;re signed in.
        </p>
        {/* Always in the page, so what lands here is read out. */}
        <div role="status" aria-live="polite">
          {notice ? (
            <p
              className={`mt-3 rounded-2xl px-4 py-3 text-[14px] motion-safe:animate-mira-in ${notice.ok ? "bg-ap-good/10 text-ap-good-ink" : "bg-ap-ground text-ap-body"}`}
            >
              {notice.text}
            </p>
          ) : null}
        </div>
      </div>
      {failed ? (
        <div className="rounded-[20px] border border-ap-line p-5 text-[14px] text-ap-body">
          <p role="alert">We couldn&apos;t load this right now.</p>
          <button type="button" className={`${LINK} mt-1`} onClick={() => void load()}>
            Try again
          </button>
        </div>
      ) : !data ? (
        <Loading />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
          <Card title="How you sign in" id="sign-in-h">
            <EmailRow
              data={data}
              onChanged={(email) => {
                setData({ ...data, email, google: { ...data.google, connected: false } });
                emailChanged(email); // the page's Account section and menu too
                setNotice({
                  ok: true,
                  text: `Your email is now ${email}. We let your old address know.`,
                });
                if (data.passkeys.rpID)
                  syncPasskeyName(data.passkeys.rpID, data.passkeys.userHandle, email);
              }}
              onReauth={signInAgain}
            />
            <GoogleRow google={data.google} />
            <Passkeys
              data={data}
              canPasskey={canPasskey}
              onReauth={signInAgain}
              onChange={(list, text) => {
                setData({ ...data, passkeys: { ...data.passkeys, list } });
                if (text) setNotice({ ok: true, text });
              }}
            />
          </Card>
          <Devices
            devices={data.devices}
            onGone={(id) => setData({ ...data, devices: data.devices.filter((d) => d.id !== id) })}
            onNotice={setNotice}
            onSignedOut={() => {
              router.replace("/mira/start");
              router.refresh();
            }}
          />
        </div>
      )}
    </section>
  );
}

function Card({ title, id, children }: { title: string; id: string; children: ReactNode }) {
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col rounded-[20px] border border-ap-line bg-white"
    >
      <h3 id={id} className="px-5 pb-1 pt-5 text-[16px] font-bold">
        {title}
      </h3>
      <div className="flex flex-col divide-y divide-ap-line">{children}</div>
    </section>
  );
}

function Row({
  icon,
  title,
  sub,
  action,
  children,
}: {
  icon: ReactNode;
  title: string;
  sub?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 px-5 py-4">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ap-ground text-ap-plum"
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold">{title}</p>
          {sub ? (
            <div className="text-[14px] text-ap-body [overflow-wrap:anywhere]">{sub}</div>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </div>
  );
}

function EmailRow({
  data,
  onChanged,
  onReauth,
}: {
  data: Security;
  onChanged: (email: string) => void;
  onReauth: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Row
      icon={<MailIcon />}
      title="Emailed code"
      sub={
        <>
          <span className="block">{data.email}</span>
          <span className="block text-[13px] text-ap-muted">
            A one-time code each time. No password to remember.
          </span>
        </>
      }
      action={
        data.emailChange.allowed && !open ? (
          <button type="button" className={LINK} onClick={() => setOpen(true)}>
            Change
          </button>
        ) : null
      }
    >
      {!data.emailChange.allowed ? (
        <p className="text-[13px] text-ap-muted">
          {data.minor
            ? "Mira is only for adults."
            : "This address is also a LoveIQ team login, so it can't be changed here."}
        </p>
      ) : null}
      {open ? (
        <ChangeEmail
          recent={data.recent}
          onCancel={() => setOpen(false)}
          onReauth={onReauth}
          onChanged={(email) => {
            setOpen(false);
            onChanged(email);
          }}
        />
      ) : null}
    </Row>
  );
}

function ChangeEmail({
  recent,
  onCancel,
  onChanged,
  onReauth,
}: {
  recent: boolean;
  onCancel: () => void;
  onChanged: (email: string) => void;
  onReauth: () => void;
}) {
  const [step, setStep] = useState<"address" | "code">("address");
  const [address, setAddress] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reauth, setReauth] = useState(!recent);
  const first = useRef<HTMLInputElement>(null);
  const codeField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (step === "address" ? first : codeField).current?.focus();
  }, [step]);

  async function send() {
    setBusy(true);
    setError(null);
    const r = await miraApi<{ reauth?: boolean }>("/api/mira/email", {
      body: { action: "start", email: address.trim() },
    });
    setBusy(false);
    if (r.data.reauth) return setReauth(true);
    if (!r.ok) return setError(r.data.error ?? "We couldn't send the code. Please try again.");
    setStep("code");
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    const r = await miraApi<{ email?: string }>("/api/mira/email", {
      body: { action: "confirm", code },
    });
    setBusy(false);
    if (!r.ok || !r.data.email) return setError(r.data.error ?? "That code didn't work.");
    onChanged(r.data.email);
  }

  if (reauth) return <Reauth what="change your email" onReauth={onReauth} onCancel={onCancel} />;
  return (
    <form
      className="flex flex-col gap-3 rounded-2xl bg-ap-ground p-4 motion-safe:animate-mira-rise"
      onSubmit={(e) => {
        e.preventDefault();
        void (step === "address" ? send() : confirm());
      }}
    >
      {step === "address" ? (
        <>
          <label className="flex flex-col gap-2 text-[14px] font-semibold">
            New email
            <input
              ref={first}
              type="email"
              autoComplete="email"
              required
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className={`${FIELD} bg-white`}
            />
          </label>
          <p className="text-[13px] leading-relaxed text-ap-muted">
            We&apos;ll send a code to the new address to confirm it. Your LoveIQ test result is
            found by email, so Mira will then use the one taken with the new address.
          </p>
        </>
      ) : (
        <>
          <p className="text-[14px] text-ap-body">
            We sent a code to <strong className="[overflow-wrap:anywhere]">{address.trim()}</strong>
            . It works for an hour.
          </p>
          <label className="flex flex-col gap-2 text-[14px] font-semibold">
            Code from the email
            <input
              ref={codeField}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={8}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
              className={`${FIELD} bg-white text-center font-serif text-[24px] tracking-[0.4em]`}
            />
          </label>
        </>
      )}
      {error ? (
        <p role="alert" className="text-[14px] text-ap-bad-ink">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={
            busy ||
            (step === "address" ? !/^\S+@\S+\.\S+$/.test(address.trim()) : code.length !== 8)
          }
          className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-ap-ink px-5 text-[14px] font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ap-purple disabled:cursor-not-allowed disabled:bg-ap-track disabled:text-ap-muted"
        >
          {busy
            ? step === "address"
              ? "Sending…"
              : "Checking…"
            : step === "address"
              ? "Send code"
              : "Confirm"}
        </button>
        {step === "code" ? (
          <button type="button" className={LINK} disabled={busy} onClick={() => void send()}>
            Send a new code
          </button>
        ) : null}
        <button type="button" className={LINK} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function GoogleRow({ google }: { google: Security["google"] }) {
  if (!google.allowed) return null;
  return (
    <Row
      icon={<GoogleG />}
      title="Google"
      sub={
        google.connected ? (
          <span className="inline-flex items-center gap-2 text-ap-good-ink">
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-ap-good" />
            Connected
          </span>
        ) : (
          <span className="block text-[13px] text-ap-muted">
            Not connected. Works for Gmail and Google Workspace addresses.
          </span>
        )
      }
      action={
        google.connected ? null : (
          // A full-page hand-over to Google, like "Continue with Google" on the sign-in page.
          <a href="/api/mira/auth/google?connect=1" className={LINK + " inline-flex items-center"}>
            Connect
          </a>
        )
      }
    />
  );
}

function Passkeys({
  data,
  canPasskey,
  onChange,
  onReauth,
}: {
  data: Security;
  canPasskey: boolean;
  onChange: (list: Passkey[], notice?: string) => void;
  onReauth: () => void;
}) {
  const { allowed, rpID, userHandle, list } = data.passkeys;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reauth, setReauth] = useState(false);
  const [fresh, setFresh] = useState<string | null>(null);

  async function add() {
    if (!data.recent) return setReauth(true);
    setBusy(true);
    setError(null);
    const r = await addPasskey("settings");
    setBusy(false);
    if (r.ok) {
      setFresh(r.passkey.id);
      return onChange([...list, r.passkey], "Passkey added. Next time, sign in with it.");
    }
    if (r.reauth) return setReauth(true);
    if (r.error) setError(r.error);
  }

  const note = !allowed
    ? rpID
      ? "Passkeys aren't available for this account. Sign in with the emailed code."
      : "Passkeys work on loveiq.org."
    : !canPasskey
      ? "This browser can't make passkeys. Try Safari, Chrome or Edge on a recent device."
      : null;

  return (
    <Row
      icon={<KeyIcon />}
      title="Passkeys"
      sub={
        <span className="block text-[13px] text-ap-muted">
          Sign in with Face ID, Touch ID or Windows Hello instead of a code. Your face or
          fingerprint never leaves your device.
        </span>
      }
    >
      {list.length ? (
        <ul className="flex flex-col gap-2">
          {list.map((p) => (
            <PasskeyItem
              key={p.id}
              passkey={p}
              fresh={p.id === fresh}
              onRenamed={(label) =>
                onChange(list.map((x) => (x.id === p.id ? { ...x, label } : x)))
              }
              onRemoved={() => {
                const rest = list.filter((x) => x.id !== p.id);
                if (rpID)
                  syncPasskeyList(
                    rpID,
                    userHandle,
                    rest.map((x) => x.id)
                  );
                onChange(rest, `Removed “${p.label}”. You can still sign in with a code.`);
              }}
            />
          ))}
        </ul>
      ) : allowed ? (
        <p className="text-[13px] text-ap-muted">No passkeys yet.</p>
      ) : null}
      {note ? <p className="text-[13px] text-ap-muted">{note}</p> : null}
      {reauth ? (
        <Reauth what="add a passkey" onReauth={onReauth} onCancel={() => setReauth(false)} />
      ) : allowed && canPasskey ? (
        <div>
          <button type="button" className={PILL} disabled={busy} onClick={() => void add()}>
            <PlusIcon />
            {busy ? "Waiting for your device…" : "Add a passkey"}
          </button>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-[14px] text-ap-bad-ink">
          {error}
        </p>
      ) : null}
    </Row>
  );
}

function PasskeyItem({
  passkey,
  fresh,
  onRenamed,
  onRemoved,
}: {
  passkey: Passkey;
  fresh: boolean;
  onRenamed: (label: string) => void;
  onRemoved: () => void;
}) {
  const [mode, setMode] = useState<"view" | "rename" | "remove">("view");
  const [label, setLabel] = useState(passkey.label);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const field = useRef<HTMLInputElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (mode === "rename") field.current?.select();
    if (mode === "remove") confirmButton.current?.focus();
  }, [mode]);

  async function rename() {
    const next = label.trim();
    if (!next || next === passkey.label) return setMode("view");
    setBusy(true);
    const r = await miraApi("/api/mira/passkeys", {
      method: "PATCH",
      body: { id: passkey.id, label: next },
    });
    setBusy(false);
    if (!r.ok) return setError(r.data.error ?? "Unable to save. Please try again.");
    setError(null);
    setMode("view");
    onRenamed(next);
  }

  async function remove() {
    setBusy(true);
    const r = await miraApi(`/api/mira/passkeys?id=${encodeURIComponent(passkey.id)}`, {
      method: "DELETE",
    });
    setBusy(false);
    if (!r.ok && r.status !== 404)
      return setError(r.data.error ?? "Unable to remove it right now.");
    onRemoved();
  }

  const meta = [
    passkey.backed_up ? "Synced" : "On this device only",
    `added ${day(passkey.created_at)}`,
    passkey.last_used_at
      ? `last used ${lastActive(passkey.last_used_at).replace("Active ", "")}`
      : "not used yet",
  ].join(" · ");

  return (
    <li
      className={`rounded-2xl border border-ap-line px-4 py-3 ${fresh ? "motion-safe:animate-mira-rise" : ""}`}
    >
      {mode === "rename" ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void rename();
          }}
        >
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
            Name
            <input
              ref={field}
              value={label}
              maxLength={60}
              onChange={(e) => setLabel(e.target.value)}
              className={FIELD}
            />
          </label>
          <div className="flex gap-3">
            <button type="submit" className={LINK} disabled={busy}>
              Save
            </button>
            <button
              type="button"
              className={LINK}
              onClick={() => {
                setLabel(passkey.label);
                setMode("view");
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <div className="min-w-0">
            <p className="text-[14px] font-semibold [overflow-wrap:anywhere]">{passkey.label}</p>
            <p className="text-[12px] text-ap-muted">{meta}</p>
          </div>
          {mode === "view" ? (
            <div className="flex gap-3">
              {/* Named in full, as a screen reader lists the buttons on their own. */}
              <button
                type="button"
                className={LINK}
                aria-label={`Rename ${passkey.label}`}
                onClick={() => setMode("rename")}
              >
                Rename
              </button>
              <button
                type="button"
                className={LINK}
                aria-label={`Remove ${passkey.label}`}
                onClick={() => setMode("remove")}
              >
                Remove
              </button>
            </div>
          ) : null}
        </div>
      )}
      {mode === "remove" ? (
        <div className="mt-3 flex flex-col gap-3 border-t border-ap-line pt-3 motion-safe:animate-mira-rise">
          <p className="text-[14px]">Remove this passkey? You can still sign in with a code.</p>
          <div className="flex gap-3">
            <button
              ref={confirmButton}
              type="button"
              className={DANGER}
              disabled={busy}
              onClick={() => void remove()}
            >
              {busy ? "Removing…" : "Remove"}
            </button>
            <button type="button" className={PILL} onClick={() => setMode("view")}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 text-[13px] text-ap-bad-ink">
          {error}
        </p>
      ) : null}
    </li>
  );
}

function Devices({
  devices,
  onGone,
  onNotice,
  onSignedOut,
}: {
  devices: Device[];
  onGone: (id: string) => void;
  onNotice: (n: { ok: boolean; text: string }) => void;
  onSignedOut: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  // "Also remove my passkeys": a passkey someone else added would outlive every sign-out.
  const [alsoKeys, setAlsoKeys] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (confirmAll) confirmButton.current?.focus();
  }, [confirmAll]);

  async function signOut(id: string | "all") {
    setBusy(id);
    setError(null);
    const keys = id === "all" && alsoKeys ? "&passkeys=1" : "";
    const r = await miraApi<{ signedOut?: boolean }>(
      `/api/mira/security?device=${encodeURIComponent(id)}${keys}`,
      { method: "DELETE" }
    );
    setBusy(null);
    if (!r.ok && r.status !== 404) {
      return setError(r.data.error ?? "Unable to sign out right now. Please try again.");
    }
    if (r.data.signedOut) return onSignedOut();
    const gone = devices.find((d) => d.id === id);
    onGone(id);
    if (gone) onNotice({ ok: true, text: `Signed out on ${gone.device}.` });
  }

  const n = devices.length;
  return (
    <section
      aria-labelledby="devices-h"
      className="flex flex-col rounded-[20px] border border-ap-line bg-white"
    >
      <div className="px-5 pb-2 pt-5">
        <h3 id="devices-h" className="text-[16px] font-bold">
          Devices
        </h3>
        <p className="text-[14px] text-ap-body">
          {n <= 1 ? "You're signed in on this device only." : `You're signed in on ${n} devices.`}
        </p>
      </div>
      <ul className="flex flex-col divide-y divide-ap-line border-t border-ap-line">
        {devices.map((d) => (
          <li key={d.id} className="flex items-start gap-3 px-5 py-4">
            <span
              aria-hidden="true"
              className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ap-ground text-ap-plum"
            >
              <DeviceIcon label={d.device} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-[15px] font-semibold">
                {d.device}
                {d.current ? (
                  <span className="rounded-full bg-ap-lilac px-2 py-0.5 text-[11px] font-bold tracking-[0.02em] text-ap-plum">
                    This device
                  </span>
                ) : null}
              </p>
              <p className="text-[13px] text-ap-body">
                {[d.city, d.current ? "Active now" : lastActive(d.last_seen_at)]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <p className="text-[12px] text-ap-muted">
                Signed in {day(d.created_at)} with {METHOD[d.method]}
              </p>
            </div>
            <button
              type="button"
              className={LINK}
              disabled={busy !== null}
              aria-label={`Sign out ${d.current ? "this device" : d.device}`}
              onClick={() => void signOut(d.id)}
            >
              {busy === d.id ? "Signing out…" : "Sign out"}
            </button>
          </li>
        ))}
      </ul>
      <div className="border-t border-ap-line px-5 py-4">
        {confirmAll ? (
          <div className="flex flex-col gap-3 motion-safe:animate-mira-rise">
            <p className="text-[14px]">
              Sign out on every device, this one too? You&apos;ll sign in again with a code, Google
              or a passkey.
            </p>
            <label className="flex min-h-[44px] items-center gap-3 text-[14px]">
              <input
                type="checkbox"
                checked={alsoKeys}
                onChange={(e) => setAlsoKeys(e.target.checked)}
                className="h-5 w-5 shrink-0 accent-ap-purple"
              />
              <span>
                Also remove my passkeys{" "}
                <span className="text-ap-muted">
                  (if one isn&apos;t yours; you can add yours again)
                </span>
              </span>
            </label>
            <div className="flex flex-wrap gap-3">
              <button
                ref={confirmButton}
                type="button"
                className={DANGER}
                disabled={busy !== null}
                onClick={() => void signOut("all")}
              >
                {busy === "all" ? "Signing out…" : "Sign out everywhere"}
              </button>
              <button type="button" className={PILL} onClick={() => setConfirmAll(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className={PILL} onClick={() => setConfirmAll(true)}>
            Sign out everywhere
          </button>
        )}
        {error ? (
          <p role="alert" className="mt-2 text-[14px] text-ap-bad-ink">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function Reauth({
  what,
  onReauth,
  onCancel,
}: {
  what: string;
  onReauth: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-ap-lilac p-4 text-[14px] motion-safe:animate-mira-rise">
      <p role="alert">
        For your security, please sign in again to {what}. You&apos;ll come straight back here.
      </p>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onReauth}
          className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-ap-ink px-5 text-[14px] font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ap-purple"
        >
          Sign in again
        </button>
        <button type="button" className={LINK} onClick={onCancel}>
          Not now
        </button>
      </div>
    </div>
  );
}

function Loading() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading sign-in and security"
      className="grid gap-4 lg:grid-cols-2"
    >
      {[0, 1].map((i) => (
        <div key={i} className="flex flex-col gap-3 rounded-[20px] border border-ap-line p-5">
          <span className="h-4 w-32 rounded-full bg-ap-track motion-safe:animate-pulse" />
          <span className="h-3 w-3/4 rounded-full bg-ap-track motion-safe:animate-pulse" />
          <span className="h-3 w-1/2 rounded-full bg-ap-track motion-safe:animate-pulse" />
        </div>
      ))}
    </div>
  );
}

const icon = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};
function MailIcon() {
  return (
    <svg {...icon}>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="m4 7 8 6 8-6" />
    </svg>
  );
}
function KeyIcon() {
  return (
    <svg {...icon}>
      <circle cx="8" cy="15" r="4" />
      <path d="m10.85 12.15 7.4-7.4M16 7l2 2M14 9l1.5 1.5" />
    </svg>
  );
}
function PlusIcon() {
  return (
    <svg {...icon} width={16} height={16}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function DeviceIcon({ label }: { label: string }) {
  if (/^(iPhone|Android phone)/.test(label)) {
    return (
      <svg {...icon}>
        <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
        <path d="M11 18.5h2" />
      </svg>
    );
  }
  if (/^(iPad|Android tablet)/.test(label)) {
    return (
      <svg {...icon}>
        <rect x="4.5" y="2.5" width="15" height="19" rx="2.5" />
        <path d="M11 18.5h2" />
      </svg>
    );
  }
  return (
    <svg {...icon}>
      <rect x="4" y="5" width="16" height="11" rx="1.5" />
      <path d="M2.5 19h19" />
    </svg>
  );
}
/** Google's "G", as its branding asks (the same as on the sign-in page). */
function GoogleG() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 48 48">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}
