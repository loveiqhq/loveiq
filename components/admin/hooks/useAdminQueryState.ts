"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type QueryUpdateValue = string | number | null | undefined;

export function useAdminQueryState() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const setQueryState = useCallback(
    (updates: Record<string, QueryUpdateValue>) => {
      const nextParams = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value == null || value === "") {
          nextParams.delete(key);
          continue;
        }
        nextParams.set(key, String(value));
      }
      const query = nextParams.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  return { searchParams, setQueryState };
}
