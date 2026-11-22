"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SUPPORT_NOTE, bandOf, type Check, type CheckId } from "@features/mira/content/checks";
import { miraApi } from "../api";

/** The menu tab these pages mark (MiraAppFrame). */
export const FRAME_TAB = "assessments" as const;

/** What GET /api/mira/checks answers (app/api/mira/checks/route.ts). */
export type CheckResult = {
  at: string;
  score: number;
  band: string;
  /** The mood check's question 9 above "Not at all": its support goes wherever the result does. */
  support: boolean;
};
export type CheckSummary = { id: CheckId; results: CheckResult[]; nextAt: string | null };
export type ChecksData = {
  account: string;
  email: string;
  name: string | null;
  useChecks: boolean;
  useAssessment: boolean;
  /** The support panel's first country (SupportPanel `highlight`). */
  support: string;
  checks: CheckSummary[];
  /** The body check's dates; `nextAt`: when the four-week check opens, after the first only. */
  bodyCheck: { taken: string[]; due: "baseline" | "week4" | null; nextAt: string | null } | null;
  assessment: { archetype: string; takenAt: string; reportPath: string | null } | null;
};

/**
 * The person's checks, loaded once per page; signed out goes to sign-in and back here. Someone
 * Mira stopped as under 18 gets the server's message (403) and nothing else.
 */
export function useChecks() {
  const router = useRouter();
  const [data, setData] = useState<ChecksData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void miraApi<ChecksData>("/api/mira/checks").then((r) => {
      if (r.status === 401) {
        router.replace(`/mira/start?next=${encodeURIComponent(window.location.pathname)}`);
      } else if (r.ok) setData(r.data);
      else setError(r.data.error ?? "Unable to load your checks.");
    });
  }, [router]);
  return { data, error, setData };
}

/**
 * A check started and not finished: its answers so far, in this tab only (sessionStorage), so a
 * reload, a call or a trip to the chat picks up where it stopped, and nothing is left on a shared
 * device once the tab closes. Keyed by account, and dropped after a day (the questions ask about
 * the last two weeks).
 */
type Draft = { answers: number[]; at: number };
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
const draftKey = (account: string, check: CheckId) => `mira.check.v1:${account}:${check}`;

export const drafts = {
  read(account: string, check: CheckId): number[] | null {
    try {
      const d = JSON.parse(
        window.sessionStorage.getItem(draftKey(account, check)) ?? "null"
      ) as Draft | null;
      const fresh = d && typeof d.at === "number" && Date.now() - d.at < DRAFT_TTL_MS;
      return fresh && Array.isArray(d.answers) && d.answers.every(Number.isInteger)
        ? d.answers
        : null;
    } catch {
      return null;
    }
  },
  save(account: string, check: CheckId, answers: number[]): void {
    try {
      window.sessionStorage.setItem(
        draftKey(account, check),
        JSON.stringify({ answers, at: Date.now() } satisfies Draft)
      );
    } catch {
      // Private mode or blocked storage: the check still works, it just can't be resumed.
    }
  },
  clear(account: string, check: CheckId): void {
    try {
      window.sessionStorage.removeItem(draftKey(account, check));
    } catch {
      // As above.
    }
  },
};

/** "21 Nov", or "21 Nov 2025" outside this year. */
export function shortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    ...(d.getFullYear() === new Date().getFullYear() ? {} : { year: "numeric" }),
  });
}

/** A result's band as a card or the history shows it, never without the support question 9 opened. */
export const bandText = (check: Check, r: CheckResult): string =>
  `${bandOf(check, r.score).label}${r.support ? ` · ${SUPPORT_NOTE}` : ""}`;

/** A check as a card shows it: never taken, part done in this tab, taken (open again later), or open again. */
export type CheckState =
  | { kind: "new" }
  | { kind: "draft"; answered: number }
  | { kind: "taken"; last: CheckResult; nextAt: string }
  | { kind: "due"; last: CheckResult };

export function stateOf(summary: CheckSummary, draft: number[] | null): CheckState {
  if (draft?.length) return { kind: "draft", answered: draft.length };
  const last = summary.results.at(-1);
  if (!last) return { kind: "new" };
  return summary.nextAt ? { kind: "taken", last, nextAt: summary.nextAt } : { kind: "due", last };
}

/** A check's line on a card: where the person is with it, and what its link does. */
export function checkLine(check: Check, state: CheckState): { status: string; action: string } {
  const n = check.items.length;
  switch (state.kind) {
    case "new":
      return { status: `Not taken yet · ${check.minutes} min`, action: "Take it" };
    case "draft":
      return {
        status: `In progress · question ${Math.min(state.answered + 1, n)} of ${n}`,
        action: "Continue",
      };
    case "taken":
      return {
        status: `${bandText(check, state.last)} · ${shortDate(state.last.at)}`,
        action: "View",
      };
    case "due":
      return {
        status: `${bandText(check, state.last)} · ${shortDate(state.last.at)} · ready to retake`,
        action: "Retake",
      };
  }
}

/** The body check's line: due, waiting for its four-week check, or done; null when unread. */
export function bodyLine(
  body: ChecksData["bodyCheck"]
): { status: string; action: string | null } | null {
  if (!body) return null;
  if (body.due === "baseline") return { status: "Not taken yet · 2 min", action: "Take it" };
  if (body.due === "week4") return { status: "Your four-week check is ready", action: "Take it" };
  if (body.nextAt) {
    return {
      status: `Taken ${shortDate(body.taken[0]!)} · next on ${shortDate(body.nextAt)}`,
      action: null,
    };
  }
  return { status: `Done · ${shortDate(body.taken.at(-1)!)}`, action: null };
}

/** This tab's unfinished checks for the account, read after mount (sessionStorage). */
export function useDrafts(account: string | undefined, ids: readonly CheckId[]) {
  const [found, setFound] = useState<Partial<Record<CheckId, number[] | null>>>({});
  useEffect(() => {
    if (!account) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage exists after mount
    setFound(Object.fromEntries(ids.map((id) => [id, drafts.read(account, id)])));
  }, [account, ids]);
  return found;
}
