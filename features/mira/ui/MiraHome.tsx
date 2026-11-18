"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { MiraAppFrame } from "./MiraAppFrame";
import { miraApi } from "./api";

/**
 * Boards 08 (Home) and 08b (Assessments), MVP: Mira is the only active coach, the LoveIQ test is
 * the only assessment, and the rest is marked "Coming soon". The guide shows as coming soon until
 * NEXT_PUBLIC_MIRA_GUIDE_URL points at a live guide page.
 */

type Me = {
  profile: { name: string | null; email: string; use_assessment: boolean };
  chats: Array<{ id: string; title: string; updated_at: string }>;
  assessment: { archetype: string; takenAt: string; reportPath: string | null } | null;
};

const COMING_SOON = [
  {
    title: "Challenges & goals",
    desc: "Pick what you want to work on and set small, doable goals.",
  },
  { title: "Daily journal", desc: "A 30-second check-in that shows your patterns over time." },
  { title: "Session recordings", desc: "Talk to Mira by voice and revisit what you discussed." },
];
const NEXT_COACHES = ["Libido challenges", "Saying what you want"];

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function when(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return days <= 0
    ? "Today"
    : days === 1
      ? "Yesterday"
      : days < 7
        ? `${days} days ago`
        : new Date(iso).toLocaleDateString();
}

