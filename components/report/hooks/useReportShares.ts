"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getCsrfToken } from "@/lib/csrf-client";

interface ReportShareItem {
  id: number;
  recipientEmail: string;
  createdAt: string;
  lastViewedAt: string | null;
}

interface ReportSharesState {
  plan: "essentials" | "full_report" | "all_reports" | null;
  seatLimit: number;
  seatsUsed: number;
  shares: ReportShareItem[];
}

interface UseReportSharesResult extends ReportSharesState {
  loading: boolean;
  submitting: boolean;
  error: string | null;
  add: (
    recipientEmail: string,
    personalMessage?: string | null
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  revoke: (shareId: number) => Promise<{ ok: true } | { ok: false; error: string }>;
  refresh: () => Promise<void>;
}

const INITIAL: ReportSharesState = {
  plan: null,
  seatLimit: 0,
  seatsUsed: 0,
  shares: [],
};

const SEAT_LIMIT_BY_PLAN: Record<NonNullable<ReportSharesState["plan"]>, number> = {
  essentials: 1,
  full_report: 2,
  all_reports: 2,
};

async function parseErrorMessage(res: Response, fallback: string) {
  try {
    const json = (await res.json()) as { error?: unknown };
    if (typeof json.error === "string") return json.error;
  } catch {
    // ignore
  }
  return fallback;
}

export function useReportShares(
  ownerToken: string | null | undefined,
  initialPlan?: ReportSharesState["plan"]
): UseReportSharesResult {
  const [state, setState] = useState<ReportSharesState>(() => {
    if (!initialPlan) return INITIAL;
    return {
      plan: initialPlan,
      seatLimit: SEAT_LIMIT_BY_PLAN[initialPlan] ?? 0,
      seatsUsed: 0,
      shares: [],
    };
  });
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    if (!ownerToken) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/report/share?ownerToken=${encodeURIComponent(ownerToken)}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!res.ok) {
        setError(await parseErrorMessage(res, "Unable to load sharing details."));
        return;
      }
      const json = (await res.json()) as ReportSharesState;
      if (!controller.signal.aborted) {
        setState({
          plan: json.plan ?? null,
          seatLimit: json.seatLimit ?? 0,
          seatsUsed: json.seatsUsed ?? 0,
          shares: Array.isArray(json.shares) ? json.shares : [],
        });
      }
    } catch (err) {
      if ((err as { name?: string }).name !== "AbortError") {
        setError("Network error — please try again.");
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [ownerToken]);

  useEffect(() => {
    void refresh();
    return () => abortRef.current?.abort();
  }, [refresh]);

  const add = useCallback<UseReportSharesResult["add"]>(
    async (recipientEmail, personalMessage) => {
      if (!ownerToken) return { ok: false, error: "Missing report context." };
      setSubmitting(true);
      setError(null);
      try {
        const res = await fetch("/api/report/share", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-csrf-token": getCsrfToken(),
          },
          body: JSON.stringify({
            ownerToken,
            recipientEmail,
            personalMessage: personalMessage ?? null,
          }),
        });
        if (!res.ok) {
          const message = await parseErrorMessage(res, "Unable to share right now.");
          setError(message);
          return { ok: false, error: message };
        }
        await refresh();
        return { ok: true };
      } catch {
        const message = "Network error — please try again.";
        setError(message);
        return { ok: false, error: message };
      } finally {
        setSubmitting(false);
      }
    },
    [ownerToken, refresh]
  );

  const revoke = useCallback<UseReportSharesResult["revoke"]>(
    async (shareId) => {
      if (!ownerToken) return { ok: false, error: "Missing report context." };
      setSubmitting(true);
      setError(null);
      try {
        const res = await fetch(`/api/report/share/${shareId}`, {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            "x-csrf-token": getCsrfToken(),
          },
          body: JSON.stringify({ ownerToken }),
        });
        if (!res.ok) {
          const message = await parseErrorMessage(res, "Unable to revoke share.");
          setError(message);
          return { ok: false, error: message };
        }
        await refresh();
        return { ok: true };
      } catch {
        const message = "Network error — please try again.";
        setError(message);
        return { ok: false, error: message };
      } finally {
        setSubmitting(false);
      }
    },
    [ownerToken, refresh]
  );

  return {
    ...state,
    loading,
    submitting,
    error,
    add,
    revoke,
    refresh,
  };
}
