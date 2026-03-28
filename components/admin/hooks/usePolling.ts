"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAdminFetch } from "./useAdminFetch";

/**
 * Wraps useAdminFetch with auto-refresh polling.
 * Pause/resume supported. Data accumulates across polls when `accumulate` is true.
 */
export function usePolling<T>(
  url: string,
  params: Record<string, string>,
  intervalMs: number = 10_000
) {
  const { data, loading, error, refetch } = useAdminFetch<T>(url, params);
  const [paused, setPaused] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const togglePause = useCallback(() => setPaused((p) => !p), []);

  useEffect(() => {
    if (paused) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      refetch();
    }, intervalMs);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [paused, intervalMs, refetch]);

  return { data, loading, error, paused, togglePause, refetch };
}
