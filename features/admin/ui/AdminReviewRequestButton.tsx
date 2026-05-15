"use client";

import { useState } from "react";
import type { AdminReviewResourceType } from "@features/admin/server/reviews";
import { getCsrfToken } from "@/lib/csrf-client";

type ImpactLevel = "low" | "medium" | "high" | "critical";

interface AdminReviewRequestButtonProps {
  title: string;
  description?: string | null;
  resourceType: AdminReviewResourceType;
  resourceId?: number | null;
  linkedMetricKey?: string | null;
  impactLevel?: ImpactLevel;
  reviewerEmail?: string | null;
  sourceHref?: string | null;
  dueDate?: string | null;
  payloadSnapshot?: Record<string, unknown>;
  label?: string;
  busyLabel?: string;
  successLabel?: string;
  className?: string;
  disabled?: boolean;
  onSuccess?: () => void;
}

export default function AdminReviewRequestButton({
  title,
  description = null,
  resourceType,
  resourceId = null,
  linkedMetricKey = null,
  impactLevel = "medium",
  reviewerEmail = null,
  sourceHref = null,
  dueDate = null,
  payloadSnapshot,
  label = "Request Review",
  busyLabel = "Requesting...",
  successLabel = "Review Queued",
  className = "rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary transition hover:bg-white/10 disabled:opacity-40",
  disabled = false,
  onSuccess,
}: AdminReviewRequestButtonProps) {
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(
    null
  );

  async function queueReview() {
    setSaving(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/admin/reviews", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": getCsrfToken(),
        },
        body: JSON.stringify({
          title,
          description,
          resource_type: resourceType,
          resource_id: resourceId,
          linked_metric_key: linkedMetricKey,
          impact_level: impactLevel,
          reviewer_email: reviewerEmail,
          source_href: sourceHref,
          due_date: dueDate,
          payload_snapshot: payloadSnapshot ?? {},
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(
          (body as { error?: string } | null)?.error || "Failed to queue review request."
        );
      }

      setFeedback({ type: "success", text: "Review request queued." });
      onSuccess?.();
    } catch (err) {
      setFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to queue review request.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        onClick={() => void queueReview()}
        disabled={disabled || saving}
        className={className}
      >
        {saving ? busyLabel : feedback?.type === "success" ? successLabel : label}
      </button>
      {feedback && (
        <p
          className={`text-xs ${feedback.type === "success" ? "text-emerald-300" : "text-red-400"}`}
        >
          {feedback.text}
        </p>
      )}
    </div>
  );
}
