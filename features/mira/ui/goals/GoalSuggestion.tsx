"use client";

import Link from "next/link";
import { useState } from "react";
import { miraApi } from "../api";
import { ANSWER_CHIP } from "../IntakeAnswers";
import { CheckDot, FOCUS, PlusIcon, TargetIcon } from "./parts";

/** The chat link behind "Ask Mira to help" on an empty goals card: the starter waits, unsent. */
export const ASK_MIRA_FOR_A_GOAL = "/mira?prompt=goal";
export const GOAL_STARTER = "Could you help me find a first small goal for this week?";

/**
 * "Add as a goal" under a reply of Mira's that offers one ([[GOAL:…]], safety.ts). Signed in:
 * one tap saves it, marked as Mira's suggestion, then "Added". Signed out: goals live in the
 * free account, so the tap explains that and leads to the usual sign-up. A reopened chat shows
 * it again (the offer is kept with the reply), as "Added" when the goals already hold it.
 */
export function GoalSuggestion({
  text,
  signedIn,
  added = false,
}: {
  text: string;
  signedIn: boolean;
  added?: boolean;
}) {
  const [state, setState] = useState<"offer" | "saving" | "added" | "account">(
    added ? "added" : "offer"
  );
  const [error, setError] = useState<string | null>(null);

  async function add() {
    if (!signedIn) return setState("account");
    setState("saving");
    setError(null);
    const r = await miraApi("/api/mira/goals", { body: { text, via: "mira" } });
    if (r.ok) return setState("added");
    setState("offer");
    setError(r.data.error ?? "That didn't save. Please try again.");
  }

  return (
    <div className="flex flex-col gap-3 rounded-[20px] border border-ap-line bg-white/90 p-4 motion-safe:animate-mira-reply sm:max-w-[88%]">
      <p className="flex items-start gap-2.5 text-[15px] leading-snug text-ap-ink">
        <span className="mt-px text-ap-purple">
          <TargetIcon />
        </span>
        <span>
          <span className="sr-only">A goal Mira suggests: </span>
          {text}
        </span>
      </p>
      {state === "added" ? (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] font-semibold text-ap-ink">
          <CheckDot done pop />
          Added to your goals
          <Link
            href="/mira/goals"
            className={`inline-flex min-h-[44px] items-center px-1 font-semibold text-ap-plum underline underline-offset-4 ${FOCUS}`}
          >
            See your goals
          </Link>
        </p>
      ) : state === "account" ? (
        <div className="flex flex-col gap-3 motion-safe:animate-mira-in sm:flex-row sm:items-center sm:gap-4">
          <p className="flex-1 text-[14px] leading-normal text-ap-body">
            Goals live in your free account, so Mira can check in on them with you.
          </p>
          <Link
            href="/mira/start"
            className={`inline-flex min-h-[44px] items-center justify-center whitespace-nowrap rounded-full bg-ap-ink px-5 text-[14px] font-bold text-white ${FOCUS}`}
          >
            Create free account
          </Link>
        </div>
      ) : (
        <div>
          <button
            type="button"
            onClick={() => void add()}
            disabled={state === "saving"}
            className={`${ANSWER_CHIP} inline-flex min-h-[44px] items-center gap-1.5 font-semibold text-ap-ink disabled:opacity-60 ${FOCUS}`}
          >
            <PlusIcon />
            {state === "saving" ? "Adding…" : "Add as a goal"}
          </button>
        </div>
      )}
      {error ? (
        <p role="alert" className="text-[13px] text-ap-bad-ink">
          {error}{" "}
          <Link href="/mira/goals" className="font-semibold underline">
            Your goals
          </Link>
        </p>
      ) : null}
    </div>
  );
}
