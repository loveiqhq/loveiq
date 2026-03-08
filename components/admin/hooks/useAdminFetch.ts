"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";

interface UseAdminFetchResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useAdminFetch<T>(
  url: string,
  params?: Record<string, string>
): UseAdminFetchResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requestKey, setRequestKey] = useState(0);
  const [completedKey, setCompletedKey] = useState(-1);

  const serializedParams = useMemo(() => (params ? JSON.stringify(params) : ""), [params]);

  const refetch = useCallback(() => {
    setRequestKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const queryString = serializedParams
      ? "?" + new URLSearchParams(JSON.parse(serializedParams) as Record<string, string>).toString()
      : "";

    fetch(`${url}${queryString}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
        return res.json();
      })
      .then((json) => {
        if (!cancelled) {
          setData(json);
          setError(null);
          setCompletedKey(requestKey);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setData(null);
          setError(err instanceof Error ? err.message : "Unknown error");
          setCompletedKey(requestKey);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [url, serializedParams, requestKey]);

  const loading = completedKey < requestKey;

  return { data, loading, error, refetch };
}
