"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { useAdminFetch } from "./hooks/useAdminFetch";
import AnswerDisplay from "./AnswerDisplay";
import BarChart from "./BarChart";
import ConfirmDialog from "./ConfirmDialog";
import JourneyTimeline from "./JourneyTimeline";
import NotesSection from "./NotesSection";
import UserFunnelCard from "./UserFunnelCard";
import { getCsrfToken } from "@shared/http/csrf-client";
import { maskEmail } from "@features/admin/server/format";

/**
 * Click-to-copy chip used for the hjUid and the survey session id. Tries the
 * modern `navigator.clipboard.writeText` first, falls back to a hidden
 * textarea + `document.execCommand("copy")` for environments where the
 * Clipboard API is missing or rejects (sandboxed iframes, some embedded
 * browsers). Shows a transient ✓ Copied state so the click is visible.
 */
function CopyableChip({ label, value, title }: { label: string; value: string; title: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!value) return;
    let ok = false;
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        ok = true;
      }
    } catch {
      ok = false;
    }
    if (!ok && typeof document !== "undefined") {
      try {
        const textarea = document.createElement("textarea");
        textarea.value = value;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        ok = document.execCommand("copy");
        document.body.removeChild(textarea);
      } catch {
        ok = false;
      }
    }
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    }
  }, [value]);

  return (
    <>
      <button
        type="button"
        onClick={handleCopy}
        title={title}
        aria-label={copied ? `${label} copied` : `Copy ${label}`}
        className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 font-mono text-[11px] text-text-muted transition hover:bg-white/10"
      >
        {copied ? "✓ Copied" : `${label} ⎘`}
      </button>
      {/* R-26: live region announces "copied" to screen-reader users. The
          button itself flips its visible label, which sighted users see —
          this region carries the same signal for AT users. role="status"
          (vs alert) chosen because the action was user-initiated and not
          urgent. aria-atomic so the full message is re-read each time. */}
      <span role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {copied ? `${label} copied to clipboard` : ""}
      </span>
    </>
  );
}

interface SubmissionData {
  submission: {
    id: number | string;
    record_type?: "submission" | "partial";
    submission_id?: number | null;
    session_id?: string | null;
    email: string;
    first_name: string;
    status: string;
    started_at: string;
    completed_at: string;
    saved_at?: string;
    updated_at?: string | null;
    duration_ms: number | null;
    utm_source: string | null;
    answer_count?: number | null;
    current_index?: number | null;
    recoverable?: boolean;
    report_token?: string | null;
    hotjar_user_id?: string | null;
  };
  answers: Array<{
    q_id: string;
    question_text?: string;
    answer_type?: string;
    answer_value: string | string[] | number | null;
    time_spent_seconds?: number | null;
    revision_count?: number | null;
    was_skipped?: boolean;
  }>;
  scoring: {
    primary_archetype: string;
    percentages: Record<string, number>;
    raw_scores: Record<string, number>;
    engine_version: string;
    scored_at: string;
    v5_primary_archetype: string | null;
    v5_percentages: Record<string, number> | null;
    v5_raw_scores: Record<string, number> | null;
  } | null;
}

interface SubmissionDetailProps {
  id: string;
  mode?: "submission" | "partial";
}

