"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { REPLY_LANGUAGES } from "@features/mira/reply-languages";
import { StyleScales, type Style } from "./CoachingStylePanel";
import { CRISIS_COUNTRY_OPTIONS } from "./countries";
import { PrimaryButton } from "./MiraShell";
import { MiraAppFrame } from "./MiraAppFrame";
import { THEME_CHOICES, ThemeIcon, useMiraLook } from "./MiraLook";
import { miraApi, signInHref, type ApiResult } from "./api";
import type { TextSize, Theme } from "./prefs";
import tokens from "./theme-tokens.js";

/**
 * Board 08c, Settings, as upgraded on 21 Nov 2026: calm sections with an index (a sticky column
 * on wide screens, a sticky row of links on phones), and each change saved as it is made, with a
 * "Saved" beside its section; only the account's typed details wait for their Save button.
 *
 * Other features' sections drop in through props (app/mira/settings/page.tsx passes them):
 * `security` (SecuritySettings), `checks` (ChecksSettings), `sharedReview` (SharedReviewSettings),
 * `journal` (JournalSettings) and `weeklySession` (WeeklySessionSettings). Each brings its own
 * heading, styled like SettingsSection's, and gets an index entry and an anchor (`Slot`). `Switch`,
 * `Select`, `SettingsGroup` and `SettingsSection` are
 * exported for them, so every row looks the same, and `EmailChanged`, so a new address shows
 * all over the page at once.
 */

/** Tells the page the account's address changed (Sign-in & security). */
export const EmailChanged = createContext<(email: string) => void>(() => undefined);

type Profile = {
  email: string;
  name: string | null;
  country: string | null;
  gender: string | null;
  style: Style;
  remember_chats: boolean;
  use_assessment: boolean;
  nudges_on: boolean;
  nudge_time: "08:00" | "19:00" | "21:30";
  time_zone: string;
  /** "Mira replies in": a language code, or null to match the person's messages. */
  reply_language?: string | null;
};

const NUDGE_TIMES = [
  ["08:00", "Morning · 8:00"],
  ["19:00", "Evening · 19:00"],
  ["21:30", "Late · 21:30"],
] as const;

const TIME_ZONES = [
  "Europe/Berlin",
  "Europe/Vienna",
  "Europe/Zurich",
  "Europe/London",
  "Europe/Dublin",
  "Europe/Sarajevo",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "America/Toronto",
  "Australia/Sydney",
  "Pacific/Auckland",
];

/** What Save sends, as the server keeps it, so only real changes go out. */
const saveable = (x: Profile) => ({
  name: x.name?.trim() || null,
  country: x.country || null,
  gender: x.gender?.trim() || null,
  style: x.style ?? {},
  remember_chats: x.remember_chats,
  use_assessment: x.use_assessment,
  nudges_on: x.nudges_on,
  nudge_time: x.nudge_time,
  time_zone: x.time_zone,
  reply_language: x.reply_language ?? null,
});

/** The fields of `now` that differ from `was`. */
export function changedFields(now: Profile, was: Profile | null): Record<string, unknown> {
  const before: Record<string, unknown> = was ? saveable(was) : {};
  return Object.fromEntries(
    Object.entries(saveable(now)).filter(
      ([k, v]) => JSON.stringify(v) !== JSON.stringify(before[k])
    )
  );
}

type SectionId =
  | "account"
  | "language"
  | "security"
  | "coaching"
  | "privacy"
  | "checks"
  | "sharing"
  | "notifications"
  | "journal"
  | "weekly"
  | "appearance"
  | "data";

type Status =
  { kind: "saving" } | { kind: "saved"; text?: string } | { kind: "error"; text: string };

export type SettingsSlots = {
  /** SecuritySettings: sign-in method, email, devices and passkeys. */
  security?: ReactNode;
  /** SharedReviewSettings. */
  sharedReview?: ReactNode;
  /** JournalSettings: the journal's reminders, inside Notifications. */
  journal?: ReactNode;
  /** WeeklySessionSettings: the weekly session's reminders, inside Notifications. */
  weeklySession?: ReactNode;
  /** ChecksSettings: "Mira may use my check results" and deleting them. */
  checks?: ReactNode;
};

const TEXT_CHOICES: Array<[TextSize, string]> = [
  ["small", "Small"],
  ["default", "Default"],
  ["large", "Large"],
];

