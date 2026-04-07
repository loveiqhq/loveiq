"use client";

import { useState, useEffect } from "react";
import { getCsrfToken } from "@/lib/csrf-client";

export interface ReportData {
  userName: string | null;
  primaryArchetype: string;
  percentages: Record<string, number>;
  reportDate: string;
  diagnostics: Record<string, unknown> | null;
}

type Status = "idle" | "loading" | "error" | "success";

export function useReportData(sessionId: string | null) {
  const [state, setState] = useState<{ data: ReportData | null; status: Status }>({
    data: null,
    status: "idle",
  });

  useEffect(() => {
    if (!sessionId) return;

    let cancelled = false;

    async function fetchReport() {
      try {
        const csrfToken = getCsrfToken();
        const res = await fetch(`/api/report?sessionId=${encodeURIComponent(sessionId!)}`, {
          headers: { "x-csrf-token": csrfToken },
        });

        if (cancelled) return;

        if (!res.ok) {
          setState({ data: null, status: "error" });
          return;
        }

        const json = (await res.json()) as ReportData;
        setState({ data: json, status: "success" });
      } catch {
        if (!cancelled) setState({ data: null, status: "error" });
      }
    }

    fetchReport();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // No sessionId → error; idle with sessionId → loading (fetch is pending)
  if (!sessionId) return { data: null, status: "error" as const };
  if (state.status === "idle") return { data: null, status: "loading" as const };
  return { data: state.data, status: state.status };
}
