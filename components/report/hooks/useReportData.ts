"use client";

import { useEffect, useState } from "react";
import { getCsrfToken } from "@/lib/csrf-client";
import {
  finalizeReportSession,
  getReportPricingSessionId,
} from "@/components/survey/hooks/surveySession";
import type { ReportPriceQuoteSnapshot } from "@/lib/pricing/reportPricing";
import type { ReportPurchasePlanId } from "@/lib/checkout/reportPurchase";

export interface ReportPracticeTendencyRowData {
  practice: string;
  // Server nulls these on locked rows past index 0 — names tease, numbers stay
  // server-stripped. See `lib/report/contentGating.ts`.
  fantasyPull: number | null;
  actualPleasure: number | null;
  description: string | null;
}

export interface ReportPracticeTendencyGroupForUser {
  title: string;
  rows: ReportPracticeTendencyRowData[];
  totalRowCount: number;
}

export interface ReportPracticeTendencyContentForUser {
  introBlocks: string[];
  groups: ReportPracticeTendencyGroupForUser[];
}

export interface ReportData {
  accessPlan: "essentials" | "full_report" | "all_reports" | null;
  userName: string | null;
  userEmail: string | null;
  ownerFirstName?: string | null;
  ownerToken?: string | null;
  viewMode?: "owner" | "shared";
  primaryArchetype: string;
  percentages: Record<string, number>;
  reportDate: string;
  diagnostics: Record<string, unknown> | null;
  snapshotAnswers: {
    currentSexualSatisfaction: number | null;
    importanceOfSex: number | null;
  } | null;
  pricingQuotes: Record<ReportPurchasePlanId, ReportPriceQuoteSnapshot> | null;
  unlockedArchetypes: string[];
  /**
   * Archetype prose, server-filtered to only include (blockId, archetypeName)
   * pairs the user has paid access to. The previous design imported the whole
   * static map into the client bundle — anyone could read every archetype's
   * premium copy via DevTools regardless of their plan.
   */
  archetypeContent: Record<string, Record<string, string>>;
  /**
   * Practice tendency content, server-filtered. When the practice section is
   * locked we ship only the free-preview row plus the total row count so the
   * locked-state placeholders render correctly without leaking premium scores.
   */
  practiceTendencies: Record<string, ReportPracticeTendencyContentForUser>;
}

export interface ReportRequestError {
  statusCode: number | null;
  message: string | null;
}

export interface ShareVerificationChallenge {
  recipientEmailHint: string | null;
  ownerFirstName: string | null;
}

type Status = "idle" | "loading" | "error" | "success" | "missing" | "needs_verification";

interface ReportIdentifier {
  sessionId?: string | null;
  token?: string | null;
  /**
   * Optional override for the pricing session id — threaded from the offer
   * email CTA (?pricingSessionId=...). When provided it takes precedence over
   * the per-report session id read from local storage so the recipient lands
   * on exactly the locked quote the email was built against.
   */
  pricingSessionIdOverride?: string | null;
}

async function parseErrorResponse(res: Response): Promise<ReportRequestError> {
  try {
    const json = (await res.json()) as { error?: unknown };
    return {
      statusCode: res.status,
      message: typeof json.error === "string" ? json.error : null,
    };
  } catch {
    return {
      statusCode: res.status,
      message: null,
    };
  }
}

export function useReportData(identifier: ReportIdentifier) {
  const { sessionId, token, pricingSessionIdOverride } = identifier;
  const hasIdentifier = !!(sessionId || token);

  const [state, setState] = useState<{
    data: ReportData | null;
    status: Status;
    error: ReportRequestError | null;
    challenge: ShareVerificationChallenge | null;
    refreshKey: number;
  }>({
    data: null,
    status: "idle",
    error: null,
    challenge: null,
    refreshKey: 0,
  });

  useEffect(() => {
    if (!hasIdentifier) return;

    let cancelled = false;

    async function fetchReport() {
      setState((prev) => ({
        ...prev,
        data: null,
        status: "loading",
        error: null,
        challenge: null,
      }));

      try {
        const csrfToken = getCsrfToken();
        const params = new URLSearchParams(token ? { token } : { sessionId: sessionId ?? "" });
        const pricingSessionId =
          pricingSessionIdOverride ?? getReportPricingSessionId({ sessionId, token });
        if (pricingSessionId) {
          params.set("pricingSessionId", pricingSessionId);
        }

        const res = await fetch(`/api/report?${params.toString()}`, {
          headers: { "x-csrf-token": csrfToken },
          cache: "no-store",
        });

        if (cancelled) return;

        if (res.status === 401) {
          // Shared-report viewer hasn't passed the email-verification gate yet.
          try {
            const json = (await res.json()) as {
              needsVerification?: boolean;
              recipientEmailHint?: string | null;
              ownerFirstName?: string | null;
            };
            if (json.needsVerification) {
              setState((prev) => ({
                data: null,
                status: "needs_verification",
                error: null,
                challenge: {
                  recipientEmailHint: json.recipientEmailHint ?? null,
                  ownerFirstName: json.ownerFirstName ?? null,
                },
                refreshKey: prev.refreshKey,
              }));
              return;
            }
          } catch {
            // Fall through to generic error handling below.
          }
        }

        if (!res.ok) {
          const error = await parseErrorResponse(res);
          setState((prev) => ({
            ...prev,
            data: null,
            status: "error",
            error,
            challenge: null,
          }));
          return;
        }

        const json = (await res.json()) as ReportData;
        if (sessionId) finalizeReportSession(sessionId);
        setState((prev) => ({
          ...prev,
          data: json,
          status: "success",
          error: null,
          challenge: null,
        }));
      } catch {
        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            data: null,
            status: "error",
            error: { statusCode: null, message: null },
            challenge: null,
          }));
        }
      }
    }

    void fetchReport();
    return () => {
      cancelled = true;
    };
  }, [sessionId, token, hasIdentifier, pricingSessionIdOverride, state.refreshKey]);

  const retry = () => setState((prev) => ({ ...prev, refreshKey: prev.refreshKey + 1 }));

  if (!hasIdentifier) {
    return {
      data: null,
      status: "missing" as const,
      error: null,
      challenge: null,
      retry,
    };
  }

  if (state.status === "idle") {
    return {
      data: null,
      status: "loading" as const,
      error: null,
      challenge: null,
      retry,
    };
  }

  return {
    data: state.data,
    status: state.status,
    error: state.error,
    challenge: state.challenge,
    retry,
  };
}
