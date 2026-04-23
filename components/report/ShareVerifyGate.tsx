"use client";

import { useState, type FC, type FormEvent } from "react";
import { getCsrfToken } from "@/lib/csrf-client";

interface Props {
  shareToken: string;
  ownerFirstName: string | null;
  recipientEmailHint: string | null;
  onVerified: () => void;
}

const ShareVerifyGate: FC<Props> = ({
  shareToken,
  ownerFirstName,
  recipientEmailHint,
  onVerified,
}) => {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ownerName = ownerFirstName?.trim() || "Someone";
  const hint = recipientEmailHint || "the email address that received the invite";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/report/share/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": getCsrfToken(),
        },
        body: JSON.stringify({ shareToken, email: trimmed }),
      });
      if (res.ok) {
        onVerified();
        return;
      }
      if (res.status === 429) {
        setError("Too many attempts. Try again in a minute.");
        return;
      }
      if (res.status === 404) {
        setError("This shared report is no longer available.");
        return;
      }
      try {
        const json = (await res.json()) as { error?: string };
        setError(json.error || "That email doesn't match this invite.");
      } catch {
        setError("That email doesn't match this invite.");
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="report-status-screen">
      <div className="report-status-card report-card report-share-verify">
        <div className="report-share-verify__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <rect x="3" y="6" width="18" height="13" rx="2" />
            <path d="m4 7 8 6 8-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <p className="report-overline">Private invite</p>
        <h1 className="report-status-card__title">Verify your email to continue</h1>
        <p className="report-status-card__copy">
          <strong>{ownerName}</strong> shared their LoveIQ report with{" "}
          <span className="report-share-verify__hint">{hint}</span>.
          <br />
          Enter that email to open it.
        </p>
        <form className="report-share-verify__form" onSubmit={handleSubmit} noValidate>
          <label className="report-share-verify__label" htmlFor="report-share-verify-email">
            Your email address
          </label>
          <input
            id="report-share-verify-email"
            name="email"
            type="email"
            className="report-share-verify__input"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="email"
            autoFocus
            disabled={submitting}
            aria-describedby={error ? "report-share-verify-error" : undefined}
          />
          {error ? (
            <p id="report-share-verify-error" className="report-share-verify__error" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            className="report-share-verify__submit"
            disabled={submitting || !email.trim()}
          >
            {submitting ? "Verifying…" : "Open report"}
          </button>
        </form>
        <p className="report-share-verify__note">
          We only verify it locally to make sure the right person sees this report. We do not create
          an account for you.
        </p>
      </div>
    </main>
  );
};

export default ShareVerifyGate;
