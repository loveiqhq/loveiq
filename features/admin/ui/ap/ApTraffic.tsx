"use client";

import type { TrafficPayload } from "@features/admin/server/ap/traffic";
import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";

import ApFilterBar from "./ApFilterBar";
import { Busy, Failed, Loading, PageHeader, RangeLine } from "./kit";
import { useApFilters } from "./useApFilters";

/** Traffic: being built to Marcus's artboard of 16 Oct 2026. */
export default function ApTraffic() {
  const { params } = useApFilters();
  const { data, loading, error, refetch } = useAdminFetch<TrafficPayload>(
    "/api/admin/ap/traffic",
    params
  );
  return (
    <>
      <PageHeader
        crumbs={["Assessments", "Assessment A", "Traffic"]}
        title="Traffic"
        description="Which sources bring people who finish the survey, unlock, read and come back, and what each of them costs."
      />
      <ApFilterBar />
      {loading && !data && <Loading label="the traffic page" />}
      {error && <Failed message={error} onRetry={refetch} />}
      {data && (
        <Busy busy={loading}>
          <RangeLine data={data} />
        </Busy>
      )}
    </>
  );
}