export default function SubmissionDetail({ id, mode = "submission" }: SubmissionDetailProps) {
  const endpoint =
    mode === "partial"
      ? `/api/admin/submissions/partial/${encodeURIComponent(id)}`
      : `/api/admin/submissions/${id}`;
  const { data, loading, error, refetch } = useAdminFetch<SubmissionData>(endpoint);
  const [showDelete, setShowDelete] = useState(false);
  const [showGrant, setShowGrant] = useState(false);
  const [grantInfo, setGrantInfo] = useState<{
    code: string;
    emailed?: boolean;
    already?: boolean;
  } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function updateStatus(status: string) {
    if (mode !== "submission") return;

    setActionLoading(true);
    setActionError(null);
    try {
      // F-05: include the timestamp from the last GET so the server can
      // reject the PATCH if another admin has changed the row since then.
      const expectedUpdatedAt = data?.submission.updated_at ?? null;
      if (!expectedUpdatedAt) {
        setActionError("Submission not loaded — refresh and try again.");
        return;
      }
      const res = await fetch(`/api/admin/submissions/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": getCsrfToken(),
        },
        body: JSON.stringify({ status, expected_updated_at: expectedUpdatedAt }),
      });
      if (res.status === 409) {
        setActionError("Another admin changed this submission. Refreshing…");
        refetch();
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setActionError((body as { error?: string } | null)?.error || "Action failed.");
        return;
      }
      refetch();
    } catch {
      setActionError("Network error. Please try again.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDelete() {
    if (mode !== "submission") return;

    setShowDelete(false);
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/submissions/${id}`, {
        method: "DELETE",
        headers: { "x-csrf-token": getCsrfToken() },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setActionError((body as { error?: string } | null)?.error || "Delete failed.");
        return;
      }
      window.location.href = "/admin/submissions";
    } catch {
      setActionError("Network error. Please try again.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleGrantCoupon() {
    if (mode !== "submission") return;

    setShowGrant(false);
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/submissions/${id}/grant-call-coupon`, {
        method: "POST",
        headers: { "x-csrf-token": getCsrfToken() },
      });
      const body = (await res.json().catch(() => null)) as {
        code?: string;
        emailed?: boolean;
        error?: string;
      } | null;
      // 409 with a code = already granted; surface the existing code.
      if (res.status === 409 && body?.code) {
        setGrantInfo({ code: body.code, already: true });
        return;
      }
      if (!res.ok || !body?.code) {
        setActionError(body?.error || "Grant failed.");
        return;
      }
      setGrantInfo({ code: body.code, emailed: body.emailed });
    } catch {
      setActionError("Network error. Please try again.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRecover() {
    if (mode !== "partial") return;

    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch("/api/admin/submissions/recover", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": getCsrfToken(),
        },
        body: JSON.stringify({ sessionId: id }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setActionError((body as { error?: string } | null)?.error || "Recovery failed.");
        return;
      }

      const body = (await res.json()) as { submissionId: number };
      window.location.href = `/admin/submissions/${body.submissionId}`;
    } catch {
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
        {error || "Submission not found"}
      </div>
    );
  }

  const { submission, answers, scoring } = data;
  const isPartial = mode === "partial" || submission.record_type === "partial";

  const siteUrl =
    (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "") || "https://loveiq.org";
  // Hotjar accounts on this workspace have been migrated to Contentsquare,
  // so the recordings live at app.contentsquare.com — `insights.hotjar.com`
  // just redirects to the Surveys list. Set NEXT_PUBLIC_CONTENTSQUARE_PROJECT_ID
  // to the Contentsquare project number (e.g. 743568) to enable the chip.
  const contentsquareProjectId = process.env.NEXT_PUBLIC_CONTENTSQUARE_PROJECT_ID || "";
  const reportUrl =
    !isPartial && submission.report_token
      ? `${siteUrl}/report/${encodeURIComponent(submission.report_token)}`
      : null;
  const sessionReplayUrl =
    !isPartial && submission.hotjar_user_id && contentsquareProjectId
      ? `https://app.contentsquare.com/#/session-replay?project=${encodeURIComponent(contentsquareProjectId)}`
      : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin/submissions" className="text-sm text-text-muted hover:text-text-primary">
          &larr; Back
        </Link>
        <h2 className="font-serif text-xl font-bold text-text-primary">
          {isPartial ? "Saved Session" : `Submission #${submission.id}`}
        </h2>
      </div>

      {(reportUrl || sessionReplayUrl || (!isPartial && submission.session_id)) && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-surface px-5 py-3 text-sm">
          {reportUrl && (
            <a
              href={reportUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="rounded-lg border border-accent-purple/30 bg-accent-purple/10 px-3 py-1.5 text-xs font-medium text-accent-purple transition hover:bg-accent-purple/20"
            >
              View report ↗
            </a>
          )}
          {sessionReplayUrl && submission.hotjar_user_id && (
            <>
              <a
                href={sessionReplayUrl}
                target="_blank"
                rel="noreferrer noopener"
                title="Opens Contentsquare Session Replay. Paste the hjUid (next to this button) into the User-ID / User-attribute filter to see only this user's sessions."
                className="rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-1.5 text-xs font-medium text-orange-300 transition hover:bg-orange-500/20"
              >
                Session replay ↗
              </a>
              <CopyableChip
                label={`hjUid: ${submission.hotjar_user_id}`}
                value={submission.hotjar_user_id}
                title="Click to copy. Paste into Contentsquare → Session Replay → Filter → User ID."
              />
            </>
          )}
          {!sessionReplayUrl && submission.session_id && (
            <CopyableChip
              label={`session: ${submission.session_id}`}
              value={submission.session_id}
              title="Click to copy the survey session id. Paste into Contentsquare or Hotjar's user-attribute search if no recording link is available."
            />
          )}
        </div>
      )}

      <div className="rounded-xl border border-white/10 bg-surface p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs text-text-muted">Email</p>
            <p className="text-sm text-text-primary">{maskEmail(submission.email)}</p>
          </div>
          <div>
            <p className="text-xs text-text-muted">Name</p>
            <p className="text-sm text-text-primary">{submission.first_name || "-"}</p>
          </div>
          <div>
            <p className="text-xs text-text-muted">Status</p>
            <p className="text-sm text-text-primary">{submission.status}</p>
          </div>
          <div>
            <p className="text-xs text-text-muted">{isPartial ? "Saved" : "Completed"}</p>
            <p className="text-sm text-text-primary">
              {new Date(
                isPartial ? submission.saved_at || submission.completed_at : submission.completed_at
              ).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
          {submission.duration_ms != null && (
            <div>
              <p className="text-xs text-text-muted">Duration</p>
              <p className="text-sm text-text-primary">
                {(() => {
                  const totalSec = Math.round(submission.duration_ms / 1000);
                  const min = Math.floor(totalSec / 60);
                  const sec = totalSec % 60;
                  return min > 0 ? `${min} min ${sec} sec` : `${sec} sec`;
                })()}
              </p>
            </div>
          )}
          <div>
            <p className="text-xs text-text-muted">UTM Source</p>
            <p className="text-sm text-text-primary">{submission.utm_source || "Direct"}</p>
          </div>
          {isPartial && (
            <>
              <div>
                <p className="text-xs text-text-muted">Answer Count</p>
                <p className="text-sm text-text-primary">
                  {submission.answer_count ?? answers.length}
                </p>
              </div>
              <div>
                <p className="text-xs text-text-muted">Saved Question Index</p>
                <p className="text-sm text-text-primary">{submission.current_index ?? "-"}</p>
              </div>
            </>
          )}
        </div>
      </div>

      {!isPartial && <JourneyTimeline id={id} />}
      {!isPartial && <UserFunnelCard id={id} />}

      <div className="rounded-xl border border-white/10 bg-surface p-5">
        <h3 className="mb-4 text-sm font-semibold text-text-primary">
          {scoring ? "Scoring Result (V4 - Probability %)" : "Not Scored"}
        </h3>
        {scoring ? (
          <>
            <div className="mb-4 flex items-baseline gap-3">
              <span className="font-serif text-lg font-bold text-accent-purple">
                {scoring.primary_archetype}
              </span>
              <span className="text-xs text-text-muted">
                {scoring.engine_version} (V6Q) -{" "}
                {new Date(scoring.scored_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
            <BarChart
              items={Object.entries(scoring.percentages)
                .sort(([, left], [, right]) => right - left)
                .map(([label, value]) => ({
                  label,
                  value: Math.round(value * 10) / 10,
                }))}
              direction="horizontal"
            />
          </>
        ) : (
          <p className="text-sm text-text-muted">
            {isPartial
              ? "This saved session has not been converted into a completed submission yet."
              : "No scoring data available for this submission."}
          </p>
        )}
      </div>

      {scoring?.v5_percentages && (
        <div className="rounded-xl border border-white/10 bg-surface p-5">
          <h3 className="mb-4 text-sm font-semibold text-text-primary">
            Scoring Result (V5 - Match %)
          </h3>
          <div className="mb-4 flex items-baseline gap-3">
            <span className="font-serif text-lg font-bold text-accent-orange">
              {scoring.v5_primary_archetype}
            </span>
            <span className="text-xs text-text-muted">Independent scores (do not sum to 100)</span>
          </div>
          <BarChart
            items={Object.entries(scoring.v5_percentages)
              .sort(([, left], [, right]) => right - left)
              .map(([label, value]) => ({
                label,
                value: Math.round(value * 10) / 10,
              }))}
            direction="horizontal"
          />
        </div>
      )}

      {actionError && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-400">
          {actionError}
        </div>
      )}

      {grantInfo && (
        <div className="rounded-xl border border-accent-purple/20 bg-accent-purple/5 p-4 text-sm text-text-primary">
          {grantInfo.already ? "A post-call coupon was already granted: " : "Coupon granted: "}
          <span className="font-mono font-semibold text-accent-purple">{grantInfo.code}</span>
          {grantInfo.already
            ? " — resend it manually if needed."
            : grantInfo.emailed
              ? " — emailed to the user."
              : " — email did not send; copy this code and send it manually."}
        </div>
      )}

      {isPartial ? (
        submission.recoverable && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleRecover}
              disabled={actionLoading}
              aria-label="Recover results"
              className="rounded-lg border border-accent-orange/20 px-3 py-1.5 text-sm text-accent-orange transition hover:bg-accent-orange/10 disabled:opacity-40"
            >
              Recover Results
            </button>
          </div>
        )
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => updateStatus("flagged")}
            disabled={actionLoading || submission.status === "flagged"}
            aria-label="Flag submission"
            className="rounded-lg border border-yellow-500/20 px-3 py-1.5 text-sm text-yellow-400 transition hover:bg-yellow-500/10 disabled:opacity-40"
          >
            Flag
          </button>
          <button
            onClick={() => updateStatus("archived")}
            disabled={actionLoading || submission.status === "archived"}
            aria-label="Archive submission"
            className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-text-muted transition hover:bg-white/5 disabled:opacity-40"
          >
            Archive
          </button>
          <button
            onClick={() => updateStatus("completed")}
            disabled={actionLoading || submission.status === "completed"}
            aria-label="Restore submission"
            className="rounded-lg border border-green-500/20 px-3 py-1.5 text-sm text-green-400 transition hover:bg-green-500/10 disabled:opacity-40"
          >
            Restore
          </button>
          <button
            onClick={() => setShowGrant(true)}
            disabled={actionLoading}
            aria-label="Grant post-call 100% coupon"
            title="Mint a one-time 100%-off code that unlocks the full report and email it to the user. Use after a completed call."
            className="rounded-lg border border-accent-purple/30 px-3 py-1.5 text-sm text-accent-purple transition hover:bg-accent-purple/10 disabled:opacity-40"
          >
            Grant 100% coupon
          </button>
          <button
            onClick={() => setShowDelete(true)}
            disabled={actionLoading}
            aria-label="Delete submission"
            className="rounded-lg border border-red-500/20 px-3 py-1.5 text-sm text-red-400 transition hover:bg-red-500/10 disabled:opacity-40"
          >
            Delete
          </button>
        </div>
      )}

      {!isPartial && <NotesSection submissionId={id} />}

      <div className="rounded-xl border border-white/10 bg-surface p-5">
        <h3 className="mb-4 text-sm font-semibold text-text-primary">Answers ({answers.length})</h3>
        {answers.length === 0 ? (
          <p className="text-sm text-text-muted">No answers recorded</p>
        ) : (
          answers.map((answer) => <AnswerDisplay key={answer.q_id} answer={answer} />)
        )}
      </div>

      {!isPartial && (
        <ConfirmDialog
          open={showDelete}
          title="Delete Submission"
          message="This will permanently delete this submission and all its answers. This cannot be undone."
          confirmLabel="Delete permanently"
          onConfirm={handleDelete}
          onCancel={() => setShowDelete(false)}
        />
      )}

      {!isPartial && (
        <ConfirmDialog
          open={showGrant}
          title="Grant post-call 100% coupon"
          message="This mints a one-time 100%-off code that unlocks the full report and emails it to the user. Use only after a completed call. It can only be granted once."
          confirmLabel="Grant coupon"
          onConfirm={handleGrantCoupon}
          onCancel={() => setShowGrant(false)}
        />
      )}
    </div>
  );
}