export default function MiraSettings({
  security,
  sharedReview,
  journal,
  weeklySession,
  checks,
}: SettingsSlots = {}) {
  const router = useRouter();
  const [p, setP] = useState<Profile | null>(null);
  // The profile as the server has it, after the load and after each save.
  const stored = useRef<Profile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [status, setStatusMap] = useState<Partial<Record<SectionId, Status>>>({});
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<"chats" | "account" | null>(null);
  // The account's typed details changed since they were loaded or saved.
  const [accountDirty, setAccountDirty] = useState(false);
  // Saves go out one after another, so the last change made is the one kept; each field
  // remembers its latest change, so an earlier save's answer never undoes or reports over it.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const saves = useRef(0);
  const latest = useRef(new Map<string, number>());
  const { look, change } = useMiraLook();

  const sections: Array<[SectionId, string]> = [
    ["account", "Account"],
    ["language", "Language"],
    ...(security ? ([["security", "Sign-in & security"]] as Array<[SectionId, string]>) : []),
    ["coaching", "Coaching"],
    ["privacy", "Privacy"],
    ...(checks ? ([["checks", "Self-checks"]] as Array<[SectionId, string]>) : []),
    ...(sharedReview ? ([["sharing", "Your rating"]] as Array<[SectionId, string]>) : []),
    ["notifications", "Notifications"],
    ...(journal ? ([["journal", "Daily journal"]] as Array<[SectionId, string]>) : []),
    ...(weeklySession ? ([["weekly", "Weekly session"]] as Array<[SectionId, string]>) : []),
    ["appearance", "Appearance"],
    ["data", "Your data"],
  ];
  const ready = p !== null;
  const active = useActiveSection(
    sections.map(([id]) => id),
    ready
  );

  useLandOnSection(ready);

  function load() {
    void miraApi<{ profile: Profile }>("/api/mira/me").then((r) => {
      if (r.status === 401) router.replace(signInHref());
      else if (r.ok) {
        stored.current = r.data.profile;
        setP(r.data.profile);
      } else setLoadError(r.data.error ?? "We couldn't load your settings.");
    });
  }
  // Once, on arrival.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, []);

  // "Delete…" swaps the buttons for the question: focus goes to its safe answer.
  const cancel = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (confirm) cancel.current?.focus();
  }, [confirm]);

  const setStatus = (id: SectionId, s: Status | null) =>
    setStatusMap((cur) => ({ ...cur, [id]: s ?? undefined }));

  /**
   * Saves `body` once the saves before it are answered. With the answer come the fields no later
   * change has taken over since: only those may be put back or reported.
   */
  async function save(body: Record<string, unknown>) {
    const n = ++saves.current;
    for (const k of Object.keys(body)) latest.current.set(k, n);
    const send = () => miraApi("/api/mira/me", { method: "PATCH", body });
    const next = queue.current.then(send, send);
    queue.current = next;
    const r = await next;
    return { r, current: Object.keys(body).filter((k) => latest.current.get(k) === n) };
  }

  /** Shows `fields` at once and saves them; a refused save puts the stored values back. */
  async function autosave(section: SectionId, fields: Partial<Profile>) {
    setP((cur) => (cur ? { ...cur, ...fields } : cur));
    setStatus(section, { kind: "saving" });
    const { r, current } = await save(fields);
    if (r.ok && stored.current) stored.current = { ...stored.current, ...fields };
    // A later change of these fields is on its way: its answer decides.
    if (current.length === 0) return;
    if (r.ok) return setStatus(section, { kind: "saved" });
    const was = stored.current;
    if (was) {
      const back = Object.fromEntries(
        current.map((k) => [k, was[k as keyof Profile]])
      ) as Partial<Profile>;
      setP((cur) => (cur ? { ...cur, ...back } : cur));
    }
    setStatus(section, {
      kind: "error",
      text: r.data.error ?? "That didn't save. Please try again.",
    });
  }

  async function saveAccount() {
    if (!p) return;
    // Everything else saved as it changed, so what differs is what was typed here.
    const body = changedFields(p, stored.current);
    if (Object.keys(body).length === 0) {
      setAccountDirty(false);
      return setStatus("account", { kind: "saved" });
    }
    setStatus("account", { kind: "saving" });
    const r: ApiResult<Record<string, unknown>> = await miraApi("/api/mira/me", {
      method: "PATCH",
      body,
    });
    if (r.ok) {
      if (stored.current) stored.current = { ...stored.current, ...body } as Profile;
      setAccountDirty(false);
      return setStatus("account", { kind: "saved" });
    }
    setStatus("account", { kind: "error", text: r.data.error ?? "Unable to save." });
  }

  /** Shows the look at once and keeps it in this browser, then saves it on the account. */
  async function changeLook(patch: { theme?: Theme; text?: TextSize }) {
    change(patch);
    setStatus("appearance", { kind: "saving" });
    const { r, current } = await save({
      ...(patch.theme ? { theme: patch.theme } : {}),
      ...(patch.text ? { text_size: patch.text } : {}),
    });
    if (current.length === 0) return;
    setStatus(
      "appearance",
      r.ok
        ? { kind: "saved" }
        : {
            kind: "error",
            text: "This browser keeps it, but your account couldn't save it. Please try again.",
          }
    );
  }

  async function remove(what: "chats" | "account") {
    setBusy(true);
    const r = await miraApi(`/api/mira/me?what=${what}`, { method: "DELETE" });
    setConfirm(null);
    if (!r.ok) {
      setBusy(false);
      return setStatus("data", {
        kind: "error",
        text: r.data.error ?? "Unable to delete right now.",
      });
    }
    if (what === "account") {
      router.replace("/mira");
      router.refresh();
      return;
    }
    setBusy(false);
    setStatus("data", { kind: "saved", text: "All your chats are deleted." });
  }

  async function signOut() {
    setBusy(true);
    setStatus("data", null);
    const r = await miraApi("/api/mira/auth", { body: { action: "logout" } });
    if (!r.ok) {
      setBusy(false);
      return setStatus("data", {
        kind: "error",
        text: r.data.error ?? "Unable to sign out. Please try again.",
      });
    }
    router.replace("/mira");
    router.refresh();
  }

  const emailChanged = useCallback(
    (email: string) => setP((cur) => (cur ? { ...cur, email } : cur)),
    []
  );

  const typed = (patch: Partial<Profile>) => {
    setStatus("account", null);
    setAccountDirty(true);
    setP((cur) => (cur ? { ...cur, ...patch } : cur));
  };

  return (
    <MiraAppFrame active="settings" email={p?.email} name={p?.name}>
      <h1 className="font-serif text-[34px] font-medium">Settings</h1>
      <p className="mt-1 text-[15px] text-ap-body">
        Changes save as you make them. Your account details have their own Save.
      </p>

      {loadError ? (
        <div role="alert" className="mt-8 rounded-3xl border border-ap-line p-5">
          <p className="text-[15px] font-semibold">{loadError}</p>
          <p className="mt-1 text-[14px] text-ap-body">
            Check your connection, then try again. Your settings are safe.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <PrimaryButton
              onClick={() => {
                setLoadError(null);
                load();
              }}
            >
              Try again
            </PrimaryButton>
          </div>
        </div>
      ) : null}

      {!p && !loadError ? <SettingsSkeleton /> : null}

      {p ? (
        <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_176px] xl:gap-12">
          <div>
            <SectionIndex sections={sections} active={active} variant="row" />
            <div className="mt-8 flex flex-col gap-12">
              <SettingsSection
                id="account"
                title="Account"
                status={status.account}
                footer={
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <PrimaryButton
                      onClick={saveAccount}
                      disabled={!accountDirty || status.account?.kind === "saving"}
                    >
                      {status.account?.kind === "saving" ? "Saving…" : "Save"}
                    </PrimaryButton>
                    {accountDirty ? (
                      <span className="text-[13px] text-ap-muted">Unsaved changes</span>
                    ) : null}
                  </div>
                }
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Name or nickname">
                    {(id) => (
                      <input
                        id={id}
                        value={p.name ?? ""}
                        maxLength={60}
                        autoComplete="nickname"
                        onChange={(e) => typed({ name: e.target.value })}
                        className={INPUT}
                      />
                    )}
                  </Field>
                  <div className="flex flex-col gap-2">
                    <p className="text-[14px] font-semibold">Email</p>
                    <p className="flex min-h-[48px] items-center rounded-2xl bg-ap-ground px-4 text-[16px] text-ap-body [overflow-wrap:anywhere]">
                      {p.email}
                    </p>
                    <p className="text-[13px] text-ap-muted">The address you sign in with.</p>
                  </div>
                  <Field label="Gender" optional>
                    {(id) => (
                      <input
                        id={id}
                        value={p.gender ?? ""}
                        maxLength={40}
                        onChange={(e) => typed({ gender: e.target.value })}
                        className={INPUT}
                      />
                    )}
                  </Field>
                  <Field
                    label="Where you’re based"
                    hint="When Mira shares support lines, this country’s come first."
                  >
                    {(id) => (
                      <Select
                        id={id}
                        value={p.country ?? ""}
                        onChange={(e) => typed({ country: e.target.value || null })}
                      >
                        <option value="">Not set</option>
                        {CRISIS_COUNTRY_OPTIONS.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.name}
                          </option>
                        ))}
                        <option value="OTHER">Somewhere else</option>
                      </Select>
                    )}
                  </Field>
                </div>
              </SettingsSection>

              <SettingsSection id="language" title="Language" status={status.language}>
                <SettingsGroup>
                  <Row
                    label="Mira replies in"
                    description="She can answer in the language you write in, or always in one."
                  >
                    {(id, describedBy) => (
                      <Select
                        id={id}
                        aria-describedby={describedBy}
                        value={p.reply_language ?? ""}
                        onChange={(e) =>
                          void autosave("language", { reply_language: e.target.value || null })
                        }
                      >
                        <option value="">Match my messages</option>
                        {REPLY_LANGUAGES.map((l) => (
                          <option key={l.code} value={l.code} lang={l.code}>
                            {l.native === l.name ? l.name : `${l.native} · ${l.name}`}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Row>
                </SettingsGroup>
                <p className="mt-2 px-1 text-[13px] text-ap-muted">
                  The app itself, with its safety messages and support lines, stays in English for
                  now.
                </p>
              </SettingsSection>

              {security ? (
                <Slot id="security">
                  <EmailChanged.Provider value={emailChanged}>{security}</EmailChanged.Provider>
                </Slot>
              ) : null}

              <SettingsSection
                id="coaching"
                title="How Mira coaches you"
                description="Pick a point on each line. The middle is balanced."
                status={status.coaching}
                action={
                  <button
                    type="button"
                    onClick={() => void autosave("coaching", { style: {} })}
                    disabled={Object.keys(p.style ?? {}).length === 0}
                    className="min-h-[44px] px-1 text-[14px] font-semibold text-ap-plum underline-offset-4 hover:underline disabled:text-ap-muted disabled:no-underline"
                  >
                    Reset to balanced
                  </button>
                }
              >
                <StyleScales
                  value={p.style ?? {}}
                  onChange={(style) => void autosave("coaching", { style })}
                />
              </SettingsSection>

              <SettingsSection id="privacy" title="What Mira may use" status={status.privacy}>
                <SettingsGroup>
                  <Switch
                    label="Remember our conversations"
                    description="Mira keeps your chats, so you can pick any of them up again."
                    checked={p.remember_chats}
                    onChange={(v) => void autosave("privacy", { remember_chats: v })}
                  />
                  <Switch
                    label="Use my test result"
                    description="Your LoveIQ Sexual Personality result tailors the coaching."
                    checked={p.use_assessment}
                    onChange={(v) => void autosave("privacy", { use_assessment: v })}
                  />
                </SettingsGroup>
                <p className="mt-3 px-1 text-[13px] leading-relaxed text-ap-muted">
                  Your chats concern your sex life, which is sensitive data under the GDPR. We use
                  them with your consent, to coach you and to improve Mira; our analytics tools also
                  see what you type. Never for advertising, never to train shared models.{" "}
                  <a href="/mira/privacy" className="text-ap-plum underline underline-offset-2">
                    How Mira handles your data
                  </a>
                </p>
              </SettingsSection>

              {checks ? <Slot id="checks">{checks}</Slot> : null}

              {sharedReview ? <Slot id="sharing">{sharedReview}</Slot> : null}

              <SettingsSection
                id="notifications"
                title="Notifications"
                status={status.notifications}
              >
                <SettingsGroup>
                  <Switch
                    label="Daily nudges by email"
                    description="A short thought from Mira that leads back into the chat. Neutral subject line."
                    checked={p.nudges_on}
                    onChange={(v) => void autosave("notifications", { nudges_on: v })}
                  />
                  {p.nudges_on && !p.remember_chats ? (
                    <p className="px-4 py-3 text-[13px] text-ap-body sm:px-5">
                      Nudges pick up on your last chat, so they need “Remember our conversations”
                      on.
                    </p>
                  ) : null}
                  {p.nudges_on ? (
                    <Row label="Nudge time">
                      {(id) => (
                        <Select
                          id={id}
                          value={p.nudge_time}
                          onChange={(e) =>
                            void autosave("notifications", {
                              nudge_time: e.target.value as Profile["nudge_time"],
                            })
                          }
                        >
                          {NUDGE_TIMES.map(([v, label]) => (
                            <option key={v} value={v}>
                              {label}
                            </option>
                          ))}
                        </Select>
                      )}
                    </Row>
                  ) : null}
                  <Row label="Time zone" description="Nudges and reminders come at your own time.">
                    {(id) => (
                      <Select
                        id={id}
                        value={p.time_zone}
                        onChange={(e) =>
                          void autosave("notifications", { time_zone: e.target.value })
                        }
                      >
                        {[...new Set([p.time_zone, ...TIME_ZONES])].map((tz) => (
                          <option key={tz} value={tz}>
                            {tz.replace("_", " ")}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Row>
                </SettingsGroup>
              </SettingsSection>

              {journal ? <Slot id="journal">{journal}</Slot> : null}

              {weeklySession ? <Slot id="weekly">{weeklySession}</Slot> : null}

              <SettingsSection
                id="appearance"
                title="Appearance"
                description="Kept in this browser, and with your account for your next sign-in elsewhere."
                status={status.appearance}
              >
                <fieldset>
                  <legend className="text-[15px] font-semibold">Theme</legend>
                  <ThemePicker
                    value={look.theme}
                    onChange={(theme) => void changeLook({ theme })}
                  />
                </fieldset>
                <fieldset className="mt-6">
                  <legend className="text-[15px] font-semibold">Text size</legend>
                  <Segmented
                    name="mira-text-size"
                    choices={TEXT_CHOICES}
                    value={look.text}
                    onChange={(text) => void changeLook({ text })}
                  />
                  <p className="mt-3 rounded-[20px] bg-ap-ground px-4 py-3 text-[16px] leading-[1.65]">
                    Go gently with yourself. Come back anytime and tell me how it went.
                  </p>
                </fieldset>
              </SettingsSection>

              <SettingsSection id="data" title="Your data" status={status.data}>
                <div className="rounded-3xl bg-ap-lilac p-5">
                  <p className="text-[15px] font-semibold">Your plan: free while in beta</p>
                  <p className="mt-1 text-[14px] text-ap-body">
                    We&apos;ll tell you well before anything changes.{" "}
                    <a
                      href="/mira/feedback"
                      className="font-semibold text-ap-ink underline underline-offset-2"
                    >
                      Share feedback
                    </a>
                  </p>
                </div>
                <p className="mt-5 text-[14px] text-ap-body">
                  Want a copy of your data? Email{" "}
                  <a
                    href="mailto:hello@loveiq.org"
                    className="text-ap-plum underline underline-offset-2"
                  >
                    hello@loveiq.org
                  </a>{" "}
                  and we&apos;ll send it within 30 days.
                </p>
                {confirm ? (
                  <div className="mt-4 rounded-3xl border border-ap-bad p-5 motion-safe:animate-mira-in">
                    <p id="confirm-delete" className="text-[15px] font-semibold">
                      {confirm === "chats"
                        ? "Delete all your chats? This can't be undone."
                        : "Delete your account, your profile and all your chats? This can't be undone."}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => remove(confirm)}
                        className="min-h-[44px] rounded-full bg-ap-bad px-5 text-[15px] font-semibold text-white disabled:opacity-50"
                      >
                        {busy ? "Deleting…" : "Delete"}
                      </button>
                      <button
                        ref={cancel}
                        type="button"
                        onClick={() => setConfirm(null)}
                        className="min-h-[44px] rounded-full border border-ap-line px-5 text-[15px] font-semibold"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => setConfirm("chats")}
                      className="min-h-[44px] rounded-full border border-ap-line px-5 text-[14px] font-semibold hover:border-ap-quiet"
                    >
                      Delete all chats
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirm("account")}
                      className="min-h-[44px] rounded-full border border-ap-bad px-5 text-[14px] font-semibold text-ap-bad-ink"
                    >
                      Delete account
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={signOut}
                  className="mt-6 min-h-[44px] text-[15px] font-semibold text-ap-plum underline underline-offset-4 disabled:opacity-50"
                >
                  Sign out
                </button>
              </SettingsSection>
            </div>
          </div>
          <SectionIndex sections={sections} active={active} variant="column" />
        </div>
      ) : null}
    </MiraAppFrame>
  );
}

/** What the person does when they take over the scrolling. */
const TAKE_OVER = ["wheel", "touchstart", "keydown", "pointerdown"] as const;

/**
 * A link into a section (#weekly from the session emails, #security back from Google) lands on it
 * once it exists (the sections come after the profile, so the browser's own jump on arrival found
 * nothing), at once, as the page's smooth scrolling would still be gliding when the sections above
 * load their own data and grow. Until the person scrolls or taps (10 seconds at most), each growth
 * lands it again, so it stays in view.
 */
function useLandOnSection(ready: boolean) {
  useEffect(() => {
    const id = window.location.hash.slice(1);
    // Only with an anchor: Firefox warns about an empty id.
    const section = ready && id ? document.getElementById(id) : null;
    if (!section) return;
    const land = () => section.scrollIntoView({ behavior: "instant", block: "start" });
    land();
    const grew = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(land);
    grew?.observe(document.body);
    const stop = () => {
      grew?.disconnect();
      window.clearTimeout(timer);
      for (const e of TAKE_OVER) window.removeEventListener(e, stop);
    };
    const timer = window.setTimeout(stop, 10_000);
    for (const e of TAKE_OVER) window.addEventListener(e, stop, { passive: true });
    return stop;
  }, [ready]);
}

/**
 * The section in view: the one crossing a line a quarter down the screen. Null until the
 * browser can tell (no IntersectionObserver: no highlight, the links still work).
 */
function useActiveSection(ids: SectionId[], ready: boolean): SectionId | null {
  const [active, setActive] = useState<SectionId | null>(null);
  const key = ids.join(" ");
  useEffect(() => {
    if (!ready || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id as SectionId);
      },
      { rootMargin: "-25% 0px -70% 0px" }
    );
    for (const id of key.split(" ")) {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, [key, ready]);
  return active;
}

/** "On this page": a sticky row of links on phones and tablets, a sticky column from xl. */
function SectionIndex({
  sections,
  active,
  variant,
}: {
  sections: Array<[SectionId, string]>;
  active: SectionId | null;
  variant: "row" | "column";
}) {
  const row = useRef<HTMLOListElement | null>(null);
  // Phones: the highlighted link stays in view as the page scrolls past its section.
  useEffect(() => {
    if (variant !== "row" || !active) return;
    const link = row.current?.querySelector<HTMLElement>(`[href="#${active}"]`);
    const list = row.current;
    if (!link || !list) return;
    const left = link.offsetLeft - list.offsetLeft;
    if (left < list.scrollLeft || left + link.offsetWidth > list.scrollLeft + list.clientWidth) {
      list.scrollLeft = left - 16;
    }
  }, [active, variant]);

  if (variant === "row") {
    return (
      <nav
        aria-label="Settings sections"
        className="sticky top-0 z-10 -mx-4 mt-5 border-b border-ap-line bg-white px-2 sm:-mx-10 sm:px-8 xl:hidden"
      >
        <ol
          ref={row}
          className="flex overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {sections.map(([id, label]) => (
            <li key={id} className="shrink-0">
              <a
                href={`#${id}`}
                aria-current={active === id ? "true" : undefined}
                className="group inline-flex min-h-[44px] items-center px-1 outline-none"
              >
                <span
                  className={`whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] transition-colors duration-200 group-focus-visible:outline group-focus-visible:outline-2 group-focus-visible:outline-ap-purple ${
                    active === id
                      ? "bg-ap-ink font-semibold text-white"
                      : "text-ap-muted hover:text-ap-ink"
                  }`}
                >
                  {label}
                </span>
              </a>
            </li>
          ))}
        </ol>
      </nav>
    );
  }
  return (
    <nav aria-label="Settings sections" className="hidden xl:block">
      <ol className="sticky top-10 flex flex-col gap-0.5">
        {sections.map(([id, label]) => (
          <li key={id}>
            <a
              href={`#${id}`}
              aria-current={active === id ? "true" : undefined}
              className={`block rounded-xl px-3 py-2 text-[14px] transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ap-purple ${
                active === id
                  ? "bg-ap-ground font-semibold text-ap-ink"
                  : "text-ap-muted hover:bg-ap-ground hover:text-ap-ink"
              }`}
            >
              {label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/**
 * One section of Settings: its heading (with "Saved" or an error beside it, read out politely),
 * an optional line under it and an action on the right (such as Reset).
 */
export function SettingsSection({
  id,
  title,
  description,
  status,
  action,
  footer,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  status?: Status;
  action?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-16 xl:scroll-mt-10">
      <div className="flex flex-wrap items-center justify-between gap-x-3">
        <div className="flex items-center gap-3">
          <h2 id={`${id}-title`} className="font-serif text-[22px] font-medium">
            {title}
          </h2>
          <span role="status" className="text-[13px]">
            {status?.kind === "saving" ? <span className="text-ap-muted">Saving…</span> : null}
            {status?.kind === "saved" ? (
              <span className="inline-flex items-center gap-1 font-semibold text-ap-good-ink motion-safe:animate-mira-pop">
                <svg
                  aria-hidden="true"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m5 12.5 4.5 4.5L19 7.5" />
                </svg>
                {status.text ?? "Saved"}
              </span>
            ) : null}
          </span>
        </div>
        {action}
      </div>
      {description ? <p className="mt-1 text-[14px] text-ap-body">{description}</p> : null}
      {status?.kind === "error" ? (
        <p
          role="alert"
          className="mt-3 rounded-2xl bg-ap-bad/10 px-4 py-3 text-[14px] text-ap-bad-ink"
        >
          {status.text}
        </p>
      ) : null}
      <div className="mt-4">{children}</div>
      {footer}
    </section>
  );
}

/**
 * Another feature's own Settings section (it brings its own heading, the same as
 * SettingsSection's): only the anchor the index scrolls to and watches.
 */
function Slot({ id, children }: { id: string; children: ReactNode }) {
  return (
    <div id={id} className="scroll-mt-16 xl:scroll-mt-10">
      {children}
    </div>
  );
}

/** Rows that belong together: one hairline frame, hairlines between. */
export function SettingsGroup({ children }: { children: ReactNode }) {
  return (
    <div className="divide-y divide-ap-line overflow-hidden rounded-3xl border border-ap-line">
      {children}
    </div>
  );
}

/** A labelled row with its control on the right (under the label on phones). */
function Row({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: (id: string, describedBy: string | undefined) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-5">
      <div className="min-w-0">
        <label htmlFor={id} className="block text-[15px] font-semibold">
          {label}
        </label>
        {description ? (
          <p id={`${id}-d`} className="mt-0.5 text-[14px] leading-snug text-ap-body">
            {description}
          </p>
        ) : null}
      </div>
      <div className="sm:w-[260px] sm:shrink-0">
        {children(id, description ? `${id}-d` : undefined)}
      </div>
    </div>
  );
}

/** A field with its label above (and a quiet hint under it). */
function Field({
  label,
  hint,
  optional,
  children,
}: {
  label: string;
  hint?: string;
  optional?: boolean;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-[14px] font-semibold">
        {label} {optional ? <span className="font-normal text-ap-muted">Optional</span> : null}
      </label>
      {children(id)}
      {hint ? <p className="text-[13px] text-ap-muted">{hint}</p> : null}
    </div>
  );
}

const INPUT =
  "min-h-[48px] w-full rounded-2xl border border-ap-line bg-white px-4 text-[16px] text-ap-ink caret-ap-purple outline-none transition-colors hover:border-ap-quiet focus:border-ap-purple focus-visible:ring-2 focus-visible:ring-ap-purple/25";

/**
 * An on/off row: the whole row toggles. A checkbox with the switch role, so it is announced as
 * "on" or "off", named by its label and described by the line under it.
 */
export function Switch({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (on: boolean) => void;
}) {
  const id = useId();
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 px-4 py-4 sm:px-5">
      <span className="min-w-0">
        <span id={`${id}-l`} className="block text-[15px] font-semibold">
          {label}
        </span>
        {description ? (
          <span id={`${id}-d`} className="mt-0.5 block text-[14px] leading-snug text-ap-body">
            {description}
          </span>
        ) : null}
      </span>
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input
          type="checkbox"
          role="switch"
          checked={checked}
          disabled={disabled}
          aria-labelledby={`${id}-l`}
          aria-describedby={description ? `${id}-d` : undefined}
          onChange={(e) => onChange(e.target.checked)}
          className="peer absolute inset-0 z-[1] h-full w-full cursor-pointer appearance-none rounded-full opacity-0 disabled:cursor-not-allowed"
        />
        <span
          aria-hidden="true"
          className="block h-7 w-12 rounded-full bg-ap-muted/75 transition-colors duration-200 peer-checked:bg-ap-purple peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ap-purple peer-disabled:opacity-50"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgba(22,16,33,0.3)] transition-transform duration-200 peer-checked:translate-x-5 motion-reduce:transition-none"
        />
      </span>
    </label>
  );
}

/** A select that matches the page's fields: WebKit's own select ignores their height and shape. */
export function Select({ children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="relative flex">
      <select
        {...rest}
        className="min-h-[48px] w-full cursor-pointer appearance-none rounded-2xl border border-ap-line bg-white pl-4 pr-10 text-[16px] font-normal text-ap-ink outline-none transition-colors hover:border-ap-quiet focus:border-ap-purple focus-visible:ring-2 focus-visible:ring-ap-purple/25"
      >
        {children}
      </select>
      <svg
        aria-hidden="true"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-ap-muted"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </span>
  );
}

/** Light, Dark, System as three small pictures of Mira, each in its own colours. */
function ThemePicker({ value, onChange }: { value: Theme; onChange: (t: Theme) => void }) {
  const name = useId();
  return (
    <div className="mt-3 grid grid-cols-3 gap-3">
      {THEME_CHOICES.map(([theme, label]) => (
        <label key={theme} className="group cursor-pointer">
          <input
            type="radio"
            name={name}
            value={theme}
            checked={value === theme}
            onChange={() => onChange(theme)}
            className="peer sr-only"
          />
          <span className="relative block overflow-hidden rounded-2xl ring-1 ring-ap-line transition-shadow duration-200 group-hover:ring-ap-quiet peer-checked:ring-2 peer-checked:ring-ap-purple peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ap-purple">
            <ThemePreview palette={theme === "dark" ? tokens.MIRA_DARK : tokens.AP_LIGHT} />
            {theme === "system" ? (
              <span className="absolute inset-0 [clip-path:polygon(58%_0,100%_0,100%_100%,42%_100%)]">
                <ThemePreview palette={tokens.MIRA_DARK} />
              </span>
            ) : null}
          </span>
          <span className="mt-2 flex items-center justify-center gap-1.5 text-[14px] text-ap-body peer-checked:font-semibold peer-checked:text-ap-ink">
            <ThemeIcon theme={theme} size={14} />
            {label}
          </span>
        </label>
      ))}
    </div>
  );
}

/** A tiny chat in a theme's own colours: whatever the page's theme, each shows its own. */
function ThemePreview({ palette }: { palette: Record<string, string> }) {
  return (
    <span aria-hidden="true" className="block h-[76px] p-3" style={{ background: palette.paper }}>
      <span className="block h-2 w-3/5 rounded-full" style={{ background: palette.ink }} />
      <span
        className="mt-1.5 block h-1.5 w-4/5 rounded-full opacity-60"
        style={{ background: palette.muted }}
      />
      <span
        className="ml-auto mt-3 block h-4 w-1/2 rounded-full"
        style={{ background: palette.ground }}
      />
    </span>
  );
}

/** A row of choices, one picked (native radios: arrow keys move between them). */
function Segmented<T extends string>({
  name,
  choices,
  value,
  onChange,
}: {
  name: string;
  choices: Array<[T, string]>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="mt-3 inline-flex w-full rounded-full bg-ap-ground p-1 sm:w-auto">
      {choices.map(([v, label], i) => (
        <label key={v} className="flex-1 cursor-pointer sm:flex-none">
          <input
            type="radio"
            name={name}
            value={v}
            checked={value === v}
            onChange={() => onChange(v)}
            className="peer sr-only"
          />
          <span className="flex min-h-[40px] items-center justify-center gap-1.5 rounded-full px-2 text-[14px] sm:px-4 text-ap-muted transition-[background-color,color,box-shadow] duration-200 hover:text-ap-ink peer-checked:bg-white peer-checked:font-semibold peer-checked:text-ap-ink peer-checked:shadow-[0_1px_3px_rgba(22,16,33,0.18)] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-ap-purple">
            <span
              aria-hidden="true"
              className="hidden font-serif sm:inline"
              style={{ fontSize: 12 + i * 3 }}
            >
              A
            </span>
            {label}
          </span>
        </label>
      ))}
    </div>
  );
}

/** While the profile loads: the page's shape, softly pulsing. */
function SettingsSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading your settings" className="mt-8 flex flex-col gap-10">
      {[200, 120, 260].map((h) => (
        <div key={h}>
          <div className="h-6 w-40 rounded-full bg-ap-ground motion-safe:animate-pulse" />
          <div
            className="mt-4 rounded-3xl bg-ap-ground motion-safe:animate-pulse"
            style={{ height: h }}
          />
        </div>
      ))}
    </div>
  );
}
