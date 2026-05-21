"use client";

import { useState, useMemo } from "react";
import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";
import Pagination from "@features/admin/ui/Pagination";

interface Transaction {
  id: number;
  amount: number;
  currency: string;
  status: string;
  card_brand: string | null;
  card_last4: string | null;
  payment_date_time: string;
  failure_code: string | null;
}

interface TransactionsData {
  transactions: Transaction[];
  total: number;
  page: number;
  pageSize: number;
}

const statusColors: Record<string, string> = {
  succeeded: "bg-emerald-500/20 text-emerald-400",
  failed: "bg-red-500/20 text-red-400",
  refunded: "bg-yellow-500/20 text-yellow-400",
  processing: "bg-blue-500/20 text-blue-400",
  canceled: "bg-gray-500/20 text-gray-400",
};

export default function TransactionsTab({ days }: { days: number }) {
  const [page, setPage] = useState(1);

  const params = useMemo(() => {
    const p: Record<string, string> = { page: String(page) };
    if (days > 0) p.days = String(days);
    return p;
  }, [page, days]);

  const { data, loading, error } = useAdminFetch<TransactionsData>(
    "/api/admin/revenue/transactions",
    params
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-accent-purple" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-center text-sm text-red-400">
        {error || "Failed to load transactions."}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border border-white/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 bg-white/5">
              <th className="px-3 py-2.5 text-left font-medium text-text-muted">Date</th>
              <th className="px-3 py-2.5 text-right font-medium text-text-muted">Amount</th>
              <th className="px-3 py-2.5 text-left font-medium text-text-muted">Status</th>
              <th className="px-3 py-2.5 text-left font-medium text-text-muted">Card</th>
              <th className="px-3 py-2.5 text-left font-medium text-text-muted">Failure</th>
            </tr>
          </thead>
          <tbody>
            {data.transactions.map((t) => (
              <tr key={t.id} className="border-b border-white/5 transition hover:bg-white/5">
                <td className="whitespace-nowrap px-3 py-2 text-text-primary">
                  {t.payment_date_time ? new Date(t.payment_date_time).toLocaleDateString() : "—"}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right text-text-primary">
                  ${(t.amount || 0).toFixed(2)}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[t.status] || "bg-white/10 text-text-muted"}`}
                  >
                    {t.status}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-text-muted">
                  {t.card_brand ? `${t.card_brand} •••• ${t.card_last4}` : "—"}
                </td>
                <td className="px-3 py-2 text-text-muted">{t.failure_code || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination
        page={data.page}
        limit={data.pageSize}
        total={data.total}
        onPageChange={setPage}
      />
    </div>
  );
}
