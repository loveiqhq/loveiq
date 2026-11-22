"use client";

import Link from "next/link";
import { useState } from "react";
import { coachById, suggestedCoaches, type CoachId } from "@features/mira/content/coaches";
import { SectionLink } from "../kit";
import { useCoachData } from "./data";
import { CoachPortrait, NotifyButton } from "./parts";
import { FOCUS, INK_PILL, QUIET_PILL } from "./styles";

const MIRA = coachById("mira");

/**
 * Home's "Your coaches" (board Home): Mira, the coach who is here, with the way back into the
 * last chat; beside her two coming-soon coaches picked for the person (asked about, then by
 * topic, then Mira's hand-overs), honest that they can't talk yet. Mounts on Home.
 */
export default function CoachesCard() {
  const { state, retry } = useCoachData();
  const data = state.status === "ready" ? state.data : null;
  const [asked, setAsked] = useState<CoachId[] | null>(null);
  if (state.status === "out" || state.status === "closed") return null;
  const known = asked ?? data?.notified ?? [];
  // From what the server knew at load: a tap here never reorders the list under the finger.
  const suggested = data ? suggestedCoaches(data.topics, data.notified) : [];
  const latest = data?.chats[0];
  const setNotified = (id: CoachId, on: boolean) =>
    setAsked((a) => {
      const base = a ?? data?.notified ?? [];
      return on ? [...new Set([...base, id])] : base.filter((x) => x !== id);
    });

  return (
    <section aria-labelledby="coaches-h">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="coaches-h" className="font-serif text-[24px] font-medium leading-tight">
          Your coaches
        </h2>
        <SectionLink href="/mira/coaches" what="coaches" />
      </div>
      <div className="mt-2 grid gap-3 md:grid-cols-2">
        <article
          aria-labelledby="your-coach-mira"
          className="relative flex flex-col overflow-hidden rounded-[24px] border border-ap-line bg-white p-5 sm:p-6"
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-20 -top-24 h-[240px] w-[240px] rounded-full bg-[radial-gradient(closest-side,rgba(191,102,217,0.14),rgba(149,142,246,0)_100%)] blur-2xl"
          />
          <div className="relative flex items-center gap-3">
            <CoachPortrait coach={MIRA} size={52} />
            <div className="min-w-0">
              <h3 id="your-coach-mira" className="font-serif text-[22px] font-medium leading-tight">
                Mira
              </h3>
              <p className="text-[13px] text-ap-muted">{MIRA.challenge} · Your coach</p>
            </div>
          </div>
          <p className="relative mt-3 font-serif text-[16px] italic leading-snug text-ap-ink">
            “{MIRA.motto}”
          </p>
          <div className="relative mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-5">
            <Link href="/mira" className={INK_PILL}>
              Talk to Mira
            </Link>
            {latest ? (
              <Link
                href={`/mira?chat=${latest.id}`}
                className={`inline-flex min-h-[44px] min-w-0 max-w-full items-center px-1 text-[14px] font-semibold text-ap-plum underline-offset-4 hover:underline ${FOCUS}`}
              >
                <span className="truncate">Continue “{latest.title}”</span>
              </Link>
            ) : null}
          </div>
        </article>

        <div className="rounded-[24px] border border-ap-line bg-white px-5 pb-2 pt-4 sm:px-6">
          {state.status === "loading" ? (
            <div className="flex flex-col gap-2 py-2">
              <p role="status" className="sr-only">
                Loading your coaches
              </p>
              {[0, 1].map((i) => (
                <div
                  key={i}
                  aria-hidden="true"
                  className="h-[84px] rounded-2xl bg-ap-ground motion-safe:animate-pulse"
                />
              ))}
            </div>
          ) : state.status === "error" ? (
            <div className="flex flex-wrap items-center gap-3 py-3">
              <p role="alert" className="text-[14px] text-ap-body">
                We couldn’t load your coaches.
              </p>
              <button type="button" onClick={retry} className={QUIET_PILL}>
                Try again
              </button>
            </div>
          ) : (
            <ul className="flex flex-col">
              {suggested.map((s, i) => (
                <li
                  key={s.coach.id}
                  style={{ animationDelay: `${i * 70}ms` }}
                  className="flex gap-3 border-t border-ap-line py-4 first:border-t-0 motion-safe:animate-mira-reply"
                >
                  <CoachPortrait coach={s.coach} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-bold leading-snug text-ap-ink">
                      {s.coach.challenge}, with {s.coach.name}
                    </p>
                    <p className="mt-0.5 text-[13px] leading-snug text-ap-muted">{s.reason}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="text-[13px] font-semibold text-ap-muted">Coming soon</span>
                      <NotifyButton
                        coach={s.coach}
                        done={known.includes(s.coach.id)}
                        onChange={setNotified}
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
