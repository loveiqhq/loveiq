"use client";

import { useState, useEffect, useCallback, useMemo } from "react";

interface UseAdminFetchResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useAdminFetch<T>(
  url: string,
  params?: Record<string, string>,
  enabled = true
): UseAdminFetchResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [requestKey, setRequestKey] = useState(0);

  const serializedParams = useMemo(() => (params ? JSON.stringify(params) : ""), [params]);

  const refetch = useCallback(() => {
    setLoading(true);
    setRequestKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading must be set synchronously before async fetch
    setLoading(true);

    const queryString = serializedParams
      ? "?" + new URLSearchParams(JSON.parse(serializedParams) as Record<string, string>).toString()
      : "";

    fetch(`${url}${queryString}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(
            (body as { error?: string } | null)?.error || `Request failed: ${res.status}`
          );
        }
        return res.json();
      })
      .then((json) => {
        if (!cancelled) {
          setData(json);
          setError(null);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setData(null);
          setError(err instanceof Error ? err.message : "Unknown error");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [url, serializedParams, requestKey, enabled]);

  return { data, loading, error, refetch };
}
