"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getCsrfToken } from "@/lib/csrf-client";

export default function StagingLoginForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/staging-login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": getCsrfToken(),
        },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        router.push("/");
      } else {
        setError("Incorrect password");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-page px-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-surface p-8 shadow-card">
        <div className="mb-8 text-center">
          <div className="mb-3 flex items-center justify-center gap-2">
            <span className="font-serif text-2xl font-semibold text-text-primary">LoveIQ</span>
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              Staging
            </span>
          </div>
          <p className="text-sm text-text-muted">Developer access only</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="staging-password" className="sr-only">
              Password
            </label>
            <input
              id="staging-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter staging password"
              required
              autoFocus
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-text-primary placeholder:text-text-muted outline-none transition focus:border-white/20 focus:ring-1 focus:ring-white/20"
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-gradient-brand py-3 text-sm font-semibold text-white shadow-pill transition hover:-translate-y-[1px] disabled:opacity-60"
          >
            {loading ? "Verifying…" : "Enter staging site"}
          </button>
        </form>
      </div>
    </div>
  );
}
