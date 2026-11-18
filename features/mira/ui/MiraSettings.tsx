"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
};

export default function MiraSettings() {
  const router = useRouter();
  const [p, setP] = useState<Profile | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"chats" | "account" | null>(null);

  useEffect(() => {
    void miraApi<{ profile: Profile }>("/api/mira/me").then((r) => {
      if (r.status === 401) router.replace("/mira/start");
      else if (r.ok) setP(r.data.profile);
      else setError(r.data.error ?? "Unable to load your settings.");
    });
  }, [router]);

  async function save() {
    if (!p) return;
    setError(null);
    const r = await miraApi("/api/mira/me", {
      method: "PATCH",
      body: {
        name: p.name?.trim() || null,
        country: p.country || null,
        gender: p.gender?.trim() || null,
        style: p.style,
        remember_chats: p.remember_chats,
        use_assessment: p.use_assessment,
      },
    });
    if (r.ok) setSaved("Saved.");
    else setError(r.data.error ?? "Unable to save.");
  }

  async function remove(what: "chats" | "account") {
    const r = await miraApi(`/api/mira/me?what=${what}`, { method: "DELETE" });
    setConfirm(null);
    if (!r.ok) return setError(r.data.error ?? "Unable to delete right now.");
    if (what === "account") router.replace("/mira");
    else setSaved("All your chats are deleted.");
  }

  async function signOut() {
    await miraApi("/api/mira/auth", { body: { action: "logout" } });
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
      {error ? (
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
              <span className="text-ap-body">{p.email}</span>
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

          <div className="flex items-center gap-3">
            <GradientButton onClick={save}>Save</GradientButton>
            {saved ? <span className="text-[14px] text-ap-good-ink">{saved}</span> : null}
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
                    onClick={() => remove(confirm)}
                    className="min-h-[44px] rounded-full bg-ap-bad px-5 font-semibold text-white"
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
              onClick={signOut}
              className="w-fit text-[14px] font-semibold text-ap-plum underline"
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
