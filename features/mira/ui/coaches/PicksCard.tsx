"use client";

import Link from "next/link";
import { useEffect } from "react";
import { picksFor } from "@features/mira/content/coaches";
import { AdultsOnly } from "../kit";
import { LoadFailed } from "../kit/load-failed";
import { track, useCoachData } from "./data";
import { ChevronIcon, CoachPortrait } from "./parts";
import { FOCUS } from "./styles";

/**
 * Home's "Picked for you" (board Home): two or three picks from the person's own chat topics,
 * the guide's practices first and a coming-soon coach where one fits, each with its reason, never
 * their words. With no topic yet, the guide's first practice. Mounts on Home; fetches its own data.
 */
export default function PicksCard() {
  const { state, retry } = useCoachData();
  const result = state.status === "ready" ? picksFor(state.data.topics) : null;
  const basis = result ? (result.personal ? "chats" : "start") : null;
  useEffect(() => {
    if (basis) track("picks_shown", basis);
  }, [basis]);
  if (state.status === "out") return null;

  return (
    <section
      aria-labelledby="picks-h"
      className="rounded-[24px] border border-ap-line bg-white p-5 sm:p-6"
    >
      <h2 id="picks-h" className="font-serif text-[22px] font-medium leading-tight">
        Picked for you
      </h2>
      {state.status === "closed" ? (
        <AdultsOnly className="mt-3" />
      ) : state.status === "loading" ? (
        <div className="mt-3 flex flex-col gap-2">
          <p role="status" className="sr-only">
            Loading your picks
          </p>
          {[0, 1].map((i) => (
            <div
              key={i}
              aria-hidden="true"
              className="h-[60px] rounded-2xl bg-ap-ground motion-safe:animate-pulse"
            />
          ))}
        </div>
      ) : state.status === "error" ? (
        <LoadFailed what="Your picks" onRetry={retry} className="mt-3" />
      ) : result ? (
        <>
          <ul className="mt-2 flex flex-col">
            {result.picks.map((p, i) => (
              <li
                key={p.id}
                style={{ animationDelay: `${i * 70}ms` }}
                className="border-t border-ap-line first:border-t-0 motion-safe:animate-mira-reply"
              >
                <Link
                  href={p.href}
                  onClick={() => track("pick_clicked", p.id)}
                  className={`group -mx-2 flex min-h-[64px] items-center gap-3 rounded-2xl px-2 py-3 transition-colors hover:bg-ap-ground ${FOCUS}`}
                >
                  {p.kind === "coach" ? (
                    <CoachPortrait coach={p.coach} size={36} />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ap-lilac font-serif text-[16px] font-semibold text-ap-violet"
                    >
                      {p.practice.number}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12px] font-semibold text-ap-violet">
                      {p.kind === "practice"
                        ? `Practice ${p.practice.number} · ${p.practice.time}`
                        : "Coach · Coming soon"}
                    </span>
                    <span className="block text-[15px] font-bold leading-snug text-ap-ink">
                      {p.kind === "practice"
                        ? p.practice.name
                        : `${p.coach.challenge}, with ${p.coach.name}`}
                    </span>
                    <span className="mt-0.5 block text-[13px] leading-snug text-ap-muted">
                      {p.reason}
                    </span>
                  </span>
                  <ChevronIcon className="shrink-0 text-ap-muted transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            ))}
          </ul>
          {result.personal ? null : state.status === "ready" && !state.data.remember ? (
            <p className="mt-3 text-[13px] leading-snug text-ap-muted">
              Picks from your chats need “Remember our conversations” on, in{" "}
              <Link
                href="/mira/settings"
                className={`font-semibold text-ap-plum underline ${FOCUS}`}
              >
                Settings
              </Link>
              .
            </p>
          ) : (
            <p className="mt-3 text-[13px] leading-snug text-ap-muted">
              As you talk with Mira, picks here follow what you talk about.
            </p>
          )}
        </>
      ) : null}
    </section>
  );
}
