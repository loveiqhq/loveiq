"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { MiraAppFrame } from "./MiraAppFrame";
import { useSupportCountry } from "./MiraLook";
import { SupportPanel } from "./SupportPanel";
import { SignedOutNotice } from "./account/SignedOut";
import { miraApi, useSignedOut } from "./api";
import ChecksHomeCard from "./checks/ChecksHomeCard";
import CoachesCard from "./coaches/CoachesCard";
import HomeSearch from "./coaches/HomeSearch";
import PicksCard from "./coaches/PicksCard";
import GoalsCard from "./goals/GoalsCard";
import { JournalCard } from "./journal/JournalCard";
import { AdultsOnly, FOCUS_RING } from "./kit";
import { shortDate } from "./kit/dates";
import { LoadFailed } from "./kit/load-failed";
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
  /** Mira stopped the account or this browser as under 18 (server/minor.ts). */
  minor?: boolean;
};

/** Earlier chats listed under the latest before "Show more chats". */
const EARLIER = 3;

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
        : shortDate(iso);
}

const SKELETON = "block rounded-full bg-ap-track motion-safe:animate-pulse";

export default function MiraHome({
  name = null,
  hour = null,
  quiet = false,
  minor = false,
  account = null,
}: {
  /** The account's first name, read with the page (app/mira/home), so the heading never changes. */
  name?: string | null;
  /** The hour on the person's own clock; without it, "Hello". */
  hour?: number | null;
  /** Support lines showed in the last 14 days: a neutral greeting, the lines at hand (CHAT-17). */
  quiet?: boolean;
  /** Stopped as under 18, read with the page; /api/mira/me can say so too. */
  minor?: boolean;
  /** The account's id: a check-in kept through a lost sign-in is its own (JournalCard). */
  account?: string | null;
}) {
  const country = useSupportCountry();
  const [me, setMe] = useState<Me | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // Try again keeps the failed card, and its focus, until the retry answers (round-3 R3-UXA-7),
  // then the kit's LoadFailed hands the focus to the card's heading.
  const [retrying, setRetrying] = useState(false);
  const [allChats, setAllChats] = useState(false);
  const [support, setSupport] = useState(false);
  const signedOut = useSignedOut();

  useEffect(() => {
    let live = true;
    void miraApi<Me>("/api/mira/me").then((r) => {
      if (!live) return;
      setRetrying(false);
      // A lost sign-in is said once, above the cards (SignedOutNotice, with the way back in), and
      // never a move to sign-in on Home's own: the sign-in page may still see the session and send
      // the person straight back, round and round (round-3 R3-UXA-2).
      if (r.ok) {
        setMe(r.data);
        setFailed(false);
      } else if (!r.signedOut) setFailed(true);
    });
    return () => {
      live = false;
    };
  }, [attempt]);

  // Until the chats are known, the card claims nothing: not "Start with Mira" to a person with
  // chats (SET-4). A failed read says so, with a retry; "New chat" works either way.
  const loading = !me && !failed;
  const [latest, ...earlier] = me?.chats ?? [];
  const hello = quiet || hour === null ? "Hello" : greeting(hour);
  // Decision 9 on Home (R3-UXA-8): "Mira is only for adults." once, in place of everything the
  // account can no longer use, never on each card.
  const stopped = minor || me?.minor === true;

  return (
    <MiraAppFrame active="home" email={me?.profile.email} name={me?.profile.name ?? name}>
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="font-serif text-[34px] font-medium leading-tight [overflow-wrap:anywhere] motion-safe:animate-mira-in">
            {hello}
            {name ? `, ${name}` : ""}
          </h1>
          {quiet ? (
            <p className="mt-1 text-[15px] text-ap-muted motion-safe:animate-mira-in">
              Take your time.{" "}
              <button
                type="button"
                onClick={() => setSupport(true)}
                className={`font-semibold text-ap-plum underline underline-offset-2 ${FOCUS_RING}`}
              >
                See support lines
              </button>
            </p>
          ) : stopped ? null : (
            <p className="mt-1 text-[15px] text-ap-muted motion-safe:animate-mira-in">
              Wonderful to see you working on your life.
            </p>
          )}
        </div>
        {stopped ? null : (
          <div className="w-full lg:max-w-[340px]">
            <HomeSearch />
          </div>
        )}
      </header>

      {/* A lost sign-in found by any call: said once here, as the cards go quiet (HAB-16). */}
      {signedOut ? (
        <SignedOutNotice />
      ) : stopped ? (
        <AdultsOnly className="mt-6" />
      ) : (
        <>
          <section
            aria-labelledby="continue-h"
            aria-busy={loading || retrying}
            className="mt-8 motion-safe:animate-mira-rise"
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
                <h2
                  id="continue-h"
                  tabIndex={-1}
                  className="font-serif text-[24px] font-medium leading-tight outline-none"
                >
                  {loading ? (
                    <>
                      <span className="sr-only">Loading your chats</span>
                      <span aria-hidden="true" className={`${SKELETON} my-1 h-5 w-48 max-w-full`} />
                    </>
                  ) : latest || failed ? (
                    "Continue with Mira"
                  ) : (
                    "Start with Mira"
                  )}
                </h2>
                {loading ? (
                  <span aria-hidden="true" className={`${SKELETON} mt-1.5 h-3 w-32 max-w-full`} />
                ) : (
                  <p className="text-[13px] text-ap-muted">
                    Body confidence
                    {latest
                      ? ` · last chat ${when(latest.updated_at).toLowerCase()}`
                      : " · your coach"}
                  </p>
                )}
              </div>
            </div>
            {loading ? (
              <span aria-hidden="true" className={`${SKELETON} mt-4 h-[50px] !rounded-2xl`} />
            ) : failed ? (
              // As every card says it (kit/load-failed), Try again described by its line.
              <LoadFailed
                what="Your chats"
                busy={retrying}
                onRetry={() => {
                  setRetrying(true);
                  setAttempt((n) => n + 1);
                }}
                className="mt-4"
              />
            ) : latest ? (
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
              <>
                <ul
                  id="earlier-chats"
                  aria-label="Earlier chats"
                  className="mt-4 flex flex-col divide-y divide-ap-line border-t border-ap-line"
                >
                  {(allChats ? earlier : earlier.slice(0, EARLIER)).map((c) => (
                    <li key={c.id}>
                      <Link
                        href={`/mira?chat=${c.id}`}
                        className="flex min-h-[44px] items-center justify-between gap-3 py-2 text-[14px]"
                      >
                        <span className="truncate">{c.title}</span>
                        <span className="shrink-0 text-[12px] text-ap-muted">
                          {when(c.updated_at)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
                {/* Every chat, on any screen (CHAT-26): the chat's own list shows only from lg. */}
                {earlier.length > EARLIER ? (
                  <button
                    type="button"
                    aria-expanded={allChats}
                    aria-controls="earlier-chats"
                    onClick={() => setAllChats(!allChats)}
                    className={`-mx-2 mt-1 min-h-[44px] rounded-full px-2 text-[14px] font-semibold text-ap-link underline-offset-4 hover:underline ${FOCUS_RING}`}
                  >
                    {allChats ? "Show fewer chats" : "Show more chats"}
                  </button>
                ) : null}
              </>
            ) : null}
          </section>

          {/* One anatomy for every section, whichever card fills it (tailwind.config.js). */}
          <div className="mira-home-sections mt-12 flex flex-col gap-12">
            <JournalCard account={account} />
            <div className="mira-home-sections grid gap-12 md:grid-cols-2 md:gap-x-8">
              <GoalsCard />
              <NextSessionCard />
            </div>
            <PicksCard />
            <ChecksHomeCard />
            <RecordingsCard />
            <CoachesCard />
          </div>
        </>
      )}
      {support ? (
        <SupportPanel
          highlight={country ? { code: country } : null}
          onClose={() => setSupport(false)}
        />
      ) : null}
    </MiraAppFrame>
  );
}
