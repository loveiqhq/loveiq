"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { StyleScales, type Style } from "./CoachingStylePanel";
import { CRISIS_COUNTRY_OPTIONS } from "./countries";
import { GradientButton } from "./MiraShell";
import { MiraAppFrame } from "./MiraAppFrame";
import { miraApi } from "./api";

/**
 * Board 08c, the Friday cut: account, coaching style, what Mira may use, your data, sign out.
 * Language, Google/Apple, devices, appearance, nudges and session reminders come after launch.
 */

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

export default function MiraSettings() {
  const router = useRouter();
  const [p, setP] = useState<Profile | null>(null);
  // The profile as the server has it, after the load and after each save.
  const stored = useRef<Profile | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<"chats" | "account" | null>(null);

  useEffect(() => {
    void miraApi<{ profile: Profile }>("/api/mira/me").then((r) => {
      if (r.status === 401) router.replace("/mira/start");
      else if (r.ok) {
        stored.current = r.data.profile;
        setP(r.data.profile);
      } else setError(r.data.error ?? "Unable to load your settings.");
    });
  }, [router]);

  async function save() {
    if (!p) return;
    setError(null);
    const body = changedFields(p, stored.current);
    if (Object.keys(body).length === 0) return setSaved("Saved.");
    setBusy(true);
    const r = await miraApi("/api/mira/me", { method: "PATCH", body });
    setBusy(false);
    if (r.ok) {
      stored.current = p;
      setSaved("Saved.");
    } else setError(r.data.error ?? "Unable to save.");
  }

  async function remove(what: "chats" | "account") {
    setBusy(true);
    const r = await miraApi(`/api/mira/me?what=${what}`, { method: "DELETE" });
    setConfirm(null);
    if (!r.ok) {
      setBusy(false);
      return setError(r.data.error ?? "Unable to delete right now.");
    }
    if (what === "account") {
      router.replace("/mira");
      router.refresh();
      return;
    }
    setBusy(false);
    setSaved("All your chats are deleted.");
  }

  async function signOut() {
    setBusy(true);
    setError(null);
    const r = await miraApi("/api/mira/auth", { body: { action: "logout" } });
    if (!r.ok) {
      setBusy(false);
      return setError(r.data.error ?? "Unable to sign out. Please try again.");
    }
    router.replace("/mira");
    router.refresh();
  }

  const set = (patch: Partial<Profile>) => {
    setSaved(null);
    setP((cur) => (cur ? { ...cur, ...patch } : cur));
  };

  return (
    <MiraAppFrame active="settings" email={p?.email} name={p?.name}>
      <h1 className="font-serif text-[34px] font-medium">Settings</h1>
      {error && !p ? (
        <p role="alert" className="mt-2 text-ap-bad-ink">
          {error}
        </p>
      ) : null}
      {p ? (
        <div className="mt-6 flex flex-col gap-8">
          <section className="flex flex-col gap-4">
            <h2 className="font-serif text-[22px] font-medium">Account</h2>
            <label className="flex flex-col gap-2 text-[14px] font-semibold">
              Name or nickname
              <input
                value={p.name ?? ""}
                maxLength={60}
                onChange={(e) => set({ name: e.target.value })}
                className="min-h-[48px] rounded-2xl border border-ap-line px-4 text-[16px] font-normal"
              />
            </label>
            <p className="text-[14px]">
              <span className="font-semibold">Email</span>{" "}
              <span className="text-ap-body [overflow-wrap:anywhere]">{p.email}</span>
            </p>
            <label className="flex flex-col gap-2 text-[14px] font-semibold">
              Gender <span className="font-normal text-ap-muted">Optional</span>
              <input
                value={p.gender ?? ""}
                maxLength={40}
                onChange={(e) => set({ gender: e.target.value })}
                className="min-h-[48px] rounded-2xl border border-ap-line px-4 text-[16px] font-normal"
              />
            </label>
            <label className="flex flex-col gap-2 text-[14px] font-semibold">
              Where you&apos;re based
              <select
                value={p.country ?? ""}
                onChange={(e) => set({ country: e.target.value || null })}
                className="min-h-[48px] rounded-2xl border border-ap-line bg-white px-4 text-[16px] font-normal"
              >
                <option value="">Not set</option>
                {CRISIS_COUNTRY_OPTIONS.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
                <option value="OTHER">Somewhere else</option>
              </select>
            </label>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="font-serif text-[22px] font-medium">How Mira coaches you</h2>
            <p className="text-[14px] text-ap-body">
              Pick a point on each line. The middle is balanced.
            </p>
            <StyleScales value={p.style ?? {}} onChange={(style) => set({ style })} />
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="font-serif text-[22px] font-medium">What Mira may use</h2>
            <Switch
              label="Remember our conversations"
              desc="Mira keeps your chats, so you don't have to start over."
              checked={p.remember_chats}
              onChange={(v) => set({ remember_chats: v })}
            />
            <Switch
              label="Use my test result"
              desc="Your LoveIQ Sexual Personality result tailors the coaching."
              checked={p.use_assessment}
              onChange={(v) => set({ use_assessment: v })}
            />
            <p className="text-[12px] leading-relaxed text-ap-muted">
              Your chats concern your sex life, which is sensitive data under the GDPR. We use them
              with your consent, to coach you and to improve Mira; our analytics tools also see what
              you type. Never for advertising, never to train shared models.{" "}
              <a href="/mira/privacy" className="underline">
                How Mira handles your data
              </a>
            </p>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="font-serif text-[22px] font-medium">Notifications</h2>
            <Switch
              label="Daily nudges by email"
              desc="A short thought from Mira that leads back into the chat. Neutral subject line."
              checked={p.nudges_on}
              onChange={(v) => set({ nudges_on: v })}
            />
            {p.nudges_on && !p.remember_chats ? (
              <p className="text-[12px] text-ap-muted">
                Nudges pick up on your last chat, so they need “Remember our conversations” on.
              </p>
            ) : null}
            <label className="flex flex-col gap-1.5 text-[14px] font-semibold">
              Nudge time
              <select
                value={p.nudge_time}
                onChange={(e) => set({ nudge_time: e.target.value as Profile["nudge_time"] })}
                className="min-h-[44px] rounded-full border border-ap-line px-4 text-[16px] font-normal"
              >
                {NUDGE_TIMES.map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-[14px] font-semibold">
              Time zone
              <select
                value={p.time_zone}
                onChange={(e) => set({ time_zone: e.target.value })}
                className="min-h-[44px] rounded-full border border-ap-line px-4 text-[16px] font-normal"
              >
                {[...new Set([p.time_zone, ...TIME_ZONES])].map((tz) => (
                  <option key={tz} value={tz}>
                    {tz.replace("_", " ")}
                  </option>
                ))}
              </select>
            </label>
          </section>

          {/* Save, delete and sign-out errors show here, next to the buttons that caused them. */}
          <div className="flex flex-wrap items-center gap-3">
            <GradientButton onClick={save} disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </GradientButton>
            <span role="status" className="text-[14px] text-ap-good-ink">
              {saved}
            </span>
            {error ? (
              <p role="alert" className="text-[14px] text-ap-bad-ink">
                {error}
              </p>
            ) : null}
          </div>

          <section className="flex flex-col gap-3 border-t border-ap-line pt-6">
            <h2 className="font-serif text-[22px] font-medium">Your data</h2>
            <p className="text-[14px] text-ap-body">
              Want a copy of your data? Email{" "}
              <a href="mailto:hello@loveiq.org" className="underline">
                hello@loveiq.org
              </a>{" "}
              and we&apos;ll send it within 30 days.
            </p>
            {confirm ? (
              <div className="rounded-2xl border border-ap-bad p-4 text-[14px]">
                <p>
                  {confirm === "chats"
                    ? "Delete all your chats? This can't be undone."
                    : "Delete your account, your profile and all your chats? This can't be undone."}
                </p>
                <div className="mt-3 flex gap-3">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => remove(confirm)}
                    className="min-h-[44px] rounded-full bg-ap-bad px-5 font-semibold text-white disabled:opacity-50"
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirm(null)}
                    className="min-h-[44px] rounded-full border border-ap-line px-5 font-semibold"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setConfirm("chats")}
                  className="min-h-[44px] rounded-full border border-ap-line px-5 text-[14px] font-semibold"
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
            <p className="text-[14px] text-ap-body">
              <strong>Plan:</strong> free while in beta. We&apos;ll tell you well before anything
              changes.
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={signOut}
              className="w-fit text-[14px] font-semibold text-ap-plum underline disabled:opacity-50"
            >
              Sign out
            </button>
          </section>
        </div>
      ) : null}
    </MiraAppFrame>
  );
}

function Switch({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-4 rounded-2xl border border-ap-line p-4">
      <span>
        <span className="block text-[15px] font-bold">{label}</span>
        <span className="text-[14px] text-ap-body">{desc}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-5 w-5 shrink-0 accent-[#795fc8]"
      />
    </label>
  );
}
