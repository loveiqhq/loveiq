"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getCsrfToken } from "@shared/http/csrf-client";
import { Mark } from "@features/admin/ui/ap/ApSidebar";

type Status = "idle" | "checking" | "error";

const ERROR_MESSAGES: Record<string, string> = {
  not_authorized: "You are not authorized to access the admin panel.",
  // An operator's one-time link that was spent or expired (app/admin/auth/callback).
  auth_failed: "That sign-in link has been used or has expired. Sign in with the password below.",
  missing_code: "That sign-in link is not valid. Sign in with the password below.",
  no_email: "That sign-in link could not be verified. Sign in with the password below.",
  idle_timeout: "You were signed out after 30 minutes without activity. Sign in again below.",
};

function getInitialError(searchParams: URLSearchParams): string {
  const errorParam = searchParams.get("error");
  if (errorParam && ERROR_MESSAGES[errorParam]) {
    return ERROR_MESSAGES[errorParam];
  }
  return "";
}

/**
 * The admin's sign-in: one password for the team, as on staging's /login (Eman, 22 Nov 2026).
 * A right password opens the page the sign-in was for (`next`, kept by the server only when it is
 * an admin page), with a full load so the proxy sees the new session.
 */
export default function AdminLoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState(() => getInitialError(searchParams));

  // The site's body is dark; the admin is AP-Analytics' light design, past the page's edges too.
  useEffect(() => {
    const before = document.body.style.background;
    document.body.style.background = "#f5f6f8";
    return () => {
      document.body.style.background = before;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setStatus("checking");
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": getCsrfToken(),
        },
        body: JSON.stringify(next ? { password, next } : { password }),
      });
      const body = (await res.json().catch(() => null)) as {
        error?: string;
        next?: string;
      } | null;
      if (res.ok && body?.next) {
        window.location.assign(body.next);
        return;
      }
      setStatus("error");
      setError(body?.error || "Something went wrong.");
    } catch {
      setStatus("error");
      setError("Something went wrong. Please try again.");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ap-ground px-4 font-sans text-ap-ink">
      <div className="w-full max-w-sm rounded-[20px] border border-ap-line bg-white p-6 shadow-ap sm:p-8">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <span className="flex items-center gap-2">
            <Mark />
            <span className="font-serif text-xl font-bold">AP-Analytics</span>
            <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-ap-label">
              Admin
            </span>
          </span>
          <p className="text-sm text-ap-muted">Admin access only</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <h1 className="sr-only">Sign in to AP-Analytics</h1>
          <label
            htmlFor="admin-password"
            className="flex flex-col gap-1 text-xs font-bold text-ap-muted"
          >
            Password
            <input
              id="admin-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter the admin password"
              required
              autoFocus
              autoComplete="current-password"
              // 16px on phones: iOS Safari zooms into a focused field under 16px, and this one
              // is focused on load, so the page opened zoomed with the card cut off.
              className="min-h-11 w-full rounded-lg border border-ap-ink/[0.18] bg-white px-3 font-sans text-base font-normal text-ap-ink placeholder:text-ap-quiet sm:text-sm"
            />
          </label>

          {error && (
            <p role="alert" className="text-sm text-ap-bad-ink">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={status === "checking"}
            className="min-h-11 w-full cursor-pointer rounded-full border-0 bg-black px-5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status === "checking" ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
