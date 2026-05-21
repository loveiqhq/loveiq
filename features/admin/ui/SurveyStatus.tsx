"use client";

import { useState } from "react";
import { useAdminFetch } from "./hooks/useAdminFetch";
import ConfirmDialog from "./ConfirmDialog";
import { getCsrfToken } from "@shared/http/csrf-client";

interface SurveyStatusData {
  active: boolean;
  id?: number;
}

export default function SurveyStatus() {
  const { data, loading, error, refetch } = useAdminFetch<SurveyStatusData>(
    "/api/admin/survey-status"
  );
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingPassword, setPendingPassword] = useState("");

  function handlePasswordSubmit() {
    if (!password) {
      setPasswordError(true);
      return;
    }
    // Store password for the API call, proceed to confirm dialog
    setPendingPassword(password);
    setShowPassword(false);
    setPassword("");
    setPasswordError(false);
    setShowConfirm(true);
  }

  function handlePasswordCancel() {
    setShowPassword(false);
    setPassword("");
    setPasswordError(false);
  }

  async function toggleStatus() {
    if (!data) return;
    setShowConfirm(false);
    setActionLoading(true);
    setActionError(null);
    try {
      const isClosing = data.active;
      const res = await fetch("/api/admin/survey-status", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": getCsrfToken(),
        },
        body: JSON.stringify({
          active: !data.active,
          ...(isClosing ? { closePassword: pendingPassword } : {}),
        }),
      });
      setPendingPassword("");
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const errMsg = (body as { error?: string } | null)?.error || "Failed to update status.";
        if (errMsg.includes("password")) {
          // Password was wrong — re-show password dialog
          setPasswordError(true);
          setShowPassword(true);
          setActionLoading(false);
          return;
        }
        setActionError(errMsg);
        return;
      }
      refetch();
    } catch {
      setPendingPassword("");
      setActionError("Network error. Please try again.");
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

      {actionError && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-400">
          {actionError}
        </div>
      )}

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
          onClick={() => (data.active ? setShowPassword(true) : setShowConfirm(true))}
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

      {/* Password gate for closing survey */}
      {showPassword && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/60"
            aria-hidden="true"
            onClick={handlePasswordCancel}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4 pointer-events-none">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="password-dialog-title"
              className="pointer-events-auto w-full max-w-sm rounded-2xl border border-red-500/30 bg-surface p-6"
            >
              <h3 id="password-dialog-title" className="font-serif text-lg font-bold text-red-400">
                Authorization Required
              </h3>
              <p className="mt-2 text-sm text-text-muted">
                Closing the survey is a protected action. Enter the authorization password to
                proceed.
              </p>
              <div className="mt-4">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setPasswordError(false);
                  }}
                  onKeyDown={(e) => e.key === "Enter" && handlePasswordSubmit()}
                  className={`w-full rounded-lg border bg-white/5 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/50 focus:outline-none ${
                    passwordError
                      ? "border-red-500/50 focus:border-red-500/70"
                      : "border-white/10 focus:border-white/20"
                  }`}
                  placeholder="Enter password"
                  autoComplete="off"
                  autoFocus
                />
                {passwordError && (
                  <p className="mt-1.5 text-xs text-red-400">Incorrect password.</p>
                )}
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={handlePasswordCancel}
                  className="rounded-lg border border-white/10 px-4 py-2 text-sm text-text-muted transition hover:bg-white/5"
                >
                  Cancel
                </button>
                <button
                  onClick={handlePasswordSubmit}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700"
                >
                  Continue
                </button>
              </div>
            </div>
          </div>
        </>
      )}

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
