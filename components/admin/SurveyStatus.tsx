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

      {/* Status display */}
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
      </div>

      {/* Danger zone */}
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6">
        <div className="flex items-center gap-2 mb-3">
          <svg
            className="h-5 w-5 text-red-400 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
          <h3 className="text-sm font-semibold text-red-400">Danger Zone</h3>
        </div>
        <p className="text-sm text-red-300/70 mb-4">
          {data.active
            ? "Closing the survey will immediately prevent all new submissions. Users currently filling out the survey will be unable to submit. Existing data is preserved."
            : "Reopening the survey will immediately allow new submissions from anyone with the survey link."}
        </p>
        <button
          onClick={() => setShowConfirm(true)}
          disabled={actionLoading}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-40 ${
            data.active
              ? "border border-red-500/40 text-red-400 hover:bg-red-500/20"
              : "border border-green-500/40 text-green-400 hover:bg-green-500/20"
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
            ? "This will immediately stop accepting new submissions. Users currently filling out the survey will lose their progress. This action can be reversed by reopening."
            : "This will immediately start accepting new survey submissions from anyone with the link."
        }
        confirmLabel={data.active ? "Close survey" : "Reopen survey"}
        requireTyped={data.active ? "CLOSE SURVEY" : "REOPEN SURVEY"}
        onConfirm={toggleStatus}
        onCancel={() => setShowConfirm(false)}
      />
    </div>
  );
}
