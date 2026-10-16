"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  defaultFilters,
  filterParams,
  filterQuery,
  parseFilters,
  periodRange,
  type ApFilters,
} from "@features/admin/server/ap/filters";
import { reportingDay } from "@shared/time/reporting-day";

/**
 * The filter bar's state lives in the URL, so a link carries it and every page reads the
 * same period. Changing one field keeps the others; a preset sets its own dates.
 */
export function useApFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const today = reportingDay(new Date());
  const filters = useMemo(() => parseFilters(searchParams, today), [searchParams, today]);

  const write = useCallback(
    (next: ApFilters) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const k of [
        "period",
        "from",
        "to",
        "compare",
        "assessment",
        "source",
        "device",
        "tier",
        "visitor",
      ])
        params.delete(k);
      for (const [k, v] of Object.entries(filterParams(next))) params.set(k, v);
      const q = params.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const update = useCallback(
    (patch: Partial<ApFilters>) => {
      const next: ApFilters = { ...filters, ...patch };
      if (patch.period && patch.period !== "custom")
        Object.assign(next, periodRange(patch.period, today));
      if ((patch.from || patch.to) && !patch.period) next.period = "custom";
      write(parseFilters(filterParams(next), today));
    },
    [filters, today, write]
  );

  const reset = useCallback(() => write(defaultFilters(today)), [today, write]);

  /** The API parameters for the current state (the server works out a preset's dates). */
  const params = useMemo(() => filterParams(filters), [filters]);

  return { filters, today, update, reset, apply: write, params, query: filterQuery(filters) };
}
