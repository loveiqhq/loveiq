"use client";

import type { PaymentPayload } from "@features/admin/server/ap/payment";
import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";

import ApFilterBar from "./ApFilterBar";
import { Busy, Failed, Loading, PageHeader, RangeLine } from "./kit";
import { useApFilters } from "./useApFilters";

/** Payment: being built to Marcus's artboard of 16 Oct 2026. */
export default function ApPayment() {
  const { params } = useApFilters();
  const { data, loading, error, refetch } = useAdminFetch<PaymentPayload>(
    "/api/admin/ap/payment",
    params
  );
  return (
    <>
      <PageHeader
        crumbs={["Assessments", "Assessment A", "Payment"]}
        title="Payment"
        description="Who pays, how, at what price, and what each pricing test did to conversion and revenue."
      />
      <ApFilterBar />
      {loading && !data && <Loading label="the payment page" />}
      {error && <Failed message={error} onRetry={refetch} />}
      {data && (
        <Busy busy={loading}>
          <RangeLine data={data} />
        </Busy>
      )}
    </>
  );
}
