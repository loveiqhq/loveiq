"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { MiraAppFrame } from "./MiraAppFrame";
import { miraApi } from "./api";
import ChecksHomeCard from "./checks/ChecksHomeCard";
import CoachesCard from "./coaches/CoachesCard";
import HomeSearch from "./coaches/HomeSearch";
import PicksCard from "./coaches/PicksCard";
import GoalsCard from "./goals/GoalsCard";
import { JournalCard } from "./journal/JournalCard";
import { RecordingsCard } from "./recordings/Recordings";
import { NextSessionCard } from "./weekly-session/NextSessionCard";

/**
 * Board 08, Home, past the MVP (22 Nov 2026): the greeting and search, the way back into the
 * chat, then today's habits first (the journal's check-in, goals, the weekly session), what is
 * picked for the person, their checks, voice sessions and coaches. Every card loads its own data
 * and owns its loading, empty and error states; this page only orders them, phone first.
 */

type Me = {
  profile: { name: string | null; email: string };
  chats: Array<{ id: string; title: string; updated_at: string }>;
};

/** 05–11 morning, 12–17 afternoon, otherwise evening (00:44 is not "morning"). */
export function greeting(hour: number): string {
  return hour >= 5 && hour < 12
    ? "Good morning"
    : hour >= 12 && hour < 18
      ? "Good afternoon"
      : "Good evening";
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
  // Neutral on the server (its clock is UTC); the browser's hour comes in with the account.
  const [hello, setHello] = useState("Hello");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void miraApi<Me>("/api/mira/me").then((r) => {
      setHello(greeting(new Date().getHours()));
      if (r.status === 401) router.replace("/mira/start");
      else if (r.ok) setMe(r.data);
      else setError(r.data.error ?? "Unable to load your account.");
    });
  }, [router]);

  const [latest, ...earlier] = me?.chats ?? [];

  return (
    <MiraAppFrame active="home" email={me?.profile.email} name={me?.profile.name}>
      {error ? (
        <p
          role="alert"
          className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-[480px] rounded-2xl border border-ap-line bg-white px-4 py-3 text-[14px] text-ap-bad-ink shadow-lg"
        >
          {error}
        </p>
      ) : null}

      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="font-serif text-[34px] font-medium leading-tight [overflow-wrap:anywhere] motion-safe:animate-mira-in">
            {hello}
            {me?.profile.name ? `, ${me.profile.name}` : ""}
          </h1>
          <p className="mt-1 text-[15px] text-ap-muted motion-safe:animate-mira-in">
            Wonderful to see you working on your life.
          </p>
        </div>
        <div className="w-full lg:max-w-[340px]">
          <HomeSearch />
        </div>
      </header>

      <section
        aria-labelledby="continue-h"
        className="mt-7 rounded-3xl border border-ap-line p-5 motion-safe:animate-mira-rise"
      >
        <div className="flex items-center gap-3">
          <Image
            src="/images/mira/mira.webp"
            alt=""
            width={48}
            height={48}
            unoptimized
            className="h-12 w-12 shrink-0 rounded-full object-cover"
          />
          <div className="min-w-0 flex-1">
            <h2 id="continue-h" className="font-serif text-[22px] font-medium leading-tight">
              {latest ? "Continue with Mira" : "Start with Mira"}
            </h2>
            <p className="text-[13px] text-ap-muted">
              Body confidence
              {latest ? ` · last chat ${when(latest.updated_at).toLowerCase()}` : " · your coach"}
            </p>
          </div>
        </div>
        {latest ? (
          <Link
            href={`/mira?chat=${latest.id}`}
            className="mt-4 block rounded-2xl bg-ap-ground px-4 py-3 text-[15px] text-ap-body transition-colors hover:bg-ap-track"
          >
            <span className="line-clamp-2 [overflow-wrap:anywhere]">{latest.title}</span>
          </Link>
        ) : (
          <p className="mt-4 text-[15px] text-ap-body">
            Feel more at home in your body, in and out of the bedroom.
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-3">
          {latest ? (
            <Link
              href={`/mira?chat=${latest.id}`}
              className="inline-flex min-h-[44px] items-center rounded-full bg-ap-ink px-5 text-[14px] font-bold text-white"
            >
              Open chat
            </Link>
          ) : null}
          <Link
            href="/mira"
            className={
              latest
                ? "inline-flex min-h-[44px] items-center rounded-full border border-ap-line px-5 text-[14px] font-semibold"
                : "inline-flex min-h-[44px] items-center rounded-full bg-ap-ink px-5 text-[14px] font-bold text-white"
            }
          >
            New chat
          </Link>
        </div>
        {earlier.length ? (
          <ul
            aria-label="Earlier chats"
            className="mt-4 flex flex-col divide-y divide-ap-line border-t border-ap-line"
          >
            {earlier.slice(0, 3).map((c) => (
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
        ) : null}
      </section>

      <div className="mt-8 flex flex-col gap-8">
        <JournalCard />
        <div className="grid gap-6 md:grid-cols-2">
          <GoalsCard />
          <NextSessionCard />
        </div>
        <PicksCard />
        <ChecksHomeCard />
        <RecordingsCard />
        <CoachesCard />
      </div>
    </MiraAppFrame>
  );
}
