"use client";

import { useEffect, useState } from "react";
import { getCsrfToken } from "@/lib/csrf-client";
import { finalizeReportSession } from "@/components/survey/hooks/surveySession";

export interface ReportData {
  userName: string | null;
  primaryArchetype: string;
  percentages: Record<string, number>;
  reportDate: string;
  diagnostics: Record<string, unknown> | null;
  snapshotAnswers: {
    currentSexualSatisfaction: number | null;
  };
}

export interface ReportRequestError {
  statusCode: number | null;
  message: string | null;
}

type Status = "idle" | "loading" | "error" | "success" | "missing";

interface ReportIdentifier {
  sessionId?: string | null;
  token?: string | null;
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
  const { sessionId, token } = identifier;
  const hasIdentifier = !!(sessionId || token);

  const [state, setState] = useState<{
    data: ReportData | null;
    status: Status;
    error: ReportRequestError | null;
  }>({
    data: null,
    status: "idle",
    error: null,
  });

  useEffect(() => {
    if (!hasIdentifier) return;

    let cancelled = false;

    async function fetchReport() {
      setState({ data: null, status: "loading", error: null });

      try {
        const csrfToken = getCsrfToken();
        const param = token
          ? `token=${encodeURIComponent(token)}`
          : `sessionId=${encodeURIComponent(sessionId!)}`;

        const res = await fetch(`/api/report?${param}`, {
          headers: { "x-csrf-token": csrfToken },
        });

        if (cancelled) return;

        if (!res.ok) {
          const error = await parseErrorResponse(res);
          setState({ data: null, status: "error", error });
          return;
        }

        const json = (await res.json()) as ReportData;
        if (sessionId) finalizeReportSession(sessionId);
        setState({ data: json, status: "success", error: null });
      } catch {
        if (!cancelled) {
          setState({
            data: null,
            status: "error",
            error: { statusCode: null, message: null },
          });
        }
      }
    }

    void fetchReport();
    return () => {
      cancelled = true;
    };
  }, [sessionId, token, hasIdentifier]);

  if (!hasIdentifier) {
    return { data: null, status: "missing" as const, error: null };
  }

  if (state.status === "idle") {
    return { data: null, status: "loading" as const, error: null };
  }

  return { data: state.data, status: state.status, error: state.error };
}