export default function MiraHome() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notified, setNotified] = useState<string[]>([]);
  const guideUrl = process.env.NEXT_PUBLIC_MIRA_GUIDE_URL;

  useEffect(() => {
    void miraApi<Me>("/api/mira/me").then((r) => {
      if (r.status === 401) router.replace("/mira/start");
      else if (r.ok) setMe(r.data);
      else setError(r.data.error ?? "Unable to load your account.");
    });
  }, [router]);

  async function notify(coach: string) {
    setNotified((n) => [...n, coach]);
    await miraApi("/api/mira/event", { body: { type: "notify", coach } });
  }

  async function toggleAssessment(on: boolean) {
    setMe((m) => (m ? { ...m, profile: { ...m.profile, use_assessment: on } } : m));
    await miraApi("/api/mira/me", { method: "PATCH", body: { use_assessment: on } });
  }

  return (
    <MiraAppFrame active="home" email={me?.profile.email} name={me?.profile.name}>
      {error ? (
        <p role="alert" className="text-ap-bad-ink">
          {error}
        </p>
      ) : null}
      <h1 className="font-serif text-[34px] font-medium">
        {greeting()}
        {me?.profile.name ? `, ${me.profile.name}` : ""}
      </h1>

      <section className="mt-6 rounded-3xl border border-ap-line p-5">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-[#fe6839] to-[#bf66d9] font-serif text-[18px] font-bold text-white"
          >
            M
          </span>
          <div className="flex-1">
            <h2 className="font-serif text-[20px] font-semibold">Mira</h2>
            <p className="text-[13px] text-ap-muted">Body confidence · your coach</p>
          </div>
          <Link
            href="/mira"
            className="inline-flex min-h-[44px] items-center rounded-full bg-black px-5 text-[14px] font-bold text-white"
          >
            New chat
          </Link>
        </div>
        <ul className="mt-4 flex flex-col divide-y divide-ap-line">
          {me && me.chats.length === 0 ? (
            <li className="py-3 text-[14px] text-ap-muted">No chats yet. Start one with Mira.</li>
          ) : null}
          {me?.chats.slice(0, 5).map((c) => (
            <li key={c.id}>
              <Link
                href={`/mira?chat=${c.id}`}
                className="flex min-h-[44px] items-center justify-between gap-3 py-2 text-[14px]"
              >
                <span className="truncate">{c.title}</span>
                <span className="shrink-0 text-[12px] text-ap-muted">{when(c.updated_at)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6 rounded-3xl border border-ap-line p-5">
        <h2 className="font-serif text-[20px] font-semibold">New coaches coming soon</h2>
        <p className="mt-1 text-[14px] text-ap-body">
          Each one trained on a single challenge, like Mira.
        </p>
        <ul className="mt-3 flex flex-col gap-2">
          {NEXT_COACHES.map((coach) => (
            <li key={coach} className="flex items-center justify-between gap-3 text-[14px]">
              <span>
                {coach}{" "}
                <span className="ml-2 rounded-full bg-ap-track px-2 py-[2px] text-[11px] text-ap-muted">
                  Soon
                </span>
              </span>
              <button
                type="button"
                disabled={notified.includes(coach)}
                onClick={() => notify(coach)}
                className="min-h-[40px] rounded-full border border-ap-line px-4 text-[13px] font-semibold disabled:text-ap-muted"
              >
                {notified.includes(coach) ? "We'll let you know" : "Notify me"}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section id="assessments" className="mt-6 rounded-3xl border border-ap-line p-5">
        <h2 className="font-serif text-[20px] font-semibold">Assessments</h2>
        {me?.assessment ? (
          <div className="mt-3 flex flex-col gap-3">
            <p className="text-[15px]">
              <strong>Sexual Personality</strong> · your result: {me.assessment.archetype}
              <span className="text-ap-muted">
                {" "}
                · taken {new Date(me.assessment.takenAt).toLocaleDateString()}
              </span>
            </p>
            <div className="flex flex-wrap gap-3">
              {me.assessment.reportPath ? (
                <a
                  href={me.assessment.reportPath}
                  className="inline-flex min-h-[44px] items-center rounded-full border border-ap-line px-5 text-[14px] font-semibold"
                >
                  View report
                </a>
              ) : null}
            </div>
            <label className="flex items-center justify-between gap-3 text-[14px]">
              <span>Mira may use this result to tailor her coaching</span>
              <input
                type="checkbox"
                checked={me.profile.use_assessment}
                onChange={(e) => toggleAssessment(e.target.checked)}
                className="h-5 w-5 accent-[#795fc8]"
              />
            </label>
          </div>
        ) : me ? (
          <div className="mt-3 flex flex-col gap-3">
            <p className="text-[15px] text-ap-body">
              <strong className="text-ap-ink">Sexual Personality</strong> · not taken yet · about 9
              min. Use the same email as your account and your result shows up here.
            </p>
            <Link
              href="/"
              className="inline-flex min-h-[44px] w-fit items-center rounded-full bg-black px-5 text-[14px] font-bold text-white"
            >
              Take the assessment
            </Link>
          </div>
        ) : null}
        <p className="mt-4 text-[12px] text-ap-muted">
          Results support self-reflection. They are not a diagnosis.
        </p>
      </section>

      <section className="mt-6 rounded-3xl border border-ap-line p-5">
        <h2 className="font-serif text-[20px] font-semibold">Guides</h2>
        <p className="mt-2 text-[15px]">
          <strong>The body confidence guide</strong>{" "}
          {guideUrl ? (
            <a href={guideUrl} className="ml-2 underline">
              Open the guide
            </a>
          ) : (
            <span className="ml-2 rounded-full bg-ap-track px-2 py-[2px] text-[11px] text-ap-muted">
              Coming soon
            </span>
          )}
        </p>
      </section>

      <section className="mt-6 grid gap-4 sm:grid-cols-3">
        {COMING_SOON.map((c) => (
          <div key={c.title} className="rounded-3xl border border-dashed border-ap-line p-5">
            <span className="rounded-full bg-ap-track px-2 py-[2px] text-[11px] text-ap-muted">
              Coming soon
            </span>
            <h3 className="mt-2 font-serif text-[18px] font-semibold">{c.title}</h3>
            <p className="mt-1 text-[13px] text-ap-body">{c.desc}</p>
          </div>
        ))}
      </section>
    </MiraAppFrame>
  );
}
