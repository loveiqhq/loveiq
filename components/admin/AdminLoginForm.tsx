"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { getCsrfToken } from "@/lib/csrf-client";
import { LoveIQMark, LoveIQWordmark } from "@/components/branding/LoveIQBrand";

type Status = "idle" | "sending" | "sent" | "error";

const ERROR_MESSAGES: Record<string, string> = {
  not_authorized: "You are not authorized to access the admin panel.",
  auth_failed: "Authentication failed. Please try again.",
  missing_code: "Invalid login link. Please request a new one.",
  no_email: "Unable to verify your email. Please try again.",
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
    <div className="flex min-h-screen items-center justify-center bg-page px-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-surface p-8 shadow-card">
        <div className="mb-8 text-center">
          <div className="mb-3 flex items-center justify-center gap-2">
            <LoveIQMark className="h-7 w-8 shrink-0" width={32} height={28} />
            <LoveIQWordmark className="text-2xl" />
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              Admin
            </span>
          </div>
          <p className="text-sm text-text-muted">Admin access only</p>
        </div>

        {status === "sent" ? (
          <div className="text-center">
            <div className="mb-4 text-3xl">&#9993;</div>
            <h2 className="mb-2 text-lg font-semibold text-text-primary">Check your email</h2>
            <p className="mb-6 text-sm text-text-muted">
              If your email is registered, we sent a magic link to{" "}
              <span className="font-medium text-text-primary">{email}</span>. Click the link to sign
              in.
            </p>
            <button
              type="button"
              onClick={() => {
                setStatus("idle");
                setEmail("");
              }}
              className="text-sm text-accent-purple transition hover:text-accent-purple/80"
            >
              Try a different email
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="admin-email" className="sr-only">
                Email
              </label>
              <input
                id="admin-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                required
                autoFocus
                autoComplete="email"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-text-primary placeholder:text-text-muted outline-none transition focus:border-white/20 focus:ring-1 focus:ring-white/20"
              />
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}

            <button
              type="submit"
              disabled={status === "sending"}
              className="w-full rounded-full bg-gradient-brand py-3 text-sm font-semibold text-white shadow-pill transition hover:-translate-y-[1px] disabled:opacity-60"
            >
              {status === "sending" ? "Sending..." : "Send magic link"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
