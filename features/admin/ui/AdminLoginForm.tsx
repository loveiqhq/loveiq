"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getCsrfToken } from "@shared/http/csrf-client";
import { Mark } from "@features/admin/ui/ap/ApSidebar";

type Status = "idle" | "sending" | "sent" | "error";

const ERROR_MESSAGES: Record<string, string> = {
  not_authorized: "You are not authorized to access the admin panel.",
  auth_failed:
    "That link has already been used or has expired. Sign-in links work once only — request a new one below and open it in this same browser.",
  missing_code: "Invalid login link. Please request a new one.",
  no_email: "Unable to verify your email. Please try again.",
  idle_timeout: "You were signed out after 30 minutes without activity. Sign in again below.",
};

function getInitialError(searchParams: URLSearchParams): string {
  const errorParam = searchParams.get("error");
  if (errorParam && ERROR_MESSAGES[errorParam]) {
    return ERROR_MESSAGES[errorParam];
  }
  return "";
}

export default function AdminLoginForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
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
    setStatus("sending");

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": getCsrfToken(),
        },
        body: JSON.stringify({ email }),
      });

      const body = await res.json().catch(() => null);

      if (res.ok) {
        setStatus("sent");
      } else {
        setStatus("error");
        setError((body as { error?: string } | null)?.error || "Something went wrong.");
      }
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

        {status === "sent" ? (
          <div className="flex flex-col items-center gap-3 text-center">
            <h1 className="font-serif text-xl font-bold">Check your email</h1>
            <p className="text-sm text-ap-body">
              If your email is registered, we sent a magic link to{" "}
              <span className="font-bold text-ap-ink">{email}</span>. Click the link to sign in.
            </p>
            <button
              type="button"
              onClick={() => {
                setStatus("idle");
                setEmail("");
              }}
              className="min-h-11 cursor-pointer text-sm font-bold text-ap-plum underline-offset-2 hover:underline"
            >
              Try a different email
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <h1 className="sr-only">Sign in to AP-Analytics</h1>
            <label
              htmlFor="admin-email"
              className="flex flex-col gap-1 text-xs font-bold text-ap-muted"
            >
              Email
              <input
                id="admin-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                required
                autoFocus
                autoComplete="email"
                className="min-h-11 w-full rounded-lg border border-ap-ink/[0.18] bg-white px-3 font-sans text-sm font-normal text-ap-ink placeholder:text-ap-quiet"
              />
            </label>

            {error && (
              <p role="alert" className="text-sm text-ap-bad-ink">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={status === "sending"}
              className="min-h-11 w-full cursor-pointer rounded-full border-0 bg-black px-5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {status === "sending" ? "Sending..." : "Send magic link"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
