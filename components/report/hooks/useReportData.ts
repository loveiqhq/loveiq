"use client";

import { useEffect, useState } from "react";
import { getCsrfToken } from "@/lib/csrf-client";

export interface ReportData {
  userName: string | null;
  primaryArchetype: string;
  percentages: Record<string, number>;
  reportDate: string;
  diagnostics: Record<string, unknown> | null;
}

export interface ReportRequestError {
  statusCode: number | null;
  message: string | null;
}

type Status = "idle" | "loading" | "error" | "success" | "missing";

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

export function useReportData(sessionId: string | null) {
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
    if (!sessionId) return;

    const activeSessionId = sessionId;
    let cancelled = false;

    async function fetchReport() {
      setState({ data: null, status: "loading", error: null });

      try {
        const csrfToken = getCsrfToken();
        const res = await fetch(`/api/report?sessionId=${encodeURIComponent(activeSessionId)}`, {
          headers: { "x-csrf-token": csrfToken },
        });

        if (cancelled) return;

        if (!res.ok) {
          const error = await parseErrorResponse(res);
          setState({ data: null, status: "error", error });
          return;
        }

        const json = (await res.json()) as ReportData;
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
  }, [sessionId]);

  if (!sessionId) {
    return { data: null, status: "missing" as const, error: null };
  }

  if (state.status === "idle") {
    return { data: null, status: "loading" as const, error: null };
  }

  return { data: state.data, status: state.status, error: state.error };
}
