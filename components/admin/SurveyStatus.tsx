"use client";

import { useState } from "react";
import { useAdminFetch } from "./hooks/useAdminFetch";
import ConfirmDialog from "./ConfirmDialog";

interface SurveyStatusData {
  active: boolean;
  id?: number;
}

function getCsrfToken(): string {
  const cookie = document.cookie
    .split("; ")
    .find((row) => row.startsWith("__Host-csrf=") || row.startsWith("__csrf="));
  return cookie?.substring(cookie.indexOf("=") + 1) || "";
}

export default function SurveyStatus() {
  const { data, loading, error, refetch } = useAdminFetch<SurveyStatusData>(
    "/api/admin/survey-status"
  );
  const [showConfirm, setShowConfirm] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  async function toggleStatus() {
    if (!data) return;
    setShowConfirm(false);
    setActionLoading(true);
    try {
      await fetch("/api/admin/survey-status", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": getCsrfToken(),
        },
        body: JSON.stringify({ active: !data.active }),
      });
      refetch();
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-accent-purple" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6 text-center text-sm text-red-400">
        {error || "Failed to load survey status"}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="font-serif text-xl font-bold text-text-primary">Survey Status</h2>

      <div className="rounded-xl border border-white/10 bg-surface p-6">
        <div className="flex items-center gap-4">
          <div className={`h-3 w-3 rounded-full ${data.active ? "bg-green-400" : "bg-red-400"}`} />
          <div>
            <p className="font-semibold text-text-primary">
              Survey is {data.active ? "Active" : "Closed"}
            </p>
            <p className="text-sm text-text-muted">
              {data.active
                ? "Users can access and submit the survey."
                : "The survey is not accepting new submissions."}
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowConfirm(true)}
          disabled={actionLoading}
          className={`mt-6 rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-40 ${
            data.active
              ? "border border-red-500/20 text-red-400 hover:bg-red-500/10"
              : "border border-green-500/20 text-green-400 hover:bg-green-500/10"
          }`}
        >
          {data.active ? "Close Survey" : "Reopen Survey"}
        </button>
      </div>

      <ConfirmDialog
        open={showConfirm}
        title={data.active ? "Close Survey" : "Reopen Survey"}
        message={
          data.active
            ? "This will prevent new survey submissions. Existing data is preserved."
            : "This will allow new survey submissions."
        }
        confirmLabel={data.active ? "Close survey" : "Reopen survey"}
        onConfirm={toggleStatus}
        onCancel={() => setShowConfirm(false)}
      />
    </div>
  );
}
