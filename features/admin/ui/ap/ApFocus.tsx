"use client";

import type { FocusPayload } from "@features/admin/server/ap/focus";
import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";

import ApFilterBar from "./ApFilterBar";
import { Busy, Failed, Loading, PageHeader, RangeLine } from "./kit";
import { useApFilters } from "./useApFilters";

/** Dashboard: being built to Marcus's artboard of 16 Oct 2026. */
export default function ApFocus() {
  const { params } = useApFilters();
  const { data, loading, error, refetch } = useAdminFetch<FocusPayload>(
    "/api/admin/ap/focus",
    params
  );
  return (
    <>
      <PageHeader
        crumbs={["Reports", "Dashboard"]}
        title="Dashboard"
        description="The few numbers that decide whether LoveIQ works."
      />
      <ApFilterBar />
      {loading && !data && <Loading label="the dashboard" />}
      {error && <Failed message={error} onRetry={refetch} />}
      {data && (
        <Busy busy={loading}>
          <RangeLine data={data} />
        </Busy>
      )}
    </>
  );
}
